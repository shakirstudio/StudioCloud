/**
 * StudioCloud: Phase 1 Gallery Access & Tenant Isolation Security Verification Suite
 * 
 * Strict 4-Tier Test Classification:
 * Tier 1: Static Checks & Code Analysis (AST, configuration, firestore.rules)
 * Tier 2: Backend Unit Tests (crypto verifier, constant-time compare, rate limiter, authorizer)
 * Tier 3: Simulated Security Boundary Tests (safe legacy reclaim, UID binding, tenant isolation)
 * Tier 4: Actual HTTP Authorization Tests (live Express HTTP requests against backend proxy routes)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { app } from '../server';
import { 
  verifyFirebaseIdToken, 
  setMockJwksForTesting, 
  resetJwksForTesting,
  TokenVerificationError 
} from '../server/tokenVerifier';
import { 
  safeCompare, 
  sanitizeGalleryForClient, 
  sanitizeProofForClient, 
  isValidTenantId 
} from '../server/credentialUtils';
import { 
  checkRateLimit, 
  recordFailedAttempt, 
  recordSuccess, 
  resetLimiterForTesting 
} from '../server/rateLimiter';
import { 
  authorizeGalleryAccess, 
  authorizeProofingWrite 
} from '../server/galleryAuthorizer';
import { 
  setMockGalleryForTesting, 
  setMockMediaForTesting, 
  setMockProofingForTesting, 
  resetMockDataForTesting 
} from '../server/firestoreProxy';

class TestRunner {
  private total = 0;
  private passed = 0;

  assert(tier: string, name: string, condition: boolean, details: string) {
    this.total++;
    const prefix = `[${tier}] ${name}`;
    if (condition) {
      console.log(`[PASS] ${prefix}`);
      console.log(`       -> ${details}`);
      this.passed++;
    } else {
      console.error(`[FAIL] ${prefix}`);
      console.error(`       -> ${details}`);
    }
  }

  summary(title: string) {
    console.log(`\n======================================================`);
    console.log(`${title}: ${this.passed}/${this.total} Security Assertions Passed`);
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

const TEST_KID = 'test-security-key-01';

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

  if (header.alg === 'none') {
    return `${encHeader}.${encPayload}.`;
  }

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encHeader}.${encPayload}`);
  const signature = signer.sign(privateKey).toString('base64url');
  return `${encHeader}.${encPayload}.${signature}`;
}

async function runPhase1SecurityVerification() {
  console.log('=== StudioCloud: Phase 1 Gallery Access & Tenant Isolation Security Suite ===\n');
  const runner = new TestRunner();

  // Configure test keys in token verifier
  setMockJwksForTesting({
    [TEST_KID]: publicKey,
  });

  // ----------------------------------------------------
  // TIER 1: STATIC CHECKS & CODE ANALYSIS
  // ----------------------------------------------------
  console.log('--- Tier 1: Static Checks & Code Analysis ---');

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  runner.assert(
    'Tier 1',
    '1. Firestore Rules Default Catch-All Deny Present',
    rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Unmapped collections and unexpected root paths fail closed with explicit default deny.'
  );

  runner.assert(
    'Tier 1',
    '2. Server Strips Sensitive Credentials (accessPassword & shareToken) in Responses',
    serverContent.includes('sanitizeGalleryForClient') && 
    serverContent.includes('const safeGallery = sanitizeGalleryForClient(gallery);') &&
    !serverContent.includes('res.json({ gallery: gallery }'),
    'Backend proxy routes invoke sanitizeGalleryForClient; accessPassword and shareToken are never returned to clients.'
  );

  runner.assert(
    'Tier 1',
    '3. Server Enforces Rate Limiting Middleware on Protected Gallery Access',
    serverContent.includes('checkRateLimit(clientIp, galleryId)') &&
    serverContent.includes("error: 'RATE_LIMIT_EXCEEDED'"),
    'Protected gallery endpoint calls checkRateLimit and blocks brute-force requests with HTTP 429.'
  );

  // ----------------------------------------------------
  // TIER 2: BACKEND UNIT TESTS
  // ----------------------------------------------------
  console.log('\n--- Tier 2: Backend Unit Tests ---');

  // 4. Token Verifier: Valid RS256 Token
  const validToken = createSignedTestToken();
  const verifiedToken = await verifyFirebaseIdToken(validToken);
  runner.assert(
    'Tier 2',
    '4. Token Verifier Accepts Valid RS256 Token & Extracts Claims',
    verifiedToken.uid === 'client_uid_test_999' &&
    verifiedToken.email === 'client.vip@example.com' &&
    verifiedToken.email_verified === true &&
    verifiedToken.aud === 'totemic-metric-wmzf6',
    `Verified RS256 token derived valid UID: ${verifiedToken.uid} and audience: ${verifiedToken.aud}`
  );

  // 5. Token Verifier: Rejects Unsupported Algorithm (alg: none or HS256)
  let rejectedAlg = false;
  try {
    const noneToken = createSignedTestToken({}, { alg: 'none' });
    await verifyFirebaseIdToken(noneToken);
  } catch (err: any) {
    rejectedAlg = err instanceof TokenVerificationError && err.code === 'UNSUPPORTED_ALGORITHM';
  }
  runner.assert(
    'Tier 2',
    '5. Token Verifier Rejects Non-RS256 Algorithm (alg: none)',
    rejectedAlg,
    "Strict RS256 algorithm enforcement threw UNSUPPORTED_ALGORITHM for alg='none'."
  );

  // 6. Token Verifier: Rejects Mismatched Audience
  let rejectedAud = false;
  try {
    const wrongAudToken = createSignedTestToken({ aud: 'malicious-attacker-project' });
    await verifyFirebaseIdToken(wrongAudToken);
  } catch (err: any) {
    rejectedAud = err instanceof TokenVerificationError && err.code === 'INVALID_TOKEN_AUDIENCE';
  }
  runner.assert(
    'Tier 2',
    '6. Token Verifier Rejects Token with Mismatched Audience',
    rejectedAud,
    'Audience check failed for cross-project token; returned INVALID_TOKEN_AUDIENCE.'
  );

  // 7. Token Verifier: Rejects Expired Token
  let rejectedExp = false;
  try {
    const expiredToken = createSignedTestToken({ exp: Math.floor(Date.now() / 1000) - 600 });
    await verifyFirebaseIdToken(expiredToken, { clockSkewSeconds: 0 });
  } catch (err: any) {
    rejectedExp = err instanceof TokenVerificationError && err.code === 'TOKEN_EXPIRED';
  }
  runner.assert(
    'Tier 2',
    '7. Token Verifier Rejects Expired Token',
    rejectedExp,
    'Expired token threw TOKEN_EXPIRED error.'
  );

  // 8. Token Verifier: Rejects Tampered Signature
  let rejectedTamper = false;
  try {
    const parts = validToken.split('.');
    // Flip one char in signature
    const tamperedSig = parts[2].slice(0, -2) + (parts[2].slice(-2) === 'AA' ? 'BB' : 'AA');
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    await verifyFirebaseIdToken(tamperedToken);
  } catch (err: any) {
    rejectedTamper = err instanceof TokenVerificationError && err.code === 'INVALID_TOKEN_SIGNATURE';
  }
  runner.assert(
    'Tier 2',
    '8. Token Verifier Rejects Cryptographically Tampered Signature',
    rejectedTamper,
    'Tampered signature threw INVALID_TOKEN_SIGNATURE error.'
  );

  // 9. Credential Utils: Constant-Time Comparison
  const compTrue = safeCompare('secure_password_123', 'secure_password_123');
  const compFalse = safeCompare('secure_password_123', 'wrong_password_999');
  const compDiffLen = safeCompare('secure_password_123', 'short');
  runner.assert(
    'Tier 2',
    '9. Credential Utils Constant-Time Safe Comparison',
    compTrue === true && compFalse === false && compDiffLen === false,
    'safeCompare handles match, mismatch, and length difference safely using timingSafeEqual.'
  );

  // 10. Credential Utils: Stripping Sensitive Fields
  const rawGalleryDoc = {
    id: 'gal_100',
    studioId: 'stu_100',
    title: 'Highland Wedding',
    privacy: 'password_protected',
    accessPassword: 'super_secret_password',
    shareToken: 'sh_token_secret_123',
    status: 'published',
  };
  const sanitized = sanitizeGalleryForClient(rawGalleryDoc);
  runner.assert(
    'Tier 2',
    '10. sanitizeGalleryForClient Strips accessPassword & shareToken',
    (sanitized as any).accessPassword === undefined &&
    (sanitized as any).shareToken === undefined &&
    sanitized.title === 'Highland Wedding' &&
    sanitized.id === 'gal_100',
    'Sensitive fields accessPassword and shareToken successfully removed from client payload.'
  );

  // 11. Rate Limiter: Max 5 Failed Attempts
  resetLimiterForTesting();
  const testIp = '192.168.1.105';
  const testGalId = 'gal_rate_test';
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt(testIp, testGalId);
  }
  const checkAfter5 = checkRateLimit(testIp, testGalId);
  recordSuccess(testIp, testGalId);
  const checkAfterSuccess = checkRateLimit(testIp, testGalId);
  runner.assert(
    'Tier 2',
    '11. Sliding-Window Rate Limiter Blocks After 5 Failed Attempts & Clears on Success',
    checkAfter5.allowed === false && checkAfter5.remaining === 0 && checkAfterSuccess.allowed === true,
    'Blocked at 5 failed attempts; resetLimiter and recordSuccess cleared block immediately.'
  );

  // 12. Gallery Authorizer: Denies Draft / Archived Gallery to External Clients
  const draftGallery = {
    id: 'gal_draft',
    studioId: 'studio_abc',
    status: 'draft',
    privacy: 'public',
  };
  const draftAuth = authorizeGalleryAccess({
    gallery: draftGallery,
    studioId: 'studio_abc',
    galleryId: 'gal_draft',
    isStudioMember: false,
  });
  runner.assert(
    'Tier 2',
    '12. Gallery Authorizer Rejects Draft Gallery for External Clients',
    draftAuth.allowed === false && draftAuth.code === 'GALLERY_NOT_PUBLISHED' && draftAuth.status === 403,
    'Draft gallery denied with 403 GALLERY_NOT_PUBLISHED.'
  );

  // 13. Gallery Authorizer: Denies Expired Gallery (HTTP 410)
  const expiredGallery = {
    id: 'gal_exp',
    studioId: 'studio_abc',
    status: 'published',
    privacy: 'public',
    expiresAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  };
  const expAuth = authorizeGalleryAccess({
    gallery: expiredGallery,
    studioId: 'studio_abc',
    galleryId: 'gal_exp',
    isStudioMember: false,
  });
  runner.assert(
    'Tier 2',
    '13. Gallery Authorizer Enforces Expiration Boundary with HTTP 410 Gone',
    expAuth.allowed === false && expAuth.code === 'GALLERY_EXPIRED' && expAuth.status === 410,
    'Expired gallery denied with HTTP 410 GALLERY_EXPIRED.'
  );

  // 14. Gallery Authorizer: Password Protection Validation
  const pwGallery = {
    id: 'gal_pw',
    studioId: 'studio_abc',
    status: 'published',
    privacy: 'password_protected',
    accessPassword: 'StudioPassword2026',
  };
  const pwMissing = authorizeGalleryAccess({
    gallery: pwGallery,
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
    password: null,
  });
  const pwWrong = authorizeGalleryAccess({
    gallery: pwGallery,
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
    password: 'IncorrectPassword',
  });
  const pwCorrect = authorizeGalleryAccess({
    gallery: pwGallery,
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
    password: 'StudioPassword2026',
  });
  runner.assert(
    'Tier 2',
    '14. Gallery Authorizer Validates Password Protection with Constant-Time Check',
    pwMissing.requiresPassword === true &&
    pwWrong.code === 'INVALID_GALLERY_PASSWORD' &&
    pwCorrect.allowed === true &&
    pwCorrect.status === 200,
    'Password gate: missing -> 401 requiresPassword, wrong -> 403, correct -> 200 OK.'
  );

  // 15. Gallery Authorizer: Studio Preview Bypass
  const previewAuth = authorizeGalleryAccess({
    gallery: pwGallery,
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
    isStudioMember: true,
  });
  runner.assert(
    'Tier 2',
    '15. Gallery Authorizer Allows Studio Member Internal Preview Bypass',
    previewAuth.allowed === true && previewAuth.status === 200,
    'Studio member preview verified without requiring client password.'
  );

  // ----------------------------------------------------
  // TIER 3: SIMULATED SECURITY BOUNDARY TESTS
  // ----------------------------------------------------
  console.log('\n--- Tier 3: Simulated Security Boundary Tests ---');

  // 16. Proofing: Binds Authenticated UID and Overwrites Forged Identity
  const proofWriteNew = authorizeProofingWrite({
    existingProof: null,
    incomingProof: {
      mediaId: 'media_photo_1',
      clientUid: 'malicious_forged_uid_666', // Attacker attempts to forge another user's UID
      isFavorite: true,
    },
    verifiedUser: {
      uid: 'client_uid_test_999',
      email: 'client.vip@example.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
      sub: 'client_uid_test_999',
      aud: 'totemic-metric-wmzf6',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
  });
  runner.assert(
    'Tier 3',
    '16. Proofing Write Binds Authenticated UID & Overwrites Forged Client UID',
    proofWriteNew.allowed === true &&
    proofWriteNew.sanitizedProof.clientUid === 'client_uid_test_999' &&
    proofWriteNew.sanitizedProof.studioId === 'studio_abc' &&
    proofWriteNew.sanitizedProof.galleryId === 'gal_pw',
    'Server ignored client-supplied clientUid and bound verified token UID client_uid_test_999.'
  );

  // 17. Proofing: Blocks Cross-Client Impersonation on Existing Record
  const existingBoundProof = {
    id: 'prf_media1_owner',
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
    mediaId: 'media_photo_1',
    clientUid: 'legitimate_client_victim',
    isFavorite: true,
  };
  const impAuth = authorizeProofingWrite({
    existingProof: existingBoundProof,
    incomingProof: {
      mediaId: 'media_photo_1',
      isFavorite: false,
    },
    verifiedUser: {
      uid: 'attacker_uid_444',
      email: 'attacker@evil.com',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
      sub: 'attacker_uid_444',
      aud: 'totemic-metric-wmzf6',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
  });
  runner.assert(
    'Tier 3',
    '17. Proofing Write Blocks Modification of Selections Owned by Another Client',
    impAuth.allowed === false && impAuth.code === 'IMPERSONATION_PREVENTED' && impAuth.status === 403,
    'Attempted modification of another UID record threw 403 IMPERSONATION_PREVENTED.'
  );

  // 18. Proofing: Rejects Unverified Email Takeover of Legacy Historical Record
  const legacyHistoricalProof = {
    id: 'prf_media1_bride_gmail_com',
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
    mediaId: 'media_photo_1',
    clientEmail: 'bride@gmail.com', // Historical record without clientUid
    isFavorite: true,
  };
  const unverifiedClaimAuth = authorizeProofingWrite({
    existingProof: legacyHistoricalProof,
    incomingProof: {
      mediaId: 'media_photo_1',
      isFavorite: false,
    },
    verifiedUser: {
      uid: 'fake_bride_uid',
      email: 'bride@gmail.com',
      email_verified: false, // NOT verified!
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
      sub: 'fake_bride_uid',
      aud: 'totemic-metric-wmzf6',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
  });
  runner.assert(
    'Tier 3',
    '18. Proofing Reclaim Rejects Unverified Email Account Attempting Legacy Takeover',
    unverifiedClaimAuth.allowed === false &&
    unverifiedClaimAuth.code === 'EMAIL_VERIFICATION_REQUIRED' &&
    unverifiedClaimAuth.status === 403,
    'Unverified email account blocked from claiming legacy proofing with EMAIL_VERIFICATION_REQUIRED.'
  );

  // 19. Proofing: Verified Email Safely Reclaims Legacy Historical Record
  const verifiedClaimAuth = authorizeProofingWrite({
    existingProof: legacyHistoricalProof,
    incomingProof: {
      mediaId: 'media_photo_1',
      isFavorite: true,
      isInAlbum: true,
    },
    verifiedUser: {
      uid: 'real_bride_uid_888',
      email: 'bride@gmail.com',
      email_verified: true, // VERIFIED!
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
      sub: 'real_bride_uid_888',
      aud: 'totemic-metric-wmzf6',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
    studioId: 'studio_abc',
    galleryId: 'gal_pw',
  });
  runner.assert(
    'Tier 3',
    '19. Verified Email Safely Reclaims Historical Record & Permanently Binds UID',
    verifiedClaimAuth.allowed === true &&
    verifiedClaimAuth.sanitizedProof.clientUid === 'real_bride_uid_888' &&
    verifiedClaimAuth.sanitizedProof.claimedByEmail === 'bride@gmail.com' &&
    Boolean(verifiedClaimAuth.sanitizedProof.claimedAt),
    'Legacy record reclaimed safely: clientUid bound to real_bride_uid_888 with claimedAt timestamp.'
  );

  // 20. Tenant Boundary: Mismatched Studio ID Denied
  const tenantMismatchAuth = authorizeGalleryAccess({
    gallery: {
      id: 'gal_other',
      studioId: 'studio_victim',
      status: 'published',
      privacy: 'public',
    },
    studioId: 'studio_attacker',
    galleryId: 'gal_other',
  });
  runner.assert(
    'Tier 3',
    '20. Tenant Boundary Check Rejects Gallery from Another Studio Tenant',
    tenantMismatchAuth.allowed === false &&
    tenantMismatchAuth.code === 'TENANT_MISMATCH' &&
    tenantMismatchAuth.status === 403,
    'Cross-tenant gallery request denied with 403 TENANT_MISMATCH.'
  );

  // ----------------------------------------------------
  // TIER 4: ACTUAL HTTP AUTHORIZATION TESTS
  // ----------------------------------------------------
  console.log('\n--- Tier 4: Actual HTTP Authorization Tests ---');

  // Start HTTP server on ephemeral port for live endpoint tests
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, resolve));
  const port = (testServer.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  // Seed mock Firestore data in memory
  resetMockDataForTesting();
  resetLimiterForTesting();

  const mockGalleryPw = {
    id: 'gal_live_pw',
    studioId: 'studio_live',
    title: 'Autumn Collection',
    status: 'published' as const,
    privacy: 'password_protected' as const,
    accessPassword: 'SecretClientPassword77',
    shareToken: 'sh_live_token_999',
  };
  setMockGalleryForTesting('studio_live', mockGalleryPw);
  setMockMediaForTesting('studio_live', 'gal_live_pw', [
    {
      id: 'media_photo_101',
      studioId: 'studio_live',
      galleryId: 'gal_live_pw',
      originalName: 'ceremony_01.jpg',
      storageUrl: 'https://storage.googleapis.com/test/photo101.jpg',
      sizeBytes: 15400000,
      mimeType: 'image/jpeg',
    },
  ]);

  const mockGalleryExpired = {
    id: 'gal_live_exp',
    studioId: 'studio_live',
    title: 'Expired Showcase',
    status: 'published' as const,
    privacy: 'public' as const,
    expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  };
  setMockGalleryForTesting('studio_live', mockGalleryExpired);

  try {
    // 21. Live HTTP: POST /api/gallery/client/view - Missing IDs
    const resBadId = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studioId: 'invalid/slash/id', galleryId: 'gal_live_pw' }),
    });
    runner.assert(
      'Tier 4',
      '21. Live HTTP POST /api/gallery/client/view Rejects Invalid Tenant Format (400)',
      resBadId.status === 400,
      `Invalid tenant ID returned HTTP ${resBadId.status}.`
    );

    // 22. Live HTTP: POST /api/gallery/client/view - Password Protected without password
    const resNoPw = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studioId: 'studio_live', galleryId: 'gal_live_pw' }),
    });
    const dataNoPw = await resNoPw.json();
    runner.assert(
      'Tier 4',
      '22. Live HTTP POST /api/gallery/client/view Returns 401 with requiresPassword Flag',
      resNoPw.status === 401 && dataNoPw.requiresPassword === true,
      `Unauthenticated password request returned HTTP ${resNoPw.status} with requiresPassword: ${dataNoPw.requiresPassword}.`
    );

    // 23. Live HTTP: POST /api/gallery/client/view - Incorrect password
    const resWrongPw = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studioId: 'studio_live',
        galleryId: 'gal_live_pw',
        password: 'IncorrectPassword!',
      }),
    });
    const dataWrongPw = await resWrongPw.json();
    runner.assert(
      'Tier 4',
      '23. Live HTTP POST /api/gallery/client/view Rejects Wrong Password with 403',
      resWrongPw.status === 403 && dataWrongPw.error === 'INVALID_GALLERY_PASSWORD',
      `Wrong password returned HTTP ${resWrongPw.status} (${dataWrongPw.error}).`
    );

    // 24. Live HTTP: Rate Limiter Blocks After Repeated Wrong Passwords
    for (let attempt = 0; attempt < 5; attempt++) {
      await fetch(`${baseUrl}/api/gallery/client/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.99' },
        body: JSON.stringify({
          studioId: 'studio_live',
          galleryId: 'gal_live_pw',
          password: `BadPassword_${attempt}`,
        }),
      });
    }
    const resRateLimited = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.99' },
      body: JSON.stringify({
        studioId: 'studio_live',
        galleryId: 'gal_live_pw',
        password: 'BadPassword_6',
      }),
    });
    const dataRateLimited = await resRateLimited.json();
    runner.assert(
      'Tier 4',
      '24. Live HTTP POST /api/gallery/client/view Blocks Brute-Force with HTTP 429',
      resRateLimited.status === 429 && dataRateLimited.error === 'RATE_LIMIT_EXCEEDED',
      `Rate limiter triggered HTTP ${resRateLimited.status}: ${dataRateLimited.message}`
    );

    // 25. Live HTTP: Valid Password Returns Sanitized Gallery and Media (Never Leaks Password)
    const resCorrectPw = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.100' },
      body: JSON.stringify({
        studioId: 'studio_live',
        galleryId: 'gal_live_pw',
        password: 'SecretClientPassword77',
      }),
    });
    const dataCorrectPw = await resCorrectPw.json();
    runner.assert(
      'Tier 4',
      '25. Live HTTP POST /api/gallery/client/view Returns 200 & NEVER Leaks Sensitive Fields',
      resCorrectPw.status === 200 &&
      dataCorrectPw.gallery?.id === 'gal_live_pw' &&
      dataCorrectPw.gallery?.title === 'Autumn Collection' &&
      dataCorrectPw.gallery?.accessPassword === undefined &&
      dataCorrectPw.gallery?.shareToken === undefined &&
      dataCorrectPw.mediaItems?.length === 1,
      'Authorized response verified: 1 media item returned, accessPassword and shareToken are undefined.'
    );

    // 26. Live HTTP: Expired Gallery Returns HTTP 410
    const resExpired = await fetch(`${baseUrl}/api/gallery/client/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studioId: 'studio_live', galleryId: 'gal_live_exp' }),
    });
    runner.assert(
      'Tier 4',
      '26. Live HTTP POST /api/gallery/client/view Returns 410 for Expired Gallery',
      resExpired.status === 410,
      `Expired gallery returned HTTP ${resExpired.status}.`
    );

    // 27. Live HTTP: Proofing Write Requires Bearer Token
    const resNoAuthProof = await fetch(`${baseUrl}/api/gallery/client/proofing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studioId: 'studio_live',
        galleryId: 'gal_live_pw',
        mediaId: 'media_photo_101',
        isFavorite: true,
      }),
    });
    const dataNoAuthProof = await resNoAuthProof.json();
    runner.assert(
      'Tier 4',
      '27. Live HTTP POST /api/gallery/client/proofing Rejects Request Without Authorization Header (401)',
      resNoAuthProof.status === 401 && dataNoAuthProof.error === 'MISSING_AUTHORIZATION_HEADER',
      `Unauthenticated proof write returned HTTP ${resNoAuthProof.status} (${dataNoAuthProof.error}).`
    );

    // 28. Live HTTP: Proofing Write with Malformed Bearer Token
    const resBadToken = await fetch(`${baseUrl}/api/gallery/client/proofing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.token.format',
      },
      body: JSON.stringify({
        studioId: 'studio_live',
        galleryId: 'gal_live_pw',
        mediaId: 'media_photo_101',
      }),
    });
    runner.assert(
      'Tier 4',
      '28. Live HTTP POST /api/gallery/client/proofing Rejects Malformed Bearer Token (401)',
      resBadToken.status === 401,
      `Malformed bearer token returned HTTP ${resBadToken.status}.`
    );

    // 29. Live HTTP: Proofing Write with Valid Cryptographic Bearer Token
    const authToken = createSignedTestToken({ sub: 'client_http_user_555' });
    const resAuthProof = await fetch(`${baseUrl}/api/gallery/client/proofing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        studioId: 'studio_live',
        galleryId: 'gal_live_pw',
        mediaId: 'media_photo_101',
        password: 'SecretClientPassword77',
        isFavorite: true,
        notes: 'Love the lighting in this shot!',
      }),
    });
    const dataAuthProof = await resAuthProof.json();
    runner.assert(
      'Tier 4',
      '29. Live HTTP POST /api/gallery/client/proofing Saves Selection & Binds Token UID',
      resAuthProof.status === 200 &&
      dataAuthProof.success === true &&
      dataAuthProof.proof?.clientUid === 'client_http_user_555' &&
      dataAuthProof.proof?.isFavorite === true,
      `Proofing item saved with bound clientUid: ${dataAuthProof.proof?.clientUid}.`
    );

    // 30. Live HTTP: GET /api/gallery/client/proofing Fetches Saved Selection
    const resGetProof = await fetch(
      `${baseUrl}/api/gallery/client/proofing?studioId=studio_live&galleryId=gal_live_pw&password=SecretClientPassword77`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    const dataGetProof = await resGetProof.json();
    runner.assert(
      'Tier 4',
      '30. Live HTTP GET /api/gallery/client/proofing Returns Client Proofing Items',
      resGetProof.status === 200 &&
      Array.isArray(dataGetProof.proofingItems) &&
      dataGetProof.proofingItems.some((p: any) => p.mediaId === 'media_photo_101'),
      `Retrieved ${dataGetProof.proofingItems?.length} proof item(s) for client_http_user_555.`
    );

    // 31. Live HTTP: GET /api/auth/token/verify Returns Verified Token Claims
    const resTokenVerify = await fetch(`${baseUrl}/api/auth/token/verify`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    const dataTokenVerify = await resTokenVerify.json();
    runner.assert(
      'Tier 4',
      '31. Live HTTP GET /api/auth/token/verify Validates Token & Returns Claims',
      resTokenVerify.status === 200 &&
      dataTokenVerify.valid === true &&
      dataTokenVerify.claims?.uid === 'client_http_user_555' &&
      dataTokenVerify.claims?.aud === 'totemic-metric-wmzf6',
      `Token verified: UID=${dataTokenVerify.claims?.uid}, aud=${dataTokenVerify.claims?.aud}.`
    );

  } finally {
    testServer.close();
    resetJwksForTesting();
    resetMockDataForTesting();
    resetLimiterForTesting();
  }

  runner.summary('StudioCloud Phase 1 Gallery Access & Tenant Isolation Security Audit');
}

runPhase1SecurityVerification().catch((err) => {
  console.error('Fatal security verification error:', err);
  process.exit(1);
});
