import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Images, 
  Lock, 
  Globe, 
  Download, 
  Trash2, 
  Calendar, 
  Eye, 
  Share2,
  X, 
  ArrowUpDown,
  Tag,
  FileText,
  Edit2,
  ExternalLink,
  Camera,
  AlertCircle,
  Check
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getGalleries, 
  createGallery, 
  updateGallery,
  deleteGallery, 
  getClients, 
  formatBytes 
} from '../../services/studioService';
import { Gallery, Client, GalleryStatus, GalleryPrivacy, GalleryTemplateCategory, GalleryLayoutType } from '../../types';
import { Badge } from '../common/Badge';
import { GalleryDetailView } from './GalleryDetailView';
import { ShareGalleryModal } from '../modals/ShareGalleryModal';
import { ClientGalleryView } from '../client/ClientGalleryView';

const TEMPLATE_PRESETS: { category: GalleryTemplateCategory; label: string; defaultLayout: GalleryLayoutType; desc: string }[] = [
  { category: 'wedding', label: 'Wedding & Heirloom', defaultLayout: 'masonry', desc: 'Grand romantic serif flow' },
  { category: 'pre_wedding', label: 'Pre-Wedding Story', defaultLayout: 'grid', desc: 'Couples narrative & split hero' },
  { category: 'portrait', label: 'Portrait Editorial', defaultLayout: 'large_image', desc: 'High-fashion full spreads' },
  { category: 'events', label: 'Private Gala & Events', defaultLayout: 'grid', desc: 'High capacity 4-column grid' },
  { category: 'portfolio', label: 'Fine Art Portfolio', defaultLayout: 'masonry', desc: 'Exhibition whitespace & linen' },
];

// Curated luxury photography sample covers
const PRESET_COVERS = [
  { label: 'Fine Art Wedding', url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Editorial Portrait', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Commercial Fashion', url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Cinematic Noir', url: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Golden Hour Couple', url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Architectural Minimal', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80' },
];

const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding & Elopement' },
  { value: 'portrait', label: 'Portrait & Headshot' },
  { value: 'commercial', label: 'Commercial & Brand' },
  { value: 'editorial', label: 'Fashion & Editorial' },
  { value: 'event', label: 'Private Event & Gala' },
  { value: 'family', label: 'Family & Newborn' },
  { value: 'other', label: 'Other Project' },
];

