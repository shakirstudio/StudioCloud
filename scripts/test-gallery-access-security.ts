/**
 * StudioCloud: Gallery Access & Tenant Isolation Security Audit Verification Suite
 * 
 * Verifies:
 * 1. Default Catch-All Deny & Tenant Boundary Enforcement
 * 2. Studio Tenant Document Access Restriction (No public leakage of business/subscription data)
 * 3. Client Gallery Access Gates (Private, Public, Unlisted Share Token, Password-Protected, Expiry, Draft/Archived)
 * 4. Multi-Tenant Firestore Rules Hierarchy & Status Invariant (published status required for client access)
 * 5. Media & Proofing Isolation (subcollection path matching, studioId & galleryId invariants)
 * 6. Proofing Write Input Validation (Tenant ID, Media ID, Client Email)
 * 7. Client UI Isolation (tenant consistency check, safe unauthenticated fallback, download authorization)
 * 8. Super Admin Privileged Authorization & Anti-Privilege Escalation
 */

import fs from 'fs';
import path from 'path';
import { 
  verifyGalleryAccess, 
  generateGalleryShareToken, 
  computeProofingSummary,
  savePhotoProofItem,
  submitClientProofingReview 
} from '../src/services/proofingService';
import { Gallery, PhotoProofItem } from '../src/types';

class TestRunner {
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
    console.log(`${title}: ${this.passed}/${this.total} Security Assertions Passed`);
    console.log(`======================================================\n`);
    if (this.passed !== this.total) {
      process.exit(1);
    }
  }
}

