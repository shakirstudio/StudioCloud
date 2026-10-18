/**
 * StudioCloud: Server Identity Fail-Closed & Backend Adapter Test Suite
 * 
 * Verifies:
 * 1. Missing trusted server credentials (ADC / Service Account) strictly FAIL CLOSED.
 * 2. Unauthenticated REST calls using Web API keys are permanently disabled.
 * 3. Protected gallery access via trusted backend proxy returns HTTP 503 SERVER_CREDENTIALS_UNAVAILABLE
 *    when server credentials are absent and no test mock is loaded.
 * 4. Mock-based unit testing remains isolated and functional.
 * 5. Privileged server identity strategy transparency endpoint reports accurate state.
 */

process.env.NODE_ENV = 'test';

import http from 'http';
import crypto from 'crypto';
import { app } from '../server';
import { setMockJwksForTesting, resetJwksForTesting } from '../server/tokenVerifier';
import {
  fetchGalleryDocument,
  fetchGalleryMedia,
  fetchGalleryProofing,
  saveProofingDocument,
  ServerCredentialsUnavailableError,
  hasTrustedServerCredentials,
  setCredentialsUnavailableForTesting,
  setMockGalleryForTesting,
  setMockMediaForTesting,
  resetMockDataForTesting,
} from '../server/firestoreProxy';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let total = 0;
let passed = 0;
let failed = 0;

function record(condition: boolean, testName: string, detail: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`${GREEN}[PASS]${RESET} ${testName}`);
    console.log(`       -> ${detail}`);
  } else {
    failed++;
    console.error(`${RED}[FAIL]${RESET} ${testName}`);
    console.error(`       -> ${detail}`);
  }
}

// Generate RSA-2048 keypair for cryptographic test token signing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KEY_ID = 'test-server-identity-key-rsa';

