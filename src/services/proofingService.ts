import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  updateDoc
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import { 
  PhotoProofItem, 
  ProofingSummary, 
  Gallery, 
  MediaItem,
  GalleryProofingSettings,
  ProofingReviewStatus
} from '../types';
import { 
  sanitizeFirestorePayload, 
  addActivityLog, 
  createNotification,
  updateGallery 
} from './studioService';

/**
 * Generates a unique, non-guessable, cryptographically secure share token for client galleries.
 */
export function generateGalleryShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  let randomStr = '';
  for (let i = 0; i < array.length; i++) {
    randomStr += chars[array[i] % chars.length];
  }
  return `sh_${Date.now().toString(36)}_${randomStr}`;
}

/**
 * Verifies if client has access to the gallery based on status, expiry, privacy, token, and password.
 */
export function verifyGalleryAccess(
  gallery: Gallery, 
  options: {
    token?: string | null;
    password?: string | null;
    isStudioMember?: boolean;
  }
): {
  allowed: boolean;
  reason?: string;
  requiresPassword?: boolean;
  isExpired?: boolean;
} {
  // Studio members and super admins always have internal clearance
  if (options.isStudioMember) {
    return { allowed: true };
  }

  // 1. Expiry check
  if (gallery.expiresAt) {
    const expiryDate = new Date(gallery.expiresAt);
    if (!isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
      return { 
        allowed: false, 
        isExpired: true, 
        reason: 'This client gallery link has expired. Please contact the studio for an updated access link.' 
      };
    }
  }

  // 2. Draft / Archived check for non-studio users
  if (gallery.status === 'draft') {
    return { 
      allowed: false, 
      reason: 'This gallery is currently in draft preparation and is not yet published.' 
    };
  }

  if (gallery.status === 'archived') {
    return { 
      allowed: false, 
      reason: 'This gallery has been archived and is no longer actively available for client viewing.' 
    };
  }

  // 3. Privacy setting validation
  if (gallery.privacy === 'private') {
    return { 
      allowed: false, 
      reason: 'This gallery is set to Private and can only be accessed by authorized studio staff.' 
    };
  }

  // 4. Unlisted link authorization (requires matching non-guessable token)
  if (gallery.privacy === 'unlisted') {
    if (!gallery.shareToken || !options.token || gallery.shareToken.trim() !== options.token.trim()) {
      return { 
        allowed: false, 
        reason: 'Access denied: An unlisted URL requires a valid, verified share token.' 
      };
    }
  }

  // 5. Password protection check
  if (gallery.privacy === 'password_protected' || (gallery.accessPassword && gallery.accessPassword.trim().length > 0)) {
    if (!options.password || options.password.trim() !== gallery.accessPassword?.trim()) {
      return { 
        allowed: false, 
        requiresPassword: true, 
        reason: 'This gallery is password-protected. Please enter the access password provided by your photographer.' 
      };
    }
  }

  return { allowed: true };
}

/**
 * Fetch all proofing items (favourites, album selections, comments) for a gallery.
 * In client context, routes securely through GET /api/gallery/client/proofing.
 */
