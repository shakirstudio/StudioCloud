export type StudioPlan = 'starter' | 'pro' | 'studio_unlimited' | 'basic' | 'studio_starter' | 'ultimate' | string;

export type StudioRole = 
  | 'owner' 
  | 'lead_photographer' 
  | 'associate_photographer' 
  | 'retoucher' 
  | 'assistant';

export type SupportedFontFamily = 
  | 'serif' 
  | 'sans' 
  | 'playfair' 
  | 'cormorant' 
  | 'inter' 
  | 'montserrat' 
  | 'cinzel';

export type LogoPlacement = 'left' | 'center' | 'right';
export type GalleryCoverStyle = 'full' | 'split' | 'minimal' | 'hero_gradient';
export type GalleryTheme = 'dark' | 'light' | 'system';

export type GalleryTemplateCategory = 
  | 'wedding' 
  | 'pre_wedding' 
  | 'portrait' 
  | 'events' 
  | 'portfolio';

export type GalleryLayoutType = 'grid' | 'masonry' | 'large_image';
export type GalleryColumnsCount = 2 | 3 | 4;
export type GalleryGridSpacing = 'compact' | 'normal' | 'spacious';

export interface GalleryDesignSettings {
  templateId?: string;
  templateType?: GalleryTemplateCategory;
  layout: GalleryLayoutType;
  columns?: GalleryColumnsCount;
  spacing?: GalleryGridSpacing;
  accentColor?: string;
  fontFamily?: SupportedFontFamily;
  coverStyle?: GalleryCoverStyle;
  galleryTheme?: GalleryTheme;
  logoPlacement?: LogoPlacement;
  showWatermark?: boolean;
  watermarkText?: string;
  customCoverUrl?: string;
  storyExcerpt?: string;
  highlightBadges?: boolean;
}

