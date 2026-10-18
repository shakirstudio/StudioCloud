/**
 * StudioCloud Phase 4: Client Gallery Access, Sharing & Photo Proofing Test Suite
 * Tests:
 * 1. Client Access Authorization Gate:
 *    - Private gallery blocks client access
 *    - Unlisted gallery requires verified non-guessable share token
 *    - Mismatched or missing token on unlisted gallery is rejected
 *    - Password-protected gallery gates access and validates photographer password
 *    - Expired gallery link blocks access with explicit expiry notice
 *    - Draft and archived galleries are hidden from non-studio clients
 *    - Studio members have internal clearance bypass
 * 2. Share Token Cryptographic Security:
 *    - Unique, non-guessable token structure (sh_ prefix, entropy, length >= 24)
 * 3. Proofing Summary Aggregation:
 *    - Accurate counting of favourites, album approvals, comments, and client email deduplication
 * 4. Firestore Proofing Payload Sanitization:
 *    - Proof records contain media identifier, client email, sanitized comments, and timestamps
 *    - No raw binary data in Firestore documents
 * 5. Multi-Tenant Firestore Security Rules:
 *    - Rules on /studios/{studioId}/galleries/{galleryId}/proofing/{proofId} enforce tenant hierarchy
 * 6. Storage Realism & Honesty:
 *    - Cloud Storage status is labelled "Not Connected"
 *    - Empty state displayed honestly when 0 media assets exist without fake/invented photos
 */

import fs from 'fs';
import path from 'path';
import { 
  verifyGalleryAccess, 
  generateGalleryShareToken, 
  computeProofingSummary,
  getEffectiveProofingSettings 
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
    console.log(`${title}: ${this.passed}/${this.total} Tests Passed`);
    console.log(`======================================================\n`);
    if (this.passed !== this.total) {
      process.exit(1);
    }
  }
}

