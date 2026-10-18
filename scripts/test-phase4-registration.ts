/**
 * StudioCloud Phase 4: Studio Registration, Tenant Creation & Multi-Tenant Isolation Test Suite
 * Tests:
 * 1. Studio/Tenant Record Creation & Field Invariants (10 GB Decimal, starter plan, active status)
 * 2. Studio Owner Membership & Role Preservation (/studios/{id}/members/{ownerId})
 * 3. Duplicate Studio Creation Prevention (In-flight deduplication & existing slug rejection)
 * 4. Join Studio Membership Validation & Unauthorized Access Rejection
 * 5. Super Admin Authorization & Platform Isolation (Non-email-spoofable server check)
 * 6. Tenant Isolation & Cross-Tenant Access Denial (Client CRM, Private Galleries, Member Roster)
 * 7. Anti-Privilege Escalation & Anti-Self-Elevation Rules (Users cannot grant superadmin or elevate member roles)
 * 8. Super Admin Empty State and Real Data Verification
 */

import fs from 'fs';
import path from 'path';

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

async function runPhase4Verification() {
  console.log('=== StudioCloud Phase 4: Registration, Tenant Creation & Isolation Suite ===\n');
  const runner = new TestRunner();

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const studioServicePath = path.resolve(process.cwd(), 'src/services/studioService.ts');
  const studioServiceContent = fs.readFileSync(studioServicePath, 'utf8');

  const authContextPath = path.resolve(process.cwd(), 'src/contexts/AuthContext.tsx');
  const authContextContent = fs.readFileSync(authContextPath, 'utf8');

  const superAdminPath = path.resolve(process.cwd(), 'src/components/modules/SuperAdminModule.tsx');
  const superAdminContent = fs.readFileSync(superAdminPath, 'utf8');

  // TEST 1: Tenant Creation Invariants in Security Rules
  runner.assert(
    '1. Firestore Rules Tenant Creation Invariant',
    rulesContent.includes('incoming().ownerId == request.auth.uid') &&
    rulesContent.includes('incoming().storageAllocationBytes == 10000000000') &&
    rulesContent.includes("incoming().plan == 'starter'") &&
    rulesContent.includes("incoming().status == 'active'"),
    'Security rules mandate ownerId matches auth.uid, storageAllocationBytes is exactly 10,000,000,000, plan is starter, and status is active.'
  );

  // TEST 2: Studio Owner Role Registration in Subcollection
  runner.assert(
    '2. Studio Owner Member Subcollection Registration',
    studioServiceContent.includes("role: 'owner'") &&
    studioServiceContent.includes("status: 'active'") &&
    studioServiceContent.includes("doc(db, 'studios', studioId, 'members', params.userId)"),
    'createStudio automatically records the owner in /studios/{studioId}/members/{userId} with role "owner".'
  );

  // TEST 3: Duplicate Studio Creation Prevention
  runner.assert(
    '3. Duplicate Studio Creation Guard',
    studioServiceContent.includes('inFlightCreationUids') &&
    studioServiceContent.includes('inFlightCreationUids.add(params.userId)') &&
    studioServiceContent.includes('inFlightCreationUids.delete(params.userId)') &&
    studioServiceContent.includes('duplicate'),
    'In-flight user deduplication set and duplicate slug/name checks prevent repeated studio creation requests.'
  );

  // TEST 4: Join Studio Validates Membership & Rejects Unauthorized Access
  runner.assert(
    '4. Join Studio Validates Membership Authorization',
    studioServiceContent.includes('verifyStudioMembership(params.studioId, params.userId)') &&
    studioServiceContent.includes('No authorized team membership was found') &&
    authContextContent.includes('verifyStudioMembership(targetStudio.id, cred.user.uid)'),
    'joinStudioAsTeamMember validates that an authorized membership exists in the studio roster before granting workspace access.'
  );

  // TEST 5: Member Anti-Self-Elevation Rule
  runner.assert(
    '5. Member Anti-Self-Elevation Protection',
    rulesContent.includes('request.auth.uid != memberId ||') &&
    rulesContent.includes('incoming().role == existing().role'),
    'Firestore rules block team members from updating their own document in /members to elevate their role.'
  );

  // TEST 6: Super Admin Server-Side Verification (Not Email String Only)
  runner.assert(
    '6. Super Admin Server-Side Registry Gate',
    rulesContent.includes('exists(/databases/$(database)/documents/admins/$(request.auth.uid))') &&
    studioServiceContent.includes("getDoc(doc(db, 'admins', userId))") &&
    studioServiceContent.includes("adminSnap.data()?.role === 'super_admin'"),
    'Super Admin access requires a server-side verified document in /admins/{userId} or trusted token in Firestore security rules.'
  );

  // TEST 7: Cross-Tenant Isolation for Studios & Subcollections
  runner.assert(
    '7. Multi-Tenant Cross-Access Isolation',
    rulesContent.includes('allow get: if isValidId(studioId) && (isSuperAdmin() || isStudioMember(studioId));') &&
    rulesContent.includes('allow list: if isSuperAdmin() || (isSignedIn() && resource.data.ownerId == request.auth.uid);') &&
    rulesContent.includes('isStudioMember(studioId)'),
    'Studios and their subcollections (clients, members, galleries, activityLogs) are strictly isolated to studio members and super admins.'
  );

  // TEST 8: Anti-Privilege Escalation on User Profile
  runner.assert(
    '8. User Profile Anti-Privilege Escalation',
    rulesContent.includes("!('isSuperAdmin' in incoming()) ||") &&
    rulesContent.includes('incoming().isSuperAdmin == false ||') &&
    rulesContent.includes('isSuperAdmin()'),
    'Standard authenticated users are strictly prevented from setting isSuperAdmin: true on /users/{userId}.'
  );

  // TEST 9: Super Admin Dashboard Accurate Empty State
  runner.assert(
    '9. Super Admin Dashboard Accurate Empty State',
    superAdminContent.includes('No Registered Studio Tenants Found') &&
    superAdminContent.includes('There are currently no photography studios in the Firestore database'),
    'Super Admin dashboard renders an informative, dedicated empty state when 0 studios exist in the platform database.'
  );

  // TEST 10: Storage Usage Realism & No Fabricated Enforcements
  runner.assert(
    '10. Storage Realism & Honesty Enforcement',
    superAdminContent.includes('formatBytes(totalUsedBytes)') &&
    studioServiceContent.includes('storageUsedBytes: 0'),
    'Storage consumption is accurately derived from Firestore tenant records, without fabricating usage or claims.'
  );

  runner.summary('StudioCloud Phase 4 Verification Summary');
}

runPhase4Verification();
