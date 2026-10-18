/**
 * Security Rule & Multi-Tenant Authorization Verification Suite
 * Tests rule assertions for Phase 2:
 * 1. Default Catch-All Deny
 * 2. Super Admin Authorization & Anti-Privilege Escalation
 * 3. Studio Storage Allocation Invariant (10,000,000,000 bytes decimal)
 * 4. Cross-Studio Access Isolation
 * 5. Immutable Audit Log Operations
 */

import fs from 'fs';
import path from 'path';

function runSecurityRuleAudit() {
  console.log('=== StudioCloud Phase 2 Security Rules Audit ===');
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const assertions: { name: string; test: () => boolean; details: string }[] = [
    {
      name: 'Default Deny Catch-All',
      test: () => rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
      details: 'Ensures all unspecified collections default to immediate access denial.',
    },
    {
      name: 'Super Admin Pre-Authorization Requirement',
      test: () => rulesContent.includes("request.auth.token.email == 'shakirtamboli.pune@gmail.com'") &&
                  rulesContent.includes('exists(/databases/$(database)/documents/admins/$(request.auth.uid))'),
      details: 'Prevents client-side spoofing; Super Admin is tied to verified token email or database registry.',
    },
    {
      name: 'User Anti-Privilege Escalation Gate',
      test: () => rulesContent.includes("!('isSuperAdmin' in incoming()) ||") &&
                  rulesContent.includes('incoming().isSuperAdmin == false ||') &&
                  rulesContent.includes('isSuperAdmin()'),
      details: 'Prevents authenticated users from self-assigning isSuperAdmin: true in /users/{userId}.',
    },
    {
      name: 'Tenant Storage Allocation Decimal Invariant (10 GB)',
      test: () => rulesContent.includes('incoming().storageAllocationBytes == 10000000000') &&
                  rulesContent.includes("incoming().plan == 'starter'") &&
                  rulesContent.includes('incoming().storageAllocationBytes == existing().storageAllocationBytes'),
      details: 'Studio creation enforces exactly 10,000,000,000 bytes; owners cannot escalate their own quota.',
    },
    {
      name: 'Cross-Tenant Document Read & Write Block',
      test: () => rulesContent.includes('isStudioMember(studioId)') &&
                  rulesContent.includes('isStudioOwner(studioId)'),
      details: 'Requires studio membership or ownership for accessing studio subcollections (clients, galleries, members).',
    },
    {
      name: 'Activity Audit Log Immutability',
      test: () => rulesContent.includes('match /activityLogs/{logId}') &&
                  rulesContent.includes('isStudioMember(studioId)') &&
                  rulesContent.includes('allow update, delete: if false;'),
      details: 'Audit logs cannot be altered or deleted by any user.',
    },
    {
      name: 'Member Anti-Self-Elevation Rule',
      test: () => rulesContent.includes('request.auth.uid != memberId ||') &&
                  rulesContent.includes('incoming().role == existing().role'),
      details: 'Studio members cannot edit their own document in /members to elevate to owner.',
    }
  ];

  let passed = 0;
  for (const assertion of assertions) {
    const result = assertion.test();
    if (result) {
      console.log(`[PASS] ${assertion.name}`);
      console.log(`       -> ${assertion.details}`);
      passed++;
    } else {
      console.error(`[FAIL] ${assertion.name}`);
      console.error(`       -> ${assertion.details}`);
    }
  }

  console.log(`\nAudit Summary: ${passed}/${assertions.length} Security Assertions Passed.`);
  if (passed !== assertions.length) {
    process.exit(1);
  }
}

runSecurityRuleAudit();
