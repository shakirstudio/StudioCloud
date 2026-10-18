import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { resolveFirebaseConfig } from './environmentConfig';

export interface GalleryDoc {
  id: string;
  studioId: string;
  title: string;
  slug?: string;
  status: 'draft' | 'published' | 'archived';
  privacy: 'public' | 'unlisted' | 'password_protected' | 'private';
  accessPassword?: string;
  shareToken?: string;
  expiresAt?: string | null;
  coverPhotoUrl?: string;
  mediaCount?: number;
  [key: string]: any;
}

export interface MediaDoc {
  id: string;
  studioId: string;
  galleryId: string;
  originalName: string;
  storageUrl: string;
  sizeBytes: number;
  mimeType: string;
  width?: number;
  height?: number;
  [key: string]: any;
}

export interface ProofDoc {
  id: string;
  studioId: string;
  galleryId: string;
  mediaId: string;
  clientUid?: string;
  clientEmail?: string;
  clientName?: string;
  isFavorite?: boolean;
  isInAlbum?: boolean;
  comments?: any[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  claimedAt?: string;
  claimedByEmail?: string;
  [key: string]: any;
}

/**
 * Typed error indicating that trusted server identity credentials
 * (Application Default Credentials or dedicated Service Account)
 * are not available on the current runtime.
 * 
 * Fails closed without falling back to unauthenticated REST calls.
 */
export class ServerCredentialsUnavailableError extends Error {
  public readonly code = 'SERVER_CREDENTIALS_UNAVAILABLE';
  public readonly status = 503;

  constructor(
    message = 'Trusted server identity credentials (Application Default Credentials or dedicated Service Account) are not configured on this backend runtime.'
  ) {
    super(message);
    this.name = 'ServerCredentialsUnavailableError';
    Object.setPrototypeOf(this, ServerCredentialsUnavailableError.prototype);
  }
}

// In-memory test repository for mock/simulation modes
const inMemoryGalleries = new Map<string, GalleryDoc>();
const inMemoryMedia = new Map<string, MediaDoc[]>();
const inMemoryProofing = new Map<string, Map<string, ProofDoc>>();

let adminAppInstance: App | null = null;
let adminDbInstance: Firestore | null = null;
let credentialsUnavailableOverride: boolean | null = null;

/**
 * Configure mock data for tests.
 */
export function setMockGalleryForTesting(studioId: string, gallery: GalleryDoc) {
  const key = `${studioId}:${gallery.id}`;
  inMemoryGalleries.set(key, gallery);
}

export function setMockMediaForTesting(studioId: string, galleryId: string, media: MediaDoc[]) {
  const key = `${studioId}:${galleryId}`;
  inMemoryMedia.set(key, media);
}

export function setMockProofingForTesting(studioId: string, galleryId: string, proof: ProofDoc) {
  const key = `${studioId}:${galleryId}`;
  if (!inMemoryProofing.has(key)) {
    inMemoryProofing.set(key, new Map());
  }
  inMemoryProofing.get(key)!.set(proof.id, proof);
}

export function resetMockDataForTesting() {
  inMemoryGalleries.clear();
  inMemoryMedia.clear();
  inMemoryProofing.clear();
}

/**
 * Explicit testing hook to simulate missing or present trusted credentials.
 */
export function setCredentialsUnavailableForTesting(unavailable: boolean | null) {
  credentialsUnavailableOverride = unavailable;
  if (unavailable) {
    adminDbInstance = null;
  }
}

/**
 * Resolves Firebase project config from local config file.
 */
function getFirebaseConfig(): { projectId: string; firestoreDatabaseId: string } {
  return resolveFirebaseConfig();
}

/**
 * Checks whether trusted server identity credentials (ADC / Service Account)
 * are configured on the current runtime.
 */
export function hasTrustedServerCredentials(): boolean {
  if (credentialsUnavailableOverride !== null) {
    return !credentialsUnavailableOverride;
  }

  // 1. Explicit service account file specified in standard Google environment variable
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        return true;
      }
    } catch {
      // Path unreadable
    }
  }

  // 2. Google Cloud managed runtimes (Cloud Run, GCE, App Engine) with automatic ADC
  if (process.env.K_SERVICE || process.env.FUNCTION_NAME || process.env.GAE_SERVICE) {
    return true;
  }

  // 3. Pre-existing initialized Admin App
  if (getApps().length > 0) {
    return true;
  }

  return false;
}

