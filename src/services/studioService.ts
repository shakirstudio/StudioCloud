import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase/config';
import { 
  Studio, 
  StudioMember, 
  Client, 
  Gallery, 
  ActivityLog, 
  QuotaCheckResult,
  StudioRole,
  UserPublic,
  ProductionTask,
  ProductionTaskStatus,
  ProductionTaskCategory,
  ProductionTaskPriority,
  ProductionTaskMetrics,
  TaskStatusHistoryItem,
  StudioBranding,
  SupportedFontFamily,
  LogoPlacement,
  GalleryCoverStyle,
  GalleryTheme,
  GalleryTemplateCategory,
  GalleryLayoutType,
  GalleryColumnsCount,
  GalleryGridSpacing,
  GalleryDesignSettings,
  StudioGalleryTemplate,
  SubscriptionPlan,
  PlanBillingInterval,
  PlanStatus,
  SubscriptionStatus,
  VALID_SUBSCRIPTION_TRANSITIONS,
  StudioSubscriptionRecord,
  SubscriptionAuditRecord
} from '../types';
import { createNotification } from './notificationService';
export * from './notificationService';

export const DEFAULT_ALLOCATION_BYTES = 10000000000; // 10 GB decimal (10,000,000,000 bytes)
export const SUPER_ADMIN_EMAIL = 'shakirtamboli.pune@gmail.com';
export const SUPER_ADMIN_EMAILS = [
  'shakirtamboli.pune@gmail.com',
  'tambolishakir66@gmail.com',
];