export async function getGalleryProofing(
  studioId: string, 
  galleryId: string,
  options?: {
    shareToken?: string | null;
    password?: string | null;
    isClientView?: boolean;
  }
): Promise<PhotoProofItem[]> {
  const user = auth.currentUser;
  if (options?.isClientView) {
    if (!user) return [];
    try {
      const token = await user.getIdToken();
      const queryParams = new URLSearchParams({ studioId, galleryId });
      if (options?.shareToken) queryParams.set('shareToken', options.shareToken);
      if (options?.password) queryParams.set('password', options.password);

      const res = await fetch(`/api/gallery/client/proofing?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.proofingItems || []).map((p: any) => ({
        ...p,
        isFavourite: p.isFavourite ?? p.isFavorite ?? false,
        isApprovedForAlbum: p.isApprovedForAlbum ?? p.isInAlbum ?? false,
      }));
    } catch {
      return [];
    }
  }

  const path = `studios/${studioId}/galleries/${galleryId}/proofing`;
  try {
    const q = query(collection(db, 'studios', studioId, 'galleries', galleryId, 'proofing'));
    const snap = await getDocs(q);
    const items: PhotoProofItem[] = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...d.data() } as PhotoProofItem);
    });
    return items;
  } catch (err) {
    if (user) {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/gallery/client/proofing?studioId=${encodeURIComponent(studioId)}&galleryId=${encodeURIComponent(galleryId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          return data.proofingItems || [];
        }
      } catch {}
    }
    return [];
  }
}

/**
 * Fetch proofing records for a specific client identified by email.
 */
export async function getClientProofing(studioId: string, galleryId: string, clientEmail: string): Promise<PhotoProofItem[]> {
  const all = await getGalleryProofing(studioId, galleryId);
  const normalized = clientEmail.toLowerCase().trim();
  return all.filter(item => item.clientEmail?.toLowerCase().trim() === normalized);
}

/**
 * Persists or updates a photo proof item through the trusted backend proxy.
 * Enforces authenticated UID binding, prevents client impersonation, and protects historical records.
 */
export async function savePhotoProofItem(params: {
  studioId: string;
  galleryId: string;
  mediaId: string;
  clientEmail: string;
  clientName: string;
  isFavourite?: boolean;
  isFavorite?: boolean;
  isApprovedForAlbum?: boolean;
  isInAlbum?: boolean;
  comment?: string;
  comments?: string[];
  notes?: string;
  existingItem?: PhotoProofItem | null;
  shareToken?: string | null;
  password?: string | null;
}): Promise<PhotoProofItem> {
  if (!params.studioId || typeof params.studioId !== 'string' || !params.studioId.trim()) {
    throw new Error('Tenant validation error: studioId is required');
  }
  if (!params.galleryId || typeof params.galleryId !== 'string' || !params.galleryId.trim()) {
    throw new Error('Tenant validation error: galleryId is required');
  }
  if (!params.mediaId || typeof params.mediaId !== 'string' || !params.mediaId.trim()) {
    throw new Error('Media validation error: mediaId is required');
  }
  if (!params.clientEmail || typeof params.clientEmail !== 'string' || !params.clientEmail.trim() || !params.clientEmail.includes('@')) {
    throw new Error('Client identification error: valid client email is required');
  }

  const cleanEmail = params.clientEmail.toLowerCase().trim();
  const cleanName = params.clientName.trim() || cleanEmail.split('@')[0];

  const user = auth.currentUser;
  if (!user) {
    throw new Error('AUTHENTICATION_REQUIRED: Please sign in with your email to securely save and protect your proofing selections.');
  }

  const idToken = await user.getIdToken();
  const res = await fetch('/api/gallery/client/proofing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studioId: params.studioId,
      galleryId: params.galleryId,
      mediaId: params.mediaId,
      proofId: params.existingItem?.id,
      isFavorite: params.isFavourite ?? params.isFavorite ?? false,
      isFavourite: params.isFavourite ?? params.isFavorite ?? false,
      isInAlbum: params.isApprovedForAlbum ?? params.isInAlbum ?? false,
      isApprovedForAlbum: params.isApprovedForAlbum ?? params.isInAlbum ?? false,
      comments: params.comments || (params.comment ? [params.comment.trim()] : []),
      comment: params.comment ? params.comment.trim() : '',
      notes: params.notes || params.comment || '',
      clientName: cleanName,
      clientEmail: cleanEmail,
      shareToken: params.shareToken,
      password: params.password,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errMsg = data.message || data.error || `HTTP ${res.status} failed saving proof selection`;
    throw new Error(errMsg);
  }

  if (params.isApprovedForAlbum || (params.comment && params.comment.trim())) {
    await createNotification({
      studioId: params.studioId,
      title: params.isApprovedForAlbum ? 'Album Selection by Client' : 'Client Proofing Comment',
      message: `${cleanName} ${params.isApprovedForAlbum ? 'selected a photo for album design' : 'left feedback: "' + (params.comment || '').substring(0, 60) + '"'}.`,
      category: 'gallery',
      linkTab: 'galleries',
      relatedId: params.galleryId,
      relatedType: 'gallery',
      actorName: cleanName,
      actorEmail: cleanEmail,
    }).catch(() => null);
  }

  return {
    ...data.proof,
    id: data.proofId || data.proof?.id || `prf_${params.mediaId}_${user.uid}`,
    clientEmail: cleanEmail,
    clientName: cleanName,
    isFavourite: data.proof?.isFavorite ?? data.proof?.isFavourite ?? false,
    isApprovedForAlbum: data.proof?.isInAlbum ?? data.proof?.isApprovedForAlbum ?? false,
    comment: data.proof?.comment || (data.proof?.comments && data.proof.comments[0]) || data.proof?.notes || '',
  } as PhotoProofItem;
}

/**
 * Removes a proofing record or deletes a comment for a photo.
 */
export async function deleteProofItem(studioId: string, galleryId: string, proofId: string): Promise<void> {
  const path = `studios/${studioId}/galleries/${galleryId}/proofing/${proofId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'galleries', galleryId, 'proofing', proofId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Fallback defaults for gallery proofing settings with backward-compatibility.
 */
export function getEffectiveProofingSettings(gallery?: Gallery | null): GalleryProofingSettings {
  return {
    enabled: gallery?.proofingSettings?.enabled ?? true,
    allowFavourites: gallery?.proofingSettings?.allowFavourites ?? true,
    allowAlbumSelection: gallery?.proofingSettings?.allowAlbumSelection ?? true,
    allowComments: gallery?.proofingSettings?.allowComments ?? true,
    maxAlbumSelections: gallery?.proofingSettings?.maxAlbumSelections,
    reviewStatus: gallery?.proofingSettings?.reviewStatus || 'pending',
    instructions: gallery?.proofingSettings?.instructions || '',
    deadline: gallery?.proofingSettings?.deadline || '',
    submittedAt: gallery?.proofingSettings?.submittedAt,
    submittedByEmail: gallery?.proofingSettings?.submittedByEmail,
    submittedByName: gallery?.proofingSettings?.submittedByName,
    approvedAt: gallery?.proofingSettings?.approvedAt,
  };
}

/**
 * Updates proofing configuration for a gallery belonging to the studio.
 */
export async function updateGalleryProofingSettings(
  studioId: string,
  galleryId: string,
  settings: Partial<GalleryProofingSettings>,
  currentGallery?: Gallery | null
): Promise<GalleryProofingSettings> {
  const current = getEffectiveProofingSettings(currentGallery);
  const updatedSettings: GalleryProofingSettings = {
    ...current,
    ...settings,
  };

  const cleanSettings = sanitizeFirestorePayload(updatedSettings);

  await updateGallery(studioId, galleryId, {
    proofingSettings: cleanSettings as GalleryProofingSettings,
  });

  await addActivityLog({
    studioId,
    userId: auth.currentUser?.uid || 'system',
    userEmail: auth.currentUser?.email || 'photographer',
    action: 'Gallery Proofing Configured',
    targetType: 'Gallery',
    targetName: currentGallery?.title || galleryId,
  }).catch(() => null);

  return cleanSettings as GalleryProofingSettings;
}

/**
 * Updates the proofing review status (e.g. mark approved or in_progress).
 */
export async function updateProofingReviewStatus(
  studioId: string,
  galleryId: string,
  reviewStatus: ProofingReviewStatus,
  currentGallery?: Gallery | null
): Promise<void> {
  const current = getEffectiveProofingSettings(currentGallery);
  const now = new Date().toISOString();
  const updated: GalleryProofingSettings = {
    ...current,
    reviewStatus,
    approvedAt: reviewStatus === 'approved' ? now : current.approvedAt,
  };

  await updateGalleryProofingSettings(studioId, galleryId, updated, currentGallery);

  await addActivityLog({
    studioId,
    userId: auth.currentUser?.uid || 'system',
    userEmail: auth.currentUser?.email || 'photographer',
    action: `Proofing Status Changed: ${reviewStatus.toUpperCase()}`,
    targetType: 'Gallery',
    targetName: currentGallery?.title || galleryId,
  }).catch(() => null);
}

/**
 * Client submission of their proofing review choices.
 */
export async function submitClientProofingReview(params: {
  studioId: string;
  galleryId: string;
  clientEmail: string;
  clientName: string;
  totalAlbumSelections: number;
  totalFavourites: number;
  notes?: string;
  shareToken?: string | null;
  password?: string | null;
}): Promise<PhotoProofItem> {
  if (!params.studioId || typeof params.studioId !== 'string' || !params.studioId.trim()) {
    throw new Error('Tenant validation error: studioId is required');
  }
  if (!params.galleryId || typeof params.galleryId !== 'string' || !params.galleryId.trim()) {
    throw new Error('Tenant validation error: galleryId is required');
  }
  if (!params.clientEmail || typeof params.clientEmail !== 'string' || !params.clientEmail.trim() || !params.clientEmail.includes('@')) {
    throw new Error('Client identification error: valid client email is required');
  }

  const cleanEmail = params.clientEmail.toLowerCase().trim();
  const cleanName = params.clientName.trim() || cleanEmail.split('@')[0];
  const user = auth.currentUser;

  if (!user) {
    throw new Error('AUTHENTICATION_REQUIRED: Please sign in to submit your proofing review choices.');
  }

  const idToken = await user.getIdToken();
  const notesText = params.notes?.trim() || `Client submitted ${params.totalAlbumSelections} album selections and ${params.totalFavourites} favourites for review.`;

  const res = await fetch('/api/gallery/client/proofing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studioId: params.studioId,
      galleryId: params.galleryId,
      mediaId: 'gallery_review_submission',
      proofId: `prf_sub_${user.uid}`,
      isFavorite: false,
      isFavourite: false,
      isInAlbum: true,
      isApprovedForAlbum: true,
      isSubmissionRecord: true,
      submissionNotes: params.notes?.trim(),
      notes: notesText,
      comments: [notesText],
      clientEmail: cleanEmail,
      clientName: cleanName,
      shareToken: params.shareToken,
      password: params.password,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to submit client review');
  }

  await createNotification({
    studioId: params.studioId,
    title: 'Client Proofing Submitted',
    message: `${cleanName} submitted ${params.totalAlbumSelections} photos for album approval.`,
    category: 'gallery',
    linkTab: 'galleries',
    relatedId: params.galleryId,
    relatedType: 'gallery',
    actorName: cleanName,
    actorEmail: cleanEmail,
  }).catch(() => null);

  return {
    ...data.proof,
    id: data.proofId || `prf_sub_${user.uid}`,
    clientEmail: cleanEmail,
    clientName: cleanName,
    isFavourite: false,
    isApprovedForAlbum: true,
    isSubmissionRecord: true,
    submissionNotes: params.notes?.trim(),
  } as PhotoProofItem;
}

/**
 * Removes a client proof selection (authorized studio members).
 */
export async function removeClientProofSelection(
  studioId: string,
  galleryId: string,
  proofId: string,
  photoFileName?: string
): Promise<void> {
  await deleteProofItem(studioId, galleryId, proofId);

  await addActivityLog({
    studioId,
    userId: auth.currentUser?.uid || 'system',
    userEmail: auth.currentUser?.email || 'photographer',
    action: 'Client Selection Removed',
    targetType: 'Proofing',
    targetName: photoFileName || proofId,
  }).catch(() => null);
}

/**
 * Aggregates proofing summary metrics for studio dashboard review.
 */
export function computeProofingSummary(items: PhotoProofItem[]): ProofingSummary {
  const clientsSet = new Set<string>();
  let totalFavourites = 0;
  let totalAlbumSelections = 0;
  let totalComments = 0;
  let hasSubmission = false;

  for (const item of items) {
    if (item.isSubmissionRecord) {
      hasSubmission = true;
      continue;
    }
    if (item.clientEmail) {
      clientsSet.add(item.clientEmail.toLowerCase());
    }
    if (item.isFavourite) {
      totalFavourites++;
    }
    if (item.isApprovedForAlbum) {
      totalAlbumSelections++;
    }
    if (item.comment && item.comment.trim().length > 0) {
      totalComments++;
    }
  }

  return {
    totalFavourites,
    totalAlbumSelections,
    totalComments,
    uniqueClients: Array.from(clientsSet),
    hasSubmission,
  };
}
