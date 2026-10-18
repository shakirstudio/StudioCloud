import crypto from 'crypto';

/**
 * Constant-time string equality check to prevent timing analysis attacks
 * when comparing passwords or share tokens.
 */
export function safeCompare(a?: string | null, b?: string | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Perform dummy timing-safe comparison on equal-length buffers
    // to resist branch/timing discrepancy on length difference.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates alphanumeric/hyphen/underscore tenant identifiers (1 to 128 chars).
 */
export function isValidTenantId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

/**
 * Strips sensitive fields (accessPassword, shareToken, internal secrets)
 * before returning gallery data in any API response or log.
 */
export function sanitizeGalleryForClient<T extends Record<string, any>>(gallery: T): Omit<T, 'accessPassword' | 'shareToken'> {
  if (!gallery || typeof gallery !== 'object') {
    return gallery;
  }

  const { accessPassword, shareToken, ...safe } = gallery;
  return safe as Omit<T, 'accessPassword' | 'shareToken'>;
}

/**
 * Strips internal tokens or sensitive fields from proofing responses.
 */
export function sanitizeProofForClient<T extends Record<string, any>>(proof: T): T {
  if (!proof || typeof proof !== 'object') {
    return proof;
  }

  const clean = { ...proof };
  delete (clean as any).accessPassword;
  delete (clean as any).shareToken;
  delete (clean as any).secret;
  return clean;
}
