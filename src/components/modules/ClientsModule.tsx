import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Trash2, 
  Edit3, 
  Images, 
  CheckCircle, 
  X,
  FileText,
  Archive,
  ArchiveRestore,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Link as LinkIcon,
  Unlink,
  Clock,
  Shield,
  AlertCircle,
  CheckCircle2,
  Lock,
  Camera,
  FolderOpen,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getClients, 
  createClient, 
  updateClient, 
  archiveClient,
  deleteClient,
  getGalleries,
  linkGalleryToClient,
  unlinkGalleryFromClient,
  getActivityLogs
} from '../../services/studioService';
import { Client, Gallery, ClientShootType, ClientStatus, ActivityLog } from '../../types';
import { Badge } from '../common/Badge';

const SHOOT_TYPES: { value: ClientShootType; label: string }[] = [
  { value: 'wedding', label: 'Wedding & Elopement' },
  { value: 'portrait', label: 'Portrait & Headshot' },
  { value: 'commercial', label: 'Commercial & Brand' },
  { value: 'editorial', label: 'Editorial & Fashion' },
  { value: 'event', label: 'Private Event & Gala' },
  { value: 'other', label: 'Other Project' },
];

const ITEMS_PER_PAGE = 8;

export const ClientsModule: React.FC = () => {
  const { activeStudio, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Directory Filters & Search
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'lead' | 'active' | 'completed' | 'archived'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ClientShootType>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'status'>('date_desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Active View Mode: 'list' or 'profile'
  const [profileClientId, setProfileClientId] = useState<string | null>(null);

  // Modals & In-Flight State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToArchive, setClientToArchive] = useState<{ client: Client; archive: boolean } | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [linkGalleryModalClient, setLinkGalleryModalClient] = useState<Client | null>(null);

  // Form submission and error handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [profileNotes, setProfileNotes] = useState('');
  const [notesSuccess, setNotesSuccess] = useState(false);

  // Create Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    shootType: 'wedding' as ClientShootType,
    status: 'lead' as ClientStatus,
    eventDate: '',
    eventLocation: '',
    notes: '',
  });

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    shootType: 'wedding' as ClientShootType,
    status: 'lead' as ClientStatus,
    eventDate: '',
    eventLocation: '',
    notes: '',
  });

  const loadData = async () => {
    if (!activeStudio) return;
    setLoading(true);
    try {
      const [cRes, gRes, logRes] = await Promise.allSettled([
        getClients(activeStudio.id),
        getGalleries(activeStudio.id),
        getActivityLogs(activeStudio.id, 50),
      ]);
      if (cRes.status === 'fulfilled' && cRes.value) setClients(cRes.value);
      if (gRes.status === 'fulfilled' && gRes.value) setGalleries(gRes.value);
      if (logRes.status === 'fulfilled' && logRes.value) setActivityLogs(logRes.value);
    } catch (err) {
      console.error('Error fetching studio clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStudio?.id]);

  // Sync profile notes when viewing client profile
  const activeProfileClient = useMemo(() => {
    if (!profileClientId) return null;
    return clients.find(c => c.id === profileClientId) || null;
  }, [profileClientId, clients]);

  useEffect(() => {
    if (activeProfileClient) {
      setProfileNotes(activeProfileClient.notes || '');
      setNotesSuccess(false);
    }
  }, [activeProfileClient]);

  // Filtered & Sorted Clients
  const filteredClients = useMemo(() => {
    return clients
      .filter((c) => {
        // Tab status filter
        if (activeTab === 'archived') {
          if (!c.isArchived && c.status !== 'archived') return false;
        } else {
          // Non-archived tabs hide archived clients
          if (c.isArchived || c.status === 'archived') return false;
          if (activeTab !== 'all' && c.status !== activeTab) return false;
        }

        // Shoot category filter
        if (typeFilter !== 'all' && c.shootType !== typeFilter) return false;

        // Search text
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const matchesName = c.fullName.toLowerCase().includes(q);
          const matchesEmail = c.email.toLowerCase().includes(q);
          const matchesPhone = c.phone?.toLowerCase().includes(q) || false;
          const matchesAddress = c.address?.toLowerCase().includes(q) || false;
          const matchesType = c.shootType.toLowerCase().includes(q);
          if (!matchesName && !matchesEmail && !matchesPhone && !matchesAddress && !matchesType) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'date_asc') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'name_asc') {
          return a.fullName.localeCompare(b.fullName);
        }
        if (sortBy === 'name_desc') {
          return b.fullName.localeCompare(a.fullName);
        }
        if (sortBy === 'status') {
          return a.status.localeCompare(b.status);
        }
        return 0;
      });
  }, [clients, activeTab, typeFilter, search, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / ITEMS_PER_PAGE));
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredClients.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredClients, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, typeFilter, search, sortBy]);

  // Handle Client Creation
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio) return;

    setFormError(null);
    setFormSuccess(null);

    const cleanName = formData.fullName.trim();
    const cleanEmail = formData.email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setFormError('Client full name must be at least 2 characters.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setFormError('Please enter a valid email address (e.g. client@example.com).');
      return;
    }
    if (formData.phone.trim() && formData.phone.trim().length < 7) {
      setFormError('Phone number must be at least 7 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createClient(activeStudio.id, {
        fullName: cleanName,
        email: cleanEmail,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        shootType: formData.shootType,
        status: formData.status,
        eventDate: formData.eventDate || undefined,
        eventLocation: formData.eventLocation.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });

      setFormSuccess(`Client "${cleanName}" registered successfully!`);
      setTimeout(() => {
        setCreateModalOpen(false);
        setFormSuccess(null);
        setFormData({
          fullName: '',
          email: '',
          phone: '',
          address: '',
          shootType: 'wedding',
          status: 'lead',
          eventDate: '',
          eventLocation: '',
          notes: '',
        });
      }, 700);

      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to register client.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setEditFormData({
      fullName: client.fullName,
      email: client.email,
      phone: client.phone || '',
      address: client.address || '',
      shootType: client.shootType,
      status: client.status,
      eventDate: client.eventDate || '',
      eventLocation: client.eventLocation || '',
      notes: client.notes || '',
    });
    setFormError(null);
  };

  // Handle Client Edit Save
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio || !editingClient) return;

    setFormError(null);
    const cleanName = editFormData.fullName.trim();
    const cleanEmail = editFormData.email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setFormError('Client full name must be at least 2 characters.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateClient(activeStudio.id, editingClient.id, {
        fullName: cleanName,
        email: cleanEmail,
        phone: editFormData.phone.trim() || undefined,
        address: editFormData.address.trim() || undefined,
        shootType: editFormData.shootType,
        status: editFormData.status,
        eventDate: editFormData.eventDate || undefined,
        eventLocation: editFormData.eventLocation.trim() || undefined,
        notes: editFormData.notes.trim() || undefined,
      });

      setEditingClient(null);
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update client.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Archive / Restore
  const confirmArchive = async () => {
    if (!activeStudio || !clientToArchive) return;
    try {
      await archiveClient(
        activeStudio.id, 
        clientToArchive.client.id, 
        clientToArchive.client.fullName, 
        clientToArchive.archive
      );
      setClientToArchive(null);
      await loadData();
    } catch (err: any) {
      console.error('Error archiving client:', err);
    }
  };

  // Handle Delete
  const confirmDelete = async () => {
    if (!activeStudio || !clientToDelete) return;
    try {
      await deleteClient(activeStudio.id, clientToDelete.id, clientToDelete.fullName);
      if (profileClientId === clientToDelete.id) {
        setProfileClientId(null);
      }
      setClientToDelete(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting client:', err);
    }
  };

  // Save Internal Notes from Profile
  const handleSaveProfileNotes = async () => {
    if (!activeStudio || !activeProfileClient) return;
    setNotesSaving(true);
    try {
      await updateClient(activeStudio.id, activeProfileClient.id, {
        notes: profileNotes.trim() || undefined,
      });
      setNotesSuccess(true);
      setTimeout(() => setNotesSuccess(false), 2500);
      await loadData();
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setNotesSaving(false);
    }
  };

  // Link Gallery to Client
  const handleLinkGallery = async (gallery: Gallery) => {
    if (!activeStudio || !linkGalleryModalClient) return;
    try {
      await linkGalleryToClient(
        activeStudio.id,
        gallery.id,
        linkGalleryModalClient.id,
        linkGalleryModalClient.fullName
      );
      setLinkGalleryModalClient(null);
      await loadData();
    } catch (err) {
      console.error('Failed to link gallery:', err);
    }
  };

  // Unlink Gallery from Client
  const handleUnlinkGallery = async (gallery: Gallery) => {
    if (!activeStudio) return;
    try {
      await unlinkGalleryFromClient(activeStudio.id, gallery.id, gallery.title);
      await loadData();
    } catch (err) {
      console.error('Failed to unlink gallery:', err);
    }
  };

  // ==========================================
  // VIEW: CLIENT PROFILE / DETAIL PAGE
  // ==========================================
  if (activeProfileClient) {
    const clientGalleries = galleries.filter(g => g.clientId === activeProfileClient.id);
    const clientLogs = activityLogs.filter(
      l => l.targetName?.includes(activeProfileClient.fullName) || l.action.toLowerCase().includes('client')
    );

    return (
      <div className="space-y-6 pb-16 animate-in fade-in duration-200">
        {/* Navigation & Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            onClick={() => setProfileClientId(null)}
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Client Directory
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openEditModal(activeProfileClient)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit Profile
            </button>

            <button
              onClick={() => setClientToArchive({ client: activeProfileClient, archive: !activeProfileClient.isArchived })}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
            >
              {activeProfileClient.isArchived ? (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5 text-emerald-500" /> Restore Client
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5 text-zinc-400" /> Archive Client
                </>
              )}
            </button>

            <button
              onClick={() => setClientToDelete(activeProfileClient)}
              className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              title="Delete Client"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Client Profile Header Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={
                  activeProfileClient.status === 'active' ? 'emerald' :
                  activeProfileClient.status === 'lead' ? 'amber' :
                  activeProfileClient.status === 'completed' ? 'blue' :
                  activeProfileClient.status === 'archived' ? 'zinc' : 'slate'
                }>
                  {activeProfileClient.status.toUpperCase()}
                </Badge>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize border border-zinc-200 dark:border-zinc-700">
                  {activeProfileClient.shootType} Photography
                </span>

                {activeProfileClient.isArchived && (
                  <Badge variant="rose">ARCHIVED</Badge>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {activeProfileClient.fullName}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  <a href={`mailto:${activeProfileClient.email}`} className="hover:underline text-zinc-700 dark:text-zinc-300">
                    {activeProfileClient.email}
                  </a>
                </span>
                {activeProfileClient.phone && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" />
                      <a href={`tel:${activeProfileClient.phone}`} className="hover:underline text-zinc-700 dark:text-zinc-300">
                        {activeProfileClient.phone}
                      </a>
                    </span>
                  </>
                )}
                {activeProfileClient.address && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      {activeProfileClient.address}
                    </span>
                  </>
                )}
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  Client since {new Date(activeProfileClient.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <button
              onClick={() => setLinkGalleryModalClient(activeProfileClient)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors flex items-center gap-1.5 shadow-2xs self-start"
            >
              <LinkIcon className="w-3.5 h-3.5" /> Link Existing Gallery
            </button>
          </div>
        </div>

        {/* 2-Column Layout: Left (Event & Galleries) / Right (Private Notes & History) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLUMNS: Event Details & Linked Galleries */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event & Shoot Information */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h3 className="text-sm font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  Event & Shoot Specifications
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Tenant: {activeStudio?.name}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Shoot Category</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">{activeProfileClient.shootType}</p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Event / Shoot Date</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {activeProfileClient.eventDate 
                      ? new Date(activeProfileClient.eventDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                      : 'Not Scheduled'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Location / Venue</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={activeProfileClient.eventLocation || 'Unspecified'}>
                    {activeProfileClient.eventLocation || 'Unspecified'}
                  </p>
                </div>
              </div>
            </div>

            {/* Linked Galleries Section */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Images className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-serif font-bold text-zinc-900 dark:text-zinc-100">
                    Associated Galleries ({clientGalleries.length})
                  </h3>
                </div>
                <button
                  onClick={() => setLinkGalleryModalClient(activeProfileClient)}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Associate Collection
                </button>
              </div>

              {clientGalleries.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
                  <FolderOpen className="w-8 h-8 text-zinc-400 mx-auto" />
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    No Galleries Associated with this Client
                  </div>
                  <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                    Link an existing photo gallery from your studio to give this client proofing and viewing access.
                  </p>
                  <button
                    onClick={() => setLinkGalleryModalClient(activeProfileClient)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200"
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> Link Existing Collection
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {clientGalleries.map((gal) => (
                    <div key={gal.id} className="py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                          {gal.coverImageUrl ? (
                            <img src={gal.coverImageUrl} alt={gal.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-400">
                              <Camera className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {gal.title}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono mt-0.5">
                            <span>Shoot: {gal.shootDate || 'Unscheduled'}</span>
                            <span>•</span>
                            <span className="capitalize">{gal.eventType || 'Photography'}</span>
                            <span>•</span>
                            <span>{gal.photoCount || 0} Photos</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={
                          gal.status === 'published' ? 'emerald' :
                          gal.status === 'in_review' ? 'amber' : 'zinc'
                        } size="sm">
                          {gal.status.toUpperCase()}
                        </Badge>

                        <button
                          onClick={() => handleUnlinkGallery(gal)}
                          className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          title="Unlink Gallery from this Client"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Private Studio Notes & Activity History */}
          <div className="space-y-6">
            {/* Private Internal Notes Card */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-serif font-bold text-zinc-900 dark:text-zinc-100">
                    Private Studio Notes
                  </h3>
                </div>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Staff Only
                </span>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Confidential studio instructions, lighting preferences, contract terms, or client personality notes. Never exposed to public links.
              </p>

              <textarea
                rows={5}
                value={profileNotes}
                onChange={(e) => setProfileNotes(e.target.value)}
                placeholder="Enter confidential studio notes..."
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
              />

              <div className="flex items-center justify-between pt-1">
                {notesSuccess ? (
                  <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Notes saved!
                  </span>
                ) : <span />}

                <button
                  onClick={handleSaveProfileNotes}
                  disabled={notesSaving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {notesSaving ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>

            {/* Relevant Activity History */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h3 className="text-sm font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-zinc-400" />
                  Audit History
                </h3>
                <span className="text-[10px] text-zinc-400 font-mono">
                  Immutable
                </span>
              </div>

              {clientLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400">
                  No activity logged for this client yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {clientLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="text-xs space-y-0.5 border-l-2 border-amber-500/50 pl-2.5 py-0.5">
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {log.action}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        {new Date(log.createdAt).toLocaleString()} by {log.userEmail}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: CLIENT DIRECTORY LIST
  // ==========================================
  return (
    <div className="space-y-6 pb-12">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Client Directory & CRM
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              {clients.filter(c => !c.isArchived && c.status !== 'archived').length} Active
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage contacts, booking specifications, and gallery associations for {activeStudio?.name}
          </p>
        </div>

        <button
          onClick={() => {
            setFormError(null);
            setFormSuccess(null);
            setCreateModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {/* Directory Filter Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          All Active ({clients.filter(c => !c.isArchived && c.status !== 'archived').length})
        </button>

        <button
          onClick={() => setActiveTab('lead')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'lead'
              ? 'bg-amber-500 text-zinc-950 font-bold shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          Leads ({clients.filter(c => c.status === 'lead' && !c.isArchived).length})
        </button>

        <button
          onClick={() => setActiveTab('active')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'active'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          Booked / Active ({clients.filter(c => c.status === 'active' && !c.isArchived).length})
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'completed'
              ? 'bg-sky-600 text-white shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          Completed ({clients.filter(c => c.status === 'completed' && !c.isArchived).length})
        </button>

        <button
          onClick={() => setActiveTab('archived')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'archived'
              ? 'bg-zinc-700 text-white shadow-2xs'
              : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          Archived ({clients.filter(c => c.isArchived || c.status === 'archived').length})
        </button>
      </div>

      {/* Search, Category Filter, and Sort Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-2xs"
          >
            <option value="all">All Shoot Categories</option>
            {SHOOT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-2xs"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="name_asc">Name (A → Z)</option>
            <option value="name_desc">Name (Z → A)</option>
            <option value="status">Status</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-amber-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Clients Directory Table / Empty States */}
      {loading ? (
        <div className="py-24 text-center text-xs text-zinc-400">Loading studio clients directory...</div>
      ) : filteredClients.length === 0 ? (
        <div className="p-12 sm:p-16 text-center rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
            {activeTab === 'archived' ? <Archive className="w-6 h-6" /> : <Users className="w-6 h-6" />}
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {search 
                ? 'No matching clients found' 
                : activeTab === 'archived' 
                ? 'No archived client profiles' 
                : 'No clients registered yet'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
              {search 
                ? 'No client matched your query. Clear search or filters to browse directory.' 
                : activeTab === 'archived'
                ? 'Clients you archive will be kept safe here and can be restored anytime.'
                : 'Register photography clients and leads to manage bookings and link online galleries.'}
            </p>
          </div>
          {activeTab !== 'archived' && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" /> Register First Client
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs space-y-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Client Name</th>
                  <th className="px-5 py-3.5">Shoot Type</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Contact Details</th>
                  <th className="px-5 py-3.5">Linked Collections</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {paginatedClients.map((client) => {
                  const clientGalleries = galleries.filter(g => g.clientId === client.id);
                  return (
                    <tr 
                      key={client.id} 
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors group cursor-pointer"
                      onClick={() => setProfileClientId(client.id)}
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {client.fullName}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          ID: {client.id.slice(0, 14)}
                        </div>
                      </td>

                      <td className="px-5 py-4 capitalize font-medium text-zinc-700 dark:text-zinc-300">
                        {client.shootType}
                      </td>

                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <Badge variant={
                          client.status === 'active' ? 'emerald' :
                          client.status === 'lead' ? 'amber' :
                          client.status === 'completed' ? 'blue' :
                          client.status === 'archived' ? 'zinc' : 'slate'
                        } size="sm">
                          {client.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="px-5 py-4 space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                          <Mail className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                          <span className="truncate max-w-[160px]">{client.email}</span>
                        </div>
                        {client.phone && (
                          <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
                            <Phone className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] truncate max-w-[160px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span>{client.address}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 font-medium">
                          <Images className="w-3.5 h-3.5 text-amber-500" />
                          <span>{clientGalleries.length} {clientGalleries.length === 1 ? 'Gallery' : 'Galleries'}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setProfileClientId(client.id)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="View Client Profile"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openEditModal(client)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="Edit Client"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setClientToArchive({ client, archive: !client.isArchived })}
                            className="p-1.5 text-zinc-400 hover:text-amber-500 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title={client.isArchived ? "Restore Client" : "Archive Client"}
                          >
                            {client.isArchived ? (
                              <ArchiveRestore className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Archive className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => setClientToDelete(client)}
                            className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title="Delete Client"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
              <div>
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredClients.length)} of {filteredClients.length} clients
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-[11px]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE CLIENT MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-7 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Register Photography Client
                </h2>
                <p className="text-xs text-zinc-500">
                  Adds contact profile to {activeStudio?.name} CRM
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
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name / Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Julianne & Marcus Vance"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="client@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Mailing / Billing Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 742 Evergreen Terrace, Seattle, WA"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot Category
                  </label>
                  <select
                    value={formData.shootType}
                    onChange={(e) => setFormData({ ...formData, shootType: e.target.value as ClientShootType })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {SHOOT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Initial Booking Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ClientStatus })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="lead">Lead / Inquired</option>
                    <option value="active">Booked / Active</option>
                    <option value="completed">Completed</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot / Event Date
                  </label>
                  <input
                    type="date"
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot Location / Venue
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. San Francisco Botanical Gardens"
                    value={formData.eventLocation}
                    onChange={(e) => setFormData({ ...formData, eventLocation: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Private Studio Notes
                  </label>
                  <span className="text-[10px] text-zinc-400 font-medium">Visible only to studio staff</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Styling preferences, shoot schedule, client expectations..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Register Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CLIENT MODAL */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-7 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Edit Client Profile
                </h2>
                <p className="text-xs text-zinc-500">
                  Update contact specifications and shoot details
                </p>
              </div>
              <button 
                onClick={() => setEditingClient(null)}
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

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.fullName}
                  onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot Category
                  </label>
                  <select
                    value={editFormData.shootType}
                    onChange={(e) => setEditFormData({ ...editFormData, shootType: e.target.value as ClientShootType })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {SHOOT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Booking Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as ClientStatus })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="lead">Lead</option>
                    <option value="active">Active / Booked</option>
                    <option value="completed">Completed</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shoot Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.eventDate}
                    onChange={(e) => setEditFormData({ ...editFormData, eventDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Venue / Location
                  </label>
                  <input
                    type="text"
                    value={editFormData.eventLocation}
                    onChange={(e) => setEditFormData({ ...editFormData, eventLocation: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Private Studio Notes
                </label>
                <textarea
                  rows={3}
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINK GALLERY MODAL */}
      {linkGalleryModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-7 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Link Gallery to {linkGalleryModalClient.fullName}
                </h3>
                <p className="text-xs text-zinc-500">
                  Select an existing studio gallery to assign to this client profile
                </p>
              </div>
              <button 
                onClick={() => setLinkGalleryModalClient(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List unassociated or other galleries */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {galleries.filter(g => g.clientId !== linkGalleryModalClient.id).length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400 space-y-2">
                  <p>All existing galleries are already linked to this client, or no galleries have been created yet.</p>
                </div>
              ) : (
                galleries
                  .filter(g => g.clientId !== linkGalleryModalClient.id)
                  .map((gal) => (
                    <div
                      key={gal.id}
                      className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {gal.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          {gal.shootDate || 'Unscheduled'} • {gal.eventType || 'Photography'} • {gal.photoCount || 0} Photos
                          {gal.clientName && ` (Currently: ${gal.clientName})`}
                        </div>
                      </div>

                      <button
                        onClick={() => handleLinkGallery(gal)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 flex items-center gap-1.5 flex-shrink-0"
                      >
                        <LinkIcon className="w-3.5 h-3.5" /> Link
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-2 flex justify-end border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setLinkGalleryModalClient(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVE / RESTORE CONFIRMATION MODAL */}
      {clientToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {clientToArchive.archive ? <Archive className="w-5 h-5 text-amber-500" /> : <ArchiveRestore className="w-5 h-5 text-emerald-500" />}
                {clientToArchive.archive ? 'Archive Client Profile' : 'Restore Client Profile'}
              </h3>
              <button 
                onClick={() => setClientToArchive(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {clientToArchive.archive ? (
                <>
                  Are you sure you want to archive <strong className="text-zinc-900 dark:text-zinc-100">"{clientToArchive.client.fullName}"</strong>? 
                  Archiving hides this contact from the active directory but preserves all booking records, private notes, and gallery links.
                </>
              ) : (
                <>
                  Restore <strong className="text-zinc-900 dark:text-zinc-100">"{clientToArchive.client.fullName}"</strong> back to the active client directory?
                </>
              )}
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setClientToArchive(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmArchive}
                className={`px-4 py-2 text-xs font-semibold rounded-xl text-white shadow-2xs ${
                  clientToArchive.archive 
                    ? 'bg-amber-600 hover:bg-amber-700' 
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {clientToArchive.archive ? 'Archive Client' : 'Restore Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CLIENT CONFIRMATION MODAL */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-500" />
                Delete Client Profile
              </h3>
              <button 
                onClick={() => setClientToDelete(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-zinc-900 dark:text-zinc-100">"{clientToDelete.fullName}"</strong>? 
              This will remove this client and their contact information from your studio tenant CRM.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setClientToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                Delete Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