export interface StudioGalleryTemplate {
  id: string;
  studioId: string;
  name: string;
  description: string;
  category: GalleryTemplateCategory;
  layout: GalleryLayoutType;
  columns: GalleryColumnsCount;
  spacing: GalleryGridSpacing;
  coverStyle: GalleryCoverStyle;
  fontFamily: SupportedFontFamily;
  accentColor: string;
  galleryTheme: GalleryTheme;
  logoPlacement: LogoPlacement;
  isStudioDefault?: boolean;
  sampleCoverUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioBranding {
  accentColor: string;
  primaryColor?: string;
  secondaryColor?: string;
  galleryBackgroundColor?: string;
  galleryAccentColor?: string;
  logoUrl?: string;
  logoPlacement?: LogoPlacement;
  fontFamily?: SupportedFontFamily;
  coverStyle?: GalleryCoverStyle;
  galleryTheme?: GalleryTheme;
  defaultTemplateId?: string;
  defaultLayout?: GalleryLayoutType;
  watermarkText?: string;
  contactEmail?: string;
  website?: string;
  phone?: string;
  address?: string;
  footerText?: string;
}

export interface StudioRegionalPreferences {
  timezone?: string;
  currency?: string;
  dateFormat?: string;
}

export interface StudioBusinessDetails {
  taxId?: string;
  registrationNumber?: string;
  billingAddress?: string;
}

export interface Studio {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  slug: string;
  ownerId: string;
  plan: StudioPlan;
  storageAllocationBytes: number; // default 10 GB = 10,737,418,240
  storageUsedBytes: number;
  branding: StudioBranding;
  regionalPreferences?: StudioRegionalPreferences;
  businessDetails?: StudioBusinessDetails;
  status: 'active' | 'suspended';
  subscription?: StudioSubscriptionRecord;
  createdAt: string;
  updatedAt: string;
}

export interface StudioMember {
  id: string;
  studioId: string;
  userId: string;
  email: string;
  displayName: string;
  role: StudioRole;
  status: 'active' | 'invited';
  joinedAt: string;
}

export type ClientShootType = 
  | 'wedding' 
  | 'portrait' 
  | 'commercial' 
  | 'editorial' 
  | 'event' 
  | 'other';

export type ClientStatus = 'lead' | 'active' | 'completed' | 'inactive' | 'archived';

export interface Client {
  id: string;
  studioId: string;
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  shootType: ClientShootType;
  status: ClientStatus;
  notes?: string;
  isArchived?: boolean;
  eventDate?: string;
  eventLocation?: string;
  createdAt: string;
  updatedAt: string;
}

export type GalleryStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type GalleryPrivacy = 'public' | 'password_protected' | 'unlisted' | 'private';

export interface Gallery {
  id: string;
  studioId: string;
  clientId?: string;
  clientName?: string;
  title: string;
  description?: string;
  eventType?: string;
  shootDate?: string;
  coverImageUrl?: string;
  status: GalleryStatus;
  privacy: GalleryPrivacy;
  downloadAccess: boolean;
  photoCount: number;
  videoCount?: number;
  storageBytes: number;
  expiresAt?: string;
  shareToken?: string;
  accessPassword?: string;
  templateId?: string;
  templateType?: GalleryTemplateCategory;
  designSettings?: GalleryDesignSettings;
  proofingSettings?: GalleryProofingSettings;
  createdAt: string;
  updatedAt: string;
}

export type MediaType = 'image' | 'video';

export interface MediaItem {
  id: string;
  studioId: string;
  galleryId: string;
  fileName: string;
  fileType: MediaType;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  downloadUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export type ProofingReviewStatus = 'pending' | 'in_progress' | 'submitted' | 'approved';

export interface GalleryProofingSettings {
  enabled: boolean;
  allowFavourites: boolean;
  allowAlbumSelection: boolean;
  allowComments: boolean;
  maxAlbumSelections?: number;
  reviewStatus: ProofingReviewStatus;
  instructions?: string;
  deadline?: string;
  submittedAt?: string;
  submittedByEmail?: string;
  submittedByName?: string;
  approvedAt?: string;
}

export interface PhotoProofItem {
  id: string;
  studioId: string;
  galleryId: string;
  mediaId: string;
  clientEmail: string;
  clientName: string;
  isFavourite: boolean;
  isApprovedForAlbum: boolean;
  comment?: string;
  isSubmissionRecord?: boolean;
  submissionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProofingSummary {
  totalFavourites: number;
  totalAlbumSelections: number;
  totalComments: number;
  uniqueClients: string[];
  reviewStatus?: ProofingReviewStatus;
  hasSubmission?: boolean;
}

export interface UploadProgressItem {
  id: string;
  file: File;
  fileName: string;
  fileType: MediaType;
  sizeBytes: number;
  progressPercent: number;
  bytesTransferred: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  downloadUrl?: string;
}

export interface ActivityLog {
  id: string;
  studioId: string;
  userId: string;
  userEmail: string;
  actorName?: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetName: string;
  details?: string;
  createdAt: string;
}

export type NotificationCategory = 'gallery' | 'client' | 'task' | 'payment' | 'system';

export interface AppNotification {
  id: string;
  studioId: string;
  recipientUserId?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  isRead: boolean;
  isArchived?: boolean;
  createdAt: string;
  readAt?: string;
  linkTab?: string;
  relatedId?: string;
  relatedType?: 'gallery' | 'client' | 'task' | 'payment' | 'member';
  actorName?: string;
  actorEmail?: string;
}

export interface UserNotificationPreferences {
  galleryNotifications: boolean;
  clientNotifications: boolean;
  taskNotifications: boolean;
  paymentNotifications: boolean;
  systemNotifications: boolean;
  emailDeliveryEnabled: boolean;
  smsDeliveryEnabled: boolean;
  pushDeliveryEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  galleryNotifications: true,
  clientNotifications: true,
  taskNotifications: true,
  paymentNotifications: true,
  systemNotifications: true,
  emailDeliveryEnabled: false,
  smsDeliveryEnabled: false,
  pushDeliveryEnabled: false,
};

export interface UserPublic {
  id: string;
  email: string;
  displayName: string;
  activeStudioId?: string;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  currentUsedBytes: number;
  allocationBytes: number;
  requestedBytes: number;
  projectedBytes: number;
  remainingBytes: number;
  percentageUsed: number;
  message: string;
}

// PRODUCTION TASK BOARD TYPES
export type ProductionTaskStatus = 
  | 'pending' 
  | 'in_progress' 
  | 'under_review' 
  | 'completed' 
  | 'blocked';

export type ProductionTaskPriority = 
  | 'low' 
  | 'medium' 
  | 'high' 
  | 'urgent';

export type ProductionTaskCategory = 
  | 'selection' 
  | 'editing' 
  | 'album_design' 
  | 'client_revisions' 
  | 'final_export' 
  | 'delivery' 
  | 'other';

export interface TaskStatusHistoryItem {
  status: ProductionTaskStatus;
  changedAt: string;
  changedBy: string;
  note?: string;
}

export interface ProductionTask {
  id: string;
  studioId: string;
  title: string;
  description?: string;
  category: ProductionTaskCategory;
  priority: ProductionTaskPriority;
  status: ProductionTaskStatus;
  startDate?: string;
  dueDate: string;
  clientId?: string;
  clientName?: string;
  galleryId?: string;
  galleryTitle?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  instructions?: string;
  statusHistory?: TaskStatusHistoryItem[];
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName?: string;
}

export interface ProductionTaskMetrics {
  total: number;
  pending: number;
  inProgress: number;
  underReview: number;
  completed: number;
  blocked: number;
  overdue: number;
  completionPercentage: number;
}

// SUPER ADMIN SUBSCRIPTION & PLAN MANAGEMENT TYPES
export type PlanBillingInterval = 'monthly' | 'annual' | 'both';
export type PlanStatus = 'active' | 'inactive';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  currency: string;
  storageLimitBytes: number;
  galleryLimit: number; // -1 for unlimited
  maxTeamMembers?: number; // -1 for unlimited, or e.g. 3, 10
  supportedFeatures: string[];
  billingInterval: PlanBillingInterval;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type SubscriptionStatus = 
  | 'trial' 
  | 'active' 
  | 'past_due' 
  | 'suspended' 
  | 'expired' 
  | 'cancelled';

export const VALID_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ['active', 'suspended', 'expired', 'cancelled'],
  active: ['suspended', 'expired', 'past_due', 'cancelled'],
  past_due: ['active', 'suspended', 'expired', 'cancelled'],
  suspended: ['active', 'expired', 'cancelled'],
  expired: ['active', 'cancelled'],
  cancelled: ['active']
};

export interface StudioSubscriptionRecord {
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  startDate: string;
  expiryDate?: string;
  billingInterval?: 'monthly' | 'annual';
  configuredStorageBytes: number;
  paymentStatus: 'manual_admin_override' | 'unverified_not_connected';
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  assignedByAdminEmail?: string;
  administrativeNotes?: string;
}

export interface SubscriptionAuditRecord {
  id: string;
  actorId: string;
  actorEmail: string;
  actorName?: string;
  action: 
    | 'plan_created'
    | 'plan_updated'
    | 'plan_activated'
    | 'plan_deactivated'
    | 'plan_deleted'
    | 'subscription_assigned'
    | 'subscription_status_changed'
    | 'storage_quota_updated'
    | 'subscription_expired'
    | 'subscription_suspended'
    | 'subscription_reactivated'
    | 'tenant_status_changed';
  targetType: 'plan' | 'subscription_plan' | 'studio_subscription' | 'studio_tenant';
  targetId: string;
  targetName: string;
  previousValue?: any;
  newValue?: any;
  reason?: string;
  timestamp: string;
}

