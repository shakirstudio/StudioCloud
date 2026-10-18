import { safeCompare, isValidTenantId } from './credentialUtils';
import { VerifiedFirebaseToken } from './tokenVerifier';

export interface AuthorizeGalleryAccessParams {
  gallery: any;
  studioId: string;
  galleryId: string;
  shareToken?: string | null;
  password?: string | null;
  verifiedUser?: VerifiedFirebaseToken | null;
  isStudioMember?: boolean;
  isSuperAdmin?: boolean;
}

export interface GalleryAuthResult {
  allowed: boolean;
  status: number;
  reason?: string;
  code?: string;
  requiresPassword?: boolean;
}

export interface AuthorizeProofingWriteParams {
  existingProof?: any | null;
  incomingProof: any;
  verifiedUser: VerifiedFirebaseToken;
  studioId: string;
  galleryId: string;
}

export interface ProofingAuthResult {
  allowed: boolean;
  status: number;
  reason?: string;
  code?: string;
  sanitizedProof?: any;
}

/**
 * Enforces gallery publication, expiry, privacy, and credentials server-side.
 */
export function authorizeGalleryAccess(params: AuthorizeGalleryAccessParams): GalleryAuthResult {
  const { gallery, studioId, galleryId, shareToken, password, isStudioMember, isSuperAdmin } = params;

  if (!isValidTenantId(studioId) || !isValidTenantId(galleryId)) {
    return {
      allowed: false,
      status: 400,
      code: 'INVALID_TENANT_IDENTIFIER',
      reason: 'Invalid studio or gallery identifier format.',
    };
  }

  if (!gallery) {
    return {
      allowed: false,
      status: 404,
      code: 'GALLERY_NOT_FOUND',
      reason: 'Gallery not found. It may have been removed or moved.',
    };
  }

  // Tenant Isolation: Gallery must strictly belong to the specified studio tenant
  if (gallery.studioId && gallery.studioId !== studioId) {
    return {
      allowed: false,
      status: 403,
      code: 'TENANT_MISMATCH',
      reason: 'Tenant isolation violation: Gallery does not belong to the requested studio.',
    };
  }

  const isPrivileged = Boolean(isStudioMember || isSuperAdmin);

  // Status Invariant: Only 'published' galleries are visible to external clients
  const status = gallery.status || 'draft';
  if (status !== 'published' && !isPrivileged) {
    return {
      allowed: false,
      status: 403,
      code: 'GALLERY_NOT_PUBLISHED',
      reason: `This gallery collection is currently ${status} and is not accessible to external clients.`,
    };
  }

  // Expiration Boundary: Enforced against trusted server timestamp
  if (gallery.expiresAt) {
    const expiryTime = new Date(gallery.expiresAt).getTime();
    if (!isNaN(expiryTime) && expiryTime <= Date.now()) {
      if (!isPrivileged) {
        return {
          allowed: false,
          status: 410,
          code: 'GALLERY_EXPIRED',
          reason: 'This collection share link has expired. Please contact the studio for an extension.',
        };
      }
    }
  }

  // Privacy Access Control Gate
  const privacy = gallery.privacy || 'public';

  if (isPrivileged) {
    return { allowed: true, status: 200 };
  }

  if (privacy === 'public') {
    return { allowed: true, status: 200 };
  }

  if (privacy === 'private') {
    return {
      allowed: false,
      status: 403,
      code: 'PRIVATE_GALLERY',
      reason: 'This collection is marked private and can only be accessed by studio members.',
    };
  }

  if (privacy === 'unlisted') {
    if (!shareToken) {
      return {
        allowed: false,
        status: 403,
        code: 'MISSING_SHARE_TOKEN',
        reason: 'This collection is unlisted. A valid share link with token is required.',
      };
    }

    if (!safeCompare(shareToken, gallery.shareToken)) {
      return {
        allowed: false,
        status: 403,
        code: 'INVALID_SHARE_TOKEN',
        reason: 'Invalid or expired collection share link.',
      };
    }

    return { allowed: true, status: 200 };
  }

  if (privacy === 'password_protected') {
    if (!password) {
      return {
        allowed: false,
        status: 401,
        code: 'PASSWORD_REQUIRED',
        reason: 'This collection is password-protected. Please enter the client access password.',
        requiresPassword: true,
      };
    }

    if (!safeCompare(password, gallery.accessPassword)) {
      return {
        allowed: false,
        status: 403,
        code: 'INVALID_GALLERY_PASSWORD',
        reason: 'Incorrect collection password. Please re-enter the password provided by the studio.',
      };
    }

    return { allowed: true, status: 200 };
  }

  return {
    allowed: false,
    status: 403,
    code: 'UNKNOWN_PRIVACY_SETTING',
    reason: 'Unrecognized gallery privacy setting.',
  };
}

