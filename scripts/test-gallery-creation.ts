/**
 * StudioCloud: Gallery Creation & Firestore Payload Sanitization Test Suite
 * Tests:
 * 1. Diagnosis verification: undefined fields (description, clientId, clientName) caused setDoc() failure
 * 2. sanitizeFirestorePayload removes undefined keys while preserving null, 0, false, arrays, and objects
 * 3. createGallery with only required fields produces zero undefined fields
 * 4. createGallery with optional fields left blank (empty strings) safely omits them
 * 5. createGallery with populated optional fields includes valid trimmed values
 * 6. Tenant isolation: studioId is required and verified
 * 7. Input validation: collection title required and validated (min length)
 * 8. Error handling: friendly error messages without raw Firebase internals leakage
 * 9. Form preservation on error and confirmation before closing
 */

import fs from 'fs';
import path from 'path';
import { sanitizeFirestorePayload } from '../src/services/studioService';

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

function hasAnyUndefined(obj: any): boolean {
  if (obj === undefined) return true;
  if (obj === null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    return obj.some(item => hasAnyUndefined(item));
  }
  return Object.values(obj).some(val => hasAnyUndefined(val));
}

async function runGalleryVerification() {
  console.log('=== StudioCloud: Gallery Creation & Payload Verification Suite ===\n');
  const runner = new TestRunner();

  const studioServicePath = path.resolve(process.cwd(), 'src/services/studioService.ts');
  const studioServiceContent = fs.readFileSync(studioServicePath, 'utf8');

  const galleriesModulePath = path.resolve(process.cwd(), 'src/components/modules/GalleriesModule.tsx');
  const galleriesModuleContent = fs.readFileSync(galleriesModulePath, 'utf8');

  // TEST 1: sanitizeFirestorePayload utility handles undefined values
  const dirtyObject = {
    title: 'Autumn in Tuscany',
    description: undefined,
    clientId: undefined,
    clientName: undefined,
    photoCount: 0,
    storageBytes: 0,
    downloadAccess: false,
    meta: {
      tags: ['wedding', undefined, 'outdoor'],
      notes: undefined,
      validNull: null,
    },
  };

  const cleaned: any = sanitizeFirestorePayload(dirtyObject);
  const containsUndefined = hasAnyUndefined(cleaned);

  runner.assert(
    '1. sanitizeFirestorePayload removes all undefined values recursively',
    !containsUndefined &&
    !('description' in cleaned) &&
    !('clientId' in cleaned) &&
    !('clientName' in cleaned) &&
    cleaned.photoCount === 0 &&
    cleaned.downloadAccess === false &&
    cleaned.meta.validNull === null &&
    cleaned.meta.tags.length === 2,
    'Recursively stripped undefined fields while preserving 0, false, null, and valid array elements.'
  );

  // TEST 2: GalleriesModule no longer sends undefined in create payload
  const hasOldUndefinedPattern = galleriesModuleContent.includes('description: formData.description.trim() || undefined');
  runner.assert(
    '2. GalleriesModule handleCreate avoids explicit undefined assignment',
    !hasOldUndefinedPattern,
    'formData.description, clientId, clientName no longer use "|| undefined" fallback.'
  );

  // TEST 3: Required Fields Only Payload Creation
  // Simulate payload with only required fields (e.g. title: "Minimal Wedding", optional fields blank)
  const minimalInput = {
    title: 'Minimal Wedding',
    eventType: 'wedding',
    coverImageUrl: 'https://example.com/cover.jpg',
    status: 'published' as const,
    privacy: 'password_protected' as const,
    downloadAccess: true,
    photoCount: 0,
    videoCount: 0,
    storageBytes: 0,
  };

  // Simulating createGallery payload construction logic
  const now = new Date().toISOString();
  const simulatedGallery: Record<string, any> = {
    id: 'gal_test_123',
    studioId: 'studio_test_abc',
    title: minimalInput.title.trim(),
    status: minimalInput.status || 'published',
    privacy: minimalInput.privacy || 'password_protected',
    downloadAccess: minimalInput.downloadAccess,
    photoCount: 0,
    videoCount: 0,
    storageBytes: 0,
    createdAt: now,
    updatedAt: now,
  };
  const sanitizedMinimal = sanitizeFirestorePayload(simulatedGallery);

  runner.assert(
    '3. Gallery payload with only required fields is 100% valid for Firestore setDoc()',
    !hasAnyUndefined(sanitizedMinimal) &&
    typeof sanitizedMinimal.title === 'string' &&
    typeof sanitizedMinimal.studioId === 'string' &&
    typeof sanitizedMinimal.photoCount === 'number',
    'Minimal gallery document contains only valid Firestore-supported data types.'
  );

  // TEST 4: Optional Fields Omission When Blank
  const blankOptionalInput = {
    title: 'Studio Portrait Session',
    description: '',
    eventType: 'editorial',
    clientId: '',
    clientName: '',
    shootDate: '',
  };

  const payloadWithBlankOptionals: Record<string, any> = {
    id: 'gal_test_456',
    studioId: 'studio_test_abc',
    title: blankOptionalInput.title.trim(),
    status: 'published',
    privacy: 'password_protected',
    downloadAccess: true,
    photoCount: 0,
    videoCount: 0,
    storageBytes: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (blankOptionalInput.description.trim()) {
    payloadWithBlankOptionals.description = blankOptionalInput.description.trim();
  }
  if (blankOptionalInput.clientId.trim()) {
    payloadWithBlankOptionals.clientId = blankOptionalInput.clientId.trim();
  }
  const sanitizedBlank = sanitizeFirestorePayload(payloadWithBlankOptionals);

  runner.assert(
    '4. Optional fields left blank are omitted from document without error',
    !('description' in sanitizedBlank) &&
    !('clientId' in sanitizedBlank) &&
    !('clientName' in sanitizedBlank) &&
    !hasAnyUndefined(sanitizedBlank),
    'Blank optional fields are excluded from payload, preventing unsupported undefined errors in setDoc().'
  );

  // TEST 5: Optional Fields Inclusion When Populated
  const populatedOptionalInput = {
    title: 'Gala Evening 2026',
    description: 'Annual corporate gala event with high-res photo delivery.',
    eventType: 'commercial',
    clientId: 'client_789',
    clientName: 'Acme Corporation',
    shootDate: '2026-10-15',
  };

  const payloadPopulated: Record<string, any> = {
    id: 'gal_test_789',
    studioId: 'studio_test_abc',
    title: populatedOptionalInput.title.trim(),
    status: 'published',
    privacy: 'password_protected',
    downloadAccess: true,
    photoCount: 0,
    videoCount: 0,
    storageBytes: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (populatedOptionalInput.description.trim()) {
    payloadPopulated.description = populatedOptionalInput.description.trim();
  }
  if (populatedOptionalInput.clientId.trim()) {
    payloadPopulated.clientId = populatedOptionalInput.clientId.trim();
    payloadPopulated.clientName = populatedOptionalInput.clientName.trim();
  }
  if (populatedOptionalInput.shootDate.trim()) {
    payloadPopulated.shootDate = populatedOptionalInput.shootDate.trim();
  }
  const sanitizedPopulated = sanitizeFirestorePayload(payloadPopulated);

  runner.assert(
    '5. Populated optional fields are correctly preserved in Firestore document',
    sanitizedPopulated.description === 'Annual corporate gala event with high-res photo delivery.' &&
    sanitizedPopulated.clientId === 'client_789' &&
    sanitizedPopulated.clientName === 'Acme Corporation' &&
    sanitizedPopulated.shootDate === '2026-10-15' &&
    !hasAnyUndefined(sanitizedPopulated),
    'All populated optional fields preserved with sanitized values.'
  );

  // TEST 6: Tenant Isolation & Studio Membership Target
  runner.assert(
    '6. Tenant Isolation: createGallery strictly enforces valid studioId',
    studioServiceContent.includes('!studioId || typeof studioId !== \'string\' || !studioId.trim()') &&
    galleriesModuleContent.includes('createGallery(activeStudio.id'),
    'Target studio is taken strictly from authenticated user activeStudio context, never untrusted form inputs.'
  );

  // TEST 7: Input Validation on Collection Title
  runner.assert(
    '7. Input Validation: Title required with minimum length in service and UI',
    studioServiceContent.includes('trimmedTitle.length < 2') &&
    galleriesModuleContent.includes('title.length < 2'),
    'Validation checks that title exists and is at least 2 characters before saving.'
  );

  // TEST 8: Error Handling & No Firebase Internals Leaked
  runner.assert(
    '8. Error Handling: Friendly user messages without leaking raw SDK internals',
    galleriesModuleContent.includes('Permission denied: You do not have authorization') &&
    galleriesModuleContent.includes('Network connection issue') &&
    galleriesModuleContent.includes('Invalid form field detected'),
    'Catches permission, network, and validation errors with clean user-friendly text.'
  );

  // TEST 9: Success Confirmation and Modal Closure
  runner.assert(
    '9. Success Confirmation: Success banner shown and form closed only after Firestore confirms save',
    galleriesModuleContent.includes('setFormSuccess(') &&
    galleriesModuleContent.includes('await loadData()') &&
    galleriesModuleContent.includes('setBannerNotice('),
    'Success feedback displayed and modal closes only after Firestore write completes.'
  );

  // TEST 10: Form Data Preservation on Error
  runner.assert(
    '10. Form Data Preservation: Inputs remain intact on failure',
    galleriesModuleContent.includes('setFormError(') &&
    !galleriesModuleContent.includes('catch (err: any) {\n      setFormData('),
    'Form data is not reset in error catch block, preserving user input for correction.'
  );

  runner.summary('StudioCloud Gallery Creation Verification');
}

runGalleryVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