/**
 * Returns the Firebase Admin Firestore instance with server-level privileges.
 * Throws ServerCredentialsUnavailableError if credentials are not configured.
 */
export function getAdminFirestoreInstance(): Firestore {
  if (credentialsUnavailableOverride === true) {
    throw new ServerCredentialsUnavailableError();
  }

  if (adminDbInstance) {
    return adminDbInstance;
  }

  const { projectId, firestoreDatabaseId } = getFirebaseConfig();

  // Fail closed if trusted credentials are not detected on this runtime
  if (!hasTrustedServerCredentials()) {
    throw new ServerCredentialsUnavailableError(
      'Trusted server identity credentials (Application Default Credentials or dedicated Service Account) are not configured on this backend runtime.'
    );
  }

  try {
    if (getApps().length === 0) {
      adminAppInstance = initializeApp({ projectId });
    } else {
      adminAppInstance = getApps()[0];
    }

    adminDbInstance = getFirestore(adminAppInstance, firestoreDatabaseId);
    return adminDbInstance;
  } catch (err: any) {
    throw new ServerCredentialsUnavailableError(
      `Failed to initialize trusted Firebase Admin identity: ${err?.message || err}`
    );
  }
}

/**
 * Decodes Firestore REST format into a plain JavaScript object.
 */
function decodeFirestoreValue(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in v) {
    const res: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      res[k] = decodeFirestoreValue(val);
    }
    return res;
  }
  return v;
}

function decodeFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const id = doc.name ? doc.name.split('/').pop() : '';
  const data: Record<string, any> = { id };
  for (const [k, v] of Object.entries(doc.fields)) {
    data[k] = decodeFirestoreValue(v);
  }
  return data;
}

/**
 * Encodes a plain JavaScript object into Firestore REST format.
 */
function encodeFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function encodeFirestoreDoc(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== 'id' && v !== undefined) {
      fields[k] = encodeFirestoreValue(v);
    }
  }
  return { fields };
}

/**
 * Fetches gallery document.
 * 
 * Authorization strategy:
 * 1. If in-memory mock exists for testing, returns mock document.
 * 2. If idToken is provided, queries Firestore REST with caller's Authorization: Bearer token.
 * 3. If idToken is NOT provided (server acting on behalf of external client),
 *    MUST use trusted Firebase Admin SDK server identity.
 * 4. Fails closed with ServerCredentialsUnavailableError if trusted server credentials are not configured.
 *    NEVER falls back to unauthenticated ?key=${apiKey} REST calls.
 */
export async function fetchGalleryDocument(
  studioId: string,
  galleryId: string,
  idToken?: string
): Promise<GalleryDoc | null> {
  const mockKey = `${studioId}:${galleryId}`;
  if (inMemoryGalleries.has(mockKey)) {
    return inMemoryGalleries.get(mockKey)!;
  }

  // Path A: Authenticated caller with verified token
  if (idToken) {
    const { projectId, firestoreDatabaseId } = getFirebaseConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/studios/${studioId}/galleries/${galleryId}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) return null;
      const raw = await response.json();
      return decodeFirestoreDoc(raw) as GalleryDoc;
    } catch {
      return null;
    }
  }

  // Path B: Trusted server-level privileged access (ADC / Service Account)
  const adminDb = getAdminFirestoreInstance();
  try {
    const docSnap = await adminDb
      .collection('studios')
      .doc(studioId)
      .collection('galleries')
      .doc(galleryId)
      .get();

    if (!docSnap.exists) {
      return null;
    }

    return { id: docSnap.id, ...(docSnap.data() || {}) } as GalleryDoc;
  } catch (err: any) {
    if (err?.code === 5 || err?.message?.includes('NOT_FOUND')) {
      return null;
    }
    throw err;
  }
}

/**
 * Fetches gallery media items.
 * 
 * Authorization strategy:
 * 1. Checks in-memory mock for testing.
 * 2. If idToken provided, queries via REST with caller's Bearer token.
 * 3. If no idToken, uses Firebase Admin SDK.
 * 4. Fails closed if trusted server credentials are unavailable.
 *    NEVER falls back to unauthenticated ?key=${apiKey} REST calls.
 */