/**
 * Enforces client proofing write authorization, tenant invariants,
 * UID binding, and safe historical record reclaim.
 */
export function authorizeProofingWrite(params: AuthorizeProofingWriteParams): ProofingAuthResult {
  const { existingProof, incomingProof, verifiedUser, studioId, galleryId } = params;

  if (!isValidTenantId(studioId) || !isValidTenantId(galleryId)) {
    return {
      allowed: false,
      status: 400,
      code: 'INVALID_TENANT_IDENTIFIER',
      reason: 'Invalid studio or gallery identifier format.',
    };
  }

  if (!incomingProof || typeof incomingProof !== 'object') {
    return {
      allowed: false,
      status: 400,
      code: 'INVALID_PAYLOAD',
      reason: 'Proofing payload must be an object.',
    };
  }

  const mediaId = incomingProof.mediaId;
  if (!mediaId || typeof mediaId !== 'string' || !isValidTenantId(mediaId)) {
    return {
      allowed: false,
      status: 400,
      code: 'INVALID_MEDIA_ID',
      reason: 'A valid mediaId is required for client proofing.',
    };
  }

  const userUid = verifiedUser.uid;
  if (!userUid) {
    return {
      allowed: false,
      status: 401,
      code: 'UNAUTHENTICATED_CLIENT',
      reason: 'Authenticated client session is required.',
    };
  }

  // Sanitized base proof payload with forced tenant invariants
  const sanitized: Record<string, any> = {
    ...incomingProof,
    studioId,
    galleryId,
    mediaId,
    clientUid: userUid,
    updatedAt: new Date().toISOString(),
  };

  // If user has verified email in token, bind it
  if (verifiedUser.email) {
    sanitized.clientEmail = verifiedUser.email;
  }

  // Handle Existing Record Modification & Impersonation Prevention
  if (existingProof) {
    // Case 1: Record already has clientUid bound
    if (existingProof.clientUid) {
      if (existingProof.clientUid !== userUid) {
        return {
          allowed: false,
          status: 403,
          code: 'IMPERSONATION_PREVENTED',
          reason: 'Permission denied: Cannot modify proofing selections owned by another client.',
        };
      }
    } else {
      // Case 2: Historical Legacy Record (keyed by email, no clientUid)
      // Protect against unverified email takeover
      const legacyEmail = (existingProof.clientEmail || '').trim().toLowerCase();
      const clientTokenEmail = (verifiedUser.email || '').trim().toLowerCase();

      if (!legacyEmail || legacyEmail !== clientTokenEmail) {
        return {
          allowed: false,
          status: 403,
          code: 'EMAIL_MISMATCH',
          reason: 'Permission denied: You cannot claim historical records belonging to another email address.',
        };
      }

      if (!verifiedUser.email_verified) {
        return {
          allowed: false,
          status: 403,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          reason: 'Email verification is required before editing or claiming historical selections.',
        };
      }

      // Safe Reclaim Invariants
      sanitized.clientUid = userUid;
      sanitized.claimedAt = new Date().toISOString();
      sanitized.claimedByEmail = clientTokenEmail;
    }
  } else {
    // New Record: bind initial creation timestamp
    sanitized.createdAt = sanitized.createdAt || new Date().toISOString();
  }

  return {
    allowed: true,
    status: 200,
    sanitizedProof: sanitized,
  };
}
