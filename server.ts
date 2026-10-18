import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { verifyFirebaseIdToken, TokenVerificationError, VerifiedFirebaseToken } from './server/tokenVerifier';
import { checkRateLimit, recordFailedAttempt, recordSuccess } from './server/rateLimiter';
import { sanitizeGalleryForClient, sanitizeProofForClient, isValidTenantId } from './server/credentialUtils';
import { authorizeGalleryAccess, authorizeProofingWrite } from './server/galleryAuthorizer';
import { 
  fetchGalleryDocument, 
  fetchGalleryMedia, 
  fetchGalleryProofing, 
  saveProofingDocument,
  ServerCredentialsUnavailableError,
  hasTrustedServerCredentials
} from './server/firestoreProxy';
import {
  createUploadTicket,
  finalizeUpload,
  handleStreamingProxyUpload,
  cleanupAbandonedUploads
} from './server/storageProxy';
import { resolveFirebaseConfig } from './server/environmentConfig';

dotenv.config();

const DEFAULT_ALLOCATION_BYTES = 10000000000; // 10 GB decimal (10,000,000,000 bytes)

const app = express();
app.use(express.json());

// API: Health & Configuration
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'StudioCloud Backend',
    timestamp: new Date().toISOString(),
    defaultAllocationBytes: DEFAULT_ALLOCATION_BYTES,
    version: '1.0.0',
  });
});

// API: Firebase Storage Configuration & Validation Parameters
app.get('/api/storage/check-config', (_req: Request, res: Response) => {
  res.json({
    storageBucket: resolveFirebaseConfig().storageBucket,
    defaultQuotaBytes: DEFAULT_ALLOCATION_BYTES, // 10,000,000,000 bytes
    maxImageBytes: 100 * 1024 * 1024, // 100 MB
    maxVideoBytes: 250 * 1024 * 1024, // 250 MB
    permittedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/tiff',
      'image/x-adobe-dng',
      'image/heic',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ],
  });
});

