import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  Download, 
  Eye, 
  Share2,
  Heart,
  Star,
  MessageSquare,
  X, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Lock, 
  Globe, 
  HardDrive, 
  Calendar, 
  User, 
  Sparkles, 
  Info, 
  Maximize2,
  FileCheck,
  Play,
  Pause,
  AlertTriangle,
  FolderOpen,
  Settings2,
  Sliders,
  Filter,
  Check,
  Clock,
  Layers,
  Camera
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Gallery, 
  MediaItem, 
  MediaType, 
  PhotoProofItem, 
  ProofingSummary,
  GalleryProofingSettings,
  ProofingReviewStatus
} from '../../types';
import { 
  getGalleryMedia, 
  deleteMediaItem, 
  validateMediaFile, 
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES
} from '../../services/storageService';
import { formatBytes, updateGallery, deleteGallery } from '../../services/studioService';
import { 
  getGalleryProofing, 
  computeProofingSummary,
  getEffectiveProofingSettings,
  updateGalleryProofingSettings,
  updateProofingReviewStatus,
  removeClientProofSelection
} from '../../services/proofingService';
import { Badge } from '../common/Badge';
import { ShareGalleryModal } from '../modals/ShareGalleryModal';
import { ClientGalleryView } from '../client/ClientGalleryView';

export interface StagedUploadItem {
  id: string;
  file: File;
  fileName: string;
  fileType: MediaType;
  sizeBytes: number;
  previewUrl?: string;
  dimensions?: { width: number; height: number };
  status: 'pending' | 'uploading' | 'completed' | 'cancelled' | 'error';
  progressPercent: number;
  simulatedSpeedMBs: number;
  error?: string;
}

interface GalleryDetailViewProps {
  gallery: Gallery;
  onBack: () => void;
  onGalleryUpdated: () => void;
  onGalleryDeleted: () => void;
}