export async function fetchGalleryMedia(
  studioId: string,
  galleryId: string,
  idToken?: string
): Promise<MediaDoc[]> {
  const mockKey = `${studioId}:${galleryId}`;
  if (inMemoryMedia.has(mockKey)) {
    return inMemoryMedia.get(mockKey)!;
  }

  // Path A: Authenticated caller with verified token
  if (idToken) {
    const { projectId, firestoreDatabaseId } = getFirebaseConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/studios/${studioId}/galleries/${galleryId}/media`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.documents) return [];
      return data.documents.map(decodeFirestoreDoc) as MediaDoc[];
    } catch {
      return [];
    }
  }

  // Path B: Trusted server-level privileged access (ADC / Service Account)
  const adminDb = getAdminFirestoreInstance();
  try {
    const colSnap = await adminDb
      .collection('studios')
      .doc(studioId)
      .collection('galleries')
      .doc(galleryId)
      .collection('media')
      .get();

    return colSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) } as MediaDoc));
  } catch (err: any) {
    if (err?.code === 5 || err?.message?.includes('NOT_FOUND')) {
      return [];
    }
    throw err;
  }
}

/**
 * Fetches gallery proofing items.
 * 
 * Authorization strategy:
 * 1. Checks in-memory mock for testing.
 * 2. If idToken provided, queries via REST with caller's Bearer token.
 * 3. If no idToken, uses Firebase Admin SDK.
 * 4. Fails closed if trusted server credentials are unavailable.
 *    NEVER falls back to unauthenticated ?key=${apiKey} REST calls.
 */
export async function fetchGalleryProofing(
  studioId: string,
  galleryId: string,
  idToken?: string
): Promise<ProofDoc[]> {
  const mockKey = `${studioId}:${galleryId}`;
  if (inMemoryProofing.has(mockKey)) {
    return Array.from(inMemoryProofing.get(mockKey)!.values());
  }

  // Path A: Authenticated caller with verified token
  if (idToken) {
    const { projectId, firestoreDatabaseId } = getFirebaseConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/studios/${studioId}/galleries/${galleryId}/proofing`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.documents) return [];
      return data.documents.map(decodeFirestoreDoc) as ProofDoc[];
    } catch {
      return [];
    }
  }

  // Path B: Trusted server-level privileged access (ADC / Service Account)
  const adminDb = getAdminFirestoreInstance();
  try {
    const colSnap = await adminDb
      .collection('studios')
      .doc(studioId)
      .collection('galleries')
      .doc(galleryId)
      .collection('proofing')
      .get();

    return colSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) } as ProofDoc));
  } catch (err: any) {
    if (err?.code === 5 || err?.message?.includes('NOT_FOUND')) {
      return [];
    }
    throw err;
  }
}

/**
 * Saves a proofing document.
 * 
 * Authorization strategy:
 * 1. Updates in-memory mock repository.
 * 2. If idToken provided, PATCH via REST with caller's Bearer token.
 * 3. If no idToken, uses Firebase Admin SDK.
 * 4. Fails closed if trusted server credentials are unavailable.
 *    NEVER falls back to unauthenticated ?key=${apiKey} REST calls.
 */
export async function saveProofingDocument(
  studioId: string,
  galleryId: string,
  proofId: string,
  data: Record<string, any>,
  idToken?: string
): Promise<void> {
  const mockKey = `${studioId}:${galleryId}`;
  if (!inMemoryProofing.has(mockKey)) {
    inMemoryProofing.set(mockKey, new Map());
  }
  const currentMap = inMemoryProofing.get(mockKey)!;
  currentMap.set(proofId, { id: proofId, ...data } as ProofDoc);

  // Path A: Authenticated caller with verified token
  if (idToken) {
    const { projectId, firestoreDatabaseId } = getFirebaseConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/studios/${studioId}/galleries/${galleryId}/proofing/${proofId}`;
    try {
      await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(encodeFirestoreDoc(data)),
      });
      return;
    } catch {
      // In-memory record is already stored
      return;
    }
  }

  // Path B: Trusted server-level privileged write (ADC / Service Account)
  const adminDb = getAdminFirestoreInstance();
  await adminDb
    .collection('studios')
    .doc(studioId)
    .collection('galleries')
    .doc(galleryId)
    .collection('proofing')
    .doc(proofId)
    .set(data, { merge: true });
}