/**
 * Recursively cleans payloads destined for Firestore setDoc() or updateDoc().
 * Removes keys whose value is undefined, preserving null, primitives, arrays, and Date objects.
 * Nested objects and arrays are recursively inspected to prevent any unsupported undefined values.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(data: T): T {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null && !(item instanceof Date) ? sanitizeFirestorePayload(item) : item)) as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue; // omit undefined field
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = sanitizeFirestorePayload(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// PLATFORM SUPER ADMIN VERIFICATION
// Note: Security rules strictly gate /admins/{adminId}. Never grant privilege based only on frontend email.
export async function verifyServerAdminStatus(userId: string, email?: string | null): Promise<boolean> {
  const path = `admins/${userId}`;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', userId));
    if (adminSnap.exists() && adminSnap.data()?.role === 'super_admin') {
      return true;
    }

    // If user's authenticated token matches the configured admin email,
    // security rules permit initializing the admin document.
    if (email && (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() || SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase()))) {
      try {
        await setDoc(doc(db, 'admins', userId), {
          id: userId,
          email: email.toLowerCase(),
          role: 'super_admin',
          verifiedAt: new Date().toISOString(),
        });
        return true;
      } catch (writeErr) {
        console.warn('Could not bootstrap admin registry doc in Firestore:', writeErr);
        // If security rules reject write, user is not admin
        return false;
      }
    }
    return false;
  } catch (err) {
    // If Firestore rules reject read with permission-denied, user is definitely not an authorized admin
    return false;
  }
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  // Use decimal units for clean 10 GB representation
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// USER PROFILE OPERATIONS
export async function getUserProfile(userId: string): Promise<UserPublic | null> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as UserPublic;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveUserProfile(userId: string, data: {
  email: string;
  displayName: string;
  activeStudioId?: string;
  isSuperAdmin?: boolean;
}): Promise<void> {
  const path = `users/${userId}`;
  const now = new Date().toISOString();
  try {
    const existing = await getDoc(doc(db, 'users', userId));
    if (existing.exists()) {
      await updateDoc(doc(db, 'users', userId), {
        ...data,
        updatedAt: now,
      });
    } else {
      await setDoc(doc(db, 'users', userId), {
        id: userId,
        ...data,
        isSuperAdmin: false, // Security: users cannot self-escalate
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// STUDIO MEMBERSHIP VERIFICATION
export async function verifyStudioMembership(
  studioId: string, 
  userId: string
): Promise<{ verified: boolean; role: StudioRole | null; member?: StudioMember; studio?: Studio }> {
  try {
    const studio = await getStudioById(studioId);
    if (!studio) {
      return { verified: false, role: null };
    }

    // 1. Direct Owner Check
    if (studio.ownerId === userId) {
      return { verified: true, role: 'owner', studio };
    }

    // 2. Member subcollection lookup
    const memberDoc = await getDoc(doc(db, 'studios', studioId, 'members', userId));
    if (memberDoc.exists()) {
      const data = memberDoc.data() as StudioMember;
      if (data.status === 'active') {
        return { 
          verified: true, 
          role: data.role || 'lead_photographer', 
          member: { ...data, id: memberDoc.id },
          studio 
        };
      }
    }

    return { verified: false, role: null, studio };
  } catch (err) {
    console.warn(`Membership verification check for studio ${studioId} returned:`, err);
    return { verified: false, role: null };
  }
}

// STUDIO OPERATIONS
export async function getStudioById(studioId: string): Promise<Studio | null> {
  const path = `studios/${studioId}`;
  try {
    const snap = await getDoc(doc(db, 'studios', studioId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Studio;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function findStudioBySlug(slug: string): Promise<Studio | null> {
  const path = 'studios';
  try {
    const normalizedSlug = slug.toLowerCase().trim();
    const q = query(collection(db, 'studios'), where('slug', '==', normalizedSlug), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docData = snap.docs[0];
    return { id: docData.id, ...docData.data() } as Studio;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getUserStudiosWithRoles(userId: string): Promise<{ 
  studios: Studio[]; 
  roles: Record<string, StudioRole>;
}> {
  const path = 'studios';
  const studiosMap = new Map<string, Studio>();
  const rolesMap: Record<string, StudioRole> = {};

  try {
    // 1. Query studios owned by user
    const q = query(collection(db, 'studios'), where('ownerId', '==', userId));
    const snap = await getDocs(q);
    
    snap.forEach((d) => {
      const studio = { id: d.id, ...d.data() } as Studio;
      studiosMap.set(d.id, studio);
      rolesMap[d.id] = 'owner';
    });

    // 2. Check activeStudioId from user profile if joined as team member
    try {
      const userProfile = await getUserProfile(userId);
      if (userProfile?.activeStudioId && !studiosMap.has(userProfile.activeStudioId)) {
        const check = await verifyStudioMembership(userProfile.activeStudioId, userId);
        if (check.verified && check.studio) {
          studiosMap.set(check.studio.id, check.studio);
          rolesMap[check.studio.id] = check.role || 'lead_photographer';
        }
      }
    } catch {
      // Ignore if user profile lookup fails
    }

    return { studios: Array.from(studiosMap.values()), roles: rolesMap };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getUserStudios(userId: string): Promise<Studio[]> {
  const res = await getUserStudiosWithRoles(userId);
  return res.studios;
}

// In-flight studio creation deduplication set
const inFlightCreationUids = new Set<string>();

export async function createStudio(params: {
  userId: string;
  userEmail: string;
  name: string;
  slug: string;
  accentColor?: string;
}): Promise<Studio> {
  const trimmedName = params.name.trim();
  const rawSlug = params.slug.toLowerCase().trim();
  const cleanedSlug = rawSlug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');

  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('Studio brand name must be at least 2 characters long.');
  }

  if (!cleanedSlug || cleanedSlug.length < 2) {
    throw new Error('Studio vanity slug must be at least 2 characters long and contain only lowercase letters, numbers, and hyphens.');
  }

  // Prevent duplicate studio creation from repeated submissions / rapid double-clicks
  if (inFlightCreationUids.has(params.userId)) {
    throw new Error('A studio creation request is currently being processed for your account. Please wait a moment.');
  }

  inFlightCreationUids.add(params.userId);

  try {
    // Check if user already registered a studio with this slug or name
    try {
      const userStudios = await getUserStudios(params.userId);
      const duplicate = userStudios.find(s => s.slug === cleanedSlug || s.name.toLowerCase() === trimmedName.toLowerCase());
      if (duplicate) {
        throw new Error(`You already have a registered studio with this name or slug: "${duplicate.name}" (@${duplicate.slug}).`);
      }
    } catch (checkErr: any) {
      if (checkErr.message?.includes('You already have a registered studio')) {
        throw checkErr;
      }
      // If query failed (e.g., initial user state), continue safely
    }

    const studioId = `studio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newStudio: Studio = {
      id: studioId,
      name: trimmedName,
      slug: cleanedSlug,
      ownerId: params.userId,
      plan: 'starter',
      storageAllocationBytes: DEFAULT_ALLOCATION_BYTES, // 10,000,000,000 bytes (10 GB decimal)
      storageUsedBytes: 0,
      branding: {
        accentColor: params.accentColor || '#c5a059',
        watermarkText: `${trimmedName} Photography`,
        contactEmail: params.userEmail,
        website: '',
        phone: '',
        footerText: `© ${new Date().getFullYear()} ${trimmedName}. All rights reserved.`,
      },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const path = `studios/${studioId}`;
    await setDoc(doc(db, 'studios', studioId), newStudio);

    // Add owner as a verified member in subcollection using userId as document ID
    const memberDoc: StudioMember = {
      id: params.userId,
      studioId,
      userId: params.userId,
      email: params.userEmail,
      displayName: params.userEmail.split('@')[0],
      role: 'owner',
      status: 'active',
      joinedAt: now,
    };
    await setDoc(doc(db, 'studios', studioId, 'members', params.userId), memberDoc);

    // Update user profile with activeStudioId
    await saveUserProfile(params.userId, {
      email: params.userEmail,
      displayName: params.userEmail.split('@')[0],
      activeStudioId: studioId,
    });

    // Add initial activity log
    await addActivityLog({
      studioId,
      userId: params.userId,
      userEmail: params.userEmail,
      action: 'Studio Created',
      targetType: 'Studio',
      targetName: trimmedName,
    });

    return newStudio;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `studios`);
  } finally {
    inFlightCreationUids.delete(params.userId);
  }
}

export async function joinStudioAsTeamMember(params: {
  studioId: string;
  userId: string;
  userEmail: string;
  displayName: string;
  role?: StudioRole;
}): Promise<Studio> {
  const studio = await getStudioById(params.studioId);
  if (!studio) {
    throw new Error('Studio not found with the specified ID or vanity slug.');
  }

  // Security & Tenant Isolation: Validate whether user is authorized on the studio roster
  const check = await verifyStudioMembership(params.studioId, params.userId);
  if (!check.verified) {
    throw new Error(
      `No authorized team membership was found for your account in studio "${studio.name}" (@${studio.slug}). ` +
      `Under StudioCloud multi-tenant isolation, the studio owner must authorize your account in their Studio Team roster before access is granted.`
    );
  }

  const now = new Date().toISOString();
  const path = `studios/${params.studioId}/members/${params.userId}`;

  try {
    // Update user profile with activeStudioId
    await saveUserProfile(params.userId, {
      email: params.userEmail,
      displayName: params.displayName || params.userEmail.split('@')[0],
      activeStudioId: params.studioId,
    });

    await addActivityLog({
      studioId: params.studioId,
      userId: params.userId,
      userEmail: params.userEmail,
      action: 'Team Member Joined Workspace',
      targetType: 'Member',
      targetName: params.displayName || params.userEmail,
    });

    return studio;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export const DEFAULT_STUDIO_BRANDING: StudioBranding = {
  accentColor: '#c5a059',
  primaryColor: '#c5a059',
  secondaryColor: '#27272a',
  galleryBackgroundColor: '#09090b',
  galleryAccentColor: '#c5a059',
  logoUrl: '',
  logoPlacement: 'left',
  fontFamily: 'serif',
  coverStyle: 'hero_gradient',
  galleryTheme: 'dark',
  watermarkText: 'StudioCloud Photography • PROOF',
  contactEmail: '',
  website: '',
  phone: '',
  address: '',
  footerText: '© All rights reserved.',
};

export const SUPPORTED_FONTS: { id: SupportedFontFamily; name: string; category: string }[] = [
  { id: 'serif', name: 'Editorial Serif', category: 'Classic Luxury' },
  { id: 'sans', name: 'Modern Minimal Sans', category: 'Contemporary' },
  { id: 'playfair', name: 'Playfair Display', category: 'Fine Art & High Fashion' },
  { id: 'cormorant', name: 'Cormorant Garamond', category: 'Timeless Wedding & Portrait' },
  { id: 'inter', name: 'Inter Clean', category: 'Commercial & Editorial' },
  { id: 'montserrat', name: 'Montserrat Geometric', category: 'Modern Creative' },
  { id: 'cinzel', name: 'Cinzel Romanesque', category: 'Monumental & Architecture' },
];

export function isValidHexColor(hex: string): boolean {
  if (!hex) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

export function getFontFamilyStyle(fontFamily?: SupportedFontFamily): string {
  switch (fontFamily) {
    case 'playfair':
      return "'Playfair Display', Georgia, serif";
    case 'cormorant':
      return "'Cormorant Garamond', Garamond, 'Times New Roman', serif";
    case 'cinzel':
      return "'Cinzel', Georgia, 'Times New Roman', serif";
    case 'montserrat':
      return "Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'inter':
      return "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'sans':
      return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    case 'serif':
    default:
      return "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
  }
}

export async function updateStudio(studioId: string, updates: Partial<Studio>): Promise<void> {
  const path = `studios/${studioId}`;
  try {
    const docRef = doc(db, 'studios', studioId);
    const cleanPayload = sanitizeFirestorePayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(docRef, cleanPayload);
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Studio Settings Updated',
      targetType: 'Studio',
      targetName: updates.name || updates.displayName || 'Studio Settings',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// CLIENT CRM OPERATIONS
export async function getClients(studioId: string): Promise<Client[]> {
  const path = `studios/${studioId}/clients`;
  try {
    const q = query(collection(db, 'studios', studioId, 'clients'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const clients: Client[] = [];
    snap.forEach((d) => {
      clients.push({ id: d.id, ...d.data() } as Client);
    });
    return clients;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getClientById(studioId: string, clientId: string): Promise<Client | null> {
  const path = `studios/${studioId}/clients/${clientId}`;
  try {
    const snap = await getDoc(doc(db, 'studios', studioId, 'clients', clientId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Client;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createClient(studioId: string, clientData: Omit<Client, 'id' | 'studioId' | 'createdAt' | 'updatedAt'>): Promise<Client> {
  const cleanName = (clientData.fullName || '').trim();
  const cleanEmail = (clientData.email || '').trim().toLowerCase();

  // Field validation
  if (cleanName.length < 2) {
    throw new Error('Client full name must be at least 2 characters.');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Please provide a valid email address format (e.g. client@example.com).');
  }
  if (clientData.phone) {
    const phoneClean = clientData.phone.trim();
    if (phoneClean.length > 0 && phoneClean.length < 7) {
      throw new Error('Phone number must be at least 7 characters.');
    }
  }

  // Prevent accidental duplicate submissions
  const existingClients = await getClients(studioId);
  const duplicate = existingClients.find(
    c => c.email.toLowerCase() === cleanEmail && !c.isArchived && c.status !== 'archived'
  );
  if (duplicate) {
    throw new Error(`A client with email "${cleanEmail}" already exists in this studio (${duplicate.fullName}).`);
  }

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const path = `studios/${studioId}/clients/${clientId}`;

  const client: Record<string, any> = {
    ...clientData,
    fullName: cleanName,
    email: cleanEmail,
    id: clientId,
    studioId,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  const cleanClient = sanitizeFirestorePayload(client);

  try {
    await setDoc(doc(db, 'studios', studioId, 'clients', clientId), cleanClient);
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Client Created',
      targetType: 'Client',
      targetName: cleanName,
    });
    await createNotification({
      studioId,
      title: 'New Client Profile',
      message: `Client "${cleanName}" was added to studio CRM.`,
      category: 'client',
      linkTab: 'clients',
      relatedId: clientId,
      relatedType: 'client',
      actorName: auth.currentUser?.displayName || 'Studio Member',
      actorEmail: auth.currentUser?.email || undefined,
    }).catch(() => null);
    return cleanClient as Client;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateClient(studioId: string, clientId: string, updates: Partial<Client>): Promise<void> {
  const path = `studios/${studioId}/clients/${clientId}`;

  if (updates.fullName !== undefined && updates.fullName.trim().length < 2) {
    throw new Error('Client full name must be at least 2 characters.');
  }
  if (updates.email !== undefined) {
    const cleanEmail = updates.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Please provide a valid email address format.');
    }
  }

  try {
    const cleanUpdates = sanitizeFirestorePayload({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    await updateDoc(doc(db, 'studios', studioId, 'clients', clientId), cleanUpdates);
    if (updates.fullName) {
      await addActivityLog({
        studioId,
        userId: auth.currentUser?.uid || 'system',
        userEmail: auth.currentUser?.email || 'photographer',
        action: 'Client Updated',
        targetType: 'Client',
        targetName: updates.fullName,
      });
      await createNotification({
        studioId,
        title: 'Client Profile Updated',
        message: `Client "${updates.fullName}" contact details were updated.`,
        category: 'client',
        linkTab: 'clients',
        relatedId: clientId,
        relatedType: 'client',
        actorName: auth.currentUser?.displayName || 'Studio Member',
        actorEmail: auth.currentUser?.email || undefined,
      }).catch(() => null);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function archiveClient(studioId: string, clientId: string, clientName: string, isArchived: boolean = true): Promise<void> {
  const path = `studios/${studioId}/clients/${clientId}`;
  try {
    const updates: Partial<Client> = {
      isArchived,
      status: isArchived ? 'archived' : 'active',
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(doc(db, 'studios', studioId, 'clients', clientId), updates);
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: isArchived ? 'Client Archived' : 'Client Restored',
      targetType: 'Client',
      targetName: clientName,
    });
    await createNotification({
      studioId,
      title: isArchived ? 'Client Archived' : 'Client Restored',
      message: `Client "${clientName}" was ${isArchived ? 'archived' : 'restored'}.`,
      category: 'client',
      linkTab: 'clients',
      relatedId: clientId,
      relatedType: 'client',
    }).catch(() => null);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteClient(studioId: string, clientId: string, clientName: string): Promise<void> {
  const path = `studios/${studioId}/clients/${clientId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'clients', clientId));
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Client Deleted',
      targetType: 'Client',
      targetName: clientName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function linkGalleryToClient(
  studioId: string,
  galleryId: string,
  clientId: string,
  clientName: string
): Promise<void> {
  const path = `studios/${studioId}/galleries/${galleryId}`;
  try {
    await updateDoc(doc(db, 'studios', studioId, 'galleries', galleryId), {
      clientId,
      clientName,
      updatedAt: new Date().toISOString(),
    });
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Gallery Linked to Client',
      targetType: 'Gallery',
      targetName: `Client: ${clientName}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function unlinkGalleryFromClient(
  studioId: string,
  galleryId: string,
  galleryTitle: string
): Promise<void> {
  const path = `studios/${studioId}/galleries/${galleryId}`;
  try {
    const { deleteField } = await import('firebase/firestore');
    await updateDoc(doc(db, 'studios', studioId, 'galleries', galleryId), {
      clientId: deleteField(),
      clientName: deleteField(),
      updatedAt: new Date().toISOString(),
    });
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Gallery Unlinked from Client',
      targetType: 'Gallery',
      targetName: galleryTitle,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// GALLERY OPERATIONS
export async function getGalleries(studioId: string): Promise<Gallery[]> {
  const path = `studios/${studioId}/galleries`;
  try {
    const q = query(collection(db, 'studios', studioId, 'galleries'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const galleries: Gallery[] = [];
    snap.forEach((d) => {
      galleries.push({ id: d.id, ...d.data() } as Gallery);
    });
    return galleries;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createGallery(
  studioId: string, 
  galleryData: Omit<Gallery, 'id' | 'studioId' | 'createdAt' | 'updatedAt'>
): Promise<Gallery> {
  if (!studioId || typeof studioId !== 'string' || !studioId.trim()) {
    throw new Error('Valid studio identifier is required to create a gallery.');
  }

  const trimmedTitle = galleryData.title?.trim();
  if (!trimmedTitle || trimmedTitle.length < 2) {
    throw new Error('Collection title is required (minimum 2 characters).');
  }

  const galleryId = `gal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const path = `studios/${studioId}/galleries/${galleryId}`;

  // Initialize required fields with validated values
  const galleryRecord: Record<string, any> = {
    id: galleryId,
    studioId: studioId.trim(),
    title: trimmedTitle,
    status: galleryData.status || 'published',
    privacy: galleryData.privacy || 'password_protected',
    downloadAccess: typeof galleryData.downloadAccess === 'boolean' ? galleryData.downloadAccess : true,
    photoCount: typeof galleryData.photoCount === 'number' ? galleryData.photoCount : 0,
    videoCount: typeof galleryData.videoCount === 'number' ? galleryData.videoCount : 0,
    storageBytes: typeof galleryData.storageBytes === 'number' ? galleryData.storageBytes : 0,
    createdAt: now,
    updatedAt: now,
  };

  // Optional fields: only include if provided and valid non-empty string; omit otherwise
  if (galleryData.description && typeof galleryData.description === 'string' && galleryData.description.trim()) {
    galleryRecord.description = galleryData.description.trim();
  }
  if (galleryData.eventType && typeof galleryData.eventType === 'string' && galleryData.eventType.trim()) {
    galleryRecord.eventType = galleryData.eventType.trim();
  }
  if (galleryData.clientId && typeof galleryData.clientId === 'string' && galleryData.clientId.trim()) {
    galleryRecord.clientId = galleryData.clientId.trim();
  }
  if (galleryData.clientName && typeof galleryData.clientName === 'string' && galleryData.clientName.trim()) {
    galleryRecord.clientName = galleryData.clientName.trim();
  }
  if (galleryData.shootDate && typeof galleryData.shootDate === 'string' && galleryData.shootDate.trim()) {
    galleryRecord.shootDate = galleryData.shootDate.trim();
  }
  if (galleryData.coverImageUrl && typeof galleryData.coverImageUrl === 'string' && galleryData.coverImageUrl.trim()) {
    galleryRecord.coverImageUrl = galleryData.coverImageUrl.trim();
  }
  if (galleryData.expiresAt && typeof galleryData.expiresAt === 'string' && galleryData.expiresAt.trim()) {
    galleryRecord.expiresAt = galleryData.expiresAt.trim();
  }
  if (galleryData.templateId && typeof galleryData.templateId === 'string' && galleryData.templateId.trim()) {
    galleryRecord.templateId = galleryData.templateId.trim();
  }
  if (galleryData.templateType && typeof galleryData.templateType === 'string' && galleryData.templateType.trim()) {
    galleryRecord.templateType = galleryData.templateType.trim();
  }
  if (galleryData.designSettings && typeof galleryData.designSettings === 'object') {
    galleryRecord.designSettings = sanitizeFirestorePayload(galleryData.designSettings);
  }

  // Double check recursively to ensure zero undefined fields reach Firestore setDoc()
  const cleanPayload = sanitizeFirestorePayload(galleryRecord);

  try {
    await setDoc(doc(db, 'studios', studioId, 'galleries', galleryId), cleanPayload);

    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Gallery Created',
      targetType: 'Gallery',
      targetName: galleryRecord.title,
    });

    await createNotification({
      studioId,
      title: 'New Gallery Created',
      message: `Collection "${galleryRecord.title}" was created by ${auth.currentUser?.email || 'photographer'}.`,
      category: 'gallery',
      linkTab: 'galleries',
      relatedId: galleryId,
      relatedType: 'gallery',
      actorName: auth.currentUser?.displayName || 'Photographer',
      actorEmail: auth.currentUser?.email || undefined,
    }).catch(() => null);

    return cleanPayload as Gallery;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateGallery(studioId: string, galleryId: string, updates: Partial<Gallery>): Promise<void> {
  if (!studioId || !galleryId) {
    throw new Error('Studio ID and Gallery ID are required to update a gallery.');
  }
  const path = `studios/${studioId}/galleries/${galleryId}`;
  
  const updatePayload: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      if (typeof val === 'string') {
        updatePayload[key] = val.trim();
      } else {
        updatePayload[key] = val;
      }
    }
  }

  const cleanUpdates = sanitizeFirestorePayload(updatePayload);

  try {
    await updateDoc(doc(db, 'studios', studioId, 'galleries', galleryId), cleanUpdates);
    if (updates.title || updates.status || updates.privacy) {
      await createNotification({
        studioId,
        title: 'Gallery Updated',
        message: `Collection "${updates.title || galleryId}" was updated.`,
        category: 'gallery',
        linkTab: 'galleries',
        relatedId: galleryId,
        relatedType: 'gallery',
        actorName: auth.currentUser?.displayName || 'Studio Member',
        actorEmail: auth.currentUser?.email || undefined,
      }).catch(() => null);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteGallery(studioId: string, galleryId: string, galleryTitle: string, storageBytes: number): Promise<void> {
  const path = `studios/${studioId}/galleries/${galleryId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'galleries', galleryId));

    // Deduct storage
    const currentStudio = await getStudioById(studioId);
    if (currentStudio) {
      const newUsed = Math.max(0, (currentStudio.storageUsedBytes || 0) - storageBytes);
      await updateStudio(studioId, { storageUsedBytes: newUsed });
    }

    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Gallery Removed',
      targetType: 'Gallery',
      targetName: galleryTitle,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// ADVANCED GALLERY TEMPLATES & DESIGN SYSTEM
// ==========================================

export const BUILT_IN_GALLERY_TEMPLATES: StudioGalleryTemplate[] = [
  {
    id: 'template_wedding',
    studioId: 'system',
    name: 'Fine Art Wedding & Heirloom',
    description: 'Grand romantic style featuring luxury serif typography, cinematic full-bleed cover header, spacious masonry layout, and champagne gold accents.',
    category: 'wedding',
    layout: 'masonry',
    columns: 3,
    spacing: 'spacious',
    coverStyle: 'full',
    fontFamily: 'cormorant',
    accentColor: '#c5a059',
    galleryTheme: 'dark',
    logoPlacement: 'center',
    isStudioDefault: true,
    sampleCoverUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'template_pre_wedding',
    studioId: 'system',
    name: 'Golden Hour Pre-Wedding Story',
    description: 'Dynamic editorial couple storytelling featuring split cover layout, warm Tuscan terracotta tones, Playfair typography, and balanced grid harmony.',
    category: 'pre_wedding',
    layout: 'grid',
    columns: 3,
    spacing: 'normal',
    coverStyle: 'split',
    fontFamily: 'playfair',
    accentColor: '#a65b45',
    galleryTheme: 'dark',
    logoPlacement: 'left',
    sampleCoverUrl: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'template_portrait',
    studioId: 'system',
    name: 'Vogue Editorial Portraiture',
    description: 'Ultra-minimal high-fashion aesthetics with monumental Cinzel typography, large-image magazine spreads, crisp monochrome palettes, and subtle hero headers.',
    category: 'portrait',
    layout: 'large_image',
    columns: 2,
    spacing: 'compact',
    coverStyle: 'minimal',
    fontFamily: 'cinzel',
    accentColor: '#ffffff',
    galleryTheme: 'dark',
    logoPlacement: 'center',
    sampleCoverUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'template_events',
    studioId: 'system',
    name: 'Private Gala & High-Capacity Event',
    description: 'High-density 4-column event gallery engineered for swift client proofing, vibrant Royal Indigo accents, modern Montserrat typography, and gradient hero headers.',
    category: 'events',
    layout: 'grid',
    columns: 4,
    spacing: 'compact',
    coverStyle: 'hero_gradient',
    fontFamily: 'montserrat',
    accentColor: '#31425f',
    galleryTheme: 'dark',
    logoPlacement: 'left',
    sampleCoverUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'template_portfolio',
    studioId: 'system',
    name: 'Architectural & Fine Art Portfolio',
    description: 'Gallery exhibition presentation with generous linen whitespace, calm Nordic Sage accents, clean Inter typography, and organic masonry flow.',
    category: 'portfolio',
    layout: 'masonry',
    columns: 3,
    spacing: 'spacious',
    coverStyle: 'split',
    fontFamily: 'inter',
    accentColor: '#52796f',
    galleryTheme: 'light',
    logoPlacement: 'left',
    sampleCoverUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export function getBuiltInGalleryTemplates(): StudioGalleryTemplate[] {
  return [...BUILT_IN_GALLERY_TEMPLATES];
}

export async function getStudioTemplates(studioId: string): Promise<StudioGalleryTemplate[]> {
  if (!studioId) return [];
  const path = `studios/${studioId}/templates`;
  try {
    const snap = await getDocs(collection(db, 'studios', studioId, 'templates'));
    const templates: StudioGalleryTemplate[] = [];
    snap.forEach((d) => {
      templates.push({ id: d.id, ...d.data() } as StudioGalleryTemplate);
    });
    return templates;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveStudioTemplate(
  studioId: string, 
  templateData: Partial<StudioGalleryTemplate> & { name: string; category: GalleryTemplateCategory }
): Promise<StudioGalleryTemplate> {
  if (!studioId) {
    throw new Error('Valid studio identifier is required to save a template.');
  }
  const trimmedName = templateData.name?.trim();
  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('Template name must be at least 2 characters.');
  }

  const templateId = templateData.id?.trim() || `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const path = `studios/${studioId}/templates/${templateId}`;

  const templateRecord: StudioGalleryTemplate = {
    id: templateId,
    studioId,
    name: trimmedName,
    description: templateData.description?.trim() || 'Custom studio gallery presentation preset.',
    category: templateData.category || 'wedding',
    layout: templateData.layout || 'grid',
    columns: templateData.columns || 3,
    spacing: templateData.spacing || 'normal',
    coverStyle: templateData.coverStyle || 'full',
    fontFamily: templateData.fontFamily || 'serif',
    accentColor: templateData.accentColor || '#c5a059',
    galleryTheme: templateData.galleryTheme || 'dark',
    logoPlacement: templateData.logoPlacement || 'left',
    isStudioDefault: Boolean(templateData.isStudioDefault),
    sampleCoverUrl: templateData.sampleCoverUrl || undefined,
    createdAt: templateData.createdAt || now,
    updatedAt: now,
  };

  const cleanPayload = sanitizeFirestorePayload(templateRecord);

  try {
    await setDoc(doc(db, 'studios', studioId, 'templates', templateId), cleanPayload);

    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: templateData.id ? 'Gallery Template Updated' : 'Gallery Template Created',
      targetType: 'Template',
      targetName: trimmedName,
    });

    return cleanPayload as StudioGalleryTemplate;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteStudioTemplate(
  studioId: string, 
  templateId: string, 
  templateName?: string
): Promise<void> {
  if (!studioId || !templateId) {
    throw new Error('Studio ID and Template ID are required to delete a template.');
  }
  const path = `studios/${studioId}/templates/${templateId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'templates', templateId));

    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Gallery Template Deleted',
      targetType: 'Template',
      targetName: templateName || templateId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function resolveGalleryDesign(
  gallery?: Gallery | null, 
  studio?: Studio | null,
  customTemplates: StudioGalleryTemplate[] = []
): GalleryDesignSettings {
  const allTemplates = [...customTemplates, ...BUILT_IN_GALLERY_TEMPLATES];
  const targetTemplateId = gallery?.designSettings?.templateId || gallery?.templateId || studio?.branding?.defaultTemplateId || 'template_wedding';
  const matchedTemplate = allTemplates.find(t => t.id === targetTemplateId) || BUILT_IN_GALLERY_TEMPLATES[0];

  return {
    templateId: matchedTemplate.id,
    templateType: gallery?.designSettings?.templateType || gallery?.templateType || matchedTemplate.category,
    layout: gallery?.designSettings?.layout || studio?.branding?.defaultLayout || matchedTemplate.layout || 'grid',
    columns: gallery?.designSettings?.columns || matchedTemplate.columns || 3,
    spacing: gallery?.designSettings?.spacing || matchedTemplate.spacing || 'normal',
    accentColor: gallery?.designSettings?.accentColor || studio?.branding?.accentColor || matchedTemplate.accentColor || '#c5a059',
    fontFamily: gallery?.designSettings?.fontFamily || studio?.branding?.fontFamily || matchedTemplate.fontFamily || 'serif',
    coverStyle: gallery?.designSettings?.coverStyle || studio?.branding?.coverStyle || matchedTemplate.coverStyle || 'full',
    galleryTheme: gallery?.designSettings?.galleryTheme || studio?.branding?.galleryTheme || matchedTemplate.galleryTheme || 'dark',
    logoPlacement: gallery?.designSettings?.logoPlacement || studio?.branding?.logoPlacement || matchedTemplate.logoPlacement || 'left',
    showWatermark: gallery?.designSettings?.showWatermark ?? Boolean(studio?.branding?.watermarkText),
    watermarkText: gallery?.designSettings?.watermarkText || studio?.branding?.watermarkText,
    customCoverUrl: gallery?.designSettings?.customCoverUrl || gallery?.coverImageUrl,
    storyExcerpt: gallery?.designSettings?.storyExcerpt,
    highlightBadges: gallery?.designSettings?.highlightBadges ?? true,
  };
}

export async function updateGalleryDesignSettings(
  studioId: string, 
  galleryId: string, 
  designSettings: GalleryDesignSettings
): Promise<void> {
  const cleanSettings = sanitizeFirestorePayload(designSettings);
  await updateGallery(studioId, galleryId, {
    designSettings: cleanSettings,
    templateId: designSettings.templateId,
    templateType: designSettings.templateType,
  });

  await addActivityLog({
    studioId,
    userId: auth.currentUser?.uid || 'system',
    userEmail: auth.currentUser?.email || 'photographer',
    action: 'Gallery Design Template Applied',
    targetType: 'Gallery',
    targetName: galleryId,
  }).catch(() => null);
}

// TEAM MEMBERS OPERATIONS
export async function getTeamMembers(studioId: string): Promise<StudioMember[]> {
  const path = `studios/${studioId}/members`;
  try {
    const snap = await getDocs(collection(db, 'studios', studioId, 'members'));
    const members: StudioMember[] = [];
    snap.forEach((d) => {
      members.push({ id: d.id, ...d.data() } as StudioMember);
    });
    return members;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function inviteTeamMember(params: {
  studioId: string;
  email: string;
  displayName: string;
  role: StudioRole;
  memberUid?: string;
}): Promise<StudioMember> {
  const memberId = params.memberUid?.trim() || `member_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const path = `studios/${params.studioId}/members/${memberId}`;

  const member: StudioMember = {
    id: memberId,
    studioId: params.studioId,
    userId: params.memberUid?.trim() || memberId,
    email: params.email.trim().toLowerCase(),
    displayName: params.displayName.trim(),
    role: params.role,
    status: 'active',
    joinedAt: now,
  };

  try {
    await setDoc(doc(db, 'studios', params.studioId, 'members', memberId), member);
    await addActivityLog({
      studioId: params.studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'owner',
      action: 'Team Member Authorized',
      targetType: 'Team',
      targetName: `${params.displayName} (${params.role})`,
    });
    return member;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function removeTeamMember(studioId: string, memberId: string, memberName: string): Promise<void> {
  const path = `studios/${studioId}/members/${memberId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'members', memberId));
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'owner',
      action: 'Team Member Removed',
      targetType: 'Team',
      targetName: memberName,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ACTIVITY AUDIT LOGS
export async function getActivityLogs(studioId: string, count = 20): Promise<ActivityLog[]> {
  const path = `studios/${studioId}/activityLogs`;
  try {
    const q = query(
      collection(db, 'studios', studioId, 'activityLogs'), 
      orderBy('createdAt', 'desc'), 
      limit(count)
    );
    const snap = await getDocs(q);
    const logs: ActivityLog[] = [];
    snap.forEach((d) => {
      logs.push({ id: d.id, ...d.data() } as ActivityLog);
    });
    return logs;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function addActivityLog(params: {
  studioId: string;
  userId: string;
  userEmail: string;
  action: string;
  targetType: string;
  targetName: string;
}): Promise<void> {
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `studios/${params.studioId}/activityLogs/${logId}`;
  try {
    const log: ActivityLog = {
      id: logId,
      studioId: params.studioId,
      userId: params.userId,
      userEmail: params.userEmail,
      action: params.action,
      targetType: params.targetType,
      targetName: params.targetName,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'studios', params.studioId, 'activityLogs', logId), log);
  } catch (err) {
    console.warn('Audit log write error:', err);
  }
}

// SUPER ADMIN PLATFORM AUDIT
export async function getSuperAdminStudios(): Promise<Studio[]> {
  const path = 'studios';
  try {
    const snap = await getDocs(collection(db, 'studios'));
    const list: Studio[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as Studio);
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// SERVER BACKEND STORAGE QUOTA CHECK
export async function verifyStorageQuotaBackend(
  currentUsedBytes: number,
  allocationBytes: number,
  incomingBytes: number
): Promise<QuotaCheckResult> {
  try {
    const res = await fetch('/api/quota/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUsedBytes, allocationBytes, incomingBytes }),
    });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    return await res.json();
  } catch (error: any) {
    const projected = currentUsedBytes + incomingBytes;
    const allowed = projected <= allocationBytes;
    return {
      allowed,
      currentUsedBytes,
      allocationBytes,
      requestedBytes: incomingBytes,
      projectedBytes: projected,
      remainingBytes: Math.max(0, allocationBytes - currentUsedBytes),
      percentageUsed: parseFloat(((currentUsedBytes / allocationBytes) * 100).toFixed(2)),
      message: allowed ? 'Storage available.' : 'Storage quota exceeded (10 GB default allocation limit).',
    };
  }
}

// ==========================================
// PRODUCTION TASK BOARD SERVICE
// ==========================================

export const PRODUCTION_TASK_CATEGORIES: { value: ProductionTaskCategory; label: string; description: string }[] = [
  { value: 'selection', label: 'Photo Selection / Shortlisting', description: 'Curating, flagging, and selecting culls for client review or editing' },
  { value: 'editing', label: 'Photo Editing & Retouching', description: 'Color grading, exposure correction, and advanced skin/background retouching' },
  { value: 'album_design', label: 'Album Design', description: 'Layout design, spread composition, and proofing for physical albums' },
  { value: 'client_revisions', label: 'Client Revisions', description: 'Addressing client-requested tweaks, crop adjustments, and proofing feedback' },
  { value: 'final_export', label: 'Final Export & Quality Check', description: 'Hi-res export, sharpness audit, metadata tagging, and color space check' },
  { value: 'delivery', label: 'Gallery Preparation & Delivery', description: 'Uploading to gallery, setting access permissions, and sending delivery link' },
  { value: 'other', label: 'Other Studio Task', description: 'Administrative, equipment preparation, print lab, or studio logistics' },
];

export async function getTasks(studioId: string): Promise<ProductionTask[]> {
  const path = `studios/${studioId}/tasks`;
  try {
    const tasksRef = collection(db, 'studios', studioId, 'tasks');
    const snap = await getDocs(tasksRef);
    const list: ProductionTask[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        ...data,
      } as ProductionTask);
    });

    // Sort by due date ascending, then created date descending
    return list.sort((a, b) => {
      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      if (dueA !== dueB) return dueA - dueB;
      const createA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createB - createA;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getTask(studioId: string, taskId: string): Promise<ProductionTask | null> {
  const path = `studios/${studioId}/tasks/${taskId}`;
  try {
    const snap = await getDoc(doc(db, 'studios', studioId, 'tasks', taskId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...snap.data(),
    } as ProductionTask;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createTask(
  studioId: string,
  taskData: Omit<ProductionTask, 'id' | 'studioId' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<ProductionTask> {
  const path = `studios/${studioId}/tasks`;

  // Validate required fields
  const cleanTitle = (taskData.title || '').trim();
  if (cleanTitle.length < 2) {
    throw new Error('Task title must be at least 2 characters.');
  }

  if (!taskData.dueDate) {
    throw new Error('Task due date is required.');
  }

  // Validate date logic
  if (taskData.startDate && taskData.dueDate) {
    const start = new Date(taskData.startDate).getTime();
    const due = new Date(taskData.dueDate).getTime();
    if (start > due) {
      throw new Error('Start date cannot be after the due date.');
    }
  }

  // Prevent duplicate submissions: check if active task with exact same title exists
  const existingTasks = await getTasks(studioId);
  const duplicate = existingTasks.find(
    (t) =>
      !t.isArchived &&
      t.status !== 'completed' &&
      t.title.trim().toLowerCase() === cleanTitle.toLowerCase() &&
      t.dueDate === taskData.dueDate
  );
  if (duplicate) {
    throw new Error(`An active task with title "${cleanTitle}" and the same due date already exists.`);
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const creatorUid = auth.currentUser?.uid || 'system';
  const creatorName = auth.currentUser?.displayName || auth.currentUser?.email || 'Studio Member';

  const initialHistory: TaskStatusHistoryItem = {
    status: taskData.status || 'pending',
    changedAt: now,
    changedBy: creatorName,
    note: 'Task initialized',
  };

  const newTask: ProductionTask = {
    ...taskData,
    id: taskId,
    studioId,
    title: cleanTitle,
    category: taskData.category || 'selection',
    priority: taskData.priority || 'medium',
    status: taskData.status || 'pending',
    statusHistory: taskData.statusHistory && taskData.statusHistory.length > 0 
      ? taskData.statusHistory 
      : [initialHistory],
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    createdBy: creatorUid,
    createdByName: creatorName,
  };

  const cleanPayload = sanitizeFirestorePayload(newTask);

  try {
    await setDoc(doc(db, 'studios', studioId, 'tasks', taskId), cleanPayload);
    await addActivityLog({
      studioId,
      userId: creatorUid,
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Task Created',
      targetType: 'Task',
      targetName: cleanTitle,
    });
    await createNotification({
      studioId,
      title: 'Production Task Created',
      message: `Task "${cleanTitle}" was added to production board (Priority: ${newTask.priority}).`,
      category: 'task',
      linkTab: 'tasks',
      relatedId: taskId,
      relatedType: 'task',
      actorName: creatorName,
      actorEmail: auth.currentUser?.email || undefined,
    }).catch(() => null);
    return cleanPayload as ProductionTask;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${path}/${taskId}`);
  }
}

export async function updateTask(
  studioId: string,
  taskId: string,
  updates: Partial<ProductionTask>,
  statusChangeNote?: string
): Promise<void> {
  const path = `studios/${studioId}/tasks/${taskId}`;

  // Validate dates if modified
  if (updates.startDate && updates.dueDate) {
    const start = new Date(updates.startDate).getTime();
    const due = new Date(updates.dueDate).getTime();
    if (start > due) {
      throw new Error('Start date cannot be after the due date.');
    }
  }

  if (updates.title !== undefined && updates.title.trim().length < 2) {
    throw new Error('Task title must be at least 2 characters.');
  }

  try {
    const currentDoc = await getDoc(doc(db, 'studios', studioId, 'tasks', taskId));
    const currentData = currentDoc.exists() ? (currentDoc.data() as ProductionTask) : null;

    let updatedHistory = currentData?.statusHistory || [];
    const now = new Date().toISOString();
    const actorName = auth.currentUser?.displayName || auth.currentUser?.email || 'Studio Member';

    // If status changed, record transition in statusHistory
    if (updates.status && currentData && updates.status !== currentData.status) {
      const historyItem: TaskStatusHistoryItem = {
        status: updates.status,
        changedAt: now,
        changedBy: actorName,
        note: statusChangeNote || `Moved from ${currentData.status.replace('_', ' ')} to ${updates.status.replace('_', ' ')}`,
      };
      updatedHistory = [...updatedHistory, historyItem];
    }

    const cleanPayload = sanitizeFirestorePayload({
      ...updates,
      ...(updates.status && { statusHistory: updatedHistory }),
      updatedAt: now,
    });

    await updateDoc(doc(db, 'studios', studioId, 'tasks', taskId), cleanPayload);

    if (updates.title || updates.status) {
      await addActivityLog({
        studioId,
        userId: auth.currentUser?.uid || 'system',
        userEmail: auth.currentUser?.email || 'photographer',
        action: updates.status ? `Task Status: ${updates.status}` : 'Task Updated',
        targetType: 'Task',
        targetName: updates.title || currentData?.title || 'Production Task',
      });
      await createNotification({
        studioId,
        title: updates.status ? `Task Status: ${updates.status.replace('_', ' ')}` : 'Task Updated',
        message: `Task "${updates.title || currentData?.title || 'Production Task'}" updated${updates.status ? ` to ${updates.status.replace('_', ' ')}` : ''}.`,
        category: 'task',
        linkTab: 'tasks',
        relatedId: taskId,
        relatedType: 'task',
        actorName,
        actorEmail: auth.currentUser?.email || undefined,
      }).catch(() => null);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function archiveTask(
  studioId: string,
  taskId: string,
  taskTitle: string,
  isArchived: boolean = true
): Promise<void> {
  const path = `studios/${studioId}/tasks/${taskId}`;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'studios', studioId, 'tasks', taskId), {
      isArchived,
      updatedAt: now,
    });
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: isArchived ? 'Task Archived' : 'Task Restored',
      targetType: 'Task',
      targetName: taskTitle,
    });
    await createNotification({
      studioId,
      title: isArchived ? 'Task Archived' : 'Task Restored',
      message: `Production task "${taskTitle}" was ${isArchived ? 'archived' : 'restored'}.`,
      category: 'task',
      linkTab: 'tasks',
      relatedId: taskId,
      relatedType: 'task',
    }).catch(() => null);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteTask(
  studioId: string,
  taskId: string,
  taskTitle: string
): Promise<void> {
  const path = `studios/${studioId}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'tasks', taskId));
    await addActivityLog({
      studioId,
      userId: auth.currentUser?.uid || 'system',
      userEmail: auth.currentUser?.email || 'photographer',
      action: 'Task Deleted',
      targetType: 'Task',
      targetName: taskTitle,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function computeTaskMetrics(tasks: ProductionTask[]): ProductionTaskMetrics {
  const activeTasks = tasks.filter((t) => !t.isArchived);
  const total = activeTasks.length;
  
  const todayStr = new Date().toISOString().split('T')[0];
  
  let pending = 0;
  let inProgress = 0;
  let underReview = 0;
  let completed = 0;
  let blocked = 0;
  let overdue = 0;

  for (const t of activeTasks) {
    if (t.status === 'pending') pending++;
    else if (t.status === 'in_progress') inProgress++;
    else if (t.status === 'under_review') underReview++;
    else if (t.status === 'completed') completed++;
    else if (t.status === 'blocked') blocked++;

    // Overdue check: task not completed and due date is earlier than today
    if (t.status !== 'completed' && t.dueDate) {
      const dueDay = t.dueDate.split('T')[0];
      if (dueDay < todayStr) {
        overdue++;
      }
    }
  }

  const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    pending,
    inProgress,
    underReview,
    completed,
    blocked,
    overdue,
    completionPercentage,
  };
}

// ==========================================
// SUPER ADMIN PLAN & SUBSCRIPTION SERVICE
// ==========================================

export function validateSubscriptionPlanInput(plan: Partial<SubscriptionPlan>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan.name || typeof plan.name !== 'string' || plan.name.trim().length < 2) {
    errors.push('Plan name must be at least 2 characters long.');
  }

  if (typeof plan.priceMonthly !== 'number' || isNaN(plan.priceMonthly) || plan.priceMonthly < 0) {
    errors.push('Monthly price must be a non-negative number.');
  }

  if (typeof plan.priceAnnual !== 'number' || isNaN(plan.priceAnnual) || plan.priceAnnual < 0) {
    errors.push('Annual price must be a non-negative number.');
  }

  if (!plan.currency || typeof plan.currency !== 'string' || plan.currency.trim().length !== 3) {
    errors.push('Currency must be a valid 3-letter code (e.g. USD, EUR, INR).');
  }

  if (typeof plan.storageLimitBytes !== 'number' || isNaN(plan.storageLimitBytes) || plan.storageLimitBytes < 1000000000) {
    errors.push('Storage limit must be at least 1,000,000,000 bytes (1 GB).');
  }

  if (typeof plan.galleryLimit !== 'number' || isNaN(plan.galleryLimit) || plan.galleryLimit < -1) {
    errors.push('Gallery limit must be -1 (unlimited) or a non-negative integer.');
  }

  if (typeof plan.maxTeamMembers !== 'undefined' && (typeof plan.maxTeamMembers !== 'number' || isNaN(plan.maxTeamMembers) || plan.maxTeamMembers < -1)) {
    errors.push('Team member limit must be -1 (unlimited) or a non-negative integer.');
  }

  if (plan.billingInterval && !['monthly', 'annual', 'both'].includes(plan.billingInterval)) {
    errors.push("Billing interval must be 'monthly', 'annual', or 'both'.");
  }

  if (plan.status && !['active', 'inactive'].includes(plan.status)) {
    errors.push("Status must be 'active' or 'inactive'.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function canTransitionSubscriptionStatus(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_SUBSCRIPTION_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// Fetch all plans configured in Firestore
// IMPORTANT: Does NOT auto-insert predefined plans if empty!
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const path = 'plans';
  try {
    const snap = await getDocs(collection(db, 'plans'));
    const plans: SubscriptionPlan[] = [];
    snap.forEach((d) => {
      plans.push({ id: d.id, ...d.data() } as SubscriptionPlan);
    });
    return plans.sort((a, b) => a.priceMonthly - b.priceMonthly);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// Create new subscription plan
export async function createSubscriptionPlan(
  planData: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>,
  customId?: string,
  actor?: { uid: string; email: string; name?: string }
): Promise<SubscriptionPlan> {
  const path = 'plans';
  const validation = validateSubscriptionPlanInput(planData);
  if (!validation.valid) {
    throw new Error(`Plan validation failed: ${validation.errors.join(' ')}`);
  }

  const planId = (customId || planData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')).slice(0, 64);
  const now = new Date().toISOString();

  const newPlan: SubscriptionPlan = {
    id: planId,
    name: planData.name.trim(),
    description: (planData.description || '').trim(),
    priceMonthly: planData.priceMonthly,
    priceAnnual: planData.priceAnnual,
    currency: planData.currency.toUpperCase().trim(),
    storageLimitBytes: planData.storageLimitBytes,
    galleryLimit: planData.galleryLimit,
    maxTeamMembers: typeof planData.maxTeamMembers === 'number' ? planData.maxTeamMembers : -1,
    supportedFeatures: planData.supportedFeatures || [],
    billingInterval: planData.billingInterval || 'monthly',
    status: planData.status || 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: actor?.email || 'superadmin',
    updatedBy: actor?.email || 'superadmin'
  };

  try {
    await setDoc(doc(db, 'plans', planId), sanitizeFirestorePayload(newPlan));

    if (actor) {
      await logSubscriptionAudit({
        actorId: actor.uid,
        actorEmail: actor.email,
        actorName: actor.name,
        action: 'plan_created',
        targetType: 'plan',
        targetId: planId,
        targetName: newPlan.name,
        newValue: newPlan,
        reason: 'Super Admin created new subscription plan definition'
      });
    }

    return newPlan;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${path}/${planId}`);
  }
}

// Update existing subscription plan
export async function updateSubscriptionPlan(
  planId: string,
  updates: Partial<SubscriptionPlan>,
  actor?: { uid: string; email: string; name?: string },
  reason?: string
): Promise<SubscriptionPlan> {
  const path = `plans/${planId}`;
  const validation = validateSubscriptionPlanInput(updates);
  if (!validation.valid) {
    throw new Error(`Plan validation failed: ${validation.errors.join(' ')}`);
  }

  try {
    const existingSnap = await getDoc(doc(db, 'plans', planId));
    if (!existingSnap.exists()) {
      throw new Error(`Plan ${planId} does not exist`);
    }
    const previous = existingSnap.data() as SubscriptionPlan;
    const now = new Date().toISOString();

    const sanitizedUpdates = sanitizeFirestorePayload({
      ...updates,
      updatedAt: now,
      updatedBy: actor?.email || 'superadmin'
    });

    await updateDoc(doc(db, 'plans', planId), sanitizedUpdates);

    if (actor) {
      await logSubscriptionAudit({
        actorId: actor.uid,
        actorEmail: actor.email,
        actorName: actor.name,
        action: 'plan_updated',
        targetType: 'plan',
        targetId: planId,
        targetName: updates.name || previous.name,
        previousValue: previous,
        newValue: { ...previous, ...sanitizedUpdates },
        reason: reason || 'Super Admin updated subscription plan configuration'
      });
    }

    return { ...previous, ...sanitizedUpdates, id: planId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Activate / Deactivate Plan
export async function toggleSubscriptionPlanStatus(
  planId: string,
  newStatus: PlanStatus,
  actor?: { uid: string; email: string; name?: string },
  reason?: string
): Promise<void> {
  const path = `plans/${planId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'plans', planId));
    if (!existingSnap.exists()) throw new Error(`Plan ${planId} does not exist`);
    const plan = existingSnap.data() as SubscriptionPlan;

    const now = new Date().toISOString();
    await updateDoc(doc(db, 'plans', planId), {
      status: newStatus,
      updatedAt: now,
      updatedBy: actor?.email || 'superadmin'
    });

    if (actor) {
      await logSubscriptionAudit({
        actorId: actor.uid,
        actorEmail: actor.email,
        actorName: actor.name,
        action: newStatus === 'active' ? 'plan_activated' : 'plan_deactivated',
        targetType: 'plan',
        targetId: planId,
        targetName: plan.name,
        previousValue: { status: plan.status },
        newValue: { status: newStatus },
        reason: reason || `Super Admin toggled plan status to ${newStatus}`
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Delete Plan
export async function deleteSubscriptionPlan(
  planId: string,
  actor?: { uid: string; email: string; name?: string },
  reason?: string
): Promise<void> {
  const path = `plans/${planId}`;
  try {
    const existingSnap = await getDoc(doc(db, 'plans', planId));
    const previous = existingSnap.exists() ? (existingSnap.data() as SubscriptionPlan) : null;

    await deleteDoc(doc(db, 'plans', planId));

    if (actor && previous) {
      await logSubscriptionAudit({
        actorId: actor.uid,
        actorEmail: actor.email,
        actorName: actor.name,
        action: 'plan_deactivated',
        targetType: 'plan',
        targetId: planId,
        targetName: previous.name,
        previousValue: previous,
        reason: reason || 'Super Admin deleted subscription plan definition'
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Assign / Update Studio Subscription (Privileged Super Admin Action)
export async function updateStudioSubscription(
  studioId: string,
  params: {
    planId?: string;
    planName?: string;
    status?: SubscriptionStatus;
    storageAllocationBytes?: number;
    expiryDate?: string;
    billingInterval?: 'monthly' | 'annual';
    reason: string;
    actor: { uid: string; email: string; name?: string };
  }
): Promise<Studio> {
  const path = `studios/${studioId}`;
  const studio = await getStudioById(studioId);
  if (!studio) {
    throw new Error(`Studio ${studioId} not found`);
  }

  const currentStatus: SubscriptionStatus = studio.subscription?.status || (studio.status === 'suspended' ? 'suspended' : 'active');
  const targetStatus: SubscriptionStatus = params.status || currentStatus;

  // Validate state transition if status is changing
  if (params.status && params.status !== currentStatus) {
    const valid = canTransitionSubscriptionStatus(currentStatus, targetStatus);
    if (!valid) {
      throw new Error(
        `Invalid subscription status transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${(VALID_SUBSCRIPTION_TRANSITIONS[currentStatus] || []).join(', ')}`
      );
    }
  }

  if (!params.reason || params.reason.trim().length < 3) {
    throw new Error('An administrative note or reason is required for privileged subscription changes.');
  }

  const now = new Date().toISOString();
  const nextPlanId = params.planId || studio.plan;
  const nextQuota = params.storageAllocationBytes !== undefined ? params.storageAllocationBytes : studio.storageAllocationBytes;

  const subscriptionRecord: StudioSubscriptionRecord = {
    planId: nextPlanId,
    planName: params.planName || (studio.subscription?.planName || nextPlanId),
    status: targetStatus,
    startDate: studio.subscription?.startDate || studio.createdAt,
    expiryDate: params.expiryDate !== undefined ? params.expiryDate : studio.subscription?.expiryDate,
    billingInterval: params.billingInterval || studio.subscription?.billingInterval || 'monthly',
    configuredStorageBytes: nextQuota,
    paymentStatus: 'manual_admin_override', // Honestly state that this is a manual override, not a payment gateway transaction!
    lastUpdatedBy: params.actor.email,
    lastUpdatedAt: now,
    assignedByAdminEmail: params.actor.email,
    administrativeNotes: params.reason.trim()
  };

  const studioUpdates: Record<string, any> = {
    plan: nextPlanId,
    storageAllocationBytes: nextQuota,
    status: targetStatus === 'suspended' ? 'suspended' : 'active',
    subscription: subscriptionRecord,
    updatedAt: now
  };

  try {
    await updateDoc(doc(db, 'studios', studioId), sanitizeFirestorePayload(studioUpdates));

    // 1. Log to platform audit trail
    await logSubscriptionAudit({
      actorId: params.actor.uid,
      actorEmail: params.actor.email,
      actorName: params.actor.name,
      action: params.planId && params.planId !== studio.plan 
        ? 'subscription_assigned' 
        : params.status && params.status !== currentStatus 
        ? 'subscription_status_changed' 
        : 'storage_quota_updated',
      targetType: 'studio_subscription',
      targetId: studioId,
      targetName: studio.name,
      previousValue: {
        plan: studio.plan,
        status: currentStatus,
        storageAllocationBytes: studio.storageAllocationBytes,
        subscription: studio.subscription
      },
      newValue: {
        plan: nextPlanId,
        status: targetStatus,
        storageAllocationBytes: nextQuota,
        subscription: subscriptionRecord
      },
      reason: params.reason.trim()
    });

    // 2. Also log to studio activity history so studio owners see administrative audit trail
    await addActivityLog({
      studioId,
      userId: params.actor.uid,
      userEmail: params.actor.email,
      action: `Super Admin updated subscription: Plan '${nextPlanId}', Status '${targetStatus}', Quota ${formatBytes(nextQuota)}. Note: ${params.reason.trim()}`,
      targetType: 'subscription',
      targetName: studio.name
    });

    return {
      ...studio,
      ...studioUpdates,
      subscription: subscriptionRecord
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Log Platform Subscription Audit Record
export async function logSubscriptionAudit(
  entry: Omit<SubscriptionAuditRecord, 'id' | 'timestamp'>
): Promise<SubscriptionAuditRecord> {
  const path = 'platformAuditLogs';
  const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const fullRecord: SubscriptionAuditRecord = {
    id: logId,
    timestamp: now,
    ...entry
  };

  try {
    await setDoc(doc(db, 'platformAuditLogs', logId), sanitizeFirestorePayload(fullRecord));
    return fullRecord;
  } catch (err) {
    console.warn('Could not write platform audit log:', err);
    return fullRecord;
  }
}

// Fetch Platform Audit Logs
export async function getPlatformAuditLogs(limitCount = 50): Promise<SubscriptionAuditRecord[]> {
  const path = 'platformAuditLogs';
  try {
    const snap = await getDocs(collection(db, 'platformAuditLogs'));
    const logs: SubscriptionAuditRecord[] = [];
    snap.forEach((d) => {
      logs.push({ id: d.id, ...d.data() } as SubscriptionAuditRecord);
    });
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limitCount);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// Check Backend Billing Status (Truth in Billing)
export async function checkAdminBillingStatusBackend(): Promise<{
  paymentGateway: string;
  recurringBilling: string;
  automaticRenewals: string;
  invoiceGeneration: string;
  zeroBillingPreserved: boolean;
  message: string;
}> {
  try {
    const res = await fetch('/api/admin/billing-status');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // ignore
  }
  return {
    paymentGateway: 'Not Connected',
    recurringBilling: 'Not Connected',
    automaticRenewals: 'Not Active',
    invoiceGeneration: 'Disabled',
    zeroBillingPreserved: true,
    message: 'Payment gateway integrations are not connected. All billing is strictly manual administrative override.'
  };
}

// Update Studio Tenant Status (Active / Suspended)
export async function updateTenantStatus(
  studioId: string,
  newStatus: 'active' | 'suspended',
  reason: string,
  actor: { uid: string; email: string; name?: string }
): Promise<Studio> {
  const path = `studios/${studioId}`;
  const studio = await getStudioById(studioId);
  if (!studio) {
    throw new Error(`Studio ${studioId} not found`);
  }

  if (!reason || reason.trim().length < 3) {
    throw new Error('An administrative note or reason is required for updating tenant status.');
  }

  const previousStatus = studio.status || 'active';
  const now = new Date().toISOString();

  const updates: Record<string, any> = {
    status: newStatus,
    updatedAt: now
  };

  // If studio has a subscription record, sync the status if appropriate
  if (studio.subscription) {
    updates.subscription = {
      ...studio.subscription,
      status: newStatus === 'suspended' ? 'suspended' : (studio.subscription.status === 'suspended' ? 'active' : studio.subscription.status),
      lastUpdatedBy: actor.email,
      lastUpdatedAt: now,
      administrativeNotes: reason.trim()
    };
  }

  try {
    await updateDoc(doc(db, 'studios', studioId), sanitizeFirestorePayload(updates));

    await logSubscriptionAudit({
      actorId: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      action: 'tenant_status_changed',
      targetType: 'studio_tenant',
      targetId: studioId,
      targetName: studio.name,
      previousValue: { status: previousStatus },
      newValue: { status: newStatus },
      reason: reason.trim()
    });

    await addActivityLog({
      studioId,
      userId: actor.uid,
      userEmail: actor.email,
      action: `Super Admin set studio tenant status to '${newStatus}'. Note: ${reason.trim()}`,
      targetType: 'studio',
      targetName: studio.name
    });

    return {
      ...studio,
      ...updates
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}


