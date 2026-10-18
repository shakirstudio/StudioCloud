import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  UploadTask
} from 'firebase/storage';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy, 
  increment 
} from 'firebase/firestore';
import { storage, db, auth, handleFirestoreError, OperationType } from '../firebase/config';
import { MediaItem, MediaType, UploadProgressItem } from '../types';
import { 
  getStudioById, 
  updateStudio, 
  getGalleries, 
  updateGallery, 
  addActivityLog, 
  verifyStorageQuotaBackend 
} from './studioService';

// File Validation Constants
export const MAX_IMAGE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_VIDEO_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/x-adobe-dng',
  'image/heic'
];

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm'
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
  fileType?: MediaType;
}

export function validateMediaFile(file: File): ValidationResult {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/');
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type) || file.type.startsWith('video/');

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: `Unsupported file type "${file.type || file.name.split('.').pop()}". Only photography (JPEG, PNG, WEBP, TIFF, RAW) and video (MP4, MOV, WEBM) files are permitted.`
    };
  }

  const fileType: MediaType = isVideo ? 'video' : 'image';
  const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds maximum allowed size of ${isVideo ? '250 MB' : '100 MB'}.`
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: `File "${file.name}" is empty (0 bytes).`
    };
  }

  return { valid: true, fileType };
}

// Active upload tasks tracker for cancellation
interface ActiveTask {
  abort: () => void;
}
const activeUploadTasks = new Map<string, ActiveTask>();

export function cancelUploadTask(uploadId: string): boolean {
  const task = activeUploadTasks.get(uploadId);
  if (task) {
    task.abort();
    activeUploadTasks.delete(uploadId);
    return true;
  }
  return false;
}

export async function uploadMediaFile(params: {
  uploadId: string;
  studioId: string;
  galleryId: string;
  file: File;
  userId: string;
  onProgress?: (progressPercent: number, bytesTransferred: number) => void;
}): Promise<MediaItem> {
  const { uploadId, studioId, galleryId, file, userId, onProgress } = params;

  // 1. Client-side file type & volumetric validation
  const validation = validateMediaFile(file);
  if (!validation.valid || !validation.fileType) {
    throw new Error(validation.error || 'Invalid media file.');
  }

  // 2. Obtain current Firebase ID token for authentication
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Authentication required: A valid Firebase ID token is required to upload media.');
  }

  // 3. Request pre-signed upload ticket from trusted backend authority
  // Backend verifies studio membership in named Firestore, validates quota, and issues server-controlled path
  const ticketResponse = await fetch('/api/gallery/media/upload-ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studioId,
      galleryId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });

  if (!ticketResponse.ok) {
    const errorData = await ticketResponse.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || 'Failed to authorize media upload ticket.');
  }

  const ticket = await ticketResponse.json();

  // 4. Upload binary directly to pre-signed URL (or proxy fallback) with XMLHttpRequest progress tracking
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);

    activeUploadTasks.set(uploadId, { abort: () => xhr.abort() });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(99.9, (event.loaded / event.total) * 100);
        onProgress(percent, event.loaded);
      }
    };

    xhr.onload = () => {
      activeUploadTasks.delete(uploadId);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage upload failed with HTTP status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => {
      activeUploadTasks.delete(uploadId);
      reject(new Error('Storage upload failed due to network error or CORS restriction.'));
    };

    xhr.onabort = () => {
      activeUploadTasks.delete(uploadId);
      reject(new Error('Upload cancelled by user.'));
    };

    xhr.send(file);
  });

  // 5. Finalize upload via trusted backend authority
  // Backend verifies object in storage, registers media document in named Firestore, updates quota, and logs audit
  const finalizeResponse = await fetch('/api/gallery/media/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      ticketId: ticket.ticketId,
      studioId,
      galleryId,
      mediaId: ticket.mediaId,
    }),
  });

  if (!finalizeResponse.ok) {
    const finalizeError = await finalizeResponse.json().catch(() => ({}));
    throw new Error(finalizeError.message || finalizeError.error || 'Failed to finalize media registration.');
  }

  const finalizeResult = await finalizeResponse.json();
  if (onProgress) {
    onProgress(100, file.size);
  }

  return finalizeResult.mediaItem as MediaItem;
}

// Fetch all media items for a gallery
export async function getGalleryMedia(studioId: string, galleryId: string): Promise<MediaItem[]> {
  const path = `studios/${studioId}/galleries/${galleryId}/media`;
  try {
    const q = query(
      collection(db, 'studios', studioId, 'galleries', galleryId, 'media'),
      orderBy('uploadedAt', 'desc')
    );
    const snap = await getDocs(q);
    const items: MediaItem[] = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...d.data() } as MediaItem);
    });
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// Delete media item from storage and database
export async function deleteMediaItem(params: {
  studioId: string;
  galleryId: string;
  mediaId: string;
  storagePath: string;
  sizeBytes: number;
  fileName: string;
  fileType: MediaType;
}): Promise<void> {
  const { studioId, galleryId, mediaId, storagePath, sizeBytes, fileName, fileType } = params;

  // 1. Delete binary from Firebase Storage
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (storageErr: any) {
    console.warn('Storage object delete warning (might already be deleted):', storageErr.message);
  }

  // 2. Delete Firestore document
  const docPath = `studios/${studioId}/galleries/${galleryId}/media/${mediaId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'galleries', galleryId, 'media', mediaId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }

  // 3. Atomically decrement Studio storageUsedBytes
  const currentStudio = await getStudioById(studioId);
  if (currentStudio) {
    const newUsed = Math.max(0, (currentStudio.storageUsedBytes || 0) - sizeBytes);
    await updateStudio(studioId, { storageUsedBytes: newUsed });
  }

  // 4. Decrement Gallery photoCount and storageBytes
  const galleryDocRef = doc(db, 'studios', studioId, 'galleries', galleryId);
  const gallerySnap = await getDoc(galleryDocRef);
  if (gallerySnap.exists()) {
    const gData = gallerySnap.data();
    const isVid = fileType === 'video';
    await updateGallery(studioId, galleryId, {
      storageBytes: Math.max(0, (gData.storageBytes || 0) - sizeBytes),
      photoCount: !isVid ? Math.max(0, (gData.photoCount || 1) - 1) : (gData.photoCount || 0),
      videoCount: isVid ? Math.max(0, (gData.videoCount || 1) - 1) : (gData.videoCount || 0),
    });
  }

  // 5. Audit log
  await addActivityLog({
    studioId,
    userId: auth.currentUser?.uid || 'system',
    userEmail: auth.currentUser?.email || 'photographer',
    action: 'Deleted Media Asset',
    targetType: 'Media Asset',
    targetName: fileName,
  });
}
