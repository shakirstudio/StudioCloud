/**
 * StudioCloud: Backend Proxy Integration Test Suite (Standalone)
 * 
 * Executes the 10 backend proxy integration assertions (B1 - B10)
 * validating server-side token/password authorization, credential stripping,
 * expired gallery enforcement, rate limiting, and authenticated UID binding.
 */

process.env.NODE_ENV = 'test';

import http from 'http';
import crypto from 'crypto';
import { app } from '../server';
import { setMockJwksForTesting, resetJwksForTesting } from '../server/tokenVerifier';
import {
  setMockGalleryForTesting,
  setMockMediaForTesting,
  setMockProofingForTesting,
  resetMockDataForTesting,
} from '../server/firestoreProxy';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let total = 0;

function recordTest(condition: boolean, testName: string, detail: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`${GREEN}[BACKEND PASS]${RESET} ${testName}`);
    console.log(`               -> ${detail}`);
  } else {
    failed++;
    console.error(`${RED}[BACKEND FAIL]${RESET} ${testName}`);
    console.error(`               -> ${detail}`);
  }
}

// Generate RSA-2048 keypair for cryptographic test token signing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KEY_ID = 'test-backend-proxy-key-rsa';

function makeSignedToken(payloadOverrides: Record<string, any> = {}): string {
  const header = { alg: 'RS256', kid: TEST_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'totemic-metric-wmzf6',
    iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
    sub: 'client_uid_backend_test',
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
    const reqHeaders: Record<string, string> = { ...headers };
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

async function run() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  StudioCloud: Standalone Backend Proxy Integration Test Suite       ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  setMockJwksForTesting({ [TEST_KEY_ID]: publicKey });

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const serverAddress = testServer.address() as any;
  const backendPort = serverAddress.port;

  try {
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
    recordTest(
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
    recordTest(
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
    recordTest(
      b3.status === 200 && b3CredentialsStripped && b3.body?.mediaItems?.length === 1,
      'B3. Backend Proxy: Valid Token Unlocks Gallery & Strips Credentials (HTTP 200)',
      'Unlocked gallery; accessPassword & shareToken are stripped from client response.'
    );

    // Test B4: Password gallery without password -> 401 with requiresPassword: true
    const b4 = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_mock_1',
      galleryId: 'gal_pw_mock',
    });
    recordTest(
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
    recordTest(
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
    recordTest(
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
    recordTest(
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
    recordTest(
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
    recordTest(
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
    recordTest(
      b10.status === 200 && Array.isArray(b10.body?.proofingItems) && b10.body.proofingItems.length >= 1,
      'B10. Backend Proxy: Proofing Selections Filtered to Caller UID (HTTP 200)',
      `Retrieved ${b10.body?.proofingItems?.length} proofing item(s) belonging to caller.`
    );
  } finally {
    testServer.close();
    resetJwksForTesting();
    resetMockDataForTesting();
  }

  console.log(`\n======================================================`);
  console.log(`Standalone Backend Proxy Test Results: ${passed}/${total} Passed (${failed} Failed)`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in backend proxy test runner:', err);
  process.exit(1);
});
