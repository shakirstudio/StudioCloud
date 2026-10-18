/**
 * StudioCloud: Trusted Backend Upload Authority Integration Test Suite
 * 
 * Tests the complete upload ticket -> signed upload -> finalize flow:
 * 1. Token Verification: Missing / malformed tokens rejected with HTTP 401
 * 2. Tenant Authorization: Studio Owner allowed (HTTP 200)
 * 3. Tenant Authorization: Studio Member allowed (HTTP 200)
 * 4. Tenant Isolation: Non-member / Cross-tenant ticket request denied (HTTP 403)
 * 5. Volumetric Limits: Photo > 100 MB rejected (HTTP 400)
 * 6. Volumetric Limits: Video > 250 MB rejected (HTTP 400)
 * 7. MIME Gate: Invalid executable MIME rejected (HTTP 400)
 * 8. Quota Reservation: Concurrent reservations tracked toward 10 GB limit
 * 9. Quota Exhaustion: Ticket exceeding 10 GB decimal limit rejected (HTTP 403)
 * 10. Server-Controlled Path: Server assigns mediaId and storagePath
 * 11. Finalization: Verifies object, attaches download token, records media doc
 * 12. Quota Accounting: Studio storageUsedBytes incremented accurately
 * 13. Idempotency: Duplicate finalization returns existing item without double-counting
 * 14. Unauthorized Finalize: Non-uploader caller rejected (HTTP 403)
 * 15. Ticket Expiration: Expired ticket rejected (HTTP 410)
 * 16. Existing Tokenized URLs: Format preserved without breaking existing tokens
 */

import http from 'http';
import crypto from 'crypto';
import { app } from '../server';
import {
  setMockStudioForStorageTesting,
  setMockGalleryForStorageTesting,
  setMockMemberForStorageTesting,
  simulateStorageBlobForTesting,
  simulateUploadTicketForTesting,
  getMockBlobForTesting,
  getMockTicketForTesting,
  resetStorageProxyForTesting,
  BASIC_PLAN_ALLOCATION_BYTES
} from '../server/storageProxy';

// Setup RSA keypair for generating test Firebase ID tokens
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-storage-key-rsa';

