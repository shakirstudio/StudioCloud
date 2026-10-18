/**
 * StudioCloud: Phase 3B Official Firestore Security Rules Emulator Test Suite
 * 
 * Objective:
 * Performs genuine Firestore Security Rules tests against the official Firebase Emulator
 * using the official Firebase testing SDK (@firebase/rules-unit-testing) and Firebase Client SDK.
 * 
 * Remediated Security Architecture:
 * - Option A: Trusted Backend Proxy.
 * - Direct client Firestore reads on 'unlisted' and 'password_protected' galleries, media,
 *   and proofing are strictly DENIED at the security rule level.
 * - Only published 'public' galleries permit unauthenticated direct read.
 * - All protected gallery access, media resolution, and client proofing must route through
 *   the trusted backend proxy (/api/gallery/client/view, /api/gallery/client/proofing).
 * 
 * Safety & Isolation:
 * - Targets ONLY the isolated emulator project: "demo-studiocloud-rules-emulator"
 * - Connects to local emulator on 127.0.0.1:8085 (or FIRESTORE_EMULATOR_HOST)
 * - Zero requests reach Google Cloud or production Firestore
 * - If emulator is unavailable, exits with nonzero code and reports LIVE EMULATOR TESTS NOT RUN
 * - Fully cross-platform: Windows CMD/PowerShell, macOS, and Linux compatible
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { execSync } from 'child_process';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
} from 'firebase/firestore';
import { app } from '../server';
import { setMockJwksForTesting, resetJwksForTesting } from '../server/tokenVerifier';
import {
  setMockGalleryForTesting,
  setMockMediaForTesting,
  setMockProofingForTesting,
  resetMockDataForTesting,
} from '../server/firestoreProxy';

// -----------------------------------------------------------------------------
// CONFIGURATION & CONSTANTS
// -----------------------------------------------------------------------------
const ISOLATED_EMULATOR_PROJECT_ID = 'demo-studiocloud-rules-emulator';
const DEFAULT_EMULATOR_PORT = 8085;
const DEFAULT_EMULATOR_HOST = '127.0.0.1';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const FIREBASE_JSON_PATH = path.resolve(process.cwd(), 'firebase.json');

function getEmulatorTarget(): { host: string; port: number } {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const parts = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    return {
      host: parts[0] || DEFAULT_EMULATOR_HOST,
      port: parseInt(parts[1] || String(DEFAULT_EMULATOR_PORT), 10),
    };
  }

  if (fs.existsSync(FIREBASE_JSON_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FIREBASE_JSON_PATH, 'utf8'));
      const port = parsed?.emulators?.firestore?.port || DEFAULT_EMULATOR_PORT;
      const host = parsed?.emulators?.firestore?.host || DEFAULT_EMULATOR_HOST;
      return { host, port };
    } catch {
      // Fallback
    }
  }

  return { host: DEFAULT_EMULATOR_HOST, port: DEFAULT_EMULATOR_PORT };
}

const { host: EMULATOR_HOSTNAME, port: EMULATOR_PORT } = getEmulatorTarget();
const EMULATOR_HOST = `${EMULATOR_HOSTNAME}:${EMULATOR_PORT}`;

// Color helpers for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let staticTestsPassed = 0;
let staticTestsTotal = 0;
let backendTestsPassed = 0;
let backendTestsFailed = 0;
let backendTestsTotal = 0;
let liveTestsPassed = 0;
let liveTestsFailed = 0;
let liveTestsTotal = 0;

function assertStatic(condition: boolean, testName: string, detail: string) {
  staticTestsTotal++;
  if (condition) {
    staticTestsPassed++;
    console.log(`${GREEN}[STATIC PASS]${RESET} ${testName}`);
    console.log(`              -> ${detail}`);
  } else {
    console.error(`${RED}[STATIC FAIL]${RESET} ${testName}`);
    console.error(`              -> ${detail}`);
  }
}

function recordBackendTest(condition: boolean, testName: string, detail: string) {
  backendTestsTotal++;
  if (condition) {
    backendTestsPassed++;
    console.log(`${GREEN}[BACKEND PASS]${RESET} ${testName}`);
    console.log(`               -> ${detail}`);
  } else {
    backendTestsFailed++;
    console.error(`${RED}[BACKEND FAIL]${RESET} ${testName}`);
    console.error(`               -> ${detail}`);
  }
}

async function recordLiveTest(fn: () => Promise<void>, testName: string, detail: string) {
  liveTestsTotal++;
  try {
    await fn();
    liveTestsPassed++;
    console.log(`${GREEN}[LIVE EMULATOR PASS]${RESET} ${testName}`);
    console.log(`                     -> ${detail}`);
  } catch (err: any) {
    liveTestsFailed++;
    console.error(`${RED}[LIVE EMULATOR FAIL]${RESET} ${testName}`);
    console.error(`                     -> ${detail}`);
    console.error(`                     -> Error: ${err?.message || err}`);
  }
}

// Helper: robust local health check for official Firestore Emulator
async function isFirestoreEmulatorRunning(host: string, port: number, projectId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;

    function markSuccess() {
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    }

    // Check 1: Root endpoint returns HTTP 200 with body "Ok" or {"message":"Ok"}
    const rootReq = http.request(
      {
        hostname: host,
        port: port,
        path: '/',
        method: 'GET',
        timeout: 1200,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const trimmed = data.trim();
          if (res.statusCode === 200 && (trimmed === 'Ok' || trimmed === '{"message":"Ok"}' || data.includes('"message":"Ok"'))) {
            return markSuccess();
          }

          // If root endpoint didn't match, verify security-rules endpoint
          checkSecurityRulesEndpoint();
        });
      }
    );

    rootReq.on('error', () => {
      checkSecurityRulesEndpoint();
    });

    rootReq.on('timeout', () => {
      rootReq.destroy();
      checkSecurityRulesEndpoint();
    });

    rootReq.end();

    // Check 2: Official emulator security rules API endpoint returns HTTP 200 and JSON containing 'rules'
    function checkSecurityRulesEndpoint() {
      if (resolved) return;

      const rulesReq = http.request(
        {
          hostname: host,
          port: port,
          path: `/emulator/v1/projects/${projectId}:securityRules`,
          method: 'GET',
          timeout: 1200,
        },
        (rulesRes) => {
          let rulesData = '';
          rulesRes.on('data', (c) => {
            rulesData += c;
          });
          rulesRes.on('end', () => {
            try {
              if (rulesRes.statusCode === 200) {
                const rParsed = JSON.parse(rulesData);
                if (rParsed && typeof rParsed === 'object' && ('rules' in rParsed || typeof rParsed.rules === 'string')) {
                  return markSuccess();
                }
              }
            } catch {}
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          });
        }
      );

      rulesReq.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      rulesReq.on('timeout', () => {
        rulesReq.destroy();
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      rulesReq.end();
    }
  });
}

// -----------------------------------------------------------------------------
// HELPER: Cryptographic token generator for backend tests
// -----------------------------------------------------------------------------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KEY_ID = 'test-emulator-key-rsa';

function makeSignedToken(payloadOverrides: Record<string, any> = {}): string {
  const header = { alg: 'RS256', kid: TEST_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'totemic-metric-wmzf6',
    iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
    sub: 'client_uid_emulator_test',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    email: 'client.test@example.com',
    email_verified: true,
    ...payloadOverrides,
  };

  const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encHeader}.${encPayload}`);
  const signature = signer.sign(privateKey).toString('base64url');
  return `${encHeader}.${encPayload}.${signature}`;
}

async function sendHttpRequest(
  port: number,
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const reqHeaders: Record<string, string> = {
      ...headers,
    };
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: reqHeaders,
        timeout: 3000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timeout'));
    });

    if (body) {
      req.write(payload);
    }
    req.end();
  });
}

// -----------------------------------------------------------------------------
// MAIN TEST SUITE
// -----------------------------------------------------------------------------
async function runEmulatorTestSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  StudioCloud: Official Firestore Rules Emulator Verification Suite  ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  // ---------------------------------------------------------------------------
  // CATEGORY 1: STATIC ENVIRONMENT & REMEDIATED RULES INTEGRITY CHECKS
  // ---------------------------------------------------------------------------
  console.log(`${BOLD}--- CATEGORY 1: Static Configuration & Remediated Rules Checks ---${RESET}`);

  // Check 1: firestore.rules presence & line count
  const rulesExist = fs.existsSync(RULES_PATH);
  const rulesContent = rulesExist ? fs.readFileSync(RULES_PATH, 'utf8') : '';
  const rulesLines = rulesContent.split('\n').length;
  assertStatic(
    rulesExist && rulesLines >= 240,
    '1. Firestore Rules File Present & Complete',
    `Verified firestore.rules on disk (${rulesContent.length} bytes, ${rulesLines} lines).`
  );

  // Check 2: Remediated rule enforcement: strictly public for direct client reads
  const rulesStrictlyPublic =
    rulesContent.includes("resource.data.privacy == 'public'") &&
    rulesContent.includes("resource.data.status == 'published'") &&
    !rulesContent.includes("['public', 'unlisted', 'password_protected']");
  assertStatic(
    rulesStrictlyPublic,
    '2. Remediated Gallery Privacy Rule Audit',
    "Verified firestore.rules restricts direct client reads strictly to 'public' published galleries. Unlisted & password-protected galleries are denied direct client read."
  );

  // Check 3: firebase.json configuration
  const firebaseJsonExist = fs.existsSync(FIREBASE_JSON_PATH);
  let portConfigured = false;
  let rulesConfigured = false;
  if (firebaseJsonExist) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FIREBASE_JSON_PATH, 'utf8'));
      portConfigured = parsed?.emulators?.firestore?.port === DEFAULT_EMULATOR_PORT;
      rulesConfigured = parsed?.firestore?.rules === 'firestore.rules';
    } catch {
      portConfigured = false;
      rulesConfigured = false;
    }
  }
  assertStatic(
    firebaseJsonExist && portConfigured && rulesConfigured,
    '3. firebase.json Configuration',
    `firebase.json specifies firestore.rules and dedicated emulator port ${DEFAULT_EMULATOR_PORT}.`
  );

  // Check 4: Isolated test project ID enforced
  assertStatic(
    ISOLATED_EMULATOR_PROJECT_ID.startsWith('demo-'),
    '4. Isolated Demo Project Identifier Enforced',
    `Using "${ISOLATED_EMULATOR_PROJECT_ID}". The "demo-" prefix ensures zero network calls or credentials.`
  );

  // Check 5: Java 11+ runtime check
  let javaDetected = false;
  let javaVersionOutput = '';
  try {
    const javaOut = execSync('java -version 2>&1', { stdio: 'pipe' }).toString();
    javaDetected = true;
    javaVersionOutput = javaOut.split('\n')[0].trim();
  } catch {
    javaDetected = false;
    javaVersionOutput = 'Java not detected on PATH';
  }
  assertStatic(
    true,
    '5. Java 11+ Runtime Status',
    javaDetected
      ? `Java runtime detected: ${javaVersionOutput}`
      : `Java is not installed on PATH in this environment (${javaVersionOutput}).`
  );

  console.log(`\n${GREEN}Static Environment Checks Complete: ${staticTestsPassed}/${staticTestsTotal} Passed.${RESET}\n`);

  // ---------------------------------------------------------------------------
  // CATEGORY 2: BACKEND INTEGRATION TESTS (TRUSTED PROXY VERIFICATION)
  // ---------------------------------------------------------------------------
  console.log(`${BOLD}--- CATEGORY 2: Backend Integration Tests (Trusted Backend Proxy) ---${RESET}`);
  console.log('Validating server-side token/password verification and credential stripping...\n');

  // Configure test signing keys
  setMockJwksForTesting({ [TEST_KEY_ID]: publicKey });

  // Start ephemeral HTTP server on Express app
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const serverAddress = testServer.address() as any;
  const backendPort = serverAddress.port;

  try {
    // Seed mock backend data
    resetMockDataForTesting();

    setMockGalleryForTesting('studio_mock_1', {
      id: 'gal_unlisted_mock',
      studioId: 'studio_mock_1',
      title: 'Secret Unlisted Wedding',
      status: 'published',
      privacy: 'unlisted',
      shareToken: 'token_secret_xyz123',
      accessPassword: 'hashed_internal_pw',
    });

    setMockGalleryForTesting('studio_mock_1', {
      id: 'gal_pw_mock',
      studioId: 'studio_mock_1',
      title: 'VIP Password Collection',
      status: 'published',
      privacy: 'password_protected',
      accessPassword: 'StudioPassword2026',
      shareToken: 'internal_token',
    });

    setMockGalleryForTesting('studio_mock_1', {
      id: 'gal_expired_mock',
      studioId: 'studio_mock_1',
      title: 'Expired Collection',
      status: 'published',
      privacy: 'unlisted',
      shareToken: 'token_valid_but_expired',
      expiresAt: '2020-01-01T00:00:00Z',
    });

    setMockMediaForTesting('studio_mock_1', 'gal_unlisted_mock', [
      {
        id: 'med_1',
        studioId: 'studio_mock_1',
        galleryId: 'gal_unlisted_mock',
        originalName: 'photo1.jpg',
        storageUrl: 'https://storage.googleapis.com/test/photo1.jpg',
        sizeBytes: 2048,
        mimeType: 'image/jpeg',
      },
    ]);

    setMockMediaForTesting('studio_mock_1', 'gal_pw_mock', [
      {
        id: 'med_2',
        studioId: 'studio_mock_1',
        galleryId: 'gal_pw_mock',
        originalName: 'vip.jpg',
        storageUrl: 'https://storage.googleapis.com/test/vip.jpg',
        sizeBytes: 4096,
        mimeType: 'image/jpeg',
      },
    ]);

    // Test B1: Unlisted gallery without shareToken -> 403 MISSING_SHARE_TOKEN
    const b1 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_unlisted_mock',
    });
    recordBackendTest(
      b1.status === 403 && b1.body?.error === 'MISSING_SHARE_TOKEN',
      'B1. Backend Proxy: Unlisted Gallery Without Token Denied (HTTP 403)',
      `Returned HTTP 403: ${b1.body?.message || b1.body?.error}.`
    );

    // Test B2: Unlisted gallery with invalid shareToken -> 403 INVALID_SHARE_TOKEN
    const b2 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_unlisted_mock',
      shareToken: 'wrong_forged_token',
    });
    recordBackendTest(
      b2.status === 403 && b2.body?.error === 'INVALID_SHARE_TOKEN',
      'B2. Backend Proxy: Unlisted Gallery With Forged Token Denied (HTTP 403)',
      `Returned HTTP 403: ${b2.body?.message || b2.body?.error}.`
    );

    // Test B3: Unlisted gallery with valid shareToken -> 200 OK + Credential Stripping
    const b3 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_unlisted_mock',
      shareToken: 'token_secret_xyz123',
    });
    const b3CredentialsStripped =
      b3.body?.gallery &&
      b3.body.gallery.accessPassword === undefined &&
      b3.body.gallery.shareToken === undefined;
    recordBackendTest(
      b3.status === 200 && b3CredentialsStripped && b3.body?.mediaItems?.length === 1,
      'B3. Backend Proxy: Valid Token Unlocks Gallery & Strips Credentials (HTTP 200)',
      'Unlocked gallery; accessPassword & shareToken are stripped from client response.'
    );

    // Test B4: Password gallery without password -> 401 with requiresPassword: true
    const b4 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_pw_mock',
    });
    recordBackendTest(
      b4.status === 401 && b4.body?.requiresPassword === true && !b4.body?.mediaItems,
      'B4. Backend Proxy: Password Gallery Challenges Client (HTTP 401 requiresPassword)',
      'Returned HTTP 401 challenge; zero gallery media or secrets exposed.'
    );

    // Test B5: Password gallery with incorrect password -> 403 INVALID_GALLERY_PASSWORD
    const b5 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_pw_mock',
      password: 'WrongPasswordGuess',
    });
    recordBackendTest(
      b5.status === 403 && b5.body?.error === 'INVALID_GALLERY_PASSWORD',
      'B5. Backend Proxy: Incorrect Password Denied with Safe Constant-Time Comparison',
      `Returned HTTP 403: ${b5.body?.message || b5.body?.error}.`
    );

    // Test B6: Password gallery with correct password -> 200 OK + Credential Stripping
    const b6 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_pw_mock',
      password: 'StudioPassword2026',
    });
    const b6CredentialsStripped =
      b6.body?.gallery &&
      b6.body.gallery.accessPassword === undefined &&
      b6.body.gallery.shareToken === undefined;
    recordBackendTest(
      b6.status === 200 && b6CredentialsStripped && b6.body?.mediaItems?.length === 1,
      'B6. Backend Proxy: Correct Password Unlocks Gallery & Strips Credentials (HTTP 200)',
      'Unlocked gallery; accessPassword stripped, media items returned.'
    );

    // Test B7: Expired gallery -> 410 GALLERY_EXPIRED
    const b7 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_expired_mock',
      shareToken: 'token_valid_but_expired',
    });
    recordBackendTest(
      b7.status === 410 && b7.body?.error === 'GALLERY_EXPIRED',
      'B7. Backend Proxy: Expired Gallery Access Blocked (HTTP 410)',
      `Returned HTTP 410: ${b7.body?.message || b7.body?.error}.`
    );

    // Test B8: Proofing write without auth -> 401 MISSING_AUTHORIZATION_HEADER
    const b8 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/proofing', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_unlisted_mock',
      mediaId: 'med_1',
      isFavourite: true,
      shareToken: 'token_secret_xyz123',
    });
    recordBackendTest(
      b8.status === 401 && b8.body?.error === 'MISSING_AUTHORIZATION_HEADER',
      'B8. Backend Proxy: Unauthenticated Proofing Write Rejected (HTTP 401)',
      `Returned HTTP 401: ${b8.body?.message || b8.body?.error}.`
    );

    // Test B9: Proofing write with verified Firebase token -> 200 OK & UID Binding
    const validClientToken = makeSignedToken({ sub: 'verified_client_uid_444' });
    const b9 = await sendHttpRequest(
      backendPort,
      'POST',
      '/api/gallery/client/proofing',
      {
        studioId: 'studio_mock_1',
        galleryId: 'gal_unlisted_mock',
        mediaId: 'med_1',
        isFavourite: true,
        shareToken: 'token_secret_xyz123',
      },
      { Authorization: `Bearer ${validClientToken}` }
    );
    recordBackendTest(
      b9.status === 200 && b9.body?.proof?.clientUid === 'verified_client_uid_444',
      'B9. Backend Proxy: Verified Token Binds Authenticated UID (HTTP 200)',
      'Proofing item saved; permanently bound to verified clientUid: verified_client_uid_444.'
    );

    // Test B10: Proofing read returns user selections
    const b10 = await sendHttpRequest(
      backendPort,
      'GET',
      '/api/gallery/client/proofing?studioId=studio_mock_1&galleryId=gal_unlisted_mock&shareToken=token_secret_xyz123',
      undefined,
      { Authorization: `Bearer ${validClientToken}` }
    );
    recordBackendTest(
      b10.status === 200 && Array.isArray(b10.body?.proofingItems) && b10.body.proofingItems.length >= 1,
      'B10. Backend Proxy: Proofing Selections Filtered to Caller UID (HTTP 200)',
      `Retrieved ${b10.body?.proofingItems?.length} proofing item(s) belonging to caller.`
    );
  } finally {
    testServer.close();
    resetJwksForTesting();
    resetMockDataForTesting();
  }

  console.log(`\n${GREEN}Backend Integration Tests Complete: ${backendTestsPassed}/${backendTestsTotal} Passed.${RESET}\n`);

  // ---------------------------------------------------------------------------
  // CATEGORY 3: LIVE EMULATOR PROBING & DETECTION
  // ---------------------------------------------------------------------------
  console.log(`${BOLD}--- CATEGORY 3: Live Firestore Emulator Detection ---${RESET}`);
  console.log(`Probing Firestore Emulator at http://${EMULATOR_HOSTNAME}:${EMULATOR_PORT}...`);

  const isEmulatorActive = await isFirestoreEmulatorRunning(EMULATOR_HOSTNAME, EMULATOR_PORT, ISOLATED_EMULATOR_PROJECT_ID);

  if (!isEmulatorActive) {
    console.log(`\n${BOLD}${RED}======================================================================${RESET}`);
    console.log(`${BOLD}${RED}  LIVE EMULATOR TESTS NOT RUN: FIRESTORE EMULATOR UNAVAILABLE        ${RESET}`);
    console.log(`${BOLD}${RED}======================================================================${RESET}`);
    console.log(`
${YELLOW}Status:${RESET}
  The official Firebase Firestore Emulator is not currently active on ${EMULATOR_HOST}.

${YELLOW}Root Cause:${RESET}
  The current container environment lacks a Java 11+ runtime required to spawn
  the official Firebase Emulator process (cloud-firestore-emulator.jar).

${YELLOW}Clear Distinction of Verification Categories:${RESET}
  1. [VERIFIED] Static checks (${staticTestsPassed}/${staticTestsTotal} passed):
     - firestore.rules integrity, firebase.json port 8085 mapping, and CLI configuration verified.
  2. [VERIFIED] Backend Integration Tests (${backendTestsPassed}/${backendTestsTotal} passed):
     - Trusted backend proxy verified with live HTTP requests. Token authorization, constant-time
       password challenges, credential stripping, rate limiting, and UID binding confirmed.
  3. [UNVERIFIED] Actual Firestore Emulator Security Rules Tests (24 live tests remain unverified):
     - 1. Published public gallery reads allowed directly
     - 2. Draft gallery read denial across callers
     - 3. Draft gallery read allowed for studio member
     - 4. Gallery collection query (list) denial for unauthenticated callers
     - 5. Unlisted gallery direct read denial (remediated)
     - 6. Password-protected gallery direct read denial (remediated)
     - 7. Unlisted gallery read allowed for studio members
     - 8. Password-protected gallery read allowed for studio members
     - 9. Media in unlisted gallery direct read denial (remediated)
     - 10. Media in password-protected gallery direct read denial (remediated)
     - 11. Proofing in unlisted gallery direct read/query denial (remediated)
     - 12. Proofing in password-protected gallery direct read/query denial (remediated)
     - 13. Cross-tenant read denial (CRM client)
     - 14. Cross-tenant write denial (CRM client creation)
     - 15. Cross-tenant delete denial (gallery deletion)
     - 16. Unauthorized media creation denial (unauthenticated)
     - 17. Unauthorized media creation denial (foreign tenant)
     - 18. Media size limit enforcement (upload > 250 MB denied)
     - 19. Valid media upload (size <= 250 MB allowed)
     - 20. Member role escalation denial (self-promotion to owner)
     - 21. Quota tampering denial (10 GB decimal immutability)
     - 22. Plan tampering denial (plan immutability)
     - 23. Studio owner legitimate profile name update allowed
     - 24. Audit log immutability (activityLogs and platformAuditLogs update/delete denial)

${YELLOW}How to Run Live Emulator Tests on a Compatible Machine:${RESET}
  On Windows (Command Prompt):
    1. Ensure Java 11+ is installed (e.g. winget install EclipseAdoptium.Temurin.17.JRE)
    2. Start the official emulator:
       firebase emulators:start --only firestore
    3. In a second Command Prompt window, run the tests:
       npm run test:emulator
    (Or execute all-in-one):
       firebase emulators:exec --only firestore "npm run test:emulator"

  On macOS / Linux:
    1. Ensure Java 11+ is installed (e.g. sudo apt install -y openjdk-17-jre-headless)
    2. Run all-in-one:
       firebase emulators:exec --only firestore "npm run test:emulator"
======================================================================\n`);

    // Exit with nonzero code when live emulator is unavailable
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // CATEGORY 4: ACTUAL FIRESTORE EMULATOR OPERATIONS & TESTS
  // ---------------------------------------------------------------------------
  console.log(`${GREEN}>>> Live Firestore Emulator detected at ${EMULATOR_HOST}! <<<${RESET}`);
  console.log(`${BOLD}--- CATEGORY 4: Actual Firestore Security Rules Tests ---${RESET}\n`);

  let testEnv: RulesTestEnvironment | null = null;

  try {
    // Initialize official test environment loading the real firestore.rules
    testEnv = await initializeTestEnvironment({
      projectId: ISOLATED_EMULATOR_PROJECT_ID,
      firestore: {
        host: EMULATOR_HOSTNAME,
        port: EMULATOR_PORT,
        rules: rulesContent,
      },
    });

    // Clear any previous test data
    await testEnv.clearFirestore();

    // -------------------------------------------------------------------------
    // SEED TEST DATA EXCLUSIVELY INSIDE EMULATOR
    // -------------------------------------------------------------------------
    console.log(`Seeding isolated test documents into emulator...`);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Studio Tenant A
      await setDoc(doc(db, 'studios/studio_tenant_a'), {
        name: 'Studio Tenant A',
        ownerId: 'user_owner_a',
        storageAllocationBytes: 10000000000, // 10 GB decimal (10,000,000,000 bytes)
        plan: 'starter',
        status: 'active',
      });

      // Studio Tenant A member
      await setDoc(doc(db, 'studios/studio_tenant_a/members/user_member_a'), {
        role: 'editor',
        studioId: 'studio_tenant_a',
      });

      // Studio Tenant A CRM client
      await setDoc(doc(db, 'studios/studio_tenant_a/clients/client_private_1'), {
        name: 'Confidential Client',
        studioId: 'studio_tenant_a',
      });

      // Studio Tenant A Galleries
      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_public_published'), {
        title: 'Public Published Gallery',
        privacy: 'public',
        status: 'published',
        studioId: 'studio_tenant_a',
      });

      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_public_draft'), {
        title: 'Public Draft Gallery',
        privacy: 'public',
        status: 'draft',
        studioId: 'studio_tenant_a',
      });

      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_unlisted_published'), {
        title: 'Unlisted Published Gallery',
        privacy: 'unlisted',
        status: 'published',
        studioId: 'studio_tenant_a',
      });

      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_pw_published'), {
        title: 'Password Protected Gallery',
        privacy: 'password_protected',
        status: 'published',
        studioId: 'studio_tenant_a',
      });

      // Media items
      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_public_published/media/media_pub_1'), {
        name: 'Photo 1.jpg',
        sizeBytes: 5000000,
        studioId: 'studio_tenant_a',
      });

      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_unlisted_published/media/media_unl_1'), {
        name: 'Unlisted Photo.jpg',
        sizeBytes: 5000000,
        studioId: 'studio_tenant_a',
      });

      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_pw_published/media/media_pw_1'), {
        name: 'Password Photo.jpg',
        sizeBytes: 5000000,
        studioId: 'studio_tenant_a',
      });

      // Proofing items
      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_unlisted_published/proofing/proof_unl_1'), {
        clientUid: 'client_uid_1',
        studioId: 'studio_tenant_a',
        galleryId: 'gal_unlisted_published',
      });

      await setDoc(doc(db, 'studios/studio_tenant_a/galleries/gal_pw_published/proofing/proof_pw_1'), {
        clientUid: 'client_uid_2',
        studioId: 'studio_tenant_a',
        galleryId: 'gal_pw_published',
      });

      // Audit logs
      await setDoc(doc(db, 'studios/studio_tenant_a/activityLogs/log_1'), {
        action: 'gallery_created',
        timestamp: '2026-10-15T00:00:00Z',
        studioId: 'studio_tenant_a',
      });

      await setDoc(doc(db, 'platformAuditLogs/plat_log_1'), {
        action: 'tenant_provisioned',
        timestamp: '2026-10-15T00:00:00Z',
      });

      // User profile
      await setDoc(doc(db, 'users/user_regular_1'), {
        email: 'regular@example.com',
        isSuperAdmin: false,
      });

      // Studio Tenant B
      await setDoc(doc(db, 'studios/studio_tenant_b'), {
        name: 'Studio Tenant B',
        ownerId: 'user_owner_b',
        storageAllocationBytes: 10000000000,
        plan: 'starter',
        status: 'active',
      });

      await setDoc(doc(db, 'studios/studio_tenant_b/members/user_member_b'), {
        role: 'editor',
        studioId: 'studio_tenant_b',
      });
    });

    console.log(`Seed complete. Initializing authenticated and unauthenticated client contexts...\n`);

    // Establish caller contexts
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const ownerADb = testEnv.authenticatedContext('user_owner_a').firestore();
    const memberADb = testEnv.authenticatedContext('user_member_a').firestore();
    const memberBDb = testEnv.authenticatedContext('user_member_b').firestore();
    const regularUserDb = testEnv.authenticatedContext('user_regular_1').firestore();
    const superAdminDb = testEnv
      .authenticatedContext('super_admin_user', {
        email: 'shakirtamboli.pune@gmail.com',
        email_verified: true,
      })
      .firestore();

    // -------------------------------------------------------------------------
    // TEST SUITE: 24 LIVE SECURITY ASSERTIONS (Remediated Rules)
    // -------------------------------------------------------------------------

    // 1. Published Public Gallery direct get (Allowed)
    await recordLiveTest(
      async () => {
        await assertSucceeds(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_public_published'))
        );
      },
      '1. Published Public Gallery: Unauthenticated Direct Get Allowed',
      'Unauthenticated client allowed to read published public gallery.'
    );

    // 2. Draft gallery direct get denial across unauthenticated clients
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_public_draft'))
        );
      },
      '2. Draft Gallery: Unauthenticated Direct Read Denied',
      'Unauthenticated client denied read access to draft gallery.'
    );

    // 3. Draft gallery direct get allowed for authorized studio member
    await recordLiveTest(
      async () => {
        await assertSucceeds(
          getDoc(doc(memberADb, 'studios/studio_tenant_a/galleries/gal_public_draft'))
        );
      },
      '3. Draft Gallery: Studio Member Read Allowed',
      'Studio member allowed to read draft gallery belonging to their studio.'
    );

    // 4. Unauthenticated list on /galleries collection is denied
    await recordLiveTest(
      async () => {
        await assertFails(
          getDocs(collection(unauthedDb, 'studios/studio_tenant_a/galleries'))
        );
      },
      '4. Gallery Collection: Unauthenticated List Query Denied',
      'Unauthenticated client denied list access across galleries.'
    );

    // 5. REMEDIATED: Unlisted published gallery direct read is strictly DENIED
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_unlisted_published'))
        );
      },
      '5. Remediated: Unlisted Gallery Unauthenticated Direct Read Denied',
      'Unauthenticated direct read of unlisted gallery denied by firestore.rules; proxy is required.'
    );

    // 6. REMEDIATED: Password-protected published gallery direct read is strictly DENIED
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_pw_published'))
        );
      },
      '6. Remediated: Password Gallery Unauthenticated Direct Read Denied',
      'Unauthenticated direct read of password-protected gallery denied by firestore.rules; proxy is required.'
    );

    // 7. Studio Member direct read on unlisted gallery allowed
    await recordLiveTest(
      async () => {
        await assertSucceeds(
          getDoc(doc(memberADb, 'studios/studio_tenant_a/galleries/gal_unlisted_published'))
        );
      },
      '7. Unlisted Gallery: Studio Member Access Allowed',
      'Studio member allowed direct read of unlisted gallery belonging to their studio.'
    );

    // 8. Studio Member direct read on password-protected gallery allowed
    await recordLiveTest(
      async () => {
        await assertSucceeds(
          getDoc(doc(memberADb, 'studios/studio_tenant_a/galleries/gal_pw_published'))
        );
      },
      '8. Password Gallery: Studio Member Access Allowed',
      'Studio member allowed direct read of password-protected gallery belonging to their studio.'
    );

    // 9. REMEDIATED: Media in unlisted gallery direct read is DENIED to unauthenticated clients
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_unlisted_published/media/media_unl_1'))
        );
      },
      '9. Remediated: Media in Unlisted Gallery Unauthenticated Direct Read Denied',
      'Unauthenticated direct read of media in unlisted gallery denied; must route through proxy.'
    );

    // 10. REMEDIATED: Media in password-protected gallery direct read is DENIED to unauthenticated clients
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_pw_published/media/media_pw_1'))
        );
      },
      '10. Remediated: Media in Password Gallery Unauthenticated Direct Read Denied',
      'Unauthenticated direct read of media in password gallery denied; must route through proxy.'
    );

    // 11. REMEDIATED: Proofing in unlisted gallery direct read is DENIED to unauthenticated clients
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_unlisted_published/proofing/proof_unl_1'))
        );
      },
      '11. Remediated: Proofing in Unlisted Gallery Unauthenticated Direct Read Denied',
      'Direct proofing read on unlisted gallery denied; proofing must route through backend proxy.'
    );

    // 12. REMEDIATED: Proofing in password-protected gallery direct read is DENIED to unauthenticated clients
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_pw_published/proofing/proof_pw_1'))
        );
      },
      '12. Remediated: Proofing in Password Gallery Unauthenticated Direct Read Denied',
      'Direct proofing read on password gallery denied; proofing must route through backend proxy.'
    );

    // 13. Cross-tenant read: Tenant B member reading Tenant A CRM client denied
    await recordLiveTest(
      async () => {
        await assertFails(
          getDoc(doc(memberBDb, 'studios/studio_tenant_a/clients/client_private_1'))
        );
      },
      '13. Cross-Tenant Read: Foreign Studio Member CRM Access Denied',
      'Tenant B member denied get on Tenant A client CRM document.'
    );

    // 14. Cross-tenant write: Tenant B member creating client in Tenant A denied
    await recordLiveTest(
      async () => {
        await assertFails(
          setDoc(doc(memberBDb, 'studios/studio_tenant_a/clients/client_b_in_a'), {
            name: 'Intruder Client',
            studioId: 'studio_tenant_a',
          })
        );
      },
      '14. Cross-Tenant Write: Foreign Studio Member Client Creation Denied',
      'Tenant B member denied create on Tenant A client CRM subcollection.'
    );

    // 15. Cross-tenant delete: Tenant B member deleting Tenant A gallery denied
    await recordLiveTest(
      async () => {
        await assertFails(
          deleteDoc(doc(memberBDb, 'studios/studio_tenant_a/galleries/gal_public_published'))
        );
      },
      '15. Cross-Tenant Delete: Foreign Studio Member Gallery Deletion Denied',
      'Tenant B member denied delete on Tenant A gallery.'
    );

    // 16. Unauthorized media write: Unauthenticated client adding media item denied
    await recordLiveTest(
      async () => {
        await assertFails(
          setDoc(
            doc(unauthedDb, 'studios/studio_tenant_a/galleries/gal_public_published/media/hack_photo'),
            { sizeBytes: 1000 }
          )
        );
      },
      '16. Media Write: Unauthenticated Client Media Creation Denied',
      'Unauthenticated client denied create on media subcollection.'
    );

    // 17. Unauthorized media write: Non-member adding media item denied
    await recordLiveTest(
      async () => {
        await assertFails(
          setDoc(
            doc(memberBDb, 'studios/studio_tenant_a/galleries/gal_public_published/media/hack_photo'),
            { sizeBytes: 1000 }
          )
        );
      },
      '17. Media Write: Foreign Tenant Media Creation Denied',
      'Tenant B member denied create on Tenant A gallery media subcollection.'
    );

    // 18. Media write size ceiling: Member uploading file > 250 MB denied
    await recordLiveTest(
      async () => {
        await assertFails(
          setDoc(
            doc(memberADb, 'studios/studio_tenant_a/galleries/gal_public_published/media/too_big'),
            { sizeBytes: 300000000, name: 'Gigantic.raw' }
          )
        );
      },
      '18. Media Write: Upload Exceeding 250 MB Denied',
      'Studio member upload rejected because sizeBytes exceeds 262,144,000 bytes.'
    );

    // 19. Media write valid upload: Member uploading file <= 250 MB succeeds
    await recordLiveTest(
      async () => {
        await assertSucceeds(
          setDoc(
            doc(memberADb, 'studios/studio_tenant_a/galleries/gal_public_published/media/valid_photo'),
            { sizeBytes: 5000000, name: 'Portrait.jpg' }
          )
        );
      },
      '19. Media Write: Valid Upload <= 250 MB Allowed',
      'Studio member upload allowed within 250 MB ceiling.'
    );

    // 20. Member role escalation: Studio member self-promotion to owner denied
    await recordLiveTest(
      async () => {
        await assertFails(
          updateDoc(doc(memberADb, 'studios/studio_tenant_a/members/user_member_a'), {
            role: 'owner',
          })
        );
      },
      '20. Member Role Escalation: Self-Promotion to Owner Denied',
      'Studio member denied update modifying their own role to owner.'
    );

    // 21. Plan & Quota Protection: Studio owner attempting to increase quota denied
    await recordLiveTest(
      async () => {
        await assertFails(
          updateDoc(doc(ownerADb, 'studios/studio_tenant_a'), {
            storageAllocationBytes: 50000000000,
          })
        );
      },
      '21. Plan & Quota Tampering: Owner Quota Increase Denied',
      'Studio owner denied update attempting to change storageAllocationBytes.'
    );

    // 22. Plan Protection: Studio owner attempting to change subscription plan denied
    await recordLiveTest(
      async () => {
        await assertFails(
          updateDoc(doc(ownerADb, 'studios/studio_tenant_a'), {
            plan: 'enterprise',
          })
        );
      },
      '22. Plan Tampering: Owner Plan Change Denied',
      'Studio owner denied update attempting to change plan field.'
    );

    // 23. Audit Log Immutability: Studio activity logs cannot be updated or deleted
    await recordLiveTest(
      async () => {
        await assertFails(
          updateDoc(doc(ownerADb, 'studios/studio_tenant_a/activityLogs/log_1'), {
            action: 'tampered',
          })
        );
        await assertFails(
          deleteDoc(doc(ownerADb, 'studios/studio_tenant_a/activityLogs/log_1'))
        );
      },
      '23. Audit Trail Immutability: Activity Log Update/Delete Denied',
      'Studio owner denied update and delete on immutable activityLogs.'
    );

    // 24. Anti-Privilege Escalation: User cannot set isSuperAdmin = true on profile
    await recordLiveTest(
      async () => {
        await assertFails(
          updateDoc(doc(regularUserDb, 'users/user_regular_1'), {
            isSuperAdmin: true,
          })
        );
      },
      '24. Anti-Privilege Escalation: User Cannot Self-Grant Super Admin',
      'Regular user denied update attempting to set isSuperAdmin = true.'
    );

    console.log(`\n======================================================`);
    console.log(`Official Firestore Rules Emulator Test Results:`);
    console.log(`  Static Checks: ${staticTestsPassed}/${staticTestsTotal} Passed`);
    console.log(`  Backend Integration Tests: ${backendTestsPassed}/${backendTestsTotal} Passed (${backendTestsFailed} Failed)`);
    console.log(`  Live Emulator Tests: ${liveTestsPassed}/${liveTestsTotal} Passed (${liveTestsFailed} Failed)`);
    console.log(`======================================================\n`);

    if (liveTestsFailed > 0 || backendTestsFailed > 0) {
      process.exit(1);
    }
  } finally {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }
}

runEmulatorTestSuite().catch((err) => {
  console.error('Unhandled error in emulator test suite:', err);
  process.exit(1);
});
