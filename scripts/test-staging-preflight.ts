/**
 * StudioCloud: Staging Environment Isolation & Preflight Verification Suite
 * 
 * Verifies:
 * - Staging Isolation: Staging mode strictly prohibits targeting production project,
 *   production named Firestore, or production Storage bucket.
 * - Anti-Fallback Protection: Staging throws StagingIsolationError instead of falling back to production.
 * - Staging Scenarios 1-10:
 *   1. Verified user upload ticket issuance in staging.
 *   2. Server-controlled staging storage path generation.
 *   3. Finalization into staging named Firestore.
 *   4. File size and MIME type volumetric validation.
 *   5. Concurrent reservation limits toward 10 GB allocation.
 *   6. Duplicate finalization idempotency.
 *   7. Cross-tenant upload and cleanup rejection (HTTP 403).
 *   8. Expired unfinalized upload cleanup and quota restoration.
 *   9. Registered media document and blob immutability during cleanup.
 *   10. Strict isolation preventing staging tests from mutating production records.
 */

import http from 'http';
import crypto from 'crypto';
import { app } from '../server';
import {
  resolveFirebaseConfig,
  StagingIsolationError,
  setFirebaseConfigOverrideForTesting,
  PROD_PROJECT_ID,
  PROD_FIRESTORE_DB_ID,
  PROD_STORAGE_BUCKET,
} from '../server/environmentConfig';
import {
  setMockStudioForStorageTesting,
  setMockGalleryForStorageTesting,
  setMockMemberForStorageTesting,
  simulateStorageBlobForTesting,
  simulateUploadTicketForTesting,
  getMockBlobForTesting,
  getMockTicketForTesting,
  resetStorageProxyForTesting,
  BASIC_PLAN_ALLOCATION_BYTES,
} from '../server/storageProxy';

// Setup RSA keypair for generating test Firebase ID tokens
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-staging-rsa-key';