// API: Storage Quota Enforcer
// Validates whether adding an asset/gallery would violate the studio's storage allocation
app.post('/api/quota/verify', (req: Request, res: Response) => {
  try {
    const { currentUsedBytes = 0, allocationBytes = DEFAULT_ALLOCATION_BYTES, incomingBytes = 0 } = req.body;

    const current = Number(currentUsedBytes);
    const alloc = Number(allocationBytes);
    const incoming = Number(incomingBytes);

    if (isNaN(current) || isNaN(alloc) || isNaN(incoming)) {
      return res.status(400).json({ error: 'Invalid numeric parameters provided.' });
    }

    const projected = current + incoming;
    const allowed = projected <= alloc;
    const remaining = Math.max(0, alloc - current);
    const percentage = alloc > 0 ? Math.min(100, (current / alloc) * 100) : 0;

    return res.json({
      allowed,
      currentUsedBytes: current,
      allocationBytes: alloc,
      requestedBytes: incoming,
      projectedBytes: projected,
      remainingBytes: remaining,
      percentageUsed: parseFloat(percentage.toFixed(2)),
      message: allowed 
        ? 'Storage quota available.' 
        : `Storage quota exceeded. Requires ${(incoming / 1000000).toFixed(1)} MB, but only ${(remaining / 1000000).toFixed(1)} MB is available. Upgrade studio subscription.`
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error verifying storage quota' });
  }
});

// API: Plan Catalog
app.get('/api/plans', (_req: Request, res: Response) => {
  res.json({
    plans: [
      {
        id: 'starter',
        name: 'Studio Starter',
        priceMonthly: 29,
        storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
        storageLabel: '10 GB High-Res Cloud Storage',
        maxTeamMembers: 3,
        features: [
          'Full Gallery Client Delivery',
          'Client CRM & Shoot Tracking',
          'Custom Brand Watermark',
          'Password-Protected Collections',
          'Default 10 GB Tenant Allocation'
        ]
      },
      {
        id: 'pro',
        name: 'Studio Pro',
        priceMonthly: 79,
        storageBytes: 250 * 1024 * 1024 * 1024, // 250 GB
        storageLabel: '250 GB High-Res Cloud Storage',
        maxTeamMembers: 10,
        features: [
          'Everything in Starter',
          'Custom Studio Subdomain / Vanity URL',
          'Priority RAW & 4K Ingestion Pipeline',
          'VIP Client Proofing & Favorite Selection',
          'Team Role Hierarchy & Audit Logging'
        ]
      },
      {
        id: 'studio_unlimited',
        name: 'Studio Enterprise',
        priceMonthly: 199,
        storageBytes: 2 * 1024 * 1024 * 1024 * 1024, // 2 TB
        storageLabel: '2 TB Dedicated Enterprise Storage',
        maxTeamMembers: 50,
        features: [
          'Everything in Pro',
          'Multi-Location Studio Hubs',
          'Dedicated Object Storage Bucket Isolation',
          'White-label Custom Client Emails',
          'Dedicated Account Representative'
        ]
      }
    ]
  });
});

// VALID SUBSCRIPTION STATE TRANSITIONS
const VALID_TRANSITIONS: Record<string, string[]> = {
  trial: ['active', 'suspended', 'expired', 'cancelled'],
  active: ['suspended', 'expired', 'past_due', 'cancelled'],
  past_due: ['active', 'suspended', 'expired', 'cancelled'],
  suspended: ['active', 'expired', 'cancelled'],
  expired: ['active', 'cancelled'],
  cancelled: ['active']
};

// API: Super Admin Plan Validation (Trusted Backend Validation)
app.post('/api/admin/plans/validate', (req: Request, res: Response) => {
  try {
    const { 
      name, 
      priceMonthly, 
      priceAnnual, 
      currency = 'USD', 
      storageLimitBytes, 
      galleryLimit = -1, 
      maxTeamMembers = -1,
      billingInterval = 'monthly',
      status = 'active'
    } = req.body;

    const errors: string[] = [];

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      errors.push('Plan name must be at least 2 characters long.');
    }

    if (typeof priceMonthly !== 'number' || isNaN(priceMonthly) || priceMonthly < 0) {
      errors.push('Monthly price must be a non-negative number.');
    }

    if (typeof priceAnnual !== 'number' || isNaN(priceAnnual) || priceAnnual < 0) {
      errors.push('Annual price must be a non-negative number.');
    }

    if (!currency || typeof currency !== 'string' || currency.trim().length !== 3) {
      errors.push('Currency code must be a valid 3-letter currency code (e.g. USD, EUR, INR).');
    }

    if (typeof storageLimitBytes !== 'number' || isNaN(storageLimitBytes) || storageLimitBytes < 1000000000) {
      errors.push('Storage limit must be at least 1,000,000,000 bytes (1 GB).');
    }

    if (typeof galleryLimit !== 'number' || isNaN(galleryLimit) || galleryLimit < -1) {
      errors.push('Gallery limit must be -1 (unlimited) or a non-negative integer.');
    }

    if (typeof maxTeamMembers !== 'undefined' && (typeof maxTeamMembers !== 'number' || isNaN(maxTeamMembers) || maxTeamMembers < -1)) {
      errors.push('Team member limit must be -1 (unlimited) or a non-negative integer.');
    }

    if (!['monthly', 'annual', 'both'].includes(billingInterval)) {
      errors.push("Billing interval must be 'monthly', 'annual', or 'both'.");
    }

    if (!['active', 'inactive'].includes(status)) {
      errors.push("Status must be 'active' or 'inactive'.");
    }

    if (errors.length > 0) {
      return res.status(400).json({ valid: false, errors });
    }

    return res.json({ valid: true, errors: [] });
  } catch (err: any) {
    return res.status(500).json({ valid: false, errors: [err.message || 'Validation error'] });
  }
});

// API: Super Admin Subscription Transition Validation (Trusted Backend Enforcement)
app.post('/api/admin/subscriptions/validate-transition', (req: Request, res: Response) => {
  try {
    const { fromStatus, toStatus, reason } = req.body;

    if (!fromStatus || !toStatus) {
      return res.status(400).json({ allowed: false, message: 'Both fromStatus and toStatus are required.' });
    }

    if (fromStatus === toStatus) {
      return res.json({ allowed: true, message: 'Status is unchanged.' });
    }

    const allowedTargets = VALID_TRANSITIONS[fromStatus] || [];
    if (!allowedTargets.includes(toStatus)) {
      return res.status(400).json({ 
        allowed: false, 
        message: `Invalid subscription status transition from '${fromStatus}' to '${toStatus}'. Allowed transitions: ${allowedTargets.join(', ')}` 
      });
    }

    if (['suspended', 'cancelled'].includes(toStatus) && (!reason || typeof reason !== 'string' || reason.trim().length < 5)) {
      return res.status(400).json({ 
        allowed: false, 
        message: 'An administrative note/reason of at least 5 characters is required for suspending or cancelling a subscription.' 
      });
    }

    return res.json({ allowed: true, message: 'Status transition validated and approved.' });
  } catch (err: any) {
    return res.status(500).json({ allowed: false, message: err.message || 'Validation error' });
  }
});

// API: Billing Boundary Transparency Status
app.get('/api/admin/billing-status', (_req: Request, res: Response) => {
  res.json({
    paymentGateway: 'Not Connected',
    recurringBilling: 'Not Connected',
    automaticRenewals: 'Not Active',
    invoiceGeneration: 'Disabled',
    verifiedPaymentsCount: 0,
    zeroBillingPreserved: true,
    message: 'Payment gateway integrations (Stripe/Razorpay) are intentionally not connected. Billing automation is Not Connected. All subscription records represent manual administrative assignments.'
  });
});

// API: Trusted Server Identity & Authentication Strategy Status
app.get('/api/admin/server-identity-status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    strategy: 'Firebase Admin SDK with Application Default Credentials (ADC)',
    hasCredentialsConfigured: hasTrustedServerCredentials(),
    unauthenticatedRestFallbackDisabled: true,
    failClosedEnforced: true,
    credentialRedactionActive: true,
    message: 'Dedicated backend server identity required for privileged production Firestore reads. Unauthenticated API-key REST fallback is permanently disabled.'
  });
});

