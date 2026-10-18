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
  limit,
  writeBatch
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase/config';
import { 
  AppNotification, 
  NotificationCategory, 
  UserNotificationPreferences, 
  DEFAULT_NOTIFICATION_PREFERENCES 
} from '../types';
import { sanitizeFirestorePayload, addActivityLog } from './studioService';

/**
 * Creates an in-app notification in the studio's partitioned notifications subcollection.
 * Only generated from real application events, respecting user preferences where applicable.
 */
export async function createNotification(params: {
  studioId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  linkTab?: string;
  relatedId?: string;
  relatedType?: 'gallery' | 'client' | 'task' | 'payment' | 'member';
  actorName?: string;
  actorEmail?: string;
  recipientUserId?: string;
}): Promise<AppNotification> {
  if (!params.studioId || typeof params.studioId !== 'string' || !params.studioId.trim()) {
    throw new Error('Valid studio ID is required to create a notification.');
  }

  const cleanTitle = (params.title || '').trim();
  const cleanMessage = (params.message || '').trim();
  if (!cleanTitle) {
    throw new Error('Notification title is required.');
  }

  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const path = `studios/${params.studioId}/notifications/${notificationId}`;

  const notification: AppNotification = {
    id: notificationId,
    studioId: params.studioId.trim(),
    recipientUserId: params.recipientUserId?.trim() || undefined,
    title: cleanTitle,
    message: cleanMessage,
    category: params.category,
    isRead: false,
    isArchived: false,
    createdAt: now,
    linkTab: params.linkTab?.trim() || undefined,
    relatedId: params.relatedId?.trim() || undefined,
    relatedType: params.relatedType || undefined,
    actorName: params.actorName?.trim() || undefined,
    actorEmail: params.actorEmail?.trim() || undefined,
  };

  const cleanPayload = sanitizeFirestorePayload(notification);

  try {
    await setDoc(doc(db, 'studios', params.studioId, 'notifications', notificationId), cleanPayload);
    return cleanPayload as AppNotification;
  } catch (err) {
    // Graceful fallback for non-blocking notification delivery
    console.warn('Failed to persist notification:', err);
    return cleanPayload as AppNotification;
  }
}

/**
 * Retrieves notifications for the active studio, sorted by latest first.
 */
export async function getNotifications(
  studioId: string, 
  limitCount = 50, 
  includeArchived = false
): Promise<AppNotification[]> {
  if (!studioId) return [];

  const path = `studios/${studioId}/notifications`;
  try {
    const notifsRef = collection(db, 'studios', studioId, 'notifications');
    const q = query(
      notifsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const results: AppNotification[] = [];

    snapshot.forEach((d) => {
      const data = d.data();
      const notifItem: AppNotification = {
        ...data,
        id: d.id,
      } as AppNotification;
      if (includeArchived || !notifItem.isArchived) {
        results.push(notifItem);
      }
    });

    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(
  studioId: string, 
  notificationId: string
): Promise<void> {
  if (!studioId || !notificationId) return;

  const path = `studios/${studioId}/notifications/${notificationId}`;
  const now = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'studios', studioId, 'notifications', notificationId), {
      isRead: true,
      readAt: now,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Marks all unread notifications in a studio as read.
 */
export async function markAllNotificationsAsRead(studioId: string): Promise<void> {
  if (!studioId) return;

  const notifs = await getNotifications(studioId, 100, false);
  const unread = notifs.filter((n) => !n.isRead);

  if (unread.length === 0) return;

  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    for (const item of unread) {
      const ref = doc(db, 'studios', studioId, 'notifications', item.id);
      batch.update(ref, { isRead: true, readAt: now });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Batch mark read failed, updating individually:', err);
    await Promise.all(
      unread.map((item) =>
        updateDoc(doc(db, 'studios', studioId, 'notifications', item.id), {
          isRead: true,
          readAt: now,
        }).catch(() => null)
      )
    );
  }
}

/**
 * Dismisses or archives a notification so it no longer clutters active notifications.
 */
export async function archiveNotification(
  studioId: string, 
  notificationId: string,
  isArchived = true
): Promise<void> {
  if (!studioId || !notificationId) return;

  const path = `studios/${studioId}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'studios', studioId, 'notifications', notificationId), {
      isArchived,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a notification completely.
 */
export async function deleteNotification(
  studioId: string, 
  notificationId: string
): Promise<void> {
  if (!studioId || !notificationId) return;

  const path = `studios/${studioId}/notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'studios', studioId, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Retrieves persisted notification preferences for an authenticated user.
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<UserNotificationPreferences> {
  if (!userId) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  try {
    // 1. Try reading from Firestore user document
    const userDocSnap = await getDoc(doc(db, 'users', userId));
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      if (data?.notificationPreferences) {
        return {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...data.notificationPreferences,
          // Always keep delivery realism: external gateways are explicitly disabled
          emailDeliveryEnabled: false,
          smsDeliveryEnabled: false,
          pushDeliveryEnabled: false,
        };
      }
    }

    // 2. Try localStorage fallback
    const local = localStorage.getItem(`studiocloud_notif_prefs_${userId}`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        return {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...parsed,
          emailDeliveryEnabled: false,
          smsDeliveryEnabled: false,
          pushDeliveryEnabled: false,
        };
      } catch {
        // ignore parse error
      }
    }
  } catch (err) {
    console.warn('Could not load user notification preferences from Firestore:', err);
  }

  return { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

/**
 * Saves notification preferences for an authenticated user to Firestore.
 */
export async function saveUserNotificationPreferences(
  userId: string,
  prefs: Partial<UserNotificationPreferences>
): Promise<UserNotificationPreferences> {
  if (!userId) {
    throw new Error('Authenticated user ID is required to save preferences.');
  }

  const current = await getUserNotificationPreferences(userId);
  const updated: UserNotificationPreferences = {
    ...current,
    ...prefs,
    // Realism invariant: external delivery channels remain unconfigured without real backend provider
    emailDeliveryEnabled: false,
    smsDeliveryEnabled: false,
    pushDeliveryEnabled: false,
  };

  try {
    // Save to user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      notificationPreferences: updated,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // If updateDoc fails (e.g. user doc setDoc needed), try setDoc with merge
    try {
      await setDoc(doc(db, 'users', userId), {
        notificationPreferences: updated,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (setErr) {
      console.warn('Failed to save preferences to Firestore, caching to localStorage:', setErr);
    }
  }

  try {
    localStorage.setItem(`studiocloud_notif_prefs_${userId}`, JSON.stringify(updated));
  } catch {
    // ignore local storage error
  }

  return updated;
}