function makeSignedToken(payloadOverrides: Record<string, any> = {}): string {
  const header = { alg: 'RS256', kid: TEST_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'totemic-metric-wmzf6',
    iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
    sub: 'client_uid_identity_test',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    email: 'client.identity@example.com',
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
  console.log(`${BOLD}${CYAN}  StudioCloud: Server Identity Fail-Closed Verification Suite        ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  setMockJwksForTesting({ [TEST_KEY_ID]: publicKey });

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const serverAddress = testServer.address() as any;
  const backendPort = serverAddress.port;

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: UNIT LEVEL FAIL-CLOSED TESTS (firestoreProxy.ts adapter)
    // -------------------------------------------------------------------------
    console.log(`${BOLD}--- SECTION 1: firestoreProxy Adapter Fail-Closed Invariants ---${RESET}`);

    // Ensure mock repository is clear
    resetMockDataForTesting();

    // Force credentials to unavailable state
    setCredentialsUnavailableForTesting(true);

    // Test 1: fetchGalleryDocument without idToken fails closed
    let galleryErrorCaught: any = null;
    try {
      await fetchGalleryDocument('studio_prod_test', 'gal_prod_test');
    } catch (err: any) {
      galleryErrorCaught = err;
    }
    record(
      galleryErrorCaught instanceof ServerCredentialsUnavailableError &&
        galleryErrorCaught.code === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '1. fetchGalleryDocument Fails Closed Without Server Credentials',
      `Threw ServerCredentialsUnavailableError (code: ${galleryErrorCaught?.code}, status: ${galleryErrorCaught?.status}).`
    );

    // Test 2: fetchGalleryMedia without idToken fails closed
    let mediaErrorCaught: any = null;
    try {
      await fetchGalleryMedia('studio_prod_test', 'gal_prod_test');
    } catch (err: any) {
      mediaErrorCaught = err;
    }
    record(
      mediaErrorCaught instanceof ServerCredentialsUnavailableError &&
        mediaErrorCaught.code === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '2. fetchGalleryMedia Fails Closed Without Server Credentials',
      `Threw ServerCredentialsUnavailableError (code: ${mediaErrorCaught?.code}).`
    );

    // Test 3: fetchGalleryProofing without idToken fails closed
    let proofingErrorCaught: any = null;
    try {
      await fetchGalleryProofing('studio_prod_test', 'gal_prod_test');
    } catch (err: any) {
      proofingErrorCaught = err;
    }
    record(
      proofingErrorCaught instanceof ServerCredentialsUnavailableError &&
        proofingErrorCaught.code === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '3. fetchGalleryProofing Fails Closed Without Server Credentials',
      `Threw ServerCredentialsUnavailableError (code: ${proofingErrorCaught?.code}).`
    );

    // Test 4: saveProofingDocument without idToken fails closed
    let saveErrorCaught: any = null;
    try {
      // Clear in-memory mock before test
      resetMockDataForTesting();
      await saveProofingDocument('studio_prod_test', 'gal_prod_test', 'prf_1', { clientUid: 'uid_test' });
    } catch (err: any) {
      saveErrorCaught = err;
    }
    record(
      saveErrorCaught instanceof ServerCredentialsUnavailableError &&
        saveErrorCaught.code === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '4. saveProofingDocument Privileged Write Fails Closed Without Server Credentials',
      `Threw ServerCredentialsUnavailableError (code: ${saveErrorCaught?.code}).`
    );

    // -------------------------------------------------------------------------
    // SECTION 2: END-TO-END HTTP BACKEND ENDPOINT FAIL-CLOSED TESTS
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}--- SECTION 2: End-to-End HTTP Endpoint Fail-Closed Behavior ---${RESET}`);

    // Test 5: POST /api/gallery/client/view returns HTTP 503 when server credentials missing
    const resViewFail = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_prod_test',
      galleryId: 'gal_prod_test',
      shareToken: 'test_token',
    });
    record(
      resViewFail.status === 503 && resViewFail.body?.error === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '5. HTTP POST /api/gallery/client/view Returns 503 SERVER_CREDENTIALS_UNAVAILABLE',
      `Returned HTTP 503: ${resViewFail.body?.message}`
    );

    // Test 6: POST /api/gallery/client/proofing returns HTTP 503 when parent gallery cannot be read
    const validClientToken = makeSignedToken();
    const resProofFail = await sendHttpRequest(
      backendPort,
      'POST',
      '/api/gallery/client/proofing',
      {
        studioId: 'studio_prod_test',
        galleryId: 'gal_prod_test',
        mediaId: 'med_test_1',
        isFavourite: true,
      },
      { Authorization: `Bearer ${validClientToken}` }
    );
    record(
      resProofFail.status === 503 && resProofFail.body?.error === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '6. HTTP POST /api/gallery/client/proofing Returns 503 When Server Cannot Verify Gallery',
      `Returned HTTP 503: ${resProofFail.body?.message}`
    );

    // Test 7: GET /api/admin/server-identity-status operational transparency
    const resStatus = await sendHttpRequest(backendPort, 'GET', '/api/admin/server-identity-status');
    record(
      resStatus.status === 200 &&
        resStatus.body?.strategy?.includes('Application Default Credentials') &&
        resStatus.body?.unauthenticatedRestFallbackDisabled === true &&
        resStatus.body?.failClosedEnforced === true,
      '7. HTTP GET /api/admin/server-identity-status Confirms Fail-Closed Policy',
      `Confirmed: unauthenticatedRestFallbackDisabled = true, failClosedEnforced = true.`
    );

    // -------------------------------------------------------------------------
    // SECTION 3: MOCK ISOLATION & TEST REPOSITORY INTEGRITY
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}--- SECTION 3: Mock Testing Isolation & Unit Test Integrity ---${RESET}`);

    // Re-enable mock data
    setMockGalleryForTesting('studio_unit_mock', {
      id: 'gal_unit_mock',
      studioId: 'studio_unit_mock',
      title: 'Mock Unit Test Collection',
      status: 'published',
      privacy: 'unlisted',
      shareToken: 'valid_unit_token',
    });

    setMockMediaForTesting('studio_unit_mock', 'gal_unit_mock', [
      {
        id: 'med_unit_1',
        studioId: 'studio_unit_mock',
        galleryId: 'gal_unit_mock',
        originalName: 'photo.jpg',
        storageUrl: 'https://storage.googleapis.com/test/photo.jpg',
        sizeBytes: 1024,
        mimeType: 'image/jpeg',
      },
    ]);

    const mockGallery = await fetchGalleryDocument('studio_unit_mock', 'gal_unit_mock');
    record(
      mockGallery !== null && mockGallery.id === 'gal_unit_mock',
      '8. In-Memory Mock Layer Intercepts Unit Tests Safely Without Network Calls',
      `Retrieved mock gallery "${mockGallery?.title}" without triggering server credentials.`
    );

    // Test 9: With mock loaded, endpoint returns HTTP 200 and strips credentials
    const resMockView = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_unit_mock',
      galleryId: 'gal_unit_mock',
      shareToken: 'valid_unit_token',
    });
    record(
      resMockView.status === 200 &&
        resMockView.body?.gallery &&
        resMockView.body.gallery.shareToken === undefined,
      '9. Protected Mock Gallery Unlocked & Credentials Stripped (HTTP 200)',
      'Mock gallery view succeeds with valid share token; credentials sanitized from response.'
    );

    // Test 10: Resetting mock re-triggers fail-closed behavior
    resetMockDataForTesting();
    const resMockCleared = await sendHttpRequest(backendPort, 'POST', '/api/gallery/client/view', {
      studioId: 'studio_unit_mock',
      galleryId: 'gal_unit_mock',
      shareToken: 'valid_unit_token',
    });
    record(
      resMockCleared.status === 503 && resMockCleared.body?.error === 'SERVER_CREDENTIALS_UNAVAILABLE',
      '10. Clearing Mock Immediately Re-Engages Strict Fail-Closed Enforcement',
      'Cleared mock leads directly to HTTP 503 fail-closed; zero unauthenticated leakage.'
    );
  } finally {
    // Reset test hooks
    setCredentialsUnavailableForTesting(null);
    resetMockDataForTesting();
    resetJwksForTesting();
    testServer.close();
  }

  console.log(`\n======================================================`);
  console.log(`Server Identity Fail-Closed Test Results: ${passed}/${total} Passed (${failed} Failed)`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in fail-closed test runner:', err);
  process.exit(1);
});