// Helper: Extract and verify Bearer token from request headers
async function extractBearerToken(req: Request): Promise<{ rawToken?: string; verified?: VerifiedFirebaseToken; error?: TokenVerificationError }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {};
  }
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    return {};
  }
  try {
    const verified = await verifyFirebaseIdToken(rawToken);
    return { rawToken, verified };
  } catch (err: any) {
    return { rawToken, error: err };
  }
}

// API: Token Verification & Claims Inspection Endpoint
app.get('/api/auth/token/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'No Bearer token provided in Authorization header.',
      });
    }

    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
      return res.status(401).json({
        valid: false,
        error: 'MALFORMED_BEARER_TOKEN',
        message: 'Empty Bearer token provided.',
      });
    }

    const verified = await verifyFirebaseIdToken(rawToken);
    return res.json({
      valid: true,
      claims: {
        uid: verified.uid,
        email: verified.email || null,
        email_verified: verified.email_verified || false,
        aud: verified.aud,
        iss: verified.iss,
        exp: verified.exp,
        auth_time: verified.auth_time,
      },
    });
  } catch (err: any) {
    const status = err instanceof TokenVerificationError ? err.status : 401;
    const code = err instanceof TokenVerificationError ? err.code : 'INVALID_TOKEN';
    return res.status(status).json({
      valid: false,
      error: code,
      message: err.message || 'Token verification failed',
    });
  }
});