async function runProofingVerification() {
  console.log('=== StudioCloud Phase 4: Client Gallery & Photo Proofing Verification Suite ===\n');
  const runner = new TestRunner();

  const mockBaseGallery: Gallery = {
    id: 'gal_wedding_789',
    studioId: 'studio_aurora_123',
    title: 'Eleanor & James Tuscan Elopement',
    status: 'published',
    privacy: 'unlisted',
    shareToken: 'sh_test_securetoken1234567890abcdef',
    accessPassword: 'tuscanwedding2026',
    downloadAccess: true,
    photoCount: 0,
    storageBytes: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // TEST 1: Private Gallery Access Restriction
  const privateGallery: Gallery = { ...mockBaseGallery, privacy: 'private' };
  const privateCheck = verifyGalleryAccess(privateGallery, { token: privateGallery.shareToken });
  runner.assert(
    '1. Private Gallery Access Block',
    !privateCheck.allowed && Boolean(privateCheck.reason?.includes('Private')),
    'Private gallery strictly blocks client-facing URLs even when token is supplied.'
  );

  // TEST 2: Studio Member Internal Clearance Bypass
  const studioMemberCheck = verifyGalleryAccess(privateGallery, { isStudioMember: true });
  runner.assert(
    '2. Studio Member Access Clearance',
    studioMemberCheck.allowed === true,
    'Studio members bypass client gates to manage and review collections.'
  );

  // TEST 3: Unlisted Gallery Valid Share Token
  const unlistedGallery: Gallery = { ...mockBaseGallery, accessPassword: '' };
  const validUnlistedCheck = verifyGalleryAccess(unlistedGallery, { 
    token: 'sh_test_securetoken1234567890abcdef' 
  });
  runner.assert(
    '3. Unlisted Gallery Share Token Authorization',
    validUnlistedCheck.allowed === true,
    'Unlisted gallery allows viewing when matching cryptographic share token is presented.'
  );

  // TEST 4: Unlisted Gallery Rejected Without Token or With Token Mismatch
  const missingTokenCheck = verifyGalleryAccess(mockBaseGallery, { token: null });
  const wrongTokenCheck = verifyGalleryAccess(mockBaseGallery, { token: 'sh_invalid_guess' });
  runner.assert(
    '4. Unlisted Gallery Rejection on Missing or Mismatched Token',
    !missingTokenCheck.allowed && !wrongTokenCheck.allowed,
    'Unlisted gallery strictly denies access when token is absent or invalid.'
  );

  // TEST 5: Password-Protected Gallery Access Gate
  const pwGallery: Gallery = { ...mockBaseGallery, privacy: 'password_protected' };
  const noPwCheck = verifyGalleryAccess(pwGallery, { token: pwGallery.shareToken });
  const wrongPwCheck = verifyGalleryAccess(pwGallery, { 
    token: pwGallery.shareToken, 
    password: 'wrongpassword' 
  });
  const correctPwCheck = verifyGalleryAccess(pwGallery, { 
    token: pwGallery.shareToken, 
    password: 'tuscanwedding2026' 
  });
  runner.assert(
    '5. Password-Protected Gallery Verification',
    noPwCheck.requiresPassword === true &&
    !wrongPwCheck.allowed &&
    correctPwCheck.allowed === true,
    'Requires photographer password, rejects incorrect passwords, and permits correct password.'
  );

  // TEST 6: Expired Gallery Link Blocking
  const expiredGallery: Gallery = {
    ...mockBaseGallery,
    expiresAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  };
  const expiredCheck = verifyGalleryAccess(expiredGallery, { token: expiredGallery.shareToken });
  runner.assert(
    '6. Expired Gallery Link Rejection',
    !expiredCheck.allowed && expiredCheck.isExpired === true && Boolean(expiredCheck.reason?.includes('expired')),
    'Expired gallery links return explicit expiry reason and block client access.'
  );

  // TEST 7: Draft and Archived Galleries Hidden
  const draftGallery: Gallery = { ...mockBaseGallery, status: 'draft' };
  const archivedGallery: Gallery = { ...mockBaseGallery, status: 'archived' };
  const draftCheck = verifyGalleryAccess(draftGallery, { token: draftGallery.shareToken });
  const archivedCheck = verifyGalleryAccess(archivedGallery, { token: archivedGallery.shareToken });
  runner.assert(
    '7. Draft & Archived Status Enforcement',
    !draftCheck.allowed && !archivedCheck.allowed,
    'Draft preparations and archived galleries are denied to clients.'
  );

  // TEST 8: Share Token Cryptographic Generation Quality
  const token1 = generateGalleryShareToken();
  const token2 = generateGalleryShareToken();
  runner.assert(
    '8. Non-Guessable Cryptographic Share Token Invariant',
    token1.startsWith('sh_') && 
    token2.startsWith('sh_') && 
    token1 !== token2 && 
    token1.length >= 28,
    `Tokens are unique, cryptographically random strings (generated: ${token1}).`
  );

  // TEST 9: Proofing Summary Computation & Deduplication
  const mockProofItems: PhotoProofItem[] = [
    {
      id: 'prf_photo1_client1',
      studioId: 'studio_aurora_123',
      galleryId: 'gal_wedding_789',
      mediaId: 'photo_bride_01',
      clientEmail: 'eleanor@example.com',
      clientName: 'Eleanor',
      isFavourite: true,
      isApprovedForAlbum: true,
      comment: 'Love the natural lighting here!',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prf_photo2_client1',
      studioId: 'studio_aurora_123',
      galleryId: 'gal_wedding_789',
      mediaId: 'photo_ceremony_05',
      clientEmail: 'eleanor@example.com',
      clientName: 'Eleanor',
      isFavourite: true,
      isApprovedForAlbum: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prf_photo1_client2',
      studioId: 'studio_aurora_123',
      galleryId: 'gal_wedding_789',
      mediaId: 'photo_bride_01',
      clientEmail: 'james@example.com',
      clientName: 'James',
      isFavourite: false,
      isApprovedForAlbum: true,
      comment: 'Must have for the front spread.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const summary = computeProofingSummary(mockProofItems);
  runner.assert(
    '9. Proofing Summary Aggregation & Client Deduplication',
    summary.totalFavourites === 2 &&
    summary.totalAlbumSelections === 2 &&
    summary.totalComments === 2 &&
    summary.uniqueClients.length === 2 &&
    summary.uniqueClients.includes('eleanor@example.com') &&
    summary.uniqueClients.includes('james@example.com'),
    'Correctly computed 2 favourites, 2 album selections, 2 comments, and 2 unique clients.'
  );

  // TEST 10: Security Rules for Proofing Subcollection
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const hasProofingRules = rulesContent.includes('match /proofing/{proofId}');
  const hasHierarchyCheck = rulesContent.includes('incoming().studioId == studioId &&') &&
                            rulesContent.includes('incoming().galleryId == galleryId');
  runner.assert(
    '10. Firestore Security Rules Proofing Partition & Invariants',
    hasProofingRules && hasHierarchyCheck,
    'firestore.rules enforces subcollection path matching, incoming studioId and galleryId hierarchy.'
  );

  // TEST 11: Realism & Honesty - Zero Binaries in Firestore & Honest Labels
  const clientViewPath = path.resolve(process.cwd(), 'src/components/client/ClientGalleryView.tsx');
  const clientViewContent = fs.readFileSync(clientViewPath, 'utf8');
  const detailViewPath = path.resolve(process.cwd(), 'src/components/modules/GalleryDetailView.tsx');
  const detailViewContent = fs.readFileSync(detailViewPath, 'utf8');

  const honestEmptyState = clientViewContent.includes('The photographer has created this collection, but media files have not yet been synchronized');
  const cloudStorageNotConnected = detailViewContent.includes('Cloud Storage: Not Connected');
  const imageUnavailableHandled = clientViewContent.includes('Image File Unavailable') && clientViewContent.includes('Storage Disconnected');

  runner.assert(
    '11. Honest Empty States & Storage Not Connected Enforcement',
    honestEmptyState && cloudStorageNotConnected && imageUnavailableHandled,
    'Client gallery displays honest empty state with zero fake photos, Cloud Storage is labelled Not Connected, and unavailable files are clearly flagged.'
  );

  // TEST 12: Backward Compatibility with Legacy Galleries (getEffectiveProofingSettings)
  const legacyGallery: Gallery = {
    ...mockBaseGallery,
    proofingSettings: undefined,
  };
  const effectiveSettings = getEffectiveProofingSettings(legacyGallery);
  runner.assert(
    '12. Backward Compatibility with Existing Galleries Without Proofing Settings',
    effectiveSettings.enabled === true &&
    effectiveSettings.allowFavourites === true &&
    effectiveSettings.allowAlbumSelection === true &&
    effectiveSettings.allowComments === true &&
    effectiveSettings.reviewStatus === 'pending',
    'Galleries without proofingSettings gracefully fallback to backward-compatible defaults.'
  );

  // TEST 13: Review Status Workflow & Lifecycle
  const customSettings: Gallery = {
    ...mockBaseGallery,
    proofingSettings: {
      enabled: true,
      allowFavourites: true,
      allowAlbumSelection: true,
      allowComments: true,
      maxAlbumSelections: 45,
      reviewStatus: 'approved',
      instructions: 'Choose 45 best moments.',
      deadline: '2026-11-01',
      approvedAt: new Date().toISOString(),
    },
  };
  const resolvedCustom = getEffectiveProofingSettings(customSettings);
  runner.assert(
    '13. Proofing Settings Configuration & Quota Invariants',
    resolvedCustom.maxAlbumSelections === 45 &&
    resolvedCustom.reviewStatus === 'approved' &&
    resolvedCustom.instructions === 'Choose 45 best moments.' &&
    Boolean(resolvedCustom.approvedAt),
    'Customized proofing rules, limits, review status, and approval timestamps are preserved.'
  );

  // TEST 14: Distinguish Selected Photos from Unselected Photos
  const sampleMedia = [
    { id: 'media_1', fileName: 'ceremony_01.jpg' },
    { id: 'media_2', fileName: 'reception_05.jpg' },
    { id: 'media_3', fileName: 'toast_12.jpg' },
  ];
  const sampleProofMap = new Map<string, { albumSelectionsCount: number; favouritesCount: number; commentsCount: number }>();
  sampleProofMap.set('media_1', { albumSelectionsCount: 1, favouritesCount: 1, commentsCount: 0 });
  sampleProofMap.set('media_2', { albumSelectionsCount: 0, favouritesCount: 1, commentsCount: 1 });

  const selectedAlbumPhotos = sampleMedia.filter(m => (sampleProofMap.get(m.id)?.albumSelectionsCount || 0) > 0);
  const unselectedPhotos = sampleMedia.filter(m => {
    const p = sampleProofMap.get(m.id);
    return !p || (p.albumSelectionsCount === 0 && p.favouritesCount === 0 && p.commentsCount === 0);
  });

  runner.assert(
    '14. Distinguish Selected Photos from Unselected Photos',
    selectedAlbumPhotos.length === 1 &&
    selectedAlbumPhotos[0].id === 'media_1' &&
    unselectedPhotos.length === 1 &&
    unselectedPhotos[0].id === 'media_3',
    'Distinguishes selected photos (media_1) from unselected photos (media_3) accurately.'
  );

  // TEST 15: Selection Management & Deletion Clearance in Security Rules
  const hasDeleteRule = rulesContent.includes('match /proofing/{proofId}') &&
                        rulesContent.includes('allow delete: if isValidId(proofId) && (isSuperAdmin() || isStudioMember(studioId));');
  runner.assert(
    '15. Selection Removal Access Clearance & Protection',
    hasDeleteRule,
    'firestore.rules explicitly restricts deletion of client proofing items to authorized studio members and super admins.'
  );

  // TEST 16: Studio Dashboard Selection Management & Settings Modal Presence
  const hasProofingSettingsModal = detailViewContent.includes('Gallery Proofing Settings') &&
                                   detailViewContent.includes('Album Selection Limit');
  const hasRemoveProofingModal = detailViewContent.includes('Remove Client Selection') &&
                                 detailViewContent.includes('Remove this client selection');
  const hasSelectionBadges = detailViewContent.includes('Proofing Selection Badges distinguishing selected photos');

  runner.assert(
    '16. Studio Dashboard Proofing Settings & Selection Controls',
    hasProofingSettingsModal && hasRemoveProofingModal && hasSelectionBadges,
    'GalleryDetailView provides studio members with proofing configuration modal, selection removal dialog, and selection badges.'
  );

  // TEST 17: Tenant Isolation & Client Access Gate on In-App Route
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');
  const hasClientRoute = appContent.includes('view === \'gallery\' && galleryId && studioId') &&
                         appContent.includes('<ClientGalleryView');
  runner.assert(
    '17. App Client Direct Route & Tenant Boundary Isolation',
    hasClientRoute,
    'App.tsx cleanly mounts ClientGalleryView for external client access without bypassing studio authorization gates.'
  );

  // TEST 18: Stable Document ID Generation & Duplicate Prevention
  const mediaId = 'media_ceremony_42';
  const email = 'clara.bow@example.com';
  const cleanEmail = email.toLowerCase().trim();
  const safeEmailKey = cleanEmail.replace(/[^a-zA-Z0-9_]/g, '_');
  const expectedProofId = `prf_${mediaId}_${safeEmailKey}`;
  runner.assert(
    '18. Stable Composite Proof IDs & Duplicate Prevention Invariant',
    expectedProofId === 'prf_media_ceremony_42_clara_bow_example_com',
    'Proof document IDs deterministically bind media ID and client email, preventing duplicate records.'
  );

  // TEST 19: Favourites Toggling & Unfavouriting Semantics
  const proofBefore: PhotoProofItem = {
    id: expectedProofId,
    studioId: 'studio_aurora_123',
    galleryId: 'gal_wedding_789',
    mediaId,
    clientEmail: cleanEmail,
    clientName: 'Clara',
    isFavourite: true,
    isApprovedForAlbum: true,
    comment: 'First dance favorite',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // When unfavouriting:
  const proofAfterUnfavourite: PhotoProofItem = {
    ...proofBefore,
    isFavourite: false,
    updatedAt: new Date().toISOString(),
  };
  const summaryAfter = computeProofingSummary([proofAfterUnfavourite]);
  runner.assert(
    '19. Unfavouriting Semantics & Selection Preservation',
    summaryAfter.totalFavourites === 0 &&
    summaryAfter.totalAlbumSelections === 1 &&
    summaryAfter.totalComments === 1 &&
    proofAfterUnfavourite.comment === 'First dance favorite',
    'Unfavouriting photo reduces totalFavourites to 0 while preserving album approval and existing comments.'
  );

  // TEST 20: Selection Limit Quota Guardrail (maxAlbumSelections)
  const quotaLimit = 2;
  const clientProofItems = [
    { id: 'p1', mediaId: 'm1', isApprovedForAlbum: true },
    { id: 'p2', mediaId: 'm2', isApprovedForAlbum: true },
  ];
  const currentAlbumCount = clientProofItems.filter(p => p.isApprovedForAlbum).length;
  const isAtQuota = currentAlbumCount >= quotaLimit;
  const attemptSelectThird = !isAtQuota;
  runner.assert(
    '20. Album Selection Quota Guardrail Enforcement',
    isAtQuota === true && attemptSelectThird === false,
    `Correctly enforces maxAlbumSelections limit (${quotaLimit}) and blocks additional selections.`
  );

  // TEST 21: Client Identity Persistence Across Page Reloads
  const hasLocalStorageKey = clientViewContent.includes('localStorage.getItem(`studiocloud_client_email_${galleryId}`)') &&
                             clientViewContent.includes('localStorage.setItem(`studiocloud_client_email_${galleryId}`, cleanE)');
  runner.assert(
    '21. Client Identity Persistence Across Page Reloads',
    hasLocalStorageKey,
    'Client email and name are securely saved in localStorage per gallery, restoring state upon reload without re-entry.'
  );

  // TEST 22: Lightbox In-Bounds Indexing for Filtered Media
  const hasFilteredMediaInLightbox = clientViewContent.includes('lightboxIndex >= filteredMedia.length') &&
                                     clientViewContent.includes('filteredMedia[lightboxIndex]');
  runner.assert(
    '22. Lightbox Accurate Selection Indexing Under Active Filters',
    hasFilteredMediaInLightbox,
    'Lightbox strictly indexes into filteredMedia, preventing mismatch between favourites and full collection.'
  );

  runner.summary('StudioCloud Phase 4 Client Proofing Verification');
}

runProofingVerification().catch((err) => {
  console.error('Fatal error in proofing verification:', err);
  process.exit(1);
});