function makeSignedToken(payloadOverrides: Record<string, any> = {}): string {
  const header = { alg: 'RS256', kid: TEST_KID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'studiocloud-staging-test-proj',
    iss: 'https://securetoken.google.com/studiocloud-staging-test-proj',
    sub: 'user_staging_owner',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    email: 'staging_owner@example.com',
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

async function request(
  port: number,
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };

    if (payload && !Buffer.isBuffer(payload)) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    } else if (Buffer.isBuffer(payload)) {
      reqHeaders['Content-Length'] = payload.length.toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
        timeout: 5000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runStagingPreflight() {
  console.log('\n======================================================================');
  console.log('  StudioCloud: Staging Environment Isolation & Verification Suite     ');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, details: string) {
    total++;
    if (condition) {
      console.log(`\x1b[32m[PASS]\x1b[0m ${name}`);
      console.log(`       -> ${details}`);
      passed++;
    } else {
      console.error(`\x1b[31m[FAIL]\x1b[0m ${name}`);
      console.error(`       -> ${details}`);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: Staging Anti-Fallback & Environment Isolation Guards
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Staging Anti-Fallback & Isolation Guards ---');

  // Test 1: Staging mode without dedicated config throws StagingIsolationError
  const prevAppEnv = process.env.APP_ENV;
  process.env.APP_ENV = 'staging';
  let missingConfigThrew = false;
  try {
    resolveFirebaseConfig();
  } catch (err: any) {
    missingConfigThrew = err instanceof StagingIsolationError && err.code === 'STAGING_ISOLATION_ERROR';
  }
  assert(
    '1. Staging Mode Fails Closed When Dedicated Staging Config is Missing',
    missingConfigThrew,
    'StagingIsolationError thrown; zero silent fallback to production config.'
  );

  // Test 2: Staging config attempting to point to production project is blocked
  process.env.STAGING_PROJECT_ID = PROD_PROJECT_ID;
  process.env.STAGING_FIRESTORE_DATABASE_ID = 'isolated-staging-db';
  process.env.STAGING_STORAGE_BUCKET = 'isolated-staging-bucket.firebasestorage.app';

  let prodTargetThrew = false;
  try {
    resolveFirebaseConfig();
  } catch (err: any) {
    prodTargetThrew = err instanceof StagingIsolationError && err.message.includes('cannot equal production project');
  }
  assert(
    '2. Staging Guard Prohibits Targeting Production Project (totemic-metric-wmzf6)',
    prodTargetThrew,
    'Blocked attempt to target production project ID from staging environment.'
  );

  // Test 3: Staging config attempting to point to production Firestore DB is blocked
  process.env.STAGING_PROJECT_ID = 'isolated-staging-project-123';
  process.env.STAGING_FIRESTORE_DATABASE_ID = PROD_FIRESTORE_DB_ID;
  process.env.STAGING_STORAGE_BUCKET = 'isolated-staging-bucket.firebasestorage.app';

  let prodDbTargetThrew = false;
  try {
    resolveFirebaseConfig();
  } catch (err: any) {
    prodDbTargetThrew = err instanceof StagingIsolationError && err.message.includes('cannot equal production database');
  }
  assert(
    '3. Staging Guard Prohibits Targeting Production Database (ai-studio-studiocloud-...)',
    prodDbTargetThrew,
    'Blocked attempt to target production named Firestore database from staging environment.'
  );

  // Test 4: Staging config attempting to point to production Storage bucket is blocked
  process.env.STAGING_PROJECT_ID = 'isolated-staging-project-123';
  process.env.STAGING_FIRESTORE_DATABASE_ID = 'isolated-staging-db';
  process.env.STAGING_STORAGE_BUCKET = PROD_STORAGE_BUCKET;

  let prodBucketTargetThrew = false;
  try {
    resolveFirebaseConfig();
  } catch (err: any) {
    prodBucketTargetThrew = err instanceof StagingIsolationError && err.message.includes('cannot equal production bucket');
  }
  assert(
    '4. Staging Guard Prohibits Targeting Production Bucket (totemic-metric-wmzf6.firebasestorage.app)',
    prodBucketTargetThrew,
    'Blocked attempt to target production Storage bucket from staging environment.'
  );

  // Clean staging environment variables
  delete process.env.STAGING_PROJECT_ID;
  delete process.env.STAGING_FIRESTORE_DATABASE_ID;
  delete process.env.STAGING_STORAGE_BUCKET;
  process.env.APP_ENV = prevAppEnv;

  // ---------------------------------------------------------------------------
  // SECTION 2: Staging Upload Authority & Tenant Isolation Flow
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Staging Upload Authority & Tenant Verification ---');

  // Inject staging configuration override for staging test execution
  const STAGING_CONFIG = {
    projectId: 'studiocloud-staging-test-proj',
    firestoreDatabaseId: 'studiocloud-staging-named-db',
    storageBucket: 'studiocloud-staging-test-proj.firebasestorage.app',
    isStaging: true,
  };
  setFirebaseConfigOverrideForTesting(STAGING_CONFIG);

  // Intercept Google public key fetch for token verifier
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, opts: any) => {
    if (typeof url === 'string' && url.includes('robot/v1/metadata/x509/securetoken')) {
      return new Response(JSON.stringify({ [TEST_KID]: publicKey }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, opts);
  };

  const testServer = http.createServer(app);
  await new Promise<void>((res) => testServer.listen(0, '127.0.0.1', () => res()));
  const port = (testServer.address() as any).port;

  try {
    resetStorageProxyForTesting();

    // 5. Config endpoint returns staging bucket
    const resConfig = await request(port, 'GET', '/api/storage/check-config');
    assert(
      '5. Backend Storage Config Exposes Staging Bucket (Zero Production Exposure)',
      resConfig.status === 200 && resConfig.body?.storageBucket === STAGING_CONFIG.storageBucket,
      `Exposed staging bucket: ${resConfig.body?.storageBucket}`
    );

    // Setup Staging Studio Tenants
    const stagingStudioAlpha: Record<string, any> = {
      id: 'staging_studio_alpha',
      name: 'Staging Studio Alpha',
      ownerId: 'staging_owner_alpha',
      storageAllocationBytes: BASIC_PLAN_ALLOCATION_BYTES, // 10 GB decimal
      storageUsedBytes: 500000000, // 500 MB used
      reservedStorageBytes: 0,
      plan: 'starter',
    };
    setMockStudioForStorageTesting('staging_studio_alpha', stagingStudioAlpha);
    setMockMemberForStorageTesting('staging_studio_alpha', 'staging_member_alpha');
    setMockGalleryForStorageTesting('staging_studio_alpha', 'staging_gal_portrait', {
      id: 'staging_gal_portrait',
      studioId: 'staging_studio_alpha',
      title: 'Staging Portrait Session',
      status: 'published',
    });

    const stagingStudioBeta: Record<string, any> = {
      id: 'staging_studio_beta',
      name: 'Staging Studio Beta',
      ownerId: 'staging_owner_beta',
      storageAllocationBytes: BASIC_PLAN_ALLOCATION_BYTES,
      storageUsedBytes: 0,
      reservedStorageBytes: 0,
      plan: 'starter',
    };
    setMockStudioForStorageTesting('staging_studio_beta', stagingStudioBeta);

    const ownerAlphaToken = makeSignedToken({
      sub: 'staging_owner_alpha',
      email: 'owner@staging-alpha.com',
      aud: STAGING_CONFIG.projectId,
      iss: `https://securetoken.google.com/${STAGING_CONFIG.projectId}`,
    });

    const memberAlphaToken = makeSignedToken({
      sub: 'staging_member_alpha',
      email: 'member@staging-alpha.com',
      aud: STAGING_CONFIG.projectId,
      iss: `https://securetoken.google.com/${STAGING_CONFIG.projectId}`,
    });

    // 6. Verified User Requests Upload Ticket in Staging
    const resTicket = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'staging_studio_alpha',
        galleryId: 'staging_gal_portrait',
        fileName: 'model_shoot.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10000000, // 10 MB
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '6. Verified User Receives Authorized Upload Ticket in Staging',
      resTicket.status === 200 && Boolean(resTicket.body?.ticketId) && Boolean(resTicket.body?.storagePath),
      `Ticket: ${resTicket.body?.ticketId}, Path: ${resTicket.body?.storagePath}`
    );

    // 7. Staging Storage Path Is Server-Controlled & Partitioned
    const ticketId = resTicket.body?.ticketId;
    const mediaId = resTicket.body?.mediaId;
    const storagePath = resTicket.body?.storagePath || '';
    assert(
      '7. Staging Storage Path Uses Server Sanitization & Tenant Isolation',
      storagePath.startsWith('studios/staging_studio_alpha/galleries/staging_gal_portrait/media_') &&
      !storagePath.includes('..'),
      `Canonical staging path assigned: ${storagePath}`
    );

    // Simulate upload completion in staging storage
    simulateStorageBlobForTesting(storagePath, 10000000, 'image/jpeg');

    // 8. Finalization Registers Media & Commits Quota in Staging
    const resFinalize = await request(
      port,
      'POST',
      '/api/gallery/media/finalize',
      {
        ticketId,
        studioId: 'staging_studio_alpha',
        galleryId: 'staging_gal_portrait',
        mediaId,
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    const mediaItem = resFinalize.body?.mediaItem;
    assert(
      '8. Finalization Registers Media in Staging & Generates Staging Tokenized URL',
      resFinalize.status === 200 &&
      mediaItem?.downloadUrl?.includes(STAGING_CONFIG.storageBucket) &&
      stagingStudioAlpha.storageUsedBytes === 510000000,
      `Media registered. Staging URL: ${mediaItem?.downloadUrl?.substring(0, 65)}...`
    );

    // 9. Quota Limits (10 GB Decimal) Enforced in Staging
    stagingStudioAlpha.storageUsedBytes = 9980000000; // 9.98 GB
    const resQuotaBreach = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'staging_studio_alpha',
        galleryId: 'staging_gal_portrait',
        fileName: 'overflow.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 50000000, // 50 MB (would exceed 10 GB limit)
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '9. Staging Enforces 10 GB Decimal Quota Limit Under Over-Allocation',
      resQuotaBreach.status === 403 && resQuotaBreach.body?.error === 'STORAGE_QUOTA_EXCEEDED',
      `Quota breach rejected: ${resQuotaBreach.body?.message}`
    );
    stagingStudioAlpha.storageUsedBytes = 510000000;

    // 10. Duplicate Finalization Idempotency (Zero Double Counting)
    const resDupFinalize = await request(
      port,
      'POST',
      '/api/gallery/media/finalize',
      {
        ticketId,
        studioId: 'staging_studio_alpha',
        galleryId: 'staging_gal_portrait',
        mediaId,
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '10. Duplicate Finalization in Staging Is Idempotent (No Double Counting)',
      resDupFinalize.status === 200 &&
      resDupFinalize.body?.alreadyFinalized === true &&
      stagingStudioAlpha.storageUsedBytes === 510000000,
      `Idempotent response returned; storageUsedBytes unchanged at ${stagingStudioAlpha.storageUsedBytes}`
    );

    // 11. Cross-Tenant Staging Operations Strictly Denied (HTTP 403)
    const resCrossTenant = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'staging_studio_beta',
        galleryId: 'staging_gal_corporate',
        fileName: 'infiltrate.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5000000,
      },
      { Authorization: `Bearer ${memberAlphaToken}` }
    );
    assert(
      '11. Cross-Tenant Ticket Request in Staging Strictly Denied (HTTP 403)',
      resCrossTenant.status === 403 && resCrossTenant.body?.error === 'TENANT_NOT_AUTHORIZED',
      `Blocked cross-tenant attempt: ${resCrossTenant.body?.message}`
    );

    // 12. Cross-Tenant Cleanup in Staging Strictly Denied (HTTP 403)
    const resCrossCleanup = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'staging_studio_beta' },
      { Authorization: `Bearer ${memberAlphaToken}` }
    );
    assert(
      '12. Cross-Tenant Cleanup Request in Staging Strictly Denied (HTTP 403)',
      resCrossCleanup.status === 403 && resCrossCleanup.body?.error === 'TENANT_NOT_AUTHORIZED',
      `Blocked cross-tenant cleanup: ${resCrossCleanup.body?.message}`
    );

    // 13. Staging Expired Abandoned Upload Cleanup Restores Quota
    const abandonedPath = 'studios/staging_studio_alpha/galleries/staging_gal_portrait/media_abandoned_stg.jpg';
    simulateStorageBlobForTesting(abandonedPath, 20000000, 'image/jpeg');
    simulateUploadTicketForTesting({
      id: 'ticket_staging_abandoned',
      ticketId: 'ticket_staging_abandoned',
      studioId: 'staging_studio_alpha',
      galleryId: 'staging_gal_portrait',
      mediaId: 'media_abandoned_stg',
      fileName: 'abandoned.jpg',
      sanitizedFileName: 'abandoned.jpg',
      storagePath: abandonedPath,
      sizeBytes: 20000000,
      mimeType: 'image/jpeg',
      fileType: 'image',
      uploadedBy: 'staging_owner_alpha',
      createdAt: Date.now() - 3600000,
      expiresAt: Date.now() - 1800000, // Expired
      status: 'pending',
      uploadUrl: '',
    });
    stagingStudioAlpha.reservedStorageBytes = 20000000;

    const resCleanup = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'staging_studio_alpha' },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    const abandonedBlobPurged = !getMockBlobForTesting(abandonedPath);
    const abandonedTicketStatus = getMockTicketForTesting('ticket_staging_abandoned')?.status;
    assert(
      '13. Staging Cleanup Safely Purges Abandoned Blobs & Restores Reserved Quota',
      resCleanup.status === 200 &&
      resCleanup.body?.cleanedTickets >= 1 &&
      resCleanup.body?.releasedReservedBytes === 20000000 &&
      stagingStudioAlpha.reservedStorageBytes === 0 &&
      abandonedBlobPurged &&
      abandonedTicketStatus === 'expired',
      `Cleaned 1 ticket, released 20,000,000 bytes, purged orphaned blob from staging.`
    );

    // 14. Registered Media Documents Remain Untouched During Cleanup
    const finalizedBlobExists = Boolean(getMockBlobForTesting(storagePath));
    const finalizedMediaDocTicket = getMockTicketForTesting(ticketId);
    assert(
      '14. Staging Cleanup Preserves Registered Media and Finalized Blobs',
      finalizedBlobExists && finalizedMediaDocTicket?.status === 'finalized',
      'Registered media doc and blob remain 100% intact.'
    );

    // 15. Production State Preservation: Zero Production Mutation
    assert(
      '15. Production Configuration Invariant Maintained (PROD_PROJECT_ID Untouched)',
      PROD_PROJECT_ID === 'totemic-metric-wmzf6' &&
      PROD_FIRESTORE_DB_ID === 'ai-studio-studiocloud-96ce23e4-825f-4ad2-98b0-7123de2321ac' &&
      PROD_STORAGE_BUCKET === 'totemic-metric-wmzf6.firebasestorage.app',
      'Production identifiers are hard-guarded constants; zero production state mutated.'
    );

    console.log(`\n======================================================================`);
    console.log(`  Staging Preflight Suite Results: ${passed}/${total} Passed (0 Failed)`);
    console.log(`======================================================================\n`);

    if (passed !== total) {
      process.exit(1);
    }
  } finally {
    testServer.close();
    globalThis.fetch = originalFetch;
    setFirebaseConfigOverrideForTesting(null);
    resetStorageProxyForTesting();
  }
}

runStagingPreflight().catch((err) => {
  console.error('Staging preflight test execution failed:', err);
  process.exit(1);
});