// API: Protected Gallery Client View (Trusted Backend Proxy)
// Enforces publication status, server-side expiry, unlisted share tokens, and password protection
// NEVER exposes accessPassword or shareToken to the client browser
app.post('/api/gallery/client/view', async (req: Request, res: Response) => {
  try {
    const { studioId, galleryId, shareToken, password, isStudioPreview } = req.body;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

    if (!isValidTenantId(studioId) || !isValidTenantId(galleryId)) {
      return res.status(400).json({ error: 'INVALID_TENANT_IDENTIFIER', message: 'Invalid studio or gallery ID.' });
    }

    // Rate Limiting check on client IP + galleryId
    const rateCheck = checkRateLimit(clientIp, galleryId);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many failed access attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
    }

    // Optional verified Firebase ID token (if caller is logged in)
    const tokenResult = await extractBearerToken(req);
    const rawToken = tokenResult.rawToken;
    const verifiedUser = tokenResult.verified || null;

    // Fetch gallery document
    const gallery = await fetchGalleryDocument(studioId, galleryId, rawToken);
    if (!gallery) {
      return res.status(404).json({ error: 'GALLERY_NOT_FOUND', message: 'Gallery not found. The collection may have been removed or moved.' });
    }

    // Server-side authorization check
    const authResult = authorizeGalleryAccess({
      gallery,
      studioId,
      galleryId,
      shareToken,
      password,
      verifiedUser,
      isStudioMember: Boolean(isStudioPreview),
      isSuperAdmin: false,
    });

    if (!authResult.allowed) {
      if (authResult.code === 'INVALID_GALLERY_PASSWORD' || authResult.code === 'INVALID_SHARE_TOKEN') {
        recordFailedAttempt(clientIp, galleryId);
      }
      return res.status(authResult.status).json({
        error: authResult.code,
        message: authResult.reason,
        requiresPassword: authResult.requiresPassword || false,
      });
    }

    // Successful authorization: clear failed attempt counter for this IP + gallery
    recordSuccess(clientIp, galleryId);

    // Fetch media items
    const mediaItems = await fetchGalleryMedia(studioId, galleryId, rawToken);

    // CRITICAL: Strip sensitive security fields before returning to client
    const safeGallery = sanitizeGalleryForClient(gallery);

    return res.json({
      gallery: safeGallery,
      mediaItems,
    });
  } catch (err: any) {
    if (err instanceof ServerCredentialsUnavailableError || err?.code === 'SERVER_CREDENTIALS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'SERVER_CREDENTIALS_UNAVAILABLE',
        message: 'Trusted server identity credentials (Application Default Credentials or dedicated Service Account) are not configured on this backend runtime. Privileged gallery access requires server credentials.',
      });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

// API: Client Photo Proofing Write Endpoint (Trusted Backend Authority)
// Enforces authenticated UID binding, prevents impersonation, and enforces safe historical email reclaim
app.post('/api/gallery/client/proofing', async (req: Request, res: Response) => {
  try {
    const tokenResult = await extractBearerToken(req);
    if (tokenResult.error) {
      return res.status(tokenResult.error.status || 401).json({
        error: tokenResult.error.code,
        message: tokenResult.error.message,
      });
    }
    if (!tokenResult.verified) {
      return res.status(401).json({
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'A valid Firebase ID token in Authorization header is required for proofing operations.',
      });
    }

    const verifiedUser = tokenResult.verified;
    const { 
      studioId, 
      galleryId, 
      mediaId, 
      proofId, 
      isFavorite, 
      isFavourite,
      isInAlbum, 
      isApprovedForAlbum,
      comments, 
      comment,
      notes, 
      submissionNotes,
      clientName,
      clientEmail,
      isSubmissionRecord,
      shareToken, 
      password 
    } = req.body;

    if (!isValidTenantId(studioId) || !isValidTenantId(galleryId) || !isValidTenantId(mediaId)) {
      return res.status(400).json({ error: 'INVALID_TENANT_IDENTIFIER', message: 'Invalid identifiers provided.' });
    }

    // Verify access to parent gallery using trusted server identity
    const gallery = await fetchGalleryDocument(studioId, galleryId);
    if (!gallery) {
      return res.status(404).json({ error: 'GALLERY_NOT_FOUND', message: 'Parent gallery not found.' });
    }

    const galleryAuth = authorizeGalleryAccess({
      gallery,
      studioId,
      galleryId,
      shareToken,
      password,
      verifiedUser,
    });

    if (!galleryAuth.allowed) {
      return res.status(galleryAuth.status).json({
        error: galleryAuth.code,
        message: galleryAuth.reason,
      });
    }

    // Target proof ID (if not provided, create deterministic prf_{mediaId}_{clientUid})
    const targetProofId = proofId || `prf_${mediaId}_${verifiedUser.uid}`;

    // Fetch existing proof if present
    const existingProofs = await fetchGalleryProofing(studioId, galleryId, tokenResult.rawToken);
    const existingProof = existingProofs.find((p) => p.id === targetProofId) || null;

    const fav = isFavorite !== undefined ? Boolean(isFavorite) : isFavourite !== undefined ? Boolean(isFavourite) : false;
    const album = isInAlbum !== undefined ? Boolean(isInAlbum) : isApprovedForAlbum !== undefined ? Boolean(isApprovedForAlbum) : false;
    const commentList = Array.isArray(comments) ? comments : (typeof comment === 'string' && comment.trim() ? [comment.trim()] : []);
    const resolvedNotes = typeof notes === 'string' ? notes.trim() : (typeof submissionNotes === 'string' ? submissionNotes.trim() : (typeof comment === 'string' ? comment.trim() : ''));

    // Enforce proofing write authorization (UID binding, safe reclaim)
    const writeAuth = authorizeProofingWrite({
      existingProof,
      incomingProof: {
        mediaId,
        isFavorite: fav,
        isFavourite: fav,
        isInAlbum: album,
        isApprovedForAlbum: album,
        comments: commentList,
        comment: typeof comment === 'string' ? comment.trim() : (commentList[0] || ''),
        notes: resolvedNotes,
        submissionNotes: typeof submissionNotes === 'string' ? submissionNotes.trim() : (isSubmissionRecord ? resolvedNotes : undefined),
        isSubmissionRecord: Boolean(isSubmissionRecord),
        clientName: clientName || verifiedUser.email?.split('@')[0] || 'Client',
        clientEmail: clientEmail || verifiedUser.email || '',
      },
      verifiedUser,
      studioId,
      galleryId,
    });

    if (!writeAuth.allowed) {
      return res.status(writeAuth.status).json({
        error: writeAuth.code,
        message: writeAuth.reason,
      });
    }

    // Save proof document via trusted server
    await saveProofingDocument(studioId, galleryId, targetProofId, writeAuth.sanitizedProof, tokenResult.rawToken);

    const safeProof = sanitizeProofForClient(writeAuth.sanitizedProof);
    safeProof.isFavourite = safeProof.isFavorite ?? safeProof.isFavourite ?? false;
    safeProof.isApprovedForAlbum = safeProof.isInAlbum ?? safeProof.isApprovedForAlbum ?? false;

    return res.json({
      success: true,
      proofId: targetProofId,
      proof: safeProof,
    });
  } catch (err: any) {
    if (err instanceof ServerCredentialsUnavailableError || err?.code === 'SERVER_CREDENTIALS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'SERVER_CREDENTIALS_UNAVAILABLE',
        message: 'Trusted server identity credentials are not configured on this backend runtime.',
      });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

// API: Client Photo Proofing Read Endpoint (Filtered to Authenticated Client)
app.get('/api/gallery/client/proofing', async (req: Request, res: Response) => {
  try {
    const tokenResult = await extractBearerToken(req);
    if (tokenResult.error) {
      return res.status(tokenResult.error.status || 401).json({
        error: tokenResult.error.code,
        message: tokenResult.error.message,
      });
    }
    if (!tokenResult.verified) {
      return res.status(401).json({
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'A valid Firebase ID token in Authorization header is required to read proofing selections.',
      });
    }

    const verifiedUser = tokenResult.verified;
    const studioId = req.query.studioId as string;
    const galleryId = req.query.galleryId as string;
    const shareToken = req.query.shareToken as string;
    const password = req.query.password as string;

    if (!isValidTenantId(studioId) || !isValidTenantId(galleryId)) {
      return res.status(400).json({ error: 'INVALID_TENANT_IDENTIFIER', message: 'Invalid studio or gallery ID.' });
    }

    // Verify parent gallery access using trusted server identity
    const gallery = await fetchGalleryDocument(studioId, galleryId);
    if (!gallery) {
      return res.status(404).json({ error: 'GALLERY_NOT_FOUND', message: 'Gallery not found.' });
    }

    const galleryAuth = authorizeGalleryAccess({
      gallery,
      studioId,
      galleryId,
      shareToken,
      password,
      verifiedUser,
    });

    if (!galleryAuth.allowed) {
      return res.status(galleryAuth.status).json({
        error: galleryAuth.code,
        message: galleryAuth.reason,
      });
    }

    const allProofs = await fetchGalleryProofing(studioId, galleryId);
    // Filter to proofs belonging strictly to the authenticated user
    const clientProofs = allProofs
      .filter((p) => {
        if (p.clientUid && p.clientUid === verifiedUser.uid) return true;
        if (
          verifiedUser.email_verified &&
          p.clientEmail &&
          verifiedUser.email &&
          p.clientEmail.toLowerCase() === verifiedUser.email.toLowerCase()
        ) {
          return true;
        }
        return false;
      })
      .map((p) => {
        const clean = sanitizeProofForClient(p);
        clean.isFavourite = clean.isFavorite ?? clean.isFavourite ?? false;
        clean.isApprovedForAlbum = clean.isInAlbum ?? clean.isApprovedForAlbum ?? false;
        return clean;
      });

        return res.json({ proofingItems: clientProofs });
    } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

// API: Download complete project source code ZIP

// API: Download complete project source code ZIP

// API: Request Pre-Signed Upload Ticket (Trusted Backend Upload Authority)
// Enforces verified studio membership, named database verification, volumetric limits, and 10 GB quota reservation
app.post('/api/gallery/media/upload-ticket', async (req: Request, res: Response) => {
  try {
    const tokenResult = await extractBearerToken(req);
    if (tokenResult.error) {
      return res.status(tokenResult.error.status || 401).json({
        error: tokenResult.error.code,
        message: tokenResult.error.message,
      });
    }
    if (!tokenResult.verified) {
      return res.status(401).json({
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'A valid Firebase ID token in Authorization header is required to request an upload ticket.',
      });
    }

    const { studioId, galleryId, fileName, mimeType, sizeBytes } = req.body;

    const ticketResult = await createUploadTicket({
      studioId,
      galleryId,
      fileName,
      mimeType,
      sizeBytes,
      verifiedUser: tokenResult.verified,
    });

    return res.json(ticketResult);
  } catch (err: any) {
    const status = err.status || (err instanceof ServerCredentialsUnavailableError ? 503 : 500);
    const code = err.code || (err instanceof ServerCredentialsUnavailableError ? 'SERVER_CREDENTIALS_UNAVAILABLE' : 'SERVER_ERROR');
    return res.status(status).json({
      error: code,
      message: err.message || 'Failed to issue upload ticket.',
    });
  }
});

// API: Finalize Storage Upload (Trusted Backend Authority)
// Verifies actual object existence and size in Storage, registers media doc in named Firestore, and commits quota
app.post('/api/gallery/media/finalize', async (req: Request, res: Response) => {
  try {
    const tokenResult = await extractBearerToken(req);
    if (tokenResult.error) {
      return res.status(tokenResult.error.status || 401).json({
        error: tokenResult.error.code,
        message: tokenResult.error.message,
      });
    }
    if (!tokenResult.verified) {
      return res.status(401).json({
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'A valid Firebase ID token in Authorization header is required to finalize an upload.',
      });
    }

    const { ticketId, studioId, galleryId, mediaId } = req.body;

    const result = await finalizeUpload({
      ticketId,
      studioId,
      galleryId,
      mediaId,
      verifiedUser: tokenResult.verified,
    });

    return res.json(result);
  } catch (err: any) {
    const status = err.status || (err instanceof ServerCredentialsUnavailableError ? 503 : 500);
    const code = err.code || (err instanceof ServerCredentialsUnavailableError ? 'SERVER_CREDENTIALS_UNAVAILABLE' : 'SERVER_ERROR');
    return res.status(status).json({
      error: code,
      message: err.message || 'Failed to finalize media upload.',
    });
  }
});

// API: Streaming Proxy Upload Fallback Endpoint
// Secured with verified Bearer token authentication, uploader UID validation, and direct streaming without memory buffering
app.put('/api/gallery/media/proxy-upload', async (req: Request, res: Response) => {
  try {
    const tokenResult = await extractBearerToken(req);
    if (tokenResult.error) {
      return res.status(tokenResult.error.status || 401).json({
        error: tokenResult.error.code,
        message: tokenResult.error.message,
      });
    }
    if (!tokenResult.verified) {
      return res.status(401).json({
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'A valid Firebase ID token in Authorization header is required for upload.',
      });
    }

    const ticketId = req.query.ticketId as string;
    const studioId = req.query.studioId as string;
    if (!ticketId) {
      return res.status(400).json({ error: 'MISSING_TICKET_ID', message: 'Missing ticketId in query.' });
    }
    if (!studioId) {
      return res.status(400).json({ error: 'MISSING_STUDIO_ID', message: 'Missing studioId in query.' });
    }

    const mimeType = (req.headers['content-type'] as string) || 'application/octet-stream';
    const contentLength = Number(req.headers['content-length'] || 0);

    const result = await handleStreamingProxyUpload(
      ticketId,
      studioId,
      tokenResult.verified,
      req,
      mimeType,
      contentLength
    );

    return res.json(result);
  } catch (err: any) {
    const status = err.status || 500;
    const code = err.code || 'SERVER_ERROR';
    return res.status(status).json({
      error: code,
      message: err.message || 'Failed to process streaming proxy upload.',
    });
  }
});

// API: Cleanup Abandoned Uploads & Expired Quota Reservations
// Identifies expired tickets, deletes orphaned blobs from Cloud Storage, and restores quota
// Strictly enforces caller authentication and studio membership (or Super Admin) authorization
app.post('/api/gallery/media/cleanup-abandoned', async (req: Request, res: Response) => {
  try {
    const tokenResult = await extractBearerToken(req);
    if (tokenResult.error) {
      return res.status(tokenResult.error.status || 401).json({
        error: tokenResult.error.code,
        message: tokenResult.error.message,
      });
    }
    if (!tokenResult.verified) {
      return res.status(401).json({
        error: 'MISSING_AUTHORIZATION_HEADER',
        message: 'A valid Firebase ID token in Authorization header is required to perform upload cleanup.',
      });
    }

    const { studioId } = req.body;
    if (!studioId || !isValidTenantId(studioId)) {
      return res.status(400).json({ error: 'INVALID_TENANT_IDENTIFIER', message: 'Valid studioId is required.' });
    }

    const result = await cleanupAbandonedUploads(studioId, tokenResult.verified);
    return res.json(result);
  } catch (err: any) {
    const status = err.status || (err instanceof ServerCredentialsUnavailableError ? 503 : 500);
    const code = err.code || (err instanceof ServerCredentialsUnavailableError ? 'SERVER_CREDENTIALS_UNAVAILABLE' : 'SERVER_ERROR');
    return res.status(status).json({
      error: code,
      message: err.message || 'Failed to run cleanup.',
    });
  }
});

// API: Download complete project source code ZIP
app.get('/api/download-zip', (_req: Request, res: Response) => {
  const candidates = [
    path.resolve(process.cwd(), 'studiocloud-app.zip'),
    path.resolve(process.cwd(), 'public', 'studiocloud-app.zip'),
    path.resolve(__dirname, 'studiocloud-app.zip'),
    path.resolve(__dirname, 'public', 'studiocloud-app.zip'),
  ];
  for (const zipPath of candidates) {
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="studiocloud-app.zip"');
      return res.sendFile(zipPath);
    }
  }
  return res.status(404).json({ error: 'ZIP_NOT_FOUND', message: 'Project zip file not found' });
});

// API: Download emulator test patch ZIP (package.json, package-lock.json, firebase.json, test-firestore-rules-emulator.ts)
app.get('/api/download-patch', (_req: Request, res: Response) => {
  const candidates = [
    path.resolve(process.cwd(), 'studiocloud-patch.zip'),
    path.resolve(process.cwd(), 'public', 'studiocloud-patch.zip'),
    path.resolve(__dirname, 'studiocloud-patch.zip'),
    path.resolve(__dirname, 'public', 'studiocloud-patch.zip'),
  ];
  for (const zipPath of candidates) {
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="studiocloud-patch.zip"');
      return res.sendFile(zipPath);
    }
  }
  return res.status(404).json({ error: 'ZIP_NOT_FOUND', message: 'Patch zip file not found' });
});

// API: Download single test-firestore-rules-emulator.ts script directly
app.get('/api/download-emulator-script', (_req: Request, res: Response) => {
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'test-firestore-rules-emulator.ts');
  if (fs.existsSync(scriptPath)) {
    res.setHeader('Content-Type', 'application/typescript');
    res.setHeader('Content-Disposition', 'attachment; filename="test-firestore-rules-emulator.ts"');
    return res.sendFile(scriptPath);
  }
  return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'Script file not found' });
});

export { app };

async function startServer() {
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`StudioCloud full-stack server running on http://localhost:${PORT}`);
  });
}

const isDirectExecution = Boolean(
  process.argv[1] && (
    process.argv[1].endsWith('server.ts') || 
    process.argv[1].endsWith('server.js')
  )
);

if (process.env.NODE_ENV !== 'test' && isDirectExecution) {
  startServer();
}