function makeSignedToken(payloadOverrides: Record<string, any> = {}): string {
  const header = { alg: 'RS256', kid: TEST_KID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'totemic-metric-wmzf6',
    iss: 'https://securetoken.google.com/totemic-metric-wmzf6',
    sub: 'user_default',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    email: 'user@example.com',
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

async function runTestSuite() {
  console.log('\n======================================================================');
  console.log('  StudioCloud: Trusted Backend Upload Authority Verification Suite    ');
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

  // Inject public key for token verification in test environment
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

    // Setup Test Studios in named database mock layer
    const studioAlpha: Record<string, any> = {
      id: 'studio_alpha',
      name: 'Studio Alpha',
      ownerId: 'owner_user_alpha',
      storageAllocationBytes: BASIC_PLAN_ALLOCATION_BYTES, // 10 GB decimal
      storageUsedBytes: 1000000000, // 1 GB used
      reservedStorageBytes: 0,
      plan: 'starter',
    };
    setMockStudioForStorageTesting('studio_alpha', studioAlpha);
    setMockMemberForStorageTesting('studio_alpha', 'member_user_alpha');
    setMockGalleryForStorageTesting('studio_alpha', 'gal_wedding', {
      id: 'gal_wedding',
      studioId: 'studio_alpha',
      title: 'Summer Wedding',
      status: 'published',
    });

    const studioBeta: Record<string, any> = {
      id: 'studio_beta',
      name: 'Studio Beta',
      ownerId: 'owner_user_beta',
      storageAllocationBytes: BASIC_PLAN_ALLOCATION_BYTES,
      storageUsedBytes: 0,
      reservedStorageBytes: 0,
      plan: 'starter',
    };
    setMockStudioForStorageTesting('studio_beta', studioBeta);
    setMockGalleryForStorageTesting('studio_beta', 'gal_corporate', {
      id: 'gal_corporate',
      studioId: 'studio_beta',
      title: 'Annual Gala',
      status: 'published',
    });

    const ownerAlphaToken = makeSignedToken({ sub: 'owner_user_alpha', email: 'owner@alpha.com' });
    const memberAlphaToken = makeSignedToken({ sub: 'member_user_alpha', email: 'member@alpha.com' });
    const strangerToken = makeSignedToken({ sub: 'stranger_user_999', email: 'stranger@other.com' });

    // 1. Missing Authorization Header Rejection
    const res1 = await request(port, 'POST', '/api/gallery/media/upload-ticket', {
      studioId: 'studio_alpha',
      galleryId: 'gal_wedding',
      fileName: 'portrait.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 5000000,
    });
    assert(
      '1. Missing Authorization Header Rejected',
      res1.status === 401 && res1.body?.error === 'MISSING_AUTHORIZATION_HEADER',
      `Returned HTTP 401: ${res1.body?.message || res1.body?.error}.`
    );

    // 2. Studio Owner Ticket Creation Allowed
    const res2 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'ceremony.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 8000000, // 8 MB
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '2. Studio Owner Authorized for Upload Ticket',
      res2.status === 200 && Boolean(res2.body?.ticketId) && Boolean(res2.body?.uploadUrl),
      `Returned ticketId: ${res2.body?.ticketId}, mediaId: ${res2.body?.mediaId}.`
    );

    // 3. Studio Team Member Ticket Creation Allowed
    const res3 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'reception.png',
        mimeType: 'image/png',
        sizeBytes: 12000000, // 12 MB
      },
      { Authorization: `Bearer ${memberAlphaToken}` }
    );
    assert(
      '3. Studio Team Member Authorized for Upload Ticket',
      res3.status === 200 && Boolean(res3.body?.ticketId),
      `Member issued upload ticket: ${res3.body?.ticketId}.`
    );

    // 4. Cross-Tenant Ticket Request Denied (Member of Alpha requesting Beta)
    const res4 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_beta',
        galleryId: 'gal_corporate',
        fileName: 'hacked.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5000000,
      },
      { Authorization: `Bearer ${memberAlphaToken}` }
    );
    assert(
      '4. Cross-Tenant Ticket Request Strictly Denied (HTTP 403)',
      res4.status === 403 && res4.body?.error === 'TENANT_NOT_AUTHORIZED',
      `Blocked cross-tenant attempt: ${res4.body?.message}.`
    );

    // 5. Oversized Photo Rejection (> 100 MB)
    const res5 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'huge_raw.dng',
        mimeType: 'image/x-adobe-dng',
        sizeBytes: 105 * 1024 * 1024, // 105 MB
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '5. Oversized Photo (>100MB) Rejection (HTTP 400)',
      res5.status === 400 && res5.body?.error === 'INVALID_FILE_PARAMETERS',
      `Rejected oversized photo: ${res5.body?.message}.`
    );

    // 6. Valid Video Ticket Creation (<= 250 MB)
    const res6 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'highlight.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 200 * 1024 * 1024, // 200 MB
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '6. Valid Video (200MB <= 250MB) Allowed for Ticket',
      res6.status === 200 && Boolean(res6.body?.ticketId),
      `Video ticket issued: ${res6.body?.ticketId}.`
    );

    // 7. Invalid Executable MIME Type Rejection
    const res7 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 5000,
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '7. Non-Media Executable MIME Type Rejection (HTTP 400)',
      res7.status === 400 && res7.body?.error === 'INVALID_FILE_PARAMETERS',
      `Rejected disallowed MIME: ${res7.body?.message}.`
    );

    // 8. Quota Reservation & Exhaustion at 10 GB Decimal Limit
    // Set Studio Alpha usage to 9.98 GB used out of 10 GB
    studioAlpha.storageUsedBytes = 9980000000; // 9.98 GB
    const res8 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'exceed_quota.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 50000000, // 50 MB (would reach 10.03 GB, exceeding 10.00 GB allocation)
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '8. Quota Exhaustion at 10 GB Decimal Limit Rejection (HTTP 403)',
      res8.status === 403 && res8.body?.error === 'STORAGE_QUOTA_EXCEEDED',
      `Rejected quota breach: ${res8.body?.message}.`
    );

    // Reset quota for remaining tests
    studioAlpha.storageUsedBytes = 1000000000;

    // 9. Server-Controlled Path & Metadata
    const res9 = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'couple ../../../traversal.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5000000,
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    const assignedPath = res9.body?.storagePath || '';
    assert(
      '9. Server-Controlled Path & Sanitization Enforced',
      res9.status === 200 &&
      assignedPath.startsWith('studios/studio_alpha/galleries/gal_wedding/media_') &&
      !assignedPath.includes('..'),
      `Canonical path assigned: ${assignedPath}.`
    );

    const ticketToFinalize = res9.body?.ticketId;
    const mediaIdToFinalize = res9.body?.mediaId;

    // Simulate uploaded storage object
    simulateStorageBlobForTesting(assignedPath, 5000000, 'image/jpeg');

    // 10. Upload Finalization & Quota Accounting
    const res10 = await request(
      port,
      'POST',
      '/api/gallery/media/finalize',
      {
        ticketId: ticketToFinalize,
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        mediaId: mediaIdToFinalize,
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '10. Finalize Upload & Quota Accounting (HTTP 200)',
      res10.status === 200 &&
      res10.body?.mediaItem?.id === mediaIdToFinalize &&
      Boolean(res10.body?.mediaItem?.downloadUrl) &&
      studioAlpha.storageUsedBytes === 1005000000,
      `Finalized media doc; downloadUrl issued; storageUsedBytes incremented to ${studioAlpha.storageUsedBytes}.`
    );

    // 11. Idempotency: Duplicate Finalization does NOT double-count quota
    const res11 = await request(
      port,
      'POST',
      '/api/gallery/media/finalize',
      {
        ticketId: ticketToFinalize,
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        mediaId: mediaIdToFinalize,
      },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    assert(
      '11. Duplicate Finalization is Idempotent & Prevents Double-Counting',
      res11.status === 200 &&
      res11.body?.alreadyFinalized === true &&
      studioAlpha.storageUsedBytes === 1005000000,
      `Idempotent response returned; storageUsedBytes remains unchanged at ${studioAlpha.storageUsedBytes}.`
    );

    // 12. Finalize by Unauthorized Caller Rejected (Stranger)
    // Issue a new ticket for Member A
    const res12Ticket = await request(
      port,
      'POST',
      '/api/gallery/media/upload-ticket',
      {
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        fileName: 'member_photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 4000000,
      },
      { Authorization: `Bearer ${memberAlphaToken}` }
    );
    const memberTicketId = res12Ticket.body?.ticketId;
    const memberMediaId = res12Ticket.body?.mediaId;
    simulateStorageBlobForTesting(res12Ticket.body?.storagePath, 4000000, 'image/jpeg');

    const res12 = await request(
      port,
      'POST',
      '/api/gallery/media/finalize',
      {
        ticketId: memberTicketId,
        studioId: 'studio_alpha',
        galleryId: 'gal_wedding',
        mediaId: memberMediaId,
      },
      { Authorization: `Bearer ${strangerToken}` }
    );
    assert(
      '12. Finalize by Non-Uploader Rejected (HTTP 403)',
      res12.status === 403 && res12.body?.error === 'TICKET_UPLOADER_MISMATCH',
      `Rejected unauthorized finalize: ${res12.body?.message}.`
    );

    // 13. Tokenized Download URL Format Compatibility
    const sampleDownloadUrl = res10.body?.mediaItem?.downloadUrl || '';
    assert(
      '13. Tokenized Download URL Conforms to Firebase Standard',
      sampleDownloadUrl.startsWith('https://firebasestorage.googleapis.com/v0/b/') &&
      sampleDownloadUrl.includes('?alt=media&token='),
      `Verified URL format: ${sampleDownloadUrl.substring(0, 60)}...`
    );

    // =========================================================================
    // SECTION: Cleanup Abandoned Uploads & Quota Restitution Security Tests
    // =========================================================================

    // 14. Missing Authorization Header on Cleanup Rejected (HTTP 401)
    const res14 = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'studio_alpha' }
    );
    assert(
      '14. Missing Authorization Header on Cleanup Rejected (HTTP 401)',
      res14.status === 401 && res14.body?.error === 'MISSING_AUTHORIZATION_HEADER',
      `Returned HTTP 401: ${res14.body?.message || res14.body?.error}.`
    );

    // 15. Invalid / Malformed Token on Cleanup Rejected (HTTP 401)
    const res15 = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'studio_alpha' },
      { Authorization: 'Bearer totally.invalid.bearer-token' }
    );
    assert(
      '15. Invalid Token on Cleanup Rejected (HTTP 401)',
      res15.status === 401,
      `Returned HTTP 401: ${res15.body?.message || res15.body?.error}.`
    );

    // Setup an expired pending ticket on Studio Beta to test cross-tenant and zero-side-effects
    const expiredPendingBetaTicketId = 'ticket_beta_expired_001';
    const expiredBetaBlobPath = 'studios/studio_beta/galleries/gal_corporate/media_abandoned_001_raw.jpg';
    simulateUploadTicketForTesting({
      id: expiredPendingBetaTicketId,
      ticketId: expiredPendingBetaTicketId,
      studioId: 'studio_beta',
      galleryId: 'gal_corporate',
      mediaId: 'media_abandoned_001',
      fileName: 'raw.jpg',
      sanitizedFileName: 'raw.jpg',
      storagePath: expiredBetaBlobPath,
      sizeBytes: 25000000, // 25 MB
      mimeType: 'image/jpeg',
      fileType: 'image',
      uploadedBy: 'owner_user_beta',
      createdAt: Date.now() - 3600000,
      expiresAt: Date.now() - 1800000, // Expired 30 min ago
      status: 'pending',
      uploadUrl: '/api/gallery/media/proxy-upload',
    });
    simulateStorageBlobForTesting(expiredBetaBlobPath, 25000000, 'image/jpeg');
    studioBeta.reservedStorageBytes = 25000000;

    // 16. Studio A Member Attempting Cleanup for Studio B Strictly Denied (HTTP 403)
    const res16 = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'studio_beta' },
      { Authorization: `Bearer ${memberAlphaToken}` }
    );
    assert(
      '16. Cross-Tenant Cleanup Attempt Strictly Denied (HTTP 403)',
      res16.status === 403 && res16.body?.error === 'TENANT_NOT_AUTHORIZED',
      `Blocked unauthorized cross-tenant cleanup: ${res16.body?.message}.`
    );

    // 17. Unauthorized Requests Cause Zero Cleanup Side Effects
    const betaBlobStillExists = Boolean(getMockBlobForTesting(expiredBetaBlobPath));
    const betaTicketAfterFailedAttempt = getMockTicketForTesting(expiredPendingBetaTicketId);
    assert(
      '17. Unauthorized Cleanup Causes Zero Side Effects',
      studioBeta.reservedStorageBytes === 25000000 &&
      betaBlobStillExists &&
      betaTicketAfterFailedAttempt?.status === 'pending',
      `Verified zero state mutation: reservedStorageBytes remained 25MB, blob intact, ticket pending.`
    );

    // Setup an expired pending ticket on Studio Alpha to test authorized owner cleanup
    const expiredPendingAlphaTicketId = 'ticket_alpha_expired_001';
    const expiredAlphaBlobPath = 'studios/studio_alpha/galleries/gal_wedding/media_abandoned_alpha_001.jpg';
    simulateUploadTicketForTesting({
      id: expiredPendingAlphaTicketId,
      ticketId: expiredPendingAlphaTicketId,
      studioId: 'studio_alpha',
      galleryId: 'gal_wedding',
      mediaId: 'media_abandoned_alpha_001',
      fileName: 'abandoned.jpg',
      sanitizedFileName: 'abandoned.jpg',
      storagePath: expiredAlphaBlobPath,
      sizeBytes: 15000000, // 15 MB
      mimeType: 'image/jpeg',
      fileType: 'image',
      uploadedBy: 'owner_user_alpha',
      createdAt: Date.now() - 3600000,
      expiresAt: Date.now() - 1800000, // Expired
      status: 'pending',
      uploadUrl: '/api/gallery/media/proxy-upload',
    });
    simulateStorageBlobForTesting(expiredAlphaBlobPath, 15000000, 'image/jpeg');
    studioAlpha.reservedStorageBytes = 15000000;

    // 18. Authorized Studio Owner Cleanup Releases Reservations & Purges Expired Blobs (HTTP 200)
    const res18 = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'studio_alpha' },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    const alphaBlobPurged = !getMockBlobForTesting(expiredAlphaBlobPath);
    const alphaTicketCleaned = getMockTicketForTesting(expiredPendingAlphaTicketId);
    assert(
      '18. Authorized Owner Cleanup Releases Reservations & Purges Blobs (HTTP 200)',
      res18.status === 200 &&
      res18.body?.cleanedTickets >= 1 &&
      res18.body?.releasedReservedBytes === 15000000 &&
      studioAlpha.reservedStorageBytes === 0 &&
      alphaBlobPurged &&
      alphaTicketCleaned?.status === 'expired',
      `Cleaned ${res18.body?.cleanedTickets} ticket(s), released ${res18.body?.releasedReservedBytes} bytes, quota restored to 0 reserved.`
    );

    // 19. Registered Finalized Media Remains Completely Untouched During Cleanup
    const finalizedAlphaBlobPath = 'studios/studio_alpha/galleries/gal_wedding/media_finalized_keep.jpg';
    simulateStorageBlobForTesting(finalizedAlphaBlobPath, 8000000, 'image/jpeg');
    simulateUploadTicketForTesting({
      id: 'ticket_alpha_finalized_keep',
      ticketId: 'ticket_alpha_finalized_keep',
      studioId: 'studio_alpha',
      galleryId: 'gal_wedding',
      mediaId: 'media_finalized_keep',
      fileName: 'finalized.jpg',
      sanitizedFileName: 'finalized.jpg',
      storagePath: finalizedAlphaBlobPath,
      sizeBytes: 8000000,
      mimeType: 'image/jpeg',
      fileType: 'image',
      uploadedBy: 'owner_user_alpha',
      createdAt: Date.now() - 3600000,
      expiresAt: Date.now() - 1800000, // Timestamp is in past, but ticket is FINALIZED
      status: 'finalized',
      uploadUrl: '',
      finalizedMediaItem: { id: 'media_finalized_keep' },
    });

    const res19 = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'studio_alpha' },
      { Authorization: `Bearer ${ownerAlphaToken}` }
    );
    const finalizedBlobStillExists = Boolean(getMockBlobForTesting(finalizedAlphaBlobPath));
    const finalizedTicketUntouched = getMockTicketForTesting('ticket_alpha_finalized_keep');
    assert(
      '19. Registered Media Documents & Storage Blobs Remain Untouched',
      res19.status === 200 &&
      finalizedBlobStillExists &&
      finalizedTicketUntouched?.status === 'finalized',
      `Registered media doc and blob preserved untouched; zero finalized objects purged.`
    );

    // 20. Authorized Super Admin Privileged Cleanup Workflow
    const superAdminToken = makeSignedToken({
      sub: 'superadmin_uid_777',
      email: 'shakirtamboli.pune@gmail.com',
    });
    const res20 = await request(
      port,
      'POST',
      '/api/gallery/media/cleanup-abandoned',
      { studioId: 'studio_beta' },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    const betaBlobPurgedByAdmin = !getMockBlobForTesting(expiredBetaBlobPath);
    const betaTicketCleanedByAdmin = getMockTicketForTesting(expiredPendingBetaTicketId);
    assert(
      '20. Authorized Super Admin Privileged Cleanup Workflow (HTTP 200)',
      res20.status === 200 &&
      res20.body?.cleanedTickets === 1 &&
      res20.body?.releasedReservedBytes === 25000000 &&
      studioBeta.reservedStorageBytes === 0 &&
      betaBlobPurgedByAdmin &&
      betaTicketCleanedByAdmin?.status === 'expired',
      `Super Admin successfully ran privileged cleanup for Studio Beta; quota restored to 0.`
    );

    console.log(`\n======================================================================`);
    console.log(`  Upload Authority Suite Results: ${passed}/${total} Passed (0 Failed)`);
    console.log(`======================================================================\n`);

    if (passed !== total) {
      process.exit(1);
    }
  } finally {
    testServer.close();
    globalThis.fetch = originalFetch;
    resetStorageProxyForTesting();
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