export const GalleriesModule: React.FC = () => {
  const { activeStudio } = useAuth();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | GalleryStatus>('all');
  const [sortBy, setSortBy] = useState<'shootDate_desc' | 'shootDate_asc' | 'createdAt_desc' | 'title_asc' | 'status'>('createdAt_desc');
  
  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editGalleryModal, setEditGalleryModal] = useState<Gallery | null>(null);
  const [galleryToDelete, setGalleryToDelete] = useState<Gallery | null>(null);
  const [previewGallery, setPreviewGallery] = useState<Gallery | null>(null);
  const [sharingGallery, setSharingGallery] = useState<Gallery | null>(null);
  const [selectedGalleryForDetail, setSelectedGalleryForDetail] = useState<Gallery | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventType: 'wedding',
    templateType: 'wedding' as GalleryTemplateCategory,
    layout: 'masonry' as GalleryLayoutType,
    clientId: '',
    shootDate: new Date().toISOString().split('T')[0],
    coverImageUrl: PRESET_COVERS[0].url,
    customCoverUrl: '',
    status: 'published' as GalleryStatus,
    privacy: 'password_protected' as GalleryPrivacy,
    downloadAccess: true,
  });

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    eventType: 'wedding',
    templateType: 'wedding' as GalleryTemplateCategory,
    layout: 'grid' as GalleryLayoutType,
    clientId: '',
    shootDate: '',
    coverImageUrl: '',
    status: 'published' as GalleryStatus,
    privacy: 'password_protected' as GalleryPrivacy,
    downloadAccess: true,
  });

  const loadData = async () => {
    if (!activeStudio) return;
    setLoading(true);
    try {
      const [gRes, cRes] = await Promise.allSettled([
        getGalleries(activeStudio.id),
        getClients(activeStudio.id),
      ]);
      if (gRes.status === 'fulfilled' && gRes.value) setGalleries(gRes.value);
      if (cRes.status === 'fulfilled' && cRes.value) setClients(cRes.value);
    } catch (err: any) {
      console.error('Error fetching galleries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStudio]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio) {
      setFormError('Active studio session is missing. Please select or register a studio.');
      return;
    }

    const title = formData.title.trim();
    if (!title) {
      setFormError('Collection title is required.');
      return;
    }

    if (title.length < 2) {
      setFormError('Collection title must be at least 2 characters.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const selectedClient = formData.clientId ? clients.find(c => c.id === formData.clientId) : undefined;
      const chosenCover = formData.customCoverUrl.trim() || formData.coverImageUrl;

      // Construct verified payload with required fields
      const galleryPayload: Omit<Gallery, 'id' | 'studioId' | 'createdAt' | 'updatedAt'> = {
        title,
        eventType: formData.eventType || 'wedding',
        coverImageUrl: chosenCover || PRESET_COVERS[0].url,
        status: formData.status,
        privacy: formData.privacy,
        downloadAccess: formData.downloadAccess,
        photoCount: 0,
        videoCount: 0,
        storageBytes: 0,
      };

      // Optional fields: only include if provided with non-empty values (never pass undefined)
      if (formData.description.trim()) {
        galleryPayload.description = formData.description.trim();
      }
      if (formData.clientId.trim()) {
        galleryPayload.clientId = formData.clientId.trim();
        if (selectedClient?.fullName) {
          galleryPayload.clientName = selectedClient.fullName;
        }
      }
      if (formData.shootDate) {
        galleryPayload.shootDate = formData.shootDate;
      }
      if (formData.templateType) {
        galleryPayload.templateType = formData.templateType;
        galleryPayload.templateId = `template_${formData.templateType}`;
        galleryPayload.designSettings = {
          templateId: `template_${formData.templateType}`,
          templateType: formData.templateType,
          layout: formData.layout,
          columns: 3,
          spacing: 'normal',
        };
      }

      const created = await createGallery(activeStudio.id, galleryPayload);

      // Confirm success state
      setFormSuccess(`Gallery "${created.title}" successfully created and saved to Firestore!`);
      setBannerNotice({
        type: 'success',
        message: `Gallery "${created.title}" was saved successfully.`,
      });

      // Reload data to reflect new persisted gallery in list
      await loadData();

      // Close modal and reset form values ONLY after Firestore confirms save
      setTimeout(() => {
        setCreateModalOpen(false);
        setFormSuccess(null);
        setFormData({
          title: '',
          description: '',
          eventType: 'wedding',
          templateType: 'wedding',
          layout: 'masonry',
          clientId: '',
          shootDate: new Date().toISOString().split('T')[0],
          coverImageUrl: PRESET_COVERS[0].url,
          customCoverUrl: '',
          status: 'published',
          privacy: 'password_protected',
          downloadAccess: true,
        });
      }, 750);
    } catch (err: any) {
      console.error('Error creating gallery:', err);
      // Keep form inputs intact on failure! Provide user-friendly message:
      const msg = err?.message || '';
      if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
        setFormError('Permission denied: You do not have authorization to create galleries in this studio.');
      } else if (msg.includes('network') || msg.includes('unavailable')) {
        setFormError('Network connection issue. Please check your internet connection and retry.');
      } else if (msg.includes('Unsupported field value: undefined') || msg.includes('Function setDoc() called with invalid data')) {
        setFormError('Invalid form field detected. All values must be valid.');
      } else {
        setFormError(msg || 'Unable to save gallery to Firestore. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (gallery: Gallery) => {
    setEditError(null);
    setEditSuccess(null);
    setEditFormData({
      title: gallery.title,
      description: gallery.description || '',
      eventType: gallery.eventType || 'wedding',
      templateType: (gallery.templateType || 'wedding') as GalleryTemplateCategory,
      layout: (gallery.designSettings?.layout || 'grid') as GalleryLayoutType,
      clientId: gallery.clientId || '',
      shootDate: gallery.shootDate || '',
      coverImageUrl: gallery.coverImageUrl || PRESET_COVERS[0].url,
      status: gallery.status,
      privacy: gallery.privacy,
      downloadAccess: gallery.downloadAccess,
    });
    setEditGalleryModal(gallery);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio || !editGalleryModal) return;

    const title = editFormData.title.trim();
    if (!title) {
      setEditError('Collection title is required.');
      return;
    }

    setIsSubmitting(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      const selectedClient = editFormData.clientId ? clients.find(c => c.id === editFormData.clientId) : undefined;

      const updateData: Partial<Gallery> = {
        title,
        eventType: editFormData.eventType,
        templateType: editFormData.templateType,
        templateId: `template_${editFormData.templateType}`,
        designSettings: {
          ...(editGalleryModal.designSettings || { columns: 3, spacing: 'normal' }),
          templateId: `template_${editFormData.templateType}`,
          templateType: editFormData.templateType,
          layout: editFormData.layout,
        },
        status: editFormData.status,
        privacy: editFormData.privacy,
        downloadAccess: editFormData.downloadAccess,
      };

      if (editFormData.description.trim()) {
        updateData.description = editFormData.description.trim();
      }
      if (editFormData.clientId.trim()) {
        updateData.clientId = editFormData.clientId.trim();
        if (selectedClient?.fullName) {
          updateData.clientName = selectedClient.fullName;
        }
      }
      if (editFormData.shootDate) {
        updateData.shootDate = editFormData.shootDate;
      }
      if (editFormData.coverImageUrl.trim()) {
        updateData.coverImageUrl = editFormData.coverImageUrl.trim();
      }

      await updateGallery(activeStudio.id, editGalleryModal.id, updateData);

      setEditSuccess('Gallery metadata updated successfully!');
      setBannerNotice({
        type: 'success',
        message: `Gallery "${title}" was updated successfully.`,
      });

      await loadData();

      setTimeout(() => {
        setEditGalleryModal(null);
        setEditSuccess(null);
      }, 700);
    } catch (err: any) {
      console.error('Error updating gallery:', err);
      const msg = err?.message || '';
      if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
        setEditError('Permission denied: You do not have authorization to update this gallery.');
      } else {
        setEditError(msg || 'Failed to update gallery.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!activeStudio || !galleryToDelete) return;
    setDeleteError(null);
    try {
      await deleteGallery(activeStudio.id, galleryToDelete.id, galleryToDelete.title, galleryToDelete.storageBytes || 0);
      setGalleryToDelete(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting gallery:', err);
      setDeleteError(err.message || 'Failed to delete gallery.');
    }
  };

  // Filter & Sort
  const filteredAndSortedGalleries = galleries
    .filter((g) => {
      const q = search.toLowerCase();
      const matchesSearch = 
        g.title.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.clientName && g.clientName.toLowerCase().includes(q)) ||
        (g.eventType && g.eventType.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'all' || g.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'shootDate_desc') {
        return (b.shootDate || '').localeCompare(a.shootDate || '');
      }
      if (sortBy === 'shootDate_asc') {
        return (a.shootDate || '').localeCompare(b.shootDate || '');
      }
      if (sortBy === 'createdAt_desc') {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      }
      if (sortBy === 'title_asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });

  // If previewing client gallery experience directly
  if (previewGallery && activeStudio) {
    return (
      <ClientGalleryView
        galleryId={previewGallery.id}
        studioId={activeStudio.id}
        shareToken={previewGallery.shareToken}
        onBackToStudio={() => {
          setPreviewGallery(null);
          loadData();
        }}
        isStudioPreview={true}
      />
    );
  }

  // If a gallery detail view is open
  if (selectedGalleryForDetail) {
    return (
      <GalleryDetailView
        gallery={selectedGalleryForDetail}
        onBack={() => {
          setSelectedGalleryForDetail(null);
          loadData();
        }}
        onGalleryUpdated={() => loadData()}
        onGalleryDeleted={() => {
          setSelectedGalleryForDetail(null);
          loadData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Notification Banner */}
      {bannerNotice && (
        <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
          bannerNotice.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-500'
        }`}>
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="font-medium">{bannerNotice.message}</span>
          </div>
          <button 
            onClick={() => setBannerNotice(null)}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 font-mono">
              Phase 3A
            </span>
            <Badge variant="zinc">Firestore Persisted</Badge>
          </div>
          <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
            Gallery Collections
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Create and organize photography collections for {activeStudio?.name}
          </p>
        </div>

        <button
          onClick={() => { setFormError(null); setCreateModalOpen(true); }}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-xs flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create New Gallery
        </button>
      </div>

      {/* Filter, Search & Sort Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'published', 'in_review', 'draft', 'archived'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                statusFilter === tab
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {tab === 'in_review' ? 'In Review' : tab}
            </button>
          ))}
        </div>

        {/* Search & Sort Dropdowns */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search galleries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 hidden sm:block" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-hidden"
            >
              <option value="createdAt_desc">Newest Created</option>
              <option value="shootDate_desc">Newest Shoot Date</option>
              <option value="shootDate_asc">Oldest Shoot Date</option>
              <option value="title_asc">Title (A-Z)</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Gallery Cards Grid */}
      {loading ? (
        <div className="py-20 text-center text-xs text-zinc-400">Loading studio collections from Firestore...</div>
      ) : filteredAndSortedGalleries.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
            <Images className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {search ? 'No matching collections found' : 'No galleries created in this studio yet'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Create your first client gallery collection with title, event type, shoot date, and custom cover photography.
            </p>
          </div>
          <button
            onClick={() => { setFormError(null); setCreateModalOpen(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Create First Gallery
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAndSortedGalleries.map((gallery) => (
            <div
              key={gallery.id}
              className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-2xs flex flex-col"
            >
              {/* Cover Image & Badges */}
              <div 
                onClick={() => setSelectedGalleryForDetail(gallery)}
                className="relative aspect-16/10 bg-zinc-100 dark:bg-zinc-800 overflow-hidden cursor-pointer"
              >
                {gallery.coverImageUrl ? (
                  <img
                    src={gallery.coverImageUrl}
                    alt={gallery.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Images className="w-8 h-8" />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-90" />

                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <Badge variant={
                    gallery.status === 'published' ? 'emerald' :
                    gallery.status === 'in_review' ? 'amber' :
                    gallery.status === 'archived' ? 'zinc' : 'slate'
                  }>
                    {gallery.status.toUpperCase()}
                  </Badge>

                  {gallery.eventType && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/60 text-white backdrop-blur-xs capitalize">
                      {gallery.eventType}
                    </span>
                  )}

                  {gallery.privacy === 'password_protected' && (
                    <span className="p-1 rounded-full bg-black/50 text-white backdrop-blur-xs" title="Password Protected">
                      <Lock className="w-3 h-3" />
                    </span>
                  )}
                  {gallery.privacy === 'public' && (
                    <span className="p-1 rounded-full bg-black/50 text-white backdrop-blur-xs" title="Public Gallery">
                      <Globe className="w-3 h-3" />
                    </span>
                  )}

                  {gallery.designSettings?.layout && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-400 text-zinc-950 shadow-xs capitalize">
                      {gallery.designSettings.layout.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="text-xs text-white/80 font-medium">
                    {gallery.clientName || 'General Client'}
                  </div>
                  <div className="text-base font-serif font-bold truncate">
                    {gallery.title}
                  </div>
                </div>
              </div>

              {/* Gallery Details Body */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  {gallery.description && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {gallery.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Shoot: {gallery.shootDate || 'Unscheduled'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{gallery.downloadAccess ? 'Hi-Res Allowed' : 'View Only'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedGalleryForDetail(gallery)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <Images className="w-3.5 h-3.5" />
                      View & Manage
                    </button>
                    <button
                      onClick={() => openEditModal(gallery)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Edit Gallery Metadata"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSharingGallery(gallery)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Share Gallery Link & Access"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPreviewGallery(gallery)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Client Proofing Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => setGalleryToDelete(gallery)}
                    className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Delete Gallery"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE GALLERY MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Create Photography Gallery
                </h2>
                <p className="text-xs text-zinc-500">
                  Persists gallery metadata to your tenant Firestore collection
                </p>
              </div>
              <button 
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Collection Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Juliette & Arthur — Côte d'Azur Wedding"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Description / Event Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of the shoot, location, and client expectations..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Event / Shoot Type *
                  </label>
                  <select
                    value={formData.eventType}
                    onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  >
                    {EVENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot Date
                  </label>
                  <input
                    type="date"
                    value={formData.shootDate}
                    onChange={(e) => setFormData({ ...formData, shootDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Gallery Template & Layout Geometry */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                    Signature Template *
                  </label>
                  <select
                    value={formData.templateType}
                    onChange={(e) => {
                      const selected = TEMPLATE_PRESETS.find(p => p.category === e.target.value);
                      setFormData({ 
                        ...formData, 
                        templateType: e.target.value as GalleryTemplateCategory,
                        layout: selected?.defaultLayout || formData.layout,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  >
                    {TEMPLATE_PRESETS.map(t => (
                      <option key={t.category} value={t.category}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                    Layout Geometry *
                  </label>
                  <select
                    value={formData.layout}
                    onChange={(e) => setFormData({ ...formData, layout: e.target.value as GalleryLayoutType })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  >
                    <option value="masonry">Flowing Masonry</option>
                    <option value="grid">Classic Balanced Grid</option>
                    <option value="large_image">Editorial Large-Image Spread</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Assign Client (Optional)
                </label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                >
                  <option value="">General Client / Unassigned</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName} ({c.shootType})</option>
                  ))}
                </select>
              </div>

              {/* Cover Image Preset Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Cover Image Reference
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COVERS.map((preset, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setFormData({ ...formData, coverImageUrl: preset.url, customCoverUrl: '' })}
                      className={`relative aspect-4/3 rounded-lg overflow-hidden border-2 transition-all ${
                        formData.coverImageUrl === preset.url && !formData.customCoverUrl 
                          ? 'border-amber-500 scale-105 shadow-xs' 
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      title={preset.label}
                    >
                      <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>

                <div className="pt-1">
                  <input
                    type="url"
                    placeholder="Or enter custom image URL (e.g. https://...)"
                    value={formData.customCoverUrl}
                    onChange={(e) => setFormData({ ...formData, customCoverUrl: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Publication Status & Privacy */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Publication Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as GalleryStatus })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="published">Published</option>
                    <option value="in_review">In Review (Proofs)</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Privacy Mode
                  </label>
                  <select
                    value={formData.privacy}
                    onChange={(e) => setFormData({ ...formData, privacy: e.target.value as GalleryPrivacy })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="password_protected">Password Protected</option>
                    <option value="public">Public Portfolio</option>
                    <option value="private">Private (Team only)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="dlCheck"
                  checked={formData.downloadAccess}
                  onChange={(e) => setFormData({ ...formData, downloadAccess: e.target.checked })}
                  className="rounded text-amber-500"
                />
                <label htmlFor="dlCheck" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Allow client original high-resolution downloads
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating Gallery...' : 'Save Gallery to Firestore'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT GALLERY MODAL */}
      {editGalleryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Edit Gallery Metadata
                </h2>
                <p className="text-xs text-zinc-500">
                  Update collection configuration in Cloud Firestore
                </p>
              </div>
              <button 
                onClick={() => setEditGalleryModal(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {editError && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {editSuccess && (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                  <span>{editSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Collection Title *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Event Type
                  </label>
                  <select
                    value={editFormData.eventType}
                    onChange={(e) => setEditFormData({ ...editFormData, eventType: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {EVENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.shootDate}
                    onChange={(e) => setEditFormData({ ...editFormData, shootDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Gallery Presentation Template & Layout */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                    Presentation Template
                  </label>
                  <select
                    value={editFormData.templateType}
                    onChange={(e) => {
                      const selected = TEMPLATE_PRESETS.find(p => p.category === e.target.value);
                      setEditFormData({ 
                        ...editFormData, 
                        templateType: e.target.value as GalleryTemplateCategory,
                        layout: selected?.defaultLayout || editFormData.layout,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {TEMPLATE_PRESETS.map(t => (
                      <option key={t.category} value={t.category}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                    Layout Geometry
                  </label>
                  <select
                    value={editFormData.layout}
                    onChange={(e) => setEditFormData({ ...editFormData, layout: e.target.value as GalleryLayoutType })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="masonry">Flowing Masonry</option>
                    <option value="grid">Classic Balanced Grid</option>
                    <option value="large_image">Editorial Large-Image Spread</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
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
                    value={editFormData.privacy}
                    onChange={(e) => setEditFormData({ ...editFormData, privacy: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="password_protected">Password Protected</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Cover Image URL
                </label>
                <input
                  type="url"
                  value={editFormData.coverImageUrl}
                  onChange={(e) => setEditFormData({ ...editFormData, coverImageUrl: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editDlCheck"
                  checked={editFormData.downloadAccess}
                  onChange={(e) => setEditFormData({ ...editFormData, downloadAccess: e.target.checked })}
                  className="rounded text-amber-500"
                />
                <label htmlFor="editDlCheck" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Allow client original high-resolution downloads
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditGalleryModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {galleryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Delete Gallery Collection
              </h3>
              <button 
                onClick={() => setGalleryToDelete(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to delete <strong className="text-zinc-900 dark:text-zinc-100">"{galleryToDelete.title}"</strong>? 
              This will remove its metadata record from your studio database.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setGalleryToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                Delete Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE GALLERY MODAL */}
      {sharingGallery && activeStudio && (
        <ShareGalleryModal
          isOpen={!!sharingGallery}
          onClose={() => setSharingGallery(null)}
          gallery={sharingGallery}
          studioSlug={activeStudio.slug}
          onGalleryUpdated={(updates) => {
            setGalleries(prev => prev.map(g => g.id === sharingGallery.id ? { ...g, ...updates } : g));
            setSharingGallery(prev => prev ? { ...prev, ...updates } : null);
          }}
          onOpenClientPreview={() => {
            const toPreview = sharingGallery;
            setSharingGallery(null);
            setPreviewGallery(toPreview);
          }}
        />
      )}
    </div>
  );
};
