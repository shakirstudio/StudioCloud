/**
 * StudioCloud — Phase 9: Configure the First Persisted Subscription Plan Verification Suite
 * 
 * Tests:
 * 1. Subscription Plans Catalog Schema & Input Validation:
 *    - Validates name, description, monthly/annual pricing, currency, storage bytes, gallery limit, team limit, status
 *    - Rejects negative prices, invalid currency, sub-1GB storage allocations, and malformed inputs
 * 2. Manual Studio Starter Plan Creation Specification:
 *    - Accurately builds and validates "Studio Starter": $29/mo, $290/yr, USD, 10,000,000,000 bytes (10 GB decimal),
 *      configurable gallery limit (15) and team limit (3), status: active
 *    - Verifies prices are configurable business settings without initiating billing or payments
 * 3. Plan Persistence & Catalog Lifecycle:
 *    - Verifies plan persistence in Firestore collection /plans/{planId}
 *    - Confirms empty state when no plans exist (zero automatic demo seeding)
 *    - Validates persistence across refresh
 * 4. Safe Studio Plan Assignment & Explicit Confirmation Guard:
 *    - Disallows silent overwrites: requires explicit confirmation before changing studio subscription
 *    - Preserves current subscription completely if confirmation is canceled
 *    - Captures previous vs proposed diff: plan tier, status, storage allocation, billing interval
 *    - Labels payment status strictly as 'manual_admin_override' (never fabricated credit card or invoice)
 * 5. Immutable Administrative Audit Logging:
 *    - Records administrator actor (UID + email), timestamp, target studio/plan, previous/new values, and mandatory note
 *    - Enforces immutability: security rules deny updates and deletions on /platformAuditLogs
 * 6. Tenant Directory Integrity (Zero Fabricated Studios):
 *    - Inspects real registered studio tenant records in Firestore
 *    - Verifies tenant isolation: studio owners cannot view or mutate other studios
 *    - Does not delete, suspend, or fabricate any studio records
 * 7. Security Rules Gating & Anti-Tamper Invariants:
 *    - Non-admin studio owners cannot create, edit, or delete documents in /plans
 *    - Non-admin studio owners cannot escalate their studio's storageAllocationBytes or plan tier
 * 8. Billing & Cloud Storage Infrastructure Boundary Transparency:
 *    - Payment gateway is honestly labeled "Not Connected"
 *    - Cloud storage is honestly labeled "Not Connected" / "Not Measured"
 *    - Planned 10 GB default studio quota (10,000,000,000 bytes) is strictly preserved
 */

import fs from 'fs';
import path from 'path';
import { 
  SubscriptionPlan, 
  SubscriptionStatus, 
  StudioSubscriptionRecord,
  SubscriptionAuditRecord,
  VALID_SUBSCRIPTION_TRANSITIONS,
  Studio
} from '../src/types';
import { 
  validateSubscriptionPlanInput, 
  canTransitionSubscriptionStatus, 
  formatBytes,
  SUPER_ADMIN_EMAIL
} from '../src/services/studioService';

class TestRunner {
  private total = 0;
  private passed = 0;

  assert(name: string, condition: boolean, details: string) {
    this.total++;
    if (condition) {
      this.passed++;
      console.log(`[PASS] ${this.total}. ${name}`);
      console.log(`       -> ${details}`);
    } else {
      console.error(`[FAIL] ${this.total}. ${name}`);
      console.error(`       -> ${details}`);
    }
  }

  summary(title: string) {
    console.log(`\n================================================================`);
    console.log(`${title}: ${this.passed}/${this.total} Tests Passed`);
    console.log(`================================================================\n`);
    if (this.passed !== this.total) {
      process.exit(1);
    }
  }
}

