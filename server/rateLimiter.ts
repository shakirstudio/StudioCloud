/**
 * Sliding-Window In-Memory Rate Limiter for Gallery Credential Verification.
 * Prevents brute-force dictionary attacks against unlisted share tokens and gallery passwords.
 */

interface RateLimitRecord {
  failedAttempts: number[];
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5; // Max 5 failed attempts within 15 minutes

const rateLimitStore = new Map<string, RateLimitRecord>();

function getStorageKey(ip: string, galleryId: string): string {
  const cleanIp = (ip || 'unknown').replace(/[^a-zA-Z0-9:._-]/g, '');
  const cleanGalleryId = (galleryId || 'global').replace(/[^a-zA-Z0-9:._-]/g, '');
  return `${cleanIp}:${cleanGalleryId}`;
}

/**
 * Checks whether an IP + gallery request is currently rate-limited.
 */
export function checkRateLimit(
  ip: string,
  galleryId: string
): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const key = getStorageKey(ip, galleryId);
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) {
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  // Filter timestamps within the sliding window
  record.failedAttempts = record.failedAttempts.filter((t) => now - t < WINDOW_MS);

  if (record.failedAttempts.length >= MAX_ATTEMPTS) {
    const oldest = record.failedAttempts[0];
    const retryAfterMs = oldest + WINDOW_MS - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - record.failedAttempts.length,
  };
}

/**
 * Records a failed verification attempt.
 */
export function recordFailedAttempt(ip: string, galleryId: string): void {
  const key = getStorageKey(ip, galleryId);
  const now = Date.now();
  const record = rateLimitStore.get(key) || { failedAttempts: [] };

  record.failedAttempts = record.failedAttempts.filter((t) => now - t < WINDOW_MS);
  record.failedAttempts.push(now);
  rateLimitStore.set(key, record);
}

/**
 * Resets/clears failed attempts upon successful verification.
 */
export function recordSuccess(ip: string, galleryId: string): void {
  const key = getStorageKey(ip, galleryId);
  rateLimitStore.delete(key);
}

/**
 * Clears the rate limiter store (used in testing).
 */
export function resetLimiterForTesting(): void {
  rateLimitStore.clear();
}
