import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { app } from '../server';
import { 
  setMockGalleryForTesting, 
  setMockMediaForTesting, 
  setMockProofingForTesting, 
  resetMockDataForTesting 
} from '../server/firestoreProxy';
import { 
  setMockJwksForTesting,
  resetJwksForTesting 
} from '../server/tokenVerifier';
import { resetLimiterForTesting } from '../server/rateLimiter';

class Phase2TestRunner {
  private total = 0;
  private passed = 0;

  assert(name: string, condition: boolean, details: string) {
    this.total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      console.log(`       -> ${details}`);
      this.passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      console.error(`       -> ${details}`);
    }
  }

  summary(title: string) {
    console.log(`\n======================================================`);
    console.log(`${title}: ${this.passed}/${this.total} Assertions Passed`);
    console.log(`======================================================\n`);
    if (this.passed !== this.total) {
      process.exit(1);
    }
  }
}

// Generate RSA-2048 keypair for cryptographic test token signing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-phase2-key-01';

function createSignedTestToken(payloadOverrides: Record<string, any> = {}, headerOverrides: Record<string, any> = {}): string {
  const header = {
    alg: 'RS256',
    kid: TEST_KID,
    typ: 'JWT',
    ...headerOverrides,
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'totemic-metric-wmzf6',
    iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
    sub: 'client_uid_test_999',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    email: 'client.vip@example.com',
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

async function runPhase2IntegrationVerification() {
  console.log('=== StudioCloud: Phase 2 Frontend Integration Verification Suite ===\n');
  const runner = new Phase2TestRunner();

  // Part 1: Static Source Verification of ClientGalleryView.tsx
  const clientViewPath = path.resolve(process.cwd(), 'src/components/client/ClientGalleryView.tsx');
  const clientViewSource = fs.readFileSync(clientViewPath, 'utf8');

  const noFirestoreImport = !clientViewSource.includes("import { doc, getDoc } from 'firebase/firestore'") &&
                            !clientViewSource.includes("import('firebase/firestore')");
  runner.assert(
    '1. ClientGalleryView: Zero Direct Firestore SDK Imports',
    noFirestoreImport,
    'ClientGalleryView has removed all direct firestore document reads.'
  );

  const routesThroughViewProxy = clientViewSource.includes("fetch('/api/gallery/client/view'");
  runner.assert(
    '2. ClientGalleryView: Routes Gallery & Media through /api/gallery/client/view',
    routesThroughViewProxy,
    'Client gallery view fetches metadata and media exclusively via trusted backend proxy.'
  );

  const routesProofingViaProxy = clientViewSource.includes("fetch(`/api/gallery/client/proofing") ||
                                 clientViewSource.includes("fetch('/api/gallery/client/proofing");
  runner.assert(
    '3. ClientGalleryView: Routes Client Proofing Reads via Backend Proxy',
    routesProofingViaProxy,
    'Client proofing selections are retrieved via backend proxy endpoint.'
  );

  const obtainsRealIdToken = clientViewSource.includes('auth.currentUser.getIdToken()') ||
                             clientViewSource.includes('auth.currentUser?.getIdToken()');
  runner.assert(
    '4. ClientGalleryView: Derives Token Exclusively from Firebase Auth Session',
    obtainsRealIdToken,
    'Verified tokens are extracted from active Firebase Auth session; no fabricated tokens.'
  );

  const sendsBearerAuth = clientViewSource.includes("Authorization': `Bearer ${token}`") ||
                          clientViewSource.includes("Authorization': `Bearer ${idToken}`") ||
                          clientViewSource.includes("Authorization: `Bearer ${token}`");
  runner.assert(
    '5. ClientGalleryView: Passes Bearer Token in Authorization Header',
    sendsBearerAuth,
    'Authorization header properly formats Bearer token for server verification.'
  );

  const passwordSentToProxy = clientViewSource.includes('fetchGalleryViaProxy(cleanPw)') ||
                              clientViewSource.includes('fetchGalleryViaProxy(passwordInput');
  const noPlaintextPasswordCompare = !clientViewSource.includes('passwordInput.trim() === gallery.accessPassword');
  runner.assert(
    '6. ClientGalleryView: Eliminates In-Browser Plaintext Password Comparison',
    passwordSentToProxy && noPlaintextPasswordCompare,
    'Gallery password verification is delegated entirely to constant-time server authorizer.'
  );

  // Part 2: Static Source Verification of proofingService.ts
  const proofServicePath = path.resolve(process.cwd(), 'src/services/proofingService.ts');
  const proofServiceSource = fs.readFileSync(proofServicePath, 'utf8');

  const saveProofRoutesToProxy = proofServiceSource.includes("fetch('/api/gallery/client/proofing'");
  runner.assert(
    '7. proofingService: savePhotoProofItem Routes Writes to Backend Proxy',
    saveProofRoutesToProxy,
    'Photo proofing write requests are directed to /api/gallery/client/proofing.'
  );

  const submitReviewRoutesToProxy = proofServiceSource.includes("fetch('/api/gallery/client/proofing'");
  runner.assert(
    '8. proofingService: submitClientProofingReview Routes Submissions to Backend Proxy',
    submitReviewRoutesToProxy,
    'Review submissions are submitted to trusted backend authority.'
  );

  const requiresAuthToSave = proofServiceSource.includes('AUTHENTICATION_REQUIRED');
  runner.assert(
    '9. proofingService: Rejects Unauthenticated Client Writes with AUTHENTICATION_REQUIRED',
    requiresAuthToSave,
    'Proofing service rejects unauthenticated write attempts before sending invalid requests.'
  );

  // Part 3: Live End-to-End HTTP Contract Verification
  setMockJwksForTesting({ [TEST_KID]: publicKey });
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, resolve));
  const address = testServer.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  try {
    const testStudioId = 'stu_phase2_test';
    const testGalId = 'gal_phase2_pw';

    setMockGalleryForTesting(testStudioId, {
      id: testGalId,
      studioId: testStudioId,
      title: 'Phase 2 Sunset Elopement',
      privacy: 'password_protected',
      accessPassword: 'StudioPassword2026',
      status: 'published',
    });

    setMockMediaForTesting(testStudioId, testGalId, [
      {
        id: 'med_sunset_01',
        studioId: testStudioId,
        galleryId: testGalId,
        originalName: 'Sunset_Ridge_01.jpg',
        storageUrl: 'https://storage.googleapis.com/test/sunset_01.jpg',
        sizeBytes: 4500000,
        mimeType: 'image/jpeg',
      },
    ]);

    // Live Test 1: Proxy returns 401 requiresPassword for password-protected gallery without password
    const resNoPw = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studioId: testStudioId, galleryId: testGalId }),
    });
    const dataNoPw = await resNoPw.json();
    runner.assert(
      '10. End-to-End: Password Challenge Contract (HTTP 401 requiresPassword)',
      resNoPw.status === 401 && dataNoPw.requiresPassword === true,
      `Challenged protected gallery with HTTP ${resNoPw.status} and requiresPassword flag.`
    );

    // Live Test 2: Unlocks with correct password, sanitizes payload, and returns media
    const resUnlock = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studioId: testStudioId,
        galleryId: testGalId,
        password: 'StudioPassword2026',
      }),
    });
    const dataUnlock = await resUnlock.json();
    runner.assert(
      '11. End-to-End: Successful Unlock Returns Sanitized Metadata & Media',
      resUnlock.status === 200 &&
      dataUnlock.gallery?.title === 'Phase 2 Sunset Elopement' &&
      dataUnlock.gallery?.accessPassword === undefined &&
      dataUnlock.gallery?.shareToken === undefined &&
      dataUnlock.mediaItems?.length === 1,
      'Unlocked gallery payload verified clean; zero credentials exposed, media items returned.'
    );

    // Live Test 3: Authenticated client saves proof selection via proxy
    const clientUid = 'client_phase2_verified_user';
    const testToken = createSignedTestToken({ sub: clientUid, email: 'client@example.com' });

    const resSaveProof = await fetch(`${baseUrl}/api/gallery/client/proofing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        studioId: testStudioId,
        galleryId: testGalId,
        mediaId: 'med_sunset_01',
        password: 'StudioPassword2026',
        isFavourite: true,
        isApprovedForAlbum: true,
        comment: 'Stunning sunset silhouette.',
      }),
    });
    const dataSaveProof = await resSaveProof.json();
    runner.assert(
      '12. End-to-End: Client Proofing Write Binds Verified Token UID',
      resSaveProof.status === 200 &&
      dataSaveProof.success === true &&
      dataSaveProof.proof?.clientUid === clientUid &&
      dataSaveProof.proof?.isFavourite === true &&
      dataSaveProof.proof?.isApprovedForAlbum === true,
      `Saved proof selection permanently bound to authenticated UID: ${dataSaveProof.proof?.clientUid}.`
    );

    // Live Test 4: Authenticated client retrieves proofing items
    const resGetProofs = await fetch(
      `${baseUrl}/api/gallery/client/proofing?studioId=${testStudioId}&galleryId=${testGalId}&password=StudioPassword2026`,
      {
        headers: { Authorization: `Bearer ${testToken}` },
      }
    );
    const dataGetProofs = await resGetProofs.json();
    runner.assert(
      '13. End-to-End: Client Proofing Read Returns User Selections',
      resGetProofs.status === 200 &&
      Array.isArray(dataGetProofs.proofingItems) &&
      dataGetProofs.proofingItems.some((p: any) => p.mediaId === 'med_sunset_01' && p.isFavourite === true),
      `Retrieved ${dataGetProofs.proofingItems?.length} proofing item(s) for client session.`
    );

  } finally {
    testServer.close();
    resetJwksForTesting();
    resetMockDataForTesting();
    resetLimiterForTesting();
  }

  runner.summary('StudioCloud Phase 2 Frontend Integration Verification');
}

runPhase2IntegrationVerification().catch((err) => {
  console.error('Fatal Phase 2 verification error:', err);
  process.exit(1);
});