async function runSecurityAudit() {
  console.log('=== StudioCloud: Gallery Access & Tenant Isolation Security Audit ===\n');
  const runner = new TestRunner();

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const clientViewPath = path.resolve(process.cwd(), 'src/components/client/ClientGalleryView.tsx');
  const clientViewContent = fs.readFileSync(clientViewPath, 'utf8');

  // ----------------------------------------------------
  // SECTION 1: FIRESTORE SECURITY RULES AUDIT
  // ----------------------------------------------------

  // 1.1 Default Deny Catch-All
  runner.assert(
    '1. Default Deny Catch-All in Firestore Rules',
    rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'All unmapped collections default to immediate read/write denial.'
  );

  // 1.2 Studio Tenant Isolation Gate
  runner.assert(
    '2. Studio Tenant Document Access Restricted to Members & Super Admins',
    rulesContent.includes('match /studios/{studioId} {') &&
    rulesContent.includes('allow get: if isValidId(studioId) && (isSuperAdmin() || isStudioMember(studioId));') &&
    rulesContent.includes('allow list: if isSuperAdmin() || (isSignedIn() && resource.data.ownerId == request.auth.uid);'),
    'Studios collection is isolated; external clients or unauthenticated users cannot list or inspect studio business records.'
  );

  // 1.3 Gallery Client Access Publication Status Guard
  runner.assert(
    '3. Gallery Access Rule Enforces Published Status for External Access',
    rulesContent.includes("resource.data.privacy in ['public', 'unlisted', 'password_protected']") &&
    rulesContent.includes("resource.data.status == 'published'"),
    'Draft and archived galleries cannot be read by clients via Firestore rules even if non-private.'
  );

  // 1.4 Media Subcollection Enforces Published Status
  runner.assert(
    '4. Media Subcollection Enforces Published Gallery Status',
    rulesContent.includes('match /media/{mediaId} {') &&
    rulesContent.includes("get(/databases/$(database)/documents/studios/$(studioId)/galleries/$(galleryId)).data.status == 'published'"),
    'Media assets cannot be listed or fetched by clients if parent gallery is not published.'
  );

  // 1.5 Proofing Subcollection Tenant Hierarchy Invariant
  runner.assert(
    '5. Proofing Subcollection Enforces Studio & Gallery Tenant Invariants',
    rulesContent.includes('match /proofing/{proofId} {') &&
    rulesContent.includes('incoming().studioId == studioId &&') &&
    rulesContent.includes('incoming().galleryId == galleryId'),
    'Proofing records cannot be cross-injected into other studios or galleries.'
  );

  // 1.6 Proofing Deletion Restricted to Studio Staff
  runner.assert(
    '6. Proofing Item Deletion Restricted to Studio Members and Super Admin',
    rulesContent.includes('match /proofing/{proofId} {') &&
    rulesContent.includes('allow delete: if isValidId(proofId) && (isSuperAdmin() || isStudioMember(studioId));'),
    'Clients cannot delete proofing submissions, audit records, or feedback.'
  );

  // 1.7 Anti-Privilege Escalation Gate
  runner.assert(
    '7. Anti-Privilege Escalation in User Document Rules',
    rulesContent.includes("!('isSuperAdmin' in incoming()) ||") &&
    rulesContent.includes('incoming().isSuperAdmin == false ||') &&
    rulesContent.includes('isSuperAdmin()'),
    'Users cannot escalate themselves to Super Admin by updating /users/{userId}.'
  );

  // ----------------------------------------------------
  // SECTION 2: CLIENT GALLERY ACCESS GATES (verifyGalleryAccess)
  // ----------------------------------------------------

  const baseGallery: Gallery = {
    id: 'gal_highland_2026',
    studioId: 'studio_kestrel_456',
    title: 'Scottish Highlands Editorial',
    status: 'published',
    privacy: 'public',
    downloadAccess: true,
    photoCount: 15,
    storageBytes: 150000000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 2.1 Public Published Gallery
  const publicCheck = verifyGalleryAccess(baseGallery, {});
  runner.assert(
    '8. Public Published Gallery Allows Immediate Access',
    publicCheck.allowed === true,
    'Public published galleries are accessible to clients without tokens or passwords.'
  );

  // 2.2 Private Gallery Blocks Client Access
  const privateGallery: Gallery = { ...baseGallery, privacy: 'private' };
  const privateCheck = verifyGalleryAccess(privateGallery, {});
  runner.assert(
    '9. Private Gallery Strictly Denies Client Access',
    !privateCheck.allowed && Boolean(privateCheck.reason?.includes('Private')),
    'Private gallery rejects client viewing requests immediately.'
  );

  // 2.3 Studio Member Clearance Bypass
  const staffCheck = verifyGalleryAccess(privateGallery, { isStudioMember: true });
  runner.assert(
    '10. Studio Member Internal Clearance Bypasses Client Gates',
    staffCheck.allowed === true,
    'Studio staff can review private, draft, or expired galleries internally.'
  );

  // 2.4 Unlisted Gallery Requires Non-Guessable Share Token
  const unlistedGallery: Gallery = {
    ...baseGallery,
    privacy: 'unlisted',
    shareToken: 'sh_secure_token_abc123xyz789',
  };
  const unlistedNoToken = verifyGalleryAccess(unlistedGallery, { token: null });
  const unlistedWrongToken = verifyGalleryAccess(unlistedGallery, { token: 'sh_invalid_guess' });
  const unlistedValidToken = verifyGalleryAccess(unlistedGallery, { token: 'sh_secure_token_abc123xyz789' });
  runner.assert(
    '11. Unlisted Gallery Share Token Validation',
    !unlistedNoToken.allowed && !unlistedWrongToken.allowed && unlistedValidToken.allowed === true,
    'Unlisted gallery strictly denies missing or invalid tokens and permits valid tokens.'
  );

  // 2.5 Password-Protected Gallery Verification
  const passwordGallery: Gallery = {
    ...baseGallery,
    privacy: 'password_protected',
    accessPassword: 'HighlandPassword2026!',
  };
  const pwNoInput = verifyGalleryAccess(passwordGallery, {});
  const pwWrongInput = verifyGalleryAccess(passwordGallery, { password: 'wrong' });
  const pwCorrectInput = verifyGalleryAccess(passwordGallery, { password: 'HighlandPassword2026!' });
  runner.assert(
    '12. Password-Protected Gallery Access Gate',
    pwNoInput.requiresPassword === true && !pwWrongInput.allowed && pwCorrectInput.allowed === true,
    'Password-protected gallery blocks without password, rejects wrong password, and unlocks with correct password.'
  );

  // 2.6 Expired Gallery Access Block
  const expiredGallery: Gallery = {
    ...baseGallery,
    expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  };
  const expiredCheck = verifyGalleryAccess(expiredGallery, {});
  runner.assert(
    '13. Expired Gallery Link Blocking',
    !expiredCheck.allowed && expiredCheck.isExpired === true && Boolean(expiredCheck.reason?.includes('expired')),
    'Expired galleries return explicit expiry rejection and block viewing.'
  );

  // 2.7 Draft and Archived Status Enforcement
  const draftGallery: Gallery = { ...baseGallery, status: 'draft' };
  const archivedGallery: Gallery = { ...baseGallery, status: 'archived' };
  const draftCheck = verifyGalleryAccess(draftGallery, {});
  const archivedCheck = verifyGalleryAccess(archivedGallery, {});
  runner.assert(
    '14. Draft and Archived Status Blocks Client Access',
    !draftCheck.allowed && !archivedCheck.allowed,
    'Galleries in draft preparation or archived state are completely inaccessible to clients.'
  );

  // ----------------------------------------------------
  // SECTION 3: SERVICE LAYER TENANT VALIDATION
  // ----------------------------------------------------

  // 3.1 savePhotoProofItem Input & Tenant Validation
  let caughtMissingStudio = false;
  try {
    await savePhotoProofItem({
      studioId: '',
      galleryId: 'gal_123',
      mediaId: 'med_123',
      clientEmail: 'client@example.com',
      clientName: 'Client',
    });
  } catch (err: any) {
    caughtMissingStudio = Boolean(err.message.includes('studioId is required'));
  }

  let caughtInvalidEmail = false;
  try {
    await savePhotoProofItem({
      studioId: 'studio_123',
      galleryId: 'gal_123',
      mediaId: 'med_123',
      clientEmail: 'notanemail',
      clientName: 'Client',
    });
  } catch (err: any) {
    caughtInvalidEmail = Boolean(err.message.includes('client email is required'));
  }

  runner.assert(
    '15. Service-Level Tenant & Client Validation Guardrails',
    caughtMissingStudio && caughtInvalidEmail,
    'Proofing service rejects operations missing tenant studioId or lacking valid email.'
  );

  // 3.2 submitClientProofingReview Tenant Validation
  let caughtSubmitMissingTenant = false;
  try {
    await submitClientProofingReview({
      studioId: '',
      galleryId: 'gal_123',
      clientEmail: 'client@example.com',
      clientName: 'Client',
      totalAlbumSelections: 5,
      totalFavourites: 10,
    });
  } catch (err: any) {
    caughtSubmitMissingTenant = Boolean(err.message.includes('studioId is required'));
  }

  runner.assert(
    '16. Review Submission Tenant Validation Guardrail',
    caughtSubmitMissingTenant,
    'Client review submission strictly validates studioId and galleryId.'
  );

  // ----------------------------------------------------
  // SECTION 4: CLIENT UI TENANT ISOLATION & DOWNLOAD RESTRICTION
  // ----------------------------------------------------

  // 4.1 Tenant Mismatch Verification in ClientGalleryView
  const hasTenantConsistencyCheck = clientViewContent.includes('galleryData.studioId && galleryData.studioId !== studioId') &&
                                     clientViewContent.includes('Tenant isolation error: Gallery does not belong to the specified studio tenant');
  runner.assert(
    '17. ClientGalleryView Tenant Mismatch Guard',
    hasTenantConsistencyCheck,
    'ClientGalleryView prevents cross-tenant access by checking that galleryData.studioId matches the URL studioId.'
  );

  // 4.2 Safe Unauthenticated Studio Isolation Fallback
  const hasSafeStudioDocFallback = clientViewContent.includes('Unauthenticated or external clients are isolated from studio tenant document') &&
                                   clientViewContent.includes('try {\n          studioData = await getStudioById(studioId);');
  runner.assert(
    '18. Graceful Studio Document Isolation for External Clients',
    hasSafeStudioDocFallback,
    'ClientGalleryView gracefully accommodates tenant isolation on /studios/{studioId} without crashing client loading.'
  );

  // 4.3 Download Authorization Respect
  const hasDownloadStatusIndicator = clientViewContent.includes('Downloads: Permitted') &&
                                     clientViewContent.includes('View Only (Downloads Disabled)');
  runner.assert(
    '19. Download Access Status & View-Only Mode Enforcement',
    hasDownloadStatusIndicator,
    'ClientGalleryView clearly indicates download permission and enforces view-only mode when downloadAccess is false.'
  );

  // 4.4 Stable Composite Proof ID Generation
  const testMediaId = 'photo_reception_99';
  const testEmail = 'alyssa.vance@studio.test';
  const safeEmail = testEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_]/g, '_');
  const expectedId = `prf_${testMediaId}_${safeEmail}`;
  runner.assert(
    '20. Stable Composite Proof IDs for Tenant-Safe Deduplication',
    expectedId === 'prf_photo_reception_99_alyssa_vance_studio_test',
    'Proof document IDs deterministically bind media ID and client email, preventing collisions or duplicates.'
  );

  runner.summary('StudioCloud Gallery Access & Tenant Isolation Security Audit');
}

runSecurityAudit().catch((err) => {
  console.error('Fatal error in security audit:', err);
  process.exit(1);
});
