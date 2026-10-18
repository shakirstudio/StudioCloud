import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveFirebaseConfig } from './environmentConfig';

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  auth_time: number;
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  firebase?: {
    sign_in_provider?: string;
    identities?: Record<string, any>;
  };
  [key: string]: any;
}

export interface VerifyTokenOptions {
  projectId?: string;
  clockSkewSeconds?: number;
}

export class TokenVerificationError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = 'TokenVerificationError';
    this.code = code;
    this.status = status;
  }
}

// In-memory cache for Google's public x509 certificates
let cachedCertificates: Record<string, string> | null = null;
let cacheExpiresAt = 0;
let mockJwksForTesting: Record<string, string> | null = null;

/**
 * Configure mock certificates for deterministic offline testing.
 */
export function setMockJwksForTesting(mockKeys: Record<string, string> | null) {
  mockJwksForTesting = mockKeys;
}

export function resetJwksForTesting() {
  mockJwksForTesting = null;
  cachedCertificates = null;
  cacheExpiresAt = 0;
}

/**
 * Resolves the target Firebase project ID from config or environment.
 */
export function getFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  return resolveFirebaseConfig().projectId;
}

/**
 * Fetches Google's public certificates from the official endpoint
 * with in-memory caching obeying Cache-Control max-age.
 */
export async function getGooglePublicKeys(forceRefresh = false): Promise<Record<string, string>> {
  if (mockJwksForTesting) {
    return mockJwksForTesting;
  }

  const now = Date.now();
  if (!forceRefresh && cachedCertificates && now < cacheExpiresAt) {
    return cachedCertificates;
  }

  const url = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
  const response = await fetch(url);
  if (!response.ok) {
    throw new TokenVerificationError(
      'JWKS_FETCH_FAILED',
      `Failed to fetch Google public certificates: HTTP ${response.status}`,
      502
    );
  }

  // Parse cache-control header
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 21600; // default 6 hours

  const certs = (await response.json()) as Record<string, string>;
  cachedCertificates = certs;
  cacheExpiresAt = now + maxAgeSeconds * 1000;
  return certs;
}

/**
 * Decodes a base64url string to utf-8 text.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Converts a base64url string to Buffer.
 */
function base64UrlToBuffer(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Strictly verifies a Firebase ID Token using Google's public x509 certs.
 * 
 * Enforces:
 * - JWT structure (header.payload.signature)
 * - alg === 'RS256'
 * - kid present in Google certificates (with key-rotation re-fetch)
 * - RSA-SHA256 signature verification
 * - aud === projectId
 * - iss === https://securetoken.google.com/<projectId>
 * - sub is non-empty string
 * - exp > now (with clock skew)
 * - iat <= now (with clock skew)
 * - auth_time <= now (with clock skew)
 */
export async function verifyFirebaseIdToken(
  token: string,
  options: VerifyTokenOptions = {}
): Promise<VerifiedFirebaseToken> {
  if (!token || typeof token !== 'string') {
    throw new TokenVerificationError('MALFORMED_BEARER_TOKEN', 'Bearer token is missing or not a string');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new TokenVerificationError(
      'MALFORMED_BEARER_TOKEN',
      'Firebase ID token must be a valid 3-part JWT (header.payload.signature)'
    );
  }

  const [rawHeader, rawPayload, rawSignature] = parts;

  // 1. Parse Header
  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(rawHeader));
  } catch {
    throw new TokenVerificationError('MALFORMED_BEARER_TOKEN', 'Token header is not valid JSON');
  }

  // 2. Algorithm check: MUST be RS256
  if (header.alg !== 'RS256') {
    throw new TokenVerificationError(
      'UNSUPPORTED_ALGORITHM',
      `Unsupported token algorithm '${header.alg}'. Only 'RS256' is accepted.`
    );
  }

  if (!header.kid || typeof header.kid !== 'string') {
    throw new TokenVerificationError('MISSING_KEY_ID', "Token header is missing 'kid' claim");
  }

  // 3. Parse Payload
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(base64UrlDecode(rawPayload));
  } catch {
    throw new TokenVerificationError('MALFORMED_BEARER_TOKEN', 'Token payload is not valid JSON');
  }

  const targetProjectId = options.projectId || getFirebaseProjectId();
  const clockSkew = options.clockSkewSeconds ?? 300; // 5-minute clock skew tolerance
  const nowSeconds = Math.floor(Date.now() / 1000);

  // 4. Validate Claims
  // Audience
  if (payload.aud !== targetProjectId) {
    throw new TokenVerificationError(
      'INVALID_TOKEN_AUDIENCE',
      `Token audience '${payload.aud}' does not match expected project '${targetProjectId}'`
    );
  }

  // Issuer
  const expectedIssuer = `https://securetoken.google.com/${targetProjectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new TokenVerificationError(
      'INVALID_TOKEN_ISSUER',
      `Token issuer '${payload.iss}' does not match expected '${expectedIssuer}'`
    );
  }

  // Subject (UID)
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    throw new TokenVerificationError('INVALID_TOKEN_SUBJECT', "Token subject 'sub' must be a non-empty string");
  }

  // Expiration
  if (typeof payload.exp !== 'number' || payload.exp <= (nowSeconds - clockSkew)) {
    throw new TokenVerificationError('TOKEN_EXPIRED', `Firebase ID token has expired (exp: ${payload.exp}, now: ${nowSeconds})`);
  }

  // Issued at
  if (typeof payload.iat !== 'number' || payload.iat > (nowSeconds + clockSkew)) {
    throw new TokenVerificationError('TOKEN_FUTURE_IAT', `Token issued at 'iat' is in the future (${payload.iat})`);
  }

  // Auth time
  if (typeof payload.auth_time === 'number' && payload.auth_time > (nowSeconds + clockSkew)) {
    throw new TokenVerificationError('TOKEN_FUTURE_AUTH_TIME', `Token auth_time is in the future (${payload.auth_time})`);
  }

  // 5. Retrieve Public Certificate (with rotation re-fetch if kid not present)
  let certs = await getGooglePublicKeys(false);
  let certificate = certs[header.kid];

  if (!certificate) {
    // Attempt key rotation refresh
    certs = await getGooglePublicKeys(true);
    certificate = certs[header.kid];
  }

  if (!certificate) {
    throw new TokenVerificationError(
      'UNKNOWN_SIGNING_KEY',
      `Signing key id '${header.kid}' was not found in active Google public certificates`
    );
  }

  // 6. Cryptographic RSA-SHA256 Signature Verification
  const signedData = `${rawHeader}.${rawPayload}`;
  const signatureBuffer = base64UrlToBuffer(rawSignature);

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signedData);
    const isValid = verifier.verify(certificate, signatureBuffer);

    if (!isValid) {
      throw new TokenVerificationError('INVALID_TOKEN_SIGNATURE', 'Cryptographic signature verification failed');
    }
  } catch (err: any) {
    if (err instanceof TokenVerificationError) throw err;
    throw new TokenVerificationError(
      'SIGNATURE_VERIFICATION_ERROR',
      `Signature verification error: ${err.message || 'Verification failed'}`
    );
  }

  return {
    uid: payload.sub,
    email: payload.email,
    email_verified: Boolean(payload.email_verified),
    auth_time: payload.auth_time || payload.iat,
    iss: payload.iss,
    sub: payload.sub,
    aud: payload.aud,
    exp: payload.exp,
    iat: payload.iat,
    firebase: payload.firebase,
    ...payload,
  };
}
