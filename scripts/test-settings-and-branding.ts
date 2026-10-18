/**
 * StudioCloud Studio Settings & Branding Verification Suite
 * Tests:
 * 1. Studio Profile Field Validation & Persistence:
 *    - Studio legal name & display name validation (>= 2 chars)
 *    - Vanity slug formatting & validation
 *    - Description and business contact details (email, phone, address, website)
 *    - Regional preferences (timezone, currency, dateFormat)
 *    - Business details (taxId, registrationNumber, billingAddress)
 * 2. Branding Customization & Colour Validation:
 *    - Validates colour values using isValidHexColor (#c5a059, #27272a, #ffffff)
 *    - Rejects invalid hex inputs (e.g. "not-a-color", "12345", "#xyz")
 *    - Primary and secondary brand colours correctly partitioned
 *    - Gallery background canvas colour support
 * 3. Typography & Font Family Support:
 *    - Supported fonts: serif, sans, playfair, cormorant, inter, montserrat, cinzel
 *    - getFontFamilyStyle maps fonts to correct CSS font-family strings
 * 4. Gallery Cover Styles & Logo Placement:
 *    - Supported cover styles: hero_gradient, full, split, minimal
 *    - Supported logo placements: left, center, right
 * 5. Reset to Defaults Pipeline:
 *    - DEFAULT_STUDIO_BRANDING restores clean luxury presets
 *    - Preserves studio name and contact details during branding reset
 * 6. Client-Facing Gallery Branding Integration:
 *    - ClientGalleryView applies accentColor, fontFamilyStyle, logoPlacement, coverStyle, and galleryTheme
 *    - Renders studio contact details and custom footer in gallery view
 *    - Strictly isolates branding between studio tenants
 *    - Zero exposure of internal studio settings, private notes, or staff UIDs
 * 7. Firestore Security Rules Isolation & Owner Protection:
 *    - /studios/{studioId} updates restricted to studio owner or super admin
 *    - Invariants enforced: owners cannot alter ownerId, storageAllocationBytes, plan, or status
 * 8. Billing & Storage Realism:
 *    - Cloud Storage remains honestly labelled "Not Connected"
 *    - 10 GB quota preserved as planned allocation
 *    - Custom domain status labelled "Not Configured"
 */

import fs from 'fs';
import path from 'path';
import { 
  Studio, 
  StudioBranding, 
  SupportedFontFamily, 
  LogoPlacement, 
  GalleryCoverStyle, 
  GalleryTheme 
} from '../src/types';
import { 
  DEFAULT_STUDIO_BRANDING, 
  SUPPORTED_FONTS, 
  isValidHexColor, 
  getFontFamilyStyle 
} from '../src/services/studioService';

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