export const GalleryDetailView: React.FC<GalleryDetailViewProps> = ({
  gallery,
  onBack,
  onGalleryUpdated,
  onGalleryDeleted
}) => {
  const { activeStudio, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Firestore-persisted media items
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');
  
  // Phase 3A Upload Preview Staging Queue (In-browser testing preview)
  const [stagedQueue, setStagedQueue] = useState<StagedUploadItem[]>([]);
  const [uploadNoticeDismissed, setUploadNoticeDismissed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Lightbox
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);
  const [lightboxPreviewItem, setLightboxPreviewItem] = useState<StagedUploadItem | null>(null);

  // Edit metadata modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(gallery.title);
  const [editStatus, setEditStatus] = useState(gallery.status);
  const [editPrivacy, setEditPrivacy] = useState(gallery.privacy);
  const [editDownloadAccess, setEditDownloadAccess] = useState(gallery.downloadAccess);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmations (no window.confirm)
  const [mediaToDelete, setMediaToDelete] = useState<MediaItem | null>(null);
  const [isDeletingGallery, setIsDeletingGallery] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Active gallery data
  const [currentGallery, setCurrentGallery] = useState<Gallery>(gallery);
  useEffect(() => {
    setCurrentGallery(gallery);
  }, [gallery]);

  // Sharing & Proofing Controls
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [clientPreviewOpen, setClientPreviewOpen] = useState(false);
  const [proofingItems, setProofingItems] = useState<PhotoProofItem[]>([]);
  const [loadingProofing, setLoadingProofing] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'media' | 'proofing'>('media');

  // Proofing Settings Configuration State
  const [proofingSettingsModalOpen, setProofingSettingsModalOpen] = useState(false);
  const [draftProofingSettings, setDraftProofingSettings] = useState<GalleryProofingSettings>(() => getEffectiveProofingSettings(gallery));
  const [isSavingProofingSettings, setIsSavingProofingSettings] = useState(false);
  const [proofingSettingsSuccess, setProofingSettingsSuccess] = useState(false);
  const [proofingSettingsError, setProofingSettingsError] = useState<string | null>(null);

  // Sync draft proofing settings whenever currentGallery changes or modal opens
  useEffect(() => {
    setDraftProofingSettings(getEffectiveProofingSettings(currentGallery));
  }, [currentGallery, proofingSettingsModalOpen]);

  // Selection Management State
  const [proofToDelete, setProofToDelete] = useState<PhotoProofItem | null>(null);
  const [isDeletingProof, setIsDeletingProof] = useState(false);
  const [proofActionSuccess, setProofActionSuccess] = useState<string | null>(null);
  const [proofActionError, setProofActionError] = useState<string | null>(null);
  const [proofFilter, setProofFilter] = useState<'all' | 'album' | 'favourites' | 'comments' | 'submissions'>('all');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [mediaSelectionFilter, setMediaSelectionFilter] = useState<'all' | 'album' | 'favourites' | 'comments' | 'unselected'>('all');

  // Photo Selections Map for fast lookup & distinguishing selected vs unselected photos
  const photoProofMap = useMemo(() => {
    const map = new Map<string, {
      favouritesCount: number;
      albumSelectionsCount: number;
      commentsCount: number;
      clients: string[];
      records: PhotoProofItem[];
    }>();

    for (const item of proofingItems) {
      if (item.isSubmissionRecord) continue;
      const existing = map.get(item.mediaId) || {
        favouritesCount: 0,
        albumSelectionsCount: 0,
        commentsCount: 0,
        clients: [],
        records: []
      };
      if (item.isFavourite) existing.favouritesCount++;
      if (item.isApprovedForAlbum) existing.albumSelectionsCount++;
      if (item.comment && item.comment.trim().length > 0) existing.commentsCount++;
      if (item.clientEmail && !existing.clients.includes(item.clientEmail)) {
        existing.clients.push(item.clientEmail);
      }
      existing.records.push(item);
      map.set(item.mediaId, existing);
    }
    return map;
  }, [proofingItems]);

  const albumSelectedPhotosCount = useMemo(() => {
    return mediaItems.filter(m => (photoProofMap.get(m.id)?.albumSelectionsCount || 0) > 0).length;
  }, [mediaItems, photoProofMap]);

  const favouritedPhotosCount = useMemo(() => {
    return mediaItems.filter(m => (photoProofMap.get(m.id)?.favouritesCount || 0) > 0).length;
  }, [mediaItems, photoProofMap]);

  const commentedPhotosCount = useMemo(() => {
    return mediaItems.filter(m => (photoProofMap.get(m.id)?.commentsCount || 0) > 0).length;
  }, [mediaItems, photoProofMap]);

  const unselectedPhotosCount = useMemo(() => {
    return mediaItems.filter(m => {
      const p = photoProofMap.get(m.id);
      return !p || (p.albumSelectionsCount === 0 && p.favouritesCount === 0 && p.commentsCount === 0);
    }).length;
  }, [mediaItems, photoProofMap]);

  // Active simulated upload intervals tracker
  const simulationIntervalsRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const loadMedia = async () => {
    if (!activeStudio) return;
    setLoadingMedia(true);
    try {
      const items = await getGalleryMedia(activeStudio.id, currentGallery.id);
      setMediaItems(items);
    } catch (err: any) {
      console.error('Error fetching gallery media:', err);
    } finally {
      setLoadingMedia(false);
    }
  };

  const loadProofing = async () => {
    if (!activeStudio) return;
    setLoadingProofing(true);
    try {
      const items = await getGalleryProofing(activeStudio.id, currentGallery.id);
      setProofingItems(items);
    } catch (err: any) {
      console.error('Error fetching gallery proofing:', err);
    } finally {
      setLoadingProofing(false);
    }
  };

  // Proofing Settings Handlers
  const handleSaveProofingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio) return;
    setIsSavingProofingSettings(true);
    setProofingSettingsError(null);
    try {
      const updated = await updateGalleryProofingSettings(
        activeStudio.id,
        currentGallery.id,
        draftProofingSettings,
        currentGallery
      );
      setCurrentGallery(prev => ({
        ...prev,
        proofingSettings: updated
      }));
      setProofingSettingsSuccess(true);
      onGalleryUpdated();
      setTimeout(() => {
        setProofingSettingsSuccess(false);
        setProofingSettingsModalOpen(false);
      }, 1000);
    } catch (err: any) {
      setProofingSettingsError(err?.message || 'Failed to save proofing settings.');
    } finally {
      setIsSavingProofingSettings(false);
    }
  };

  const handleUpdateReviewStatus = async (status: ProofingReviewStatus) => {
    if (!activeStudio) return;
    try {
      await updateProofingReviewStatus(activeStudio.id, currentGallery.id, status, currentGallery);
      setCurrentGallery(prev => ({
        ...prev,
        proofingSettings: {
          ...getEffectiveProofingSettings(prev),
          reviewStatus: status,
          approvedAt: status === 'approved' ? new Date().toISOString() : prev.proofingSettings?.approvedAt,
        }
      }));
      setProofActionSuccess(`Review status updated to: ${status.replace('_', ' ').toUpperCase()}`);
      setTimeout(() => setProofActionSuccess(null), 3500);
      onGalleryUpdated();
    } catch (err: any) {
      setProofActionError(err?.message || 'Failed to update review status.');
      setTimeout(() => setProofActionError(null), 3500);
    }
  };

  const handleConfirmDeleteProof = async () => {
    if (!proofToDelete || !activeStudio) return;
    setIsDeletingProof(true);
    try {
      const matchingMedia = mediaItems.find(m => m.id === proofToDelete.mediaId);
      await removeClientProofSelection(
        activeStudio.id,
        currentGallery.id,
        proofToDelete.id,
        matchingMedia?.fileName || proofToDelete.mediaId
      );
      setProofingItems(prev => prev.filter(p => p.id !== proofToDelete.id));
      setProofToDelete(null);
      setProofActionSuccess('Client selection successfully removed from gallery records.');
      setTimeout(() => setProofActionSuccess(null), 3500);
    } catch (err: any) {
      setProofActionError(err?.message || 'Failed to remove selection.');
      setTimeout(() => setProofActionError(null), 3500);
    } finally {
      setIsDeletingProof(false);
    }
  };

  useEffect(() => {
    loadMedia();
    loadProofing();
    return () => {
      // Clear simulation timers on unmount
      Object.values(simulationIntervalsRef.current).forEach(clearInterval);
    };
  }, [currentGallery.id, activeStudio?.id]);

  // Clean up object URLs when items removed
  const cleanupPreviewUrl = (item: StagedUploadItem) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  };

  // Handle files selected via input or drop
  const handleProcessFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setValidationError(null);

    const newItems: StagedUploadItem[] = [];

    for (const file of selectedFiles) {
      const validation = validateMediaFile(file);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid file selected.');
        continue;
      }

      // Generate in-browser preview URL for client visualization
      let previewUrl: string | undefined;
      if (validation.fileType === 'image') {
        previewUrl = URL.createObjectURL(file);
      }

      const item: StagedUploadItem = {
        id: `preview_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        fileName: file.name,
        fileType: validation.fileType!,
        sizeBytes: file.size,
        previewUrl,
        status: 'pending',
        progressPercent: 0,
        simulatedSpeedMBs: 4.5 + Math.random() * 5.0, // realistic 4-9 MB/s preview speed
      };

      // Measure dimensions asynchronously if image
      if (previewUrl) {
        const img = new Image();
        img.src = previewUrl;
        img.onload = () => {
          setStagedQueue(prev => prev.map(q => q.id === item.id ? {
            ...q,
            dimensions: { width: img.naturalWidth, height: img.naturalHeight }
          } : q));
        };
      }

      newItems.push(item);
    }

    if (newItems.length > 0) {
      setStagedQueue(prev => [...prev, ...newItems]);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleProcessFiles(Array.from(e.target.files));
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleProcessFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Run upload simulation for a specific staged item
  const startSimulation = (item: StagedUploadItem) => {
    if (item.status === 'uploading') return;

    setStagedQueue(prev => prev.map(q => q.id === item.id ? { 
      ...q, 
      status: 'uploading', 
      progressPercent: q.progressPercent >= 100 ? 0 : q.progressPercent 
    } : q));

    // Simulated step intervals based on file size
    const durationMs = Math.min(6000, Math.max(1200, (item.sizeBytes / (1024 * 1024)) * 150));
    const stepInterval = 100;
    const incrementPerStep = (100 / (durationMs / stepInterval));

    const interval = setInterval(() => {
      setStagedQueue(prev => {
        const current = prev.find(q => q.id === item.id);
        if (!current || current.status !== 'uploading') {
          clearInterval(interval);
          delete simulationIntervalsRef.current[item.id];
          return prev;
        }

        const nextProgress = Math.min(100, current.progressPercent + incrementPerStep);

        if (nextProgress >= 100) {
          clearInterval(interval);
          delete simulationIntervalsRef.current[item.id];
          return prev.map(q => q.id === item.id ? {
            ...q,
            progressPercent: 100,
            status: 'completed'
          } : q);
        }

        return prev.map(q => q.id === item.id ? {
          ...q,
          progressPercent: nextProgress
        } : q);
      });
    }, stepInterval);

    simulationIntervalsRef.current[item.id] = interval;
  };

  // Run upload simulation for all pending staged items
  const startAllSimulations = () => {
    stagedQueue.forEach(item => {
      if (item.status === 'pending' || item.status === 'cancelled' || item.status === 'error') {
        startSimulation(item);
      }
    });
  };

  const cancelSimulation = (id: string) => {
    if (simulationIntervalsRef.current[id]) {
      clearInterval(simulationIntervalsRef.current[id]);
      delete simulationIntervalsRef.current[id];
    }
    setStagedQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'cancelled' } : q));
  };

  const removeStagedItem = (id: string) => {
    const item = stagedQueue.find(q => q.id === id);
    if (item) cleanupPreviewUrl(item);
    if (simulationIntervalsRef.current[id]) {
      clearInterval(simulationIntervalsRef.current[id]);
      delete simulationIntervalsRef.current[id];
    }
    setStagedQueue(prev => prev.filter(q => q.id !== id));
  };

  const clearStagedQueue = () => {
    stagedQueue.forEach(cleanupPreviewUrl);
    Object.values(simulationIntervalsRef.current).forEach(clearInterval);
    simulationIntervalsRef.current = {};
    setStagedQueue([]);
  };

  // Delete persisted media item from Firestore
  const handleConfirmDeleteMedia = async () => {
    if (!activeStudio || !mediaToDelete) return;
    try {
      await deleteMediaItem({
        studioId: activeStudio.id,
        galleryId: gallery.id,
        mediaId: mediaToDelete.id,
        storagePath: mediaToDelete.storagePath,
        sizeBytes: mediaToDelete.sizeBytes,
        fileName: mediaToDelete.fileName,
        fileType: mediaToDelete.fileType
      });
      setMediaToDelete(null);
      await loadMedia();
      onGalleryUpdated();
    } catch (err: any) {
      console.error('Error deleting media:', err);
      setActionError('Failed to delete media asset: ' + err.message);
    }
  };

  // Save gallery settings
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio || !editTitle.trim()) return;

    setIsSavingEdit(true);
    setEditError(null);
    try {
      await updateGallery(activeStudio.id, gallery.id, {
        title: editTitle.trim(),
        status: editStatus,
        privacy: editPrivacy,
        downloadAccess: editDownloadAccess
      });
      setEditModalOpen(false);
      onGalleryUpdated();
    } catch (err: any) {
      console.error('Error updating gallery:', err);
      setEditError(err.message || 'Failed to update gallery.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete entire gallery
  const handleConfirmDeleteGallery = async () => {
    if (!activeStudio) return;
    try {
      await deleteGallery(activeStudio.id, gallery.id, gallery.title, gallery.storageBytes || 0);
      setIsDeletingGallery(false);
      onGalleryDeleted();
    } catch (err: any) {
      console.error('Error deleting gallery:', err);
      setActionError('Failed to delete gallery: ' + err.message);
    }
  };

  const filteredMedia = mediaItems.filter(item => {
    if (mediaFilter === 'image' && item.fileType !== 'image') return false;
    if (mediaFilter === 'video' && item.fileType !== 'video') return false;

    if (mediaSelectionFilter === 'album') {
      return (photoProofMap.get(item.id)?.albumSelectionsCount || 0) > 0;
    }
    if (mediaSelectionFilter === 'favourites') {
      return (photoProofMap.get(item.id)?.favouritesCount || 0) > 0;
    }
    if (mediaSelectionFilter === 'comments') {
      return (photoProofMap.get(item.id)?.commentsCount || 0) > 0;
    }
    if (mediaSelectionFilter === 'unselected') {
      const p = photoProofMap.get(item.id);
      return !p || (p.albumSelectionsCount === 0 && p.favouritesCount === 0 && p.commentsCount === 0);
    }
    return true;
  });

  const photoCount = mediaItems.filter(m => m.fileType === 'image').length;
  const videoCount = mediaItems.filter(m => m.fileType === 'video').length;

  if (clientPreviewOpen && activeStudio) {
    return (
      <ClientGalleryView
        galleryId={currentGallery.id}
        studioId={activeStudio.id}
        shareToken={currentGallery.shareToken}
        onBackToStudio={() => {
          setClientPreviewOpen(false);
          loadMedia();
          loadProofing();
        }}
        isStudioPreview={true}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Proofing Action Feedback Toast / Banner */}
      {proofActionSuccess && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{proofActionSuccess}</span>
          </div>
          <button onClick={() => setProofActionSuccess(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {proofActionError && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{proofActionError}</span>
          </div>
          <button onClick={() => setProofActionError(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Back Button & Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Collections
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setProofingSettingsModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Configure Gallery Proofing Settings & Guidance"
          >
            <Sliders className="w-3.5 h-3.5" />
            Proofing Settings
          </button>
          <button
            onClick={() => setShareModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share Gallery
          </button>
          <button
            onClick={() => setClientPreviewOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            Client View
          </button>
          <button
            onClick={() => setEditModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Edit Settings
          </button>
          <button
            onClick={() => setIsDeletingGallery(true)}
            className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            title="Delete Gallery"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gallery Header Card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={
                gallery.status === 'published' ? 'emerald' :
                gallery.status === 'in_review' ? 'amber' :
                gallery.status === 'archived' ? 'zinc' : 'slate'
              }>
                {gallery.status.toUpperCase()}
              </Badge>

              <Badge variant={gallery.privacy === 'public' ? 'blue' : 'slate'}>
                {gallery.privacy === 'password_protected' ? 'Password Protected' : gallery.privacy.toUpperCase()}
              </Badge>

              {gallery.eventType && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">
                  {gallery.eventType}
                </span>
              )}

              {gallery.downloadAccess && (
                <Badge variant="gold">Hi-Res Downloads Enabled</Badge>
              )}

              {gallery.templateType && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 capitalize">
                  Template: {gallery.templateType.replace('_', ' ')}
                </span>
              )}

              {gallery.designSettings?.layout && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize">
                  Layout: {gallery.designSettings.layout.replace('_', ' ')}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {gallery.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400 pt-1">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                {gallery.clientName || 'General Client'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                Shoot: {gallery.shootDate || 'Unscheduled'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                Planned 10 GB Studio Allocation (Storage Not Connected)
              </span>
            </div>
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              multiple
              accept="image/*,video/mp4,video/quicktime,video/webm"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-xs flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Select Photos & Videos
            </button>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 dark:text-rose-400 flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION TABS: MEDIA ASSETS vs CLIENT PROOFING REVIEW */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <button
          onClick={() => setActiveViewTab('media')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeViewTab === 'media'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800/50'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Media Assets ({mediaItems.length})
        </button>

        <button
          onClick={() => {
            setActiveViewTab('proofing');
            loadProofing();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeViewTab === 'proofing'
              ? 'bg-amber-500 text-zinc-950 shadow-2xs font-bold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800/50'
          }`}
        >
          <Star className="w-4 h-4 fill-current" />
          Client Proofing Review ({proofingItems.length})
        </button>
      </div>

      {activeViewTab === 'media' && (
        <div className="space-y-6">
          {/* PHASE 3A PROMINENT DEVELOPMENT PREVIEW BANNER */}
          {!uploadNoticeDismissed && (
        <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 text-xs text-zinc-700 dark:text-zinc-300 relative space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Phase 3A: Development Preview — Media Upload & Proofing Pipeline
              </span>
              <Badge variant="amber" size="sm">Development Preview</Badge>
            </div>
            <button 
              onClick={() => setUploadNoticeDismissed(true)} 
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
            Real cloud object storage is not yet connected to preserve your free tier and avoid paid billing upgrades. 
            The upload interface below functions as a <strong>development preview</strong>: you can choose photos and videos, 
            inspect file details and previews, and test the client-side validation and progress simulation pipeline. 
            <strong>Note:</strong> Files tested in this preview are held temporarily in-browser and are not permanently saved to cloud object storage.
          </p>
        </div>
      )}

      {/* DRAG & DROP UPLOAD INTERFACE (DEVELOPMENT PREVIEW) */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed transition-all p-6 sm:p-8 text-center space-y-3 ${
          isDragOver 
            ? 'border-amber-500 bg-amber-500/10' 
            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
      >
        <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
          <Upload className="w-6 h-6 text-zinc-500 dark:text-zinc-400" />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-center gap-2">
            <span>Drag & drop media files, or</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-amber-600 dark:text-amber-400 hover:underline font-semibold"
            >
              browse from computer
            </button>
          </div>
          <p className="text-xs text-zinc-500 max-w-lg mx-auto">
            Photography (JPEG, PNG, WEBP, TIFF, RAW/DNG up to 100MB) & Cinema Reels (MP4, MOV, WEBM up to 250MB)
          </p>
          <div className="text-[11px] font-mono text-zinc-400 pt-0.5">
            Phase 3A Development Preview • Temporary In-Browser Validation
          </div>
        </div>

        {validationError && (
          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 dark:text-rose-400 inline-flex items-center gap-2 mt-2">
            <AlertCircle className="w-4 h-4" />
            <span>{validationError}</span>
          </div>
        )}
      </div>

      {/* STAGED MEDIA PREVIEW & PROGRESS UI */}
      {stagedQueue.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                Upload Preview Staging Queue ({stagedQueue.length} files selected)
              </div>
              <p className="text-[11px] text-zinc-400">
                Client-side previews, file inspection, and simulated transfer feedback
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={startAllSimulations}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Play className="w-3.5 h-3.5" />
                Test Upload Pipeline
              </button>
              <button
                onClick={clearStagedQueue}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Clear Queue
              </button>
            </div>
          </div>

          {/* Staged Items List */}
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {stagedQueue.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Left: Thumbnail & Details */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Thumbnail */}
                  <div 
                    onClick={() => { if (item.previewUrl) setLightboxPreviewItem(item); }}
                    className="w-12 h-12 rounded-lg bg-zinc-200 dark:bg-zinc-700 overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer relative group"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : item.fileType === 'video' ? (
                      <Video className="w-5 h-5 text-zinc-500" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-zinc-500" />
                    )}
                    {item.previewUrl && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* File Metadata */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate text-[12px]">
                      {item.fileName}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span className="font-mono font-medium text-zinc-600 dark:text-zinc-300">
                        {formatBytes(item.sizeBytes)}
                      </span>
                      <span>•</span>
                      <span className="uppercase font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300">
                        {item.file.type || item.fileType}
                      </span>
                      {item.dimensions && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[10px]">
                            {item.dimensions.width} × {item.dimensions.height} px
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle: Progress Bar & Status */}
                <div className="w-full sm:w-48 space-y-1.5 flex-shrink-0">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">
                      {item.status === 'completed' ? (
                        <span className="text-emerald-500 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Preview Verified
                        </span>
                      ) : item.status === 'uploading' ? (
                        <span className="text-amber-500 font-semibold animate-pulse">
                          Simulating {item.simulatedSpeedMBs.toFixed(1)} MB/s
                        </span>
                      ) : item.status === 'cancelled' ? (
                        <span className="text-zinc-400">Cancelled</span>
                      ) : (
                        <span className="text-zinc-400">Ready</span>
                      )}
                    </span>
                    <span className="font-mono text-zinc-500 font-medium">
                      {item.progressPercent.toFixed(0)}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        item.status === 'completed'
                          ? 'bg-emerald-500'
                          : item.status === 'uploading'
                          ? 'bg-amber-500'
                          : item.status === 'cancelled'
                          ? 'bg-zinc-400'
                          : 'bg-zinc-300 dark:bg-zinc-600'
                      }`}
                      style={{ width: `${item.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                  {item.status === 'pending' || item.status === 'cancelled' ? (
                    <button
                      onClick={() => startSimulation(item)}
                      className="p-1.5 text-amber-600 hover:text-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                      title="Test Upload"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  ) : item.status === 'uploading' ? (
                    <button
                      onClick={() => cancelSimulation(item.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg transition-colors"
                      title="Cancel Simulation"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => startSimulation(item)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition-colors"
                      title="Test Again"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => removeStagedItem(item.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Remove from Queue"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Staging Disclaimer */}
          <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50 text-[11px] text-zinc-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              Files in this queue are verified locally in-browser. Zero billing mode is active.
            </span>
            <Badge variant="zinc" size="sm">Not Persisted</Badge>
          </div>
        </div>
      )}

      {/* FILTER TABS & ASSET COUNT */}
      <div className="space-y-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setMediaFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mediaFilter === 'all'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              All Media ({mediaItems.length})
            </button>
            <button
              onClick={() => setMediaFilter('image')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                mediaFilter === 'image'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Photos ({photoCount})
            </button>
            <button
              onClick={() => setMediaFilter('video')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                mediaFilter === 'video'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Videos ({videoCount})
            </button>
          </div>

          <div className="text-xs text-zinc-400 font-mono">
            Cloud Storage: Not Connected
          </div>
        </div>

        {/* Client Proofing Selection State Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
          <span className="text-[11px] font-mono uppercase text-zinc-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Proofing:
          </span>
          <button
            onClick={() => setMediaSelectionFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              mediaSelectionFilter === 'all'
                ? 'bg-amber-500 text-zinc-950 font-bold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/60'
            }`}
          >
            All States ({mediaItems.length})
          </button>
          <button
            onClick={() => setMediaSelectionFilter('album')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
              mediaSelectionFilter === 'album'
                ? 'bg-amber-500 text-zinc-950 font-bold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/60'
            }`}
          >
            <Star className="w-3 h-3 fill-current text-amber-500" />
            Album Shortlist ({albumSelectedPhotosCount})
          </button>
          <button
            onClick={() => setMediaSelectionFilter('favourites')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
              mediaSelectionFilter === 'favourites'
                ? 'bg-rose-500 text-white font-bold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/60'
            }`}
          >
            <Heart className="w-3 h-3 fill-current text-rose-500" />
            Favourites ({favouritedPhotosCount})
          </button>
          <button
            onClick={() => setMediaSelectionFilter('comments')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
              mediaSelectionFilter === 'comments'
                ? 'bg-blue-600 text-white font-bold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/60'
            }`}
          >
            <MessageSquare className="w-3 h-3 text-blue-500" />
            With Notes ({commentedPhotosCount})
          </button>
          <button
            onClick={() => setMediaSelectionFilter('unselected')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              mediaSelectionFilter === 'unselected'
                ? 'bg-zinc-800 text-white font-bold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800/60'
            }`}
          >
            Unselected ({unselectedPhotosCount})
          </button>
        </div>
      </div>

      {/* PERMANENT GALLERY MEDIA GRID / EMPTY STATE */}
      {loadingMedia ? (
        <div className="py-20 text-center text-xs text-zinc-400">Loading gallery media records...</div>
      ) : filteredMedia.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-zinc-400" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {mediaSelectionFilter !== 'all' 
                ? `No media assets match "${mediaSelectionFilter.replace('_', ' ')}" filter` 
                : 'No Permanent Media Assets in this Collection'}
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {mediaSelectionFilter !== 'all'
                ? 'Try resetting the proofing filter to view all photos or browse client submissions.'
                : 'Gallery metadata is saved in Cloud Firestore. Real photo and video files will be stored once cloud object storage is connected.'}
            </p>
          </div>
          {mediaSelectionFilter !== 'all' ? (
            <button
              onClick={() => setMediaSelectionFilter('all')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors shadow-xs"
            >
              Reset Proofing Filter
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" /> Test Media Upload Interface
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {filteredMedia.map(item => {
            const proof = photoProofMap.get(item.id);
            const isAlbumSelected = (proof?.albumSelectionsCount || 0) > 0;
            const isFavourited = (proof?.favouritesCount || 0) > 0;
            const hasComments = (proof?.commentsCount || 0) > 0;

            return (
              <div
                key={item.id}
                className={`group relative rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs transition-all flex flex-col ${
                  isAlbumSelected
                    ? 'border-amber-400 dark:border-amber-500/60 ring-1 ring-amber-400/30'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Media Preview Box */}
                <div 
                  onClick={() => setLightboxItem(item)}
                  className="relative aspect-square bg-zinc-100 dark:bg-zinc-800 overflow-hidden cursor-pointer"
                >
                  {item.fileType === 'image' ? (
                    <img
                      src={item.downloadUrl}
                      alt={item.fileName}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-300">
                      <Video className="w-8 h-8 text-amber-400 mb-1" />
                      <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">Video</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="p-2 rounded-full bg-black/60 text-white backdrop-blur-xs">
                      <Maximize2 className="w-4 h-4" />
                    </span>
                  </div>

                  <div className="absolute top-2 left-2 flex items-center gap-1 z-10 pointer-events-none">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-black/60 text-white backdrop-blur-xs">
                      {item.fileType}
                    </span>
                  </div>

                  {/* Proofing Selection Badges distinguishing selected photos */}
                  {proof && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-10 pointer-events-none">
                      {isAlbumSelected && (
                        <span 
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-zinc-950 flex items-center gap-0.5 shadow-sm"
                          title={`${proof.albumSelectionsCount} client(s) selected for album`}
                        >
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span>{proof.albumSelectionsCount}</span>
                        </span>
                      )}
                      {isFavourited && (
                        <span 
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-500 text-white flex items-center gap-0.5 shadow-sm"
                          title={`${proof.favouritesCount} client(s) marked favourite`}
                        >
                          <Heart className="w-2.5 h-2.5 fill-current" />
                          <span>{proof.favouritesCount}</span>
                        </span>
                      )}
                      {hasComments && (
                        <span 
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-500 text-white flex items-center gap-0.5 shadow-sm"
                          title={`${proof.commentsCount} feedback comment(s)`}
                        >
                          <MessageSquare className="w-2.5 h-2.5" />
                          <span>{proof.commentsCount}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

              {/* Item Info & Quick Actions */}
              <div className="p-2.5 flex items-center justify-between text-xs gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-[11px]" title={item.fileName}>
                    {item.fileName}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {formatBytes(item.sizeBytes)}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={item.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={item.fileName}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded"
                    title="Download Original"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => setMediaToDelete(item)}
                    className="p-1 text-zinc-400 hover:text-rose-500 rounded"
                    title="Delete Media"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
        </div>
      )}

      {/* CLIENT PROOFING REVIEW TAB */}
      {activeViewTab === 'proofing' && (
        <div className="space-y-6">
          {/* Proofing Summary Metrics & Workflow Controls */}
          {(() => {
            const summary = computeProofingSummary(proofingItems);
            const activeSettings = getEffectiveProofingSettings(currentGallery);

            // Filter proofing items according to proofFilter and selectedClientFilter
            const filteredProofItems = proofingItems.filter(item => {
              if (selectedClientFilter !== 'all' && item.clientEmail.toLowerCase() !== selectedClientFilter.toLowerCase()) {
                return false;
              }
              if (proofFilter === 'album') return item.isApprovedForAlbum && !item.isSubmissionRecord;
              if (proofFilter === 'favourites') return item.isFavourite && !item.isSubmissionRecord;
              if (proofFilter === 'comments') return item.comment && item.comment.trim().length > 0 && !item.isSubmissionRecord;
              if (proofFilter === 'submissions') return item.isSubmissionRecord;
              return true;
            });

            return (
              <div className="space-y-6">
                {/* Proofing Status & Workflow Actions Banner */}
                <div className="p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <Sliders className="w-4 h-4 text-amber-500" />
                          Gallery Proofing Workflow
                        </span>
                        <Badge variant={activeSettings.enabled ? 'emerald' : 'zinc'} size="sm">
                          {activeSettings.enabled ? 'Proofing Active' : 'Proofing Paused'}
                        </Badge>
                        <Badge 
                          variant={
                            activeSettings.reviewStatus === 'approved' ? 'emerald' :
                            activeSettings.reviewStatus === 'submitted' ? 'amber' :
                            activeSettings.reviewStatus === 'in_progress' ? 'blue' : 'zinc'
                          } 
                          size="sm"
                        >
                          Status: {activeSettings.reviewStatus.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Control client selection permissions, review statuses, album quotas, and instructions for this collection.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setProofingSettingsModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5 shadow-2xs"
                      >
                        <Sliders className="w-3.5 h-3.5 text-amber-500" />
                        Configure Rules
                      </button>

                      {/* Quick Review Status Actions */}
                      {activeSettings.reviewStatus !== 'in_progress' && (
                        <button
                          onClick={() => handleUpdateReviewStatus('in_progress')}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                          title="Mark review as in progress"
                        >
                          Mark In Progress
                        </button>
                      )}

                      {activeSettings.reviewStatus !== 'approved' && (
                        <button
                          onClick={() => handleUpdateReviewStatus('approved')}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 shadow-2xs"
                          title="Approve client selections for album design production"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve Selections
                        </button>
                      )}

                      {activeSettings.reviewStatus === 'approved' && (
                        <button
                          onClick={() => handleUpdateReviewStatus('pending')}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 transition-colors"
                          title="Reopen review"
                        >
                          Reopen Review
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Guidance Summary if set */}
                  {(activeSettings.instructions || activeSettings.deadline || activeSettings.maxAlbumSelections) && (
                    <div className="p-3.5 rounded-xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        {activeSettings.instructions && (
                          <div className="text-zinc-700 dark:text-zinc-300">
                            <strong className="text-amber-700 dark:text-amber-400">Client Instructions:</strong> "{activeSettings.instructions}"
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                          {activeSettings.maxAlbumSelections && (
                            <span>Quota: Max {activeSettings.maxAlbumSelections} album photos</span>
                          )}
                          {activeSettings.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-500" />
                              Deadline: {new Date(activeSettings.deadline).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Proofing Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1 shadow-2xs">
                    <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />
                      Client Favourites
                    </div>
                    <div className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
                      {summary.totalFavourites}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1 shadow-2xs">
                    <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                      Album Selections
                    </div>
                    <div className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
                      {summary.totalAlbumSelections}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1 shadow-2xs">
                    <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                      Feedback Notes
                    </div>
                    <div className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
                      {summary.totalComments}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1 shadow-2xs">
                    <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-500" />
                      Client Reviewers
                    </div>
                    <div className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
                      {summary.uniqueClients.length}
                    </div>
                  </div>
                </div>

                {/* Submissions Filter Toolbar */}
                <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-mono uppercase text-zinc-400 mr-1 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Filter Submissions:
                    </span>
                    <button
                      onClick={() => setProofFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        proofFilter === 'all'
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      All Records ({proofingItems.length})
                    </button>
                    <button
                      onClick={() => setProofFilter('album')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                        proofFilter === 'album'
                          ? 'bg-amber-500 text-zinc-950 font-bold shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      <Star className="w-3 h-3 fill-current text-amber-500" />
                      Album ({summary.totalAlbumSelections})
                    </button>
                    <button
                      onClick={() => setProofFilter('favourites')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                        proofFilter === 'favourites'
                          ? 'bg-rose-500 text-white font-bold shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      <Heart className="w-3 h-3 fill-current text-rose-500" />
                      Favourites ({summary.totalFavourites})
                    </button>
                    <button
                      onClick={() => setProofFilter('comments')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                        proofFilter === 'comments'
                          ? 'bg-blue-600 text-white font-bold shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3 text-blue-500" />
                      Notes ({summary.totalComments})
                    </button>
                    <button
                      onClick={() => setProofFilter('submissions')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                        proofFilter === 'submissions'
                          ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Submissions ({proofingItems.filter(p => p.isSubmissionRecord).length})
                    </button>
                  </div>

                  {/* Client Filter Dropdown */}
                  {summary.uniqueClients.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400">Client:</span>
                      <select
                        value={selectedClientFilter}
                        onChange={(e) => setSelectedClientFilter(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-hidden"
                      >
                        <option value="all">All Clients ({summary.uniqueClients.length})</option>
                        {summary.uniqueClients.map(email => (
                          <option key={email} value={email}>{email}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Proofing Items List or Honest Empty State */}
                {loadingProofing ? (
                  <div className="py-16 text-center text-xs text-zinc-400">Loading proofing records...</div>
                ) : filteredProofItems.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                      <Star className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {proofingItems.length === 0 
                          ? 'No Client Selections or Comments Yet'
                          : `No records match current filter "${proofFilter}"`}
                      </h3>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {proofingItems.length === 0
                          ? 'Share this gallery with your clients using the Share Gallery link. As clients browse photos, tap favourites, select photos for album approval, or leave editing comments, their responses will appear here in real time.'
                          : 'Try changing your proofing filter to view other selections or client feedback.'}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => setShareModalOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share Gallery with Client
                      </button>
                      <button
                        onClick={() => setClientPreviewOpen(true)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Test Client Experience
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                      <span>Client Proofing Records ({filteredProofItems.length})</span>
                      <span className="text-[11px] text-zinc-400 font-mono font-normal">
                        Persisted in Firestore subcollection /proofing
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {filteredProofItems.map(item => {
                        const matchingMedia = mediaItems.find(m => m.id === item.mediaId);

                        return (
                          <div
                            key={item.id}
                            className={`p-4 rounded-xl border bg-white dark:bg-zinc-900 space-y-3 shadow-2xs transition-all ${
                              item.isSubmissionRecord
                                ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20'
                                : item.isApprovedForAlbum
                                ? 'border-amber-400/60 dark:border-amber-500/40 ring-1 ring-amber-400/20'
                                : 'border-zinc-200 dark:border-zinc-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Photo thumbnail preview or unavailable placeholder */}
                                {!item.isSubmissionRecord && (
                                  <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                                    {matchingMedia?.downloadUrl ? (
                                      <img
                                        src={matchingMedia.downloadUrl}
                                        alt={matchingMedia.fileName}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="text-center p-1">
                                        <Camera className="w-4 h-4 text-zinc-400 mx-auto" />
                                        <span className="text-[8px] font-mono text-zinc-500 block leading-tight">No file</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 truncate">
                                    <User className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                                    <span className="truncate">{item.clientName || 'Client'}</span>
                                  </div>
                                  <div className="text-[11px] text-zinc-500 font-mono truncate">
                                    {item.clientEmail}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                                {item.isSubmissionRecord && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <CheckCircle2 className="w-3 h-3" /> Submitted Review
                                  </span>
                                )}
                                {item.isFavourite && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    <Heart className="w-3 h-3 fill-current" /> Favourite
                                  </span>
                                )}
                                {item.isApprovedForAlbum && !item.isSubmissionRecord && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                    <Star className="w-3 h-3 fill-current" /> Album Approved
                                  </span>
                                )}

                                {/* Remove Selection button for authorized studio members */}
                                <button
                                  onClick={() => setProofToDelete(item)}
                                  className="p-1 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors ml-1"
                                  title="Remove this client selection"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Associated Media Filename and ID */}
                            {!item.isSubmissionRecord && (
                              <div className="text-xs text-zinc-500 font-mono bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded-lg flex items-center justify-between gap-2">
                                <span className="truncate text-zinc-800 dark:text-zinc-200 font-medium">
                                  {matchingMedia?.fileName || item.mediaId}
                                </span>
                                <span className="text-[10px] text-zinc-400 flex-shrink-0">
                                  ID: {item.mediaId.substring(0, 14)}...
                                </span>
                              </div>
                            )}

                            {/* Client Note / Comment */}
                            {item.comment && item.comment.trim().length > 0 && (
                              <div className="p-3 rounded-xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 text-xs space-y-1">
                                <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 text-[11px]">
                                  <MessageSquare className="w-3 h-3" /> Client Note:
                                </div>
                                <p className="text-zinc-700 dark:text-zinc-300 italic">
                                  "{item.comment}"
                                </p>
                              </div>
                            )}

                            {item.submissionNotes && (
                              <div className="p-3 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs space-y-1">
                                <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 text-[11px]">
                                  <CheckCircle2 className="w-3 h-3" /> Submission Notes:
                                </div>
                                <p className="text-zinc-700 dark:text-zinc-300">
                                  "{item.submissionNotes}"
                                </p>
                              </div>
                            )}

                            <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                              <span>Recorded: {new Date(item.updatedAt || item.createdAt).toLocaleString()}</span>
                              <span className="font-mono">Doc: {item.id}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* LIGHTBOX FOR PERSISTED MEDIA */}
      {lightboxItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="min-w-0">
                <div className="font-semibold text-white truncate text-sm">
                  {lightboxItem.fileName}
                </div>
                <div className="text-xs text-zinc-400 font-mono mt-0.5">
                  {formatBytes(lightboxItem.sizeBytes)} • Uploaded {new Date(lightboxItem.uploadedAt).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={lightboxItem.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={lightboxItem.fileName}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button
                  onClick={() => setLightboxItem(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center max-h-[70vh] overflow-hidden rounded-xl bg-black">
              {lightboxItem.fileType === 'image' ? (
                <img
                  src={lightboxItem.downloadUrl}
                  alt={lightboxItem.fileName}
                  className="max-h-[68vh] max-w-full object-contain"
                />
              ) : (
                <video
                  src={lightboxItem.downloadUrl}
                  controls
                  autoPlay
                  className="max-h-[68vh] max-w-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR STAGED PREVIEW */}
      {lightboxPreviewItem && lightboxPreviewItem.previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="min-w-0">
                <div className="font-semibold text-white truncate text-sm flex items-center gap-2">
                  <span>{lightboxPreviewItem.fileName}</span>
                  <Badge variant="amber" size="sm">Local In-Browser Preview</Badge>
                </div>
                <div className="text-xs text-zinc-400 font-mono mt-0.5">
                  {formatBytes(lightboxPreviewItem.sizeBytes)} • {lightboxPreviewItem.dimensions ? `${lightboxPreviewItem.dimensions.width}×${lightboxPreviewItem.dimensions.height}px` : 'Image'}
                </div>
              </div>

              <button
                onClick={() => setLightboxPreviewItem(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center max-h-[70vh] overflow-hidden rounded-xl bg-black">
              <img
                src={lightboxPreviewItem.previewUrl}
                alt={lightboxPreviewItem.fileName}
                className="max-h-[68vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* EDIT GALLERY SETTINGS MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Edit Gallery Settings
              </h2>
              <button 
                onClick={() => setEditModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Collection Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="published">Published</option>
                    <option value="in_review">In Review</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Privacy
                  </label>
                  <select
                    value={editPrivacy}
                    onChange={(e) => setEditPrivacy(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="password_protected">Password Protected</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editDl"
                  checked={editDownloadAccess}
                  onChange={(e) => setEditDownloadAccess(e.target.checked)}
                  className="rounded text-amber-500"
                />
                <label htmlFor="editDl" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Allow client original high-resolution downloads
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL FOR MEDIA ITEM */}
      {mediaToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Delete Media Asset
              </h3>
              <button 
                onClick={() => setMediaToDelete(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-zinc-900 dark:text-zinc-100">"{mediaToDelete.fileName}"</strong>? 
              This will remove its record from your studio collection.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setMediaToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteMedia}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                Delete Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL FOR ENTIRE GALLERY */}
      {isDeletingGallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Delete Gallery Collection
              </h3>
              <button 
                onClick={() => setIsDeletingGallery(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-zinc-900 dark:text-zinc-100">"{gallery.title}"</strong>? 
              This will delete this gallery collection metadata from your studio.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setIsDeletingGallery(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteGallery}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                Delete Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE GALLERY MODAL */}
      {shareModalOpen && activeStudio && (
        <ShareGalleryModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          gallery={currentGallery}
          studioSlug={activeStudio.slug}
          onGalleryUpdated={(updates) => {
            onGalleryUpdated();
          }}
          onOpenClientPreview={() => {
            setShareModalOpen(false);
            setClientPreviewOpen(true);
          }}
        />
      )}

      {/* CONFIGURE PROOFING SETTINGS MODAL */}
      {proofingSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                    Gallery Proofing Settings
                  </h3>
                  <p className="text-xs text-zinc-500">Configure client review permissions & guidance</p>
                </div>
              </div>
              <button 
                onClick={() => setProofingSettingsModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {proofingSettingsSuccess && (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Proofing settings successfully saved in Firestore!</span>
              </div>
            )}

            {proofingSettingsError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{proofingSettingsError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProofingSettings} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Proofing Master Toggle */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Enable Client Proofing
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Allow clients to mark favourites, select album photos, and post feedback
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftProofingSettings.enabled}
                  onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </div>

              {/* Feature Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between cursor-pointer">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />
                    Favourites
                  </div>
                  <input
                    type="checkbox"
                    checked={draftProofingSettings.allowFavourites}
                    onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, allowFavourites: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>

                <label className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between cursor-pointer">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                    Album Picks
                  </div>
                  <input
                    type="checkbox"
                    checked={draftProofingSettings.allowAlbumSelection}
                    onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, allowAlbumSelection: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>

                <label className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between cursor-pointer">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                    Comments
                  </div>
                  <input
                    type="checkbox"
                    checked={draftProofingSettings.allowComments}
                    onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, allowComments: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
              </div>

              {/* Limits and Review Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Album Selection Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 40 (leave blank for unlimited)"
                    value={draftProofingSettings.maxAlbumSelections || ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                      setDraftProofingSettings(prev => ({ ...prev, maxAlbumSelections: val }));
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Maximum photos client can select</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Workflow Status
                  </label>
                  <select
                    value={draftProofingSettings.reviewStatus}
                    onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, reviewStatus: e.target.value as ProofingReviewStatus }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="pending">Pending Client Review</option>
                    <option value="in_progress">In Progress by Client</option>
                    <option value="submitted">Submitted by Client</option>
                    <option value="approved">Approved for Album Production</option>
                  </select>
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Current production workflow stage</span>
                </div>
              </div>

              {/* Deadline & Guidance */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Client Selection Deadline
                </label>
                <input
                  type="date"
                  value={draftProofingSettings.deadline ? draftProofingSettings.deadline.split('T')[0] : ''}
                  onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, deadline: e.target.value || undefined }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Client Guidance & Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Please select your favorite 40 photos for your handcrafted linen album spread. Click the star on each photo to add to your album choices."
                  value={draftProofingSettings.instructions || ''}
                  onChange={(e) => setDraftProofingSettings(prev => ({ ...prev, instructions: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 resize-none"
                />
                <span className="text-[10px] text-zinc-400 mt-0.5 block">Displayed prominently to clients at the top of their gallery view</span>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProofingSettingsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProofingSettings}
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
                >
                  {isSavingProofingSettings ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving Settings...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Proofing Rules
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVE CLIENT PROOF SELECTION CONFIRMATION MODAL */}
      {proofToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Remove Client Selection
                </h3>
              </div>
              <button 
                onClick={() => setProofToDelete(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                Are you sure you want to remove the client selection record for:
              </p>
              <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 space-y-1">
                <div>Client: <strong>{proofToDelete.clientName} ({proofToDelete.clientEmail})</strong></div>
                <div>Media: <strong>{mediaItems.find(m => m.id === proofToDelete.mediaId)?.fileName || proofToDelete.mediaId}</strong></div>
                {proofToDelete.comment && <div>Note: <em>"{proofToDelete.comment}"</em></div>}
              </div>
              <p className="text-[11px] text-zinc-500">
                This action will delete this specific proof record from Firestore under the studio tenant boundary.
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setProofToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteProof}
                disabled={isDeletingProof}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs flex items-center gap-1.5"
              >
                {isDeletingProof ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Remove Selection'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