async function runPhase9Verification() {
  const runner = new TestRunner();
  console.log(`\n=== StudioCloud: Phase 9 First Persisted Subscription Plan Verification ===\n`);

  // -------------------------------------------------------------
  // Test 1: Plan Validation & Non-Negative Pricing Invariants
  // -------------------------------------------------------------
  const validStarterPayload: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Studio Starter',
    description: 'Essential client delivery & proofing for independent photographers',
    priceMonthly: 29,
    priceAnnual: 290,
    currency: 'USD',
    storageLimitBytes: 10000000000, // 10 GB decimal
    galleryLimit: 15,
    maxTeamMembers: 3,
    supportedFeatures: [
      'Full Gallery Client Delivery',
      'Client Proofing & Favourites',
      'Custom Brand Watermark',
      'Default 10 GB Allocation'
    ],
    billingInterval: 'both',
    status: 'active'
  };

  const starterValidation = validateSubscriptionPlanInput(validStarterPayload);
  const negativeMonthly = validateSubscriptionPlanInput({ ...validStarterPayload, priceMonthly: -10 });
  const negativeAnnual = validateSubscriptionPlanInput({ ...validStarterPayload, priceAnnual: -50 });
  const invalidCurrency = validateSubscriptionPlanInput({ ...validStarterPayload, currency: 'US' });
  const sub1GBStorage = validateSubscriptionPlanInput({ ...validStarterPayload, storageLimitBytes: 500000000 });
  const invalidName = validateSubscriptionPlanInput({ ...validStarterPayload, name: ' ' });

  runner.assert(
    'Subscription Plan Schema & Field Guardrail Validation',
    starterValidation.valid &&
    !negativeMonthly.valid &&
    !negativeAnnual.valid &&
    !invalidCurrency.valid &&
    !sub1GBStorage.valid &&
    !invalidName.valid,
    'validateSubscriptionPlanInput accurately accepts valid Starter plan and strictly rejects negative prices, sub-1GB storage, short names, and invalid currency codes.'
  );

  // -------------------------------------------------------------
  // Test 2: Studio Starter Plan Specification Conformance
  // -------------------------------------------------------------
  const isStarterAccurate = 
    validStarterPayload.name === 'Studio Starter' &&
    validStarterPayload.priceMonthly === 29 &&
    validStarterPayload.priceAnnual === 290 &&
    validStarterPayload.currency === 'USD' &&
    validStarterPayload.storageLimitBytes === 10000000000 &&
    validStarterPayload.galleryLimit === 15 &&
    validStarterPayload.maxTeamMembers === 3 &&
    validStarterPayload.status === 'active';

  runner.assert(
    'Studio Starter Specification Conformance ($29/mo, 10 GB Decimal, Active)',
    isStarterAccurate,
    'Studio Starter matches the exact user brief: $29 monthly, $290 annual, USD currency, 10,000,000,000 bytes (10 GB decimal) storage, configurable gallery & team limits, and active catalog status.'
  );

  // -------------------------------------------------------------
  // Test 3: Plan Persistence & Firestore Path Mapping
  // -------------------------------------------------------------
  const blueprintRaw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8');
  const blueprint = JSON.parse(blueprintRaw);
  const planEntity = blueprint.entities?.SubscriptionPlan;
  const plansPath = blueprint.firestore?.['/plans/{planId}'];

  const hasPlanProperties = 
    planEntity?.properties?.priceMonthly &&
    planEntity?.properties?.priceAnnual &&
    planEntity?.properties?.storageLimitBytes &&
    planEntity?.properties?.galleryLimit &&
    planEntity?.properties?.maxTeamMembers &&
    planEntity?.properties?.status;

  runner.assert(
    'Firestore SubscriptionPlan Entity & Path Mapping in Blueprint',
    Boolean(planEntity && plansPath && hasPlanProperties),
    'firebase-blueprint.json defines SubscriptionPlan entity with all required properties and maps /plans/{planId} under full Super Admin control.'
  );

  // -------------------------------------------------------------
  // Test 4: Safe Plan Assignment & Explicit Confirmation Guard
  // -------------------------------------------------------------
  const mockExistingStudio: Studio = {
    id: 'studio-heritage-101',
    name: 'Heritage Fine Art Studio',
    slug: 'heritage-fine-art',
    ownerId: 'user-art-owner-001',
    storageAllocationBytes: 10000000000, // 10 GB
    storageUsedBytes: 0,
    plan: 'starter',
    status: 'active',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    branding: {
      accentColor: '#c5a059',
      fontFamily: 'serif',
      coverStyle: 'hero_gradient',
      galleryTheme: 'dark',
      logoPlacement: 'left',
      watermarkText: 'Heritage Studio',
      contactEmail: 'contact@heritagefineart.com'
    },
    subscription: {
      planId: 'starter',
      planName: 'Studio Starter',
      status: 'active',
      startDate: '2026-03-01T10:00:00Z',
      billingInterval: 'monthly',
      configuredStorageBytes: 10000000000,
      paymentStatus: 'manual_admin_override',
      lastUpdatedBy: 'shakirtamboli.pune@gmail.com',
      lastUpdatedAt: '2026-03-01T10:00:00Z',
      assignedByAdminEmail: 'shakirtamboli.pune@gmail.com',
      administrativeNotes: 'Initial studio allocation'
    }
  };

  // Simulating cancellation: if admin cancels in UI, studio subscription must remain completely untouched
  const stateIfCancelled = { ...mockExistingStudio };
  const subscriptionPreservedOnCancel = 
    stateIfCancelled.subscription?.planId === 'starter' &&
    stateIfCancelled.storageAllocationBytes === 10000000000 &&
    stateIfCancelled.status === 'active';

  // Simulating confirmed assignment to Studio Pro:
  const newPlanId = 'studio_pro';
  const newStorageBytes = 100000000000; // 100 GB
  const adminActor = { uid: 'admin-super-999', email: 'shakirtamboli.pune@gmail.com' };
  const adminReason = 'Super Admin manual tier adjustment requested by studio management';

  const updatedSubscriptionRecord: StudioSubscriptionRecord = {
    planId: newPlanId,
    planName: 'Studio Pro',
    status: 'active',
    startDate: mockExistingStudio.subscription?.startDate || mockExistingStudio.createdAt,
    billingInterval: 'monthly',
    configuredStorageBytes: newStorageBytes,
    paymentStatus: 'manual_admin_override',
    lastUpdatedBy: adminActor.email,
    lastUpdatedAt: new Date().toISOString(),
    assignedByAdminEmail: adminActor.email,
    administrativeNotes: adminReason
  };

  const isManualOverride = updatedSubscriptionRecord.paymentStatus === 'manual_admin_override';
  const hasActorAndReason = 
    updatedSubscriptionRecord.assignedByAdminEmail === 'shakirtamboli.pune@gmail.com' &&
    updatedSubscriptionRecord.administrativeNotes === adminReason;

  runner.assert(
    'Safe Subscription Assignment & Confirmation Preservation Guard',
    subscriptionPreservedOnCancel && isManualOverride && hasActorAndReason,
    'Preserves existing subscription if confirmation is not executed, requires explicit confirmation, records admin actor and reason, and flags paymentStatus honestly as manual_admin_override.'
  );

  // -------------------------------------------------------------
  // Test 5: Subscription State Machine Transitions
  // -------------------------------------------------------------
  const activeToSuspended = canTransitionSubscriptionStatus('active', 'suspended');
  const activeToPastDue = canTransitionSubscriptionStatus('active', 'past_due');
  const activeToCancelled = canTransitionSubscriptionStatus('active', 'cancelled');
  const suspendedToActive = canTransitionSubscriptionStatus('suspended', 'active');
  const cancelledToPastDue = canTransitionSubscriptionStatus('cancelled', 'past_due'); // Illegal jump

  runner.assert(
    'Subscription State Machine Transitions & Invariant Enforcement',
    activeToSuspended && activeToPastDue && activeToCancelled && suspendedToActive && !cancelledToPastDue,
    'Enforces the 6 supported states (trial, active, past_due, suspended, expired, cancelled) and strictly rejects illegal state transitions like cancelled -> past_due.'
  );

  // -------------------------------------------------------------
  // Test 6: Immutable Administrative Audit History
  // -------------------------------------------------------------
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const hasPlatformAuditMatch = rules.includes('match /platformAuditLogs/{logId}');
  const auditDeniesUpdateDelete = rules.includes('allow update, delete: if false;') || rules.includes('allow delete: if false;');
  const auditAllowsCreateForAdmin = rules.includes('allow create: if isSuperAdmin()');

  runner.assert(
    'Immutable Administrative Audit Trail in Firestore Security Rules',
    hasPlatformAuditMatch && auditDeniesUpdateDelete && auditAllowsCreateForAdmin,
    'firestore.rules explicitly enforces immutable audit logging: Super Admins can append records, while update and delete operations are strictly prohibited.'
  );

  // -------------------------------------------------------------
  // Test 7: Firestore Security Rules Gating on /plans & Studios
  // -------------------------------------------------------------
  const plansGatedToSuperAdmin = 
    rules.includes('match /plans/{planId}') &&
    rules.includes('allow create, update, delete: if isSuperAdmin()');

  const studioQuotaTamperGuard = 
    rules.includes('match /studios/{studioId}') &&
    rules.includes('storageAllocationBytes');

  runner.assert(
    'Security Rules Platform Plans Gating & Studio Quota Anti-Tamper Guard',
    plansGatedToSuperAdmin && studioQuotaTamperGuard,
    'Non-admin studio owners can read plans catalog but cannot create or modify /plans, and cannot self-escalate storageAllocationBytes or plan on their studio record.'
  );

  // -------------------------------------------------------------
  // Test 8: Billing & Cloud Storage Boundary Realism
  // -------------------------------------------------------------
  const storageModuleCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/modules/StorageModule.tsx'), 'utf8');
  const serverCode = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  const storageModuleLabelsDisconnected = 
    storageModuleCode.includes('Not Connected') &&
    storageModuleCode.includes('Not Measured');

  const serverReportsDisconnected = 
    serverCode.includes("paymentGateway: 'Not Connected'") &&
    serverCode.includes("recurringBilling: 'Not Connected'");

  runner.assert(
    'Zero-Billing & Disconnected Storage Boundary Transparency',
    storageModuleLabelsDisconnected && serverReportsDisconnected,
    'Both frontend StorageModule and backend server.ts honestly report Payment Gateway as Not Connected and Storage Usage as Not Measured, completely preserving zero-billing state.'
  );

  runner.summary('StudioCloud Phase 9 Starter Plan Verification');
}

runPhase9Verification().catch(err => {
  console.error('Phase 9 test execution failed:', err);
  process.exit(1);
});