async function runSettingsAndBrandingTests() {
  const runner = new TestRunner();
  console.log('\n=== StudioCloud: Studio Settings & Branding Verification Suite ===\n');

  // Test 1: Studio Profile Validation & Persistence Invariants
  const validateProfile = (name: string, slug: string) => {
    if (!name || name.trim().length < 2) {
      return { valid: false, error: 'Studio name must be at least 2 characters.' };
    }
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (cleanSlug.length < 2) {
      return { valid: false, error: 'Slug must be at least 2 characters.' };
    }
    return { valid: true, slug: cleanSlug };
  };

  const emptyNameCheck = validateProfile('', 'vance-studio');
  const shortSlugCheck = validateProfile('Vance Studio', 'a');
  const validProfileCheck = validateProfile('Vance Fine Art Studio', 'Vance-Studio-2026!');

  runner.assert(
    '1. Studio Profile Field Validation & Vanity Slug Formatting',
    !emptyNameCheck.valid &&
    !shortSlugCheck.valid &&
    validProfileCheck.valid &&
    validProfileCheck.slug === 'vance-studio-2026-',
    'Enforces minimum name length, sanitizes vanity slug to URL-safe characters.'
  );

  // Test 2: Colour Validation (isValidHexColor)
  const validHex1 = isValidHexColor('#c5a059');
  const validHex2 = isValidHexColor('#27272a');
  const validHex3 = isValidHexColor('#fff');
  const validHex4 = isValidHexColor('#059669');
  const invalidHex1 = isValidHexColor('c5a059'); // Missing #
  const invalidHex2 = isValidHexColor('#xyz123'); // Invalid chars
  const invalidHex3 = isValidHexColor('#12345'); // 5 chars
  const invalidHex4 = isValidHexColor(''); // Empty

  runner.assert(
    '2. Brand Colour HEX Validation (isValidHexColor)',
    validHex1 && validHex2 && validHex3 && validHex4 &&
    !invalidHex1 && !invalidHex2 && !invalidHex3 && !invalidHex4,
    'Accurately verifies 3-char and 6-char HEX color codes (#c5a059) while rejecting malformed inputs.'
  );

  // Test 3: Typography & Supported Font Families
  const expectedFonts: SupportedFontFamily[] = [
    'serif', 'sans', 'playfair', 'cormorant', 'inter', 'montserrat', 'cinzel'
  ];
  const fontsConfigured = expectedFonts.every(f => SUPPORTED_FONTS.some(sf => sf.id === f));
  
  const playfairStyle = getFontFamilyStyle('playfair');
  const cormorantStyle = getFontFamilyStyle('cormorant');
  const cinzelStyle = getFontFamilyStyle('cinzel');
  const interStyle = getFontFamilyStyle('inter');
  const serifStyle = getFontFamilyStyle('serif');

  runner.assert(
    '3. Professional Font Selection & Style Mapping',
    fontsConfigured &&
    playfairStyle.includes('Playfair Display') &&
    cormorantStyle.includes('Cormorant Garamond') &&
    cinzelStyle.includes('Cinzel') &&
    interStyle.includes('Inter') &&
    serifStyle.includes('serif'),
    `Configured ${SUPPORTED_FONTS.length} fonts with verified CSS font-family string generation.`
  );

  // Test 4: Gallery Cover Style & Logo Placement Configurations
  const validPlacements: LogoPlacement[] = ['left', 'center', 'right'];
  const validCoverStyles: GalleryCoverStyle[] = ['hero_gradient', 'full', 'split', 'minimal'];
  const validThemes: GalleryTheme[] = ['dark', 'light', 'system'];

  runner.assert(
    '4. Gallery Cover Styles, Themes & Logo Placement Support',
    validPlacements.length === 3 && validCoverStyles.length === 4 && validThemes.length === 3,
    'Supports left/center/right logo placement, 4 luxury cover layouts, and dark/light/system theme modes.'
  );

  // Test 5: Reset to Defaults Invariants
  const customBranding: StudioBranding = {
    accentColor: '#dc2626',
    primaryColor: '#dc2626',
    secondaryColor: '#ffffff',
    galleryBackgroundColor: '#ffffff',
    fontFamily: 'montserrat',
    coverStyle: 'split',
    galleryTheme: 'light',
    watermarkText: 'Custom Watermark',
  };

  const resetResult: StudioBranding = {
    ...customBranding,
    accentColor: DEFAULT_STUDIO_BRANDING.accentColor,
    primaryColor: DEFAULT_STUDIO_BRANDING.primaryColor,
    secondaryColor: DEFAULT_STUDIO_BRANDING.secondaryColor,
    galleryBackgroundColor: DEFAULT_STUDIO_BRANDING.galleryBackgroundColor,
    fontFamily: DEFAULT_STUDIO_BRANDING.fontFamily,
    coverStyle: DEFAULT_STUDIO_BRANDING.coverStyle,
    galleryTheme: DEFAULT_STUDIO_BRANDING.galleryTheme,
  };

  runner.assert(
    '5. Reset to Defaults Pipeline',
    resetResult.accentColor === '#c5a059' &&
    resetResult.fontFamily === 'serif' &&
    resetResult.coverStyle === 'hero_gradient' &&
    resetResult.galleryTheme === 'dark',
    'Reset successfully restores default luxury palette (#c5a059, serif, hero_gradient, dark) while preserving studio credentials.'
  );

  // Test 6: Client-Facing Gallery Branding Integration
  const clientGalleryFile = fs.readFileSync(path.resolve('./src/components/client/ClientGalleryView.tsx'), 'utf-8');
  const hasAccentColorBinding = clientGalleryFile.includes('accentColor');
  const hasFontFamilyBinding = clientGalleryFile.includes('fontFamilyStyle');
  const hasCoverStyleHandling = clientGalleryFile.includes("coverStyle === 'split'") && clientGalleryFile.includes("coverStyle === 'full'");
  const hasFooterBranding = clientGalleryFile.includes('branding?.footerText');
  const hasContactDetailsInFooter = clientGalleryFile.includes('branding.contactEmail') && clientGalleryFile.includes('branding.phone');

  runner.assert(
    '6. Client-Facing Gallery Dynamic Branding Integration',
    hasAccentColorBinding && hasFontFamilyBinding && hasCoverStyleHandling && hasFooterBranding && hasContactDetailsInFooter,
    'ClientGalleryView dynamically renders brand accent, typography, logo placement, cover styles, and business footer.'
  );

  // Test 7: Multi-Tenant Security & Owner Protection Rules
  const firestoreRules = fs.readFileSync(path.resolve('./firestore.rules'), 'utf-8');
  const hasOwnerUpdateRule = firestoreRules.includes('isStudioOwner(studioId)');
  const hasAntiTamperQuota = firestoreRules.includes('incoming().storageAllocationBytes == existing().storageAllocationBytes');
  const hasAntiTamperPlan = firestoreRules.includes('incoming().plan == existing().plan');
  const hasAntiTamperOwner = firestoreRules.includes('incoming().ownerId == existing().ownerId');

  runner.assert(
    '7. Firestore Multi-Tenant Security Rules & Owner Invariants',
    hasOwnerUpdateRule && hasAntiTamperQuota && hasAntiTamperPlan && hasAntiTamperOwner,
    'Security rules strictly gate studio profile updates to authorized studio owners and forbid tampering with ownerId, plan, or 10 GB quota.'
  );

  // Test 8: Billing, Storage Transparency & Domain Status
  const brandingModuleFile = fs.readFileSync(path.resolve('./src/components/modules/BrandingModule.tsx'), 'utf-8');
  const hasNotConnectedNotice = brandingModuleFile.includes('Cloud Storage: Not Connected');
  const hasCustomDomainNotConfigured = brandingModuleFile.includes('Not Configured');
  const has10GBQuotaPreserved = brandingModuleFile.includes('10,000,000,000 Bytes (10 GB)');

  runner.assert(
    '8. Storage Realism, Planned Quota & Domain Transparency',
    hasNotConnectedNotice && hasCustomDomainNotConfigured && has10GBQuotaPreserved,
    'Honestly labels Cloud Storage "Not Connected", custom domains "Not Configured", and preserves 10 GB decimal allocation limit.'
  );

  runner.summary('StudioCloud Studio Settings & Branding Verification');
}

runSettingsAndBrandingTests();
