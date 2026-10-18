import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckSquare, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Images, 
  Users, 
  Tag, 
  ArrowUpDown, 
  X, 
  Edit2, 
  Trash2, 
  Archive, 
  ArchiveRestore, 
  AlertTriangle,
  MoveRight,
  Eye,
  FileText,
  List,
  LayoutGrid,
  ChevronRight,
  MoreVertical,
  Layers,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getTasks, 
  createTask, 
  updateTask, 
  archiveTask, 
  deleteTask, 
  computeTaskMetrics,
  getClients, 
  getGalleries, 
  getTeamMembers,
  PRODUCTION_TASK_CATEGORIES
} from '../../services/studioService';
import { 
  ProductionTask, 
  ProductionTaskStatus, 
  ProductionTaskPriority, 
  ProductionTaskCategory, 
  Client, 
  Gallery, 
  StudioMember 
} from '../../types';
import { Badge } from '../common/Badge';

const STATUS_COLUMNS: { id: ProductionTaskStatus; title: string; color: string; badgeVariant: 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' }[] = [
  { id: 'pending', title: 'Pending', color: 'border-zinc-300 dark:border-zinc-700', badgeVariant: 'slate' },
  { id: 'in_progress', title: 'In Progress', color: 'border-blue-500/40', badgeVariant: 'blue' },
  { id: 'under_review', title: 'Under Review', color: 'border-amber-500/40', badgeVariant: 'amber' },
  { id: 'completed', title: 'Completed', color: 'border-emerald-500/40', badgeVariant: 'emerald' },
  { id: 'blocked', title: 'Blocked', color: 'border-rose-500/40', badgeVariant: 'rose' },
];

export const TaskBoardModule: React.FC = () => {
  const { activeStudio, user } = useAuth();

  // Primary data states
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [teamMembers, setTeamMembers] = useState<StudioMember[]>([]);
  const [loading, setLoading] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showArchived, setShowArchived] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProductionTaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | ProductionTaskPriority>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductionTaskCategory>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'due_asc' | 'due_desc' | 'created_desc' | 'priority_desc'>('due_asc');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<ProductionTask | null>(null);
  const [editingTask, setEditingTask] = useState<ProductionTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<ProductionTask | null>(null);
  const [taskToArchive, setTaskToArchive] = useState<{ task: ProductionTask; archive: boolean } | null>(null);
  const [statusChangeModal, setStatusChangeModal] = useState<{ task: ProductionTask; nextStatus: ProductionTaskStatus } | null>(null);
  const [statusNote, setStatusNote] = useState('');

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'selection' as ProductionTaskCategory,
    priority: 'medium' as ProductionTaskPriority,
    status: 'pending' as ProductionTaskStatus,
    startDate: '',
    dueDate: '',
    clientId: '',
    galleryId: '',
    assigneeId: '',
    instructions: '',
  });

  // Load Data
  const loadData = async () => {
    if (!activeStudio) return;
    setLoading(true);
    try {
      const [tList, cList, gList, mList] = await Promise.all([
        getTasks(activeStudio.id),
        getClients(activeStudio.id),
        getGalleries(activeStudio.id),
        getTeamMembers(activeStudio.id).catch(() => []),
      ]);
      setTasks(tList);
      setClients(cList);
      setGalleries(gList);
      setTeamMembers(mList);
    } catch (err) {
      console.error('Error loading task board data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStudio?.id]);

  // Derived real metrics
  const metrics = useMemo(() => computeTaskMetrics(tasks), [tasks]);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filtered & Sorted Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Archive filter
      if (!showArchived && t.isArchived) return false;
      if (showArchived && !t.isArchived) return false;

      // Search term
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(query);
        const matchDesc = t.description?.toLowerCase().includes(query);
        const matchClient = t.clientName?.toLowerCase().includes(query);
        const matchGallery = t.galleryTitle?.toLowerCase().includes(query);
        const matchAssignee = t.assigneeName?.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchClient && !matchGallery && !matchAssignee) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;

      // Priority filter
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;

      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

      // Overdue filter
      if (overdueOnly) {
        if (t.status === 'completed') return false;
        if (!t.dueDate || t.dueDate.split('T')[0] >= todayStr) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'due_asc') {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDue - bDue;
      }
      if (sortBy === 'due_desc') {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return bDue - aDue;
      }
      if (sortBy === 'created_desc') {
        const aC = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bC = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bC - aC;
      }
      if (sortBy === 'priority_desc') {
        const pOrder: Record<ProductionTaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        return (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
      }
      return 0;
    });
  }, [tasks, showArchived, search, statusFilter, priorityFilter, categoryFilter, overdueOnly, sortBy, todayStr]);

  // Open Create Modal
  const openCreateModal = () => {
    setFormData({
      title: '',
      description: '',
      category: 'selection',
      priority: 'medium',
      status: 'pending',
      startDate: '',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      clientId: '',
      galleryId: '',
      assigneeId: '',
      instructions: '',
    });
    setFormError(null);
    setFormSuccess(null);
    setCreateModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (task: ProductionTask) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      category: task.category,
      priority: task.priority,
      status: task.status,
      startDate: task.startDate ? task.startDate.split('T')[0] : '',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      clientId: task.clientId || '',
      galleryId: task.galleryId || '',
      assigneeId: task.assigneeId || '',
      instructions: task.instructions || '',
    });
    setFormError(null);
    setFormSuccess(null);
  };

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio) return;

    if (!formData.title.trim() || formData.title.trim().length < 2) {
      setFormError('Task title must be at least 2 characters.');
      return;
    }
    if (!formData.dueDate) {
      setFormError('Due date is required.');
      return;
    }
    if (formData.startDate && formData.startDate > formData.dueDate) {
      setFormError('Start date cannot be after the due date.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const selectedClient = clients.find((c) => c.id === formData.clientId);
      const selectedGallery = galleries.find((g) => g.id === formData.galleryId);
      const selectedAssignee = teamMembers.find((m) => m.id === formData.assigneeId);

      await createTask(activeStudio.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category,
        priority: formData.priority,
        status: formData.status,
        startDate: formData.startDate ? `${formData.startDate}T00:00:00.000Z` : undefined,
        dueDate: `${formData.dueDate}T23:59:59.000Z`,
        clientId: selectedClient?.id,
        clientName: selectedClient?.fullName,
        galleryId: selectedGallery?.id,
        galleryTitle: selectedGallery?.title,
        assigneeId: selectedAssignee?.id,
        assigneeName: selectedAssignee?.displayName || selectedAssignee?.email,
        assigneeEmail: selectedAssignee?.email,
        instructions: formData.instructions.trim() || undefined,
      });

      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error creating task:', err);
      setFormError(err.message || 'Failed to create production task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio || !editingTask) return;

    if (!formData.title.trim() || formData.title.trim().length < 2) {
      setFormError('Task title must be at least 2 characters.');
      return;
    }
    if (!formData.dueDate) {
      setFormError('Due date is required.');
      return;
    }
    if (formData.startDate && formData.startDate > formData.dueDate) {
      setFormError('Start date cannot be after the due date.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const selectedClient = clients.find((c) => c.id === formData.clientId);
      const selectedGallery = galleries.find((g) => g.id === formData.galleryId);
      const selectedAssignee = teamMembers.find((m) => m.id === formData.assigneeId);

      await updateTask(activeStudio.id, editingTask.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category,
        priority: formData.priority,
        status: formData.status,
        startDate: formData.startDate ? `${formData.startDate}T00:00:00.000Z` : undefined,
        dueDate: `${formData.dueDate}T23:59:59.000Z`,
        clientId: selectedClient?.id || '',
        clientName: selectedClient?.fullName || '',
        galleryId: selectedGallery?.id || '',
        galleryTitle: selectedGallery?.title || '',
        assigneeId: selectedAssignee?.id || '',
        assigneeName: selectedAssignee ? (selectedAssignee.displayName || selectedAssignee.email) : '',
        assigneeEmail: selectedAssignee?.email || '',
        instructions: formData.instructions.trim() || undefined,
      });

      setEditingTask(null);
      await loadData();
      if (detailTask?.id === editingTask.id) {
        // Refresh detail view
        const refreshed = await getTasks(activeStudio.id);
        const match = refreshed.find((t) => t.id === editingTask.id);
        if (match) setDetailTask(match);
      }
    } catch (err: any) {
      console.error('Error updating task:', err);
      setFormError(err.message || 'Failed to update production task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Move status quick action
  const handleConfirmStatusChange = async () => {
    if (!activeStudio || !statusChangeModal) return;
    setIsSubmitting(true);
    try {
      await updateTask(
        activeStudio.id,
        statusChangeModal.task.id,
        { status: statusChangeModal.nextStatus },
        statusNote.trim() || undefined
      );
      setStatusChangeModal(null);
      setStatusNote('');
      await loadData();
      if (detailTask?.id === statusChangeModal.task.id) {
        const refreshed = await getTasks(activeStudio.id);
        const match = refreshed.find((t) => t.id === statusChangeModal.task.id);
        if (match) setDetailTask(match);
      }
    } catch (err) {
      console.error('Error changing task status:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Archive / Restore
  const handleConfirmArchive = async () => {
    if (!activeStudio || !taskToArchive) return;
    setIsSubmitting(true);
    try {
      await archiveTask(
        activeStudio.id,
        taskToArchive.task.id,
        taskToArchive.task.title,
        taskToArchive.archive
      );
      setTaskToArchive(null);
      if (detailTask?.id === taskToArchive.task.id) {
        setDetailTask(null);
      }
      await loadData();
    } catch (err) {
      console.error('Error archiving task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!activeStudio || !taskToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteTask(activeStudio.id, taskToDelete.id, taskToDelete.title);
      setTaskToDelete(null);
      if (detailTask?.id === taskToDelete.id) {
        setDetailTask(null);
      }
      await loadData();
    } catch (err) {
      console.error('Error deleting task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityBadgeVariant = (p: ProductionTaskPriority): 'rose' | 'amber' | 'blue' | 'slate' => {
    switch (p) {
      case 'urgent': return 'rose';
      case 'high': return 'amber';
      case 'medium': return 'blue';
      case 'low': return 'slate';
    }
  };

  const isOverdue = (task: ProductionTask) => {
    if (task.status === 'completed') return false;
    if (!task.dueDate) return false;
    return task.dueDate.split('T')[0] < todayStr;
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Production Task Board
            </h1>
            <Badge variant="amber" size="sm">
              Workflow Engine
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Track post-production culling, editing, album design, client revisions, and delivery pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
              title="Kanban Board View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden md:inline">List</span>
            </button>
          </div>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              showArchived
                ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'Active Tasks' : 'Archived'}
          </button>

          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors shadow-2xs flex items-center gap-2 font-bold"
          >
            <Plus className="w-4 h-4" />
            New Production Task
          </button>
        </div>
      </div>

      {/* Actual Progress & Reporting Metric Cards (Calculated directly from persisted data) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Total Active
          </div>
          <div className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
            {metrics.total}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono">
            {metrics.completionPercentage}% pipeline complete
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Pending
          </div>
          <div className="text-2xl font-serif font-bold text-zinc-700 dark:text-zinc-300">
            {metrics.pending}
          </div>
          <div className="text-[10px] text-zinc-400">Awaiting start</div>
        </div>

        <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/20 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            In Progress
          </div>
          <div className="text-2xl font-serif font-bold text-blue-600 dark:text-blue-400">
            {metrics.inProgress}
          </div>
          <div className="text-[10px] text-blue-500/80">Active editing</div>
        </div>

        <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/20 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Under Review
          </div>
          <div className="text-2xl font-serif font-bold text-amber-600 dark:text-amber-400">
            {metrics.underReview}
          </div>
          <div className="text-[10px] text-amber-600/80">Client / QC check</div>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Completed
          </div>
          <div className="text-2xl font-serif font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.completed}
          </div>
          <div className="text-[10px] text-emerald-600/80">Delivered & verified</div>
        </div>

        <div className={`p-4 rounded-2xl border shadow-2xs space-y-1 ${
          metrics.overdue > 0 
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400' 
            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500'
        }`}>
          <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center justify-between">
            <span>Overdue</span>
            {metrics.overdue > 0 && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
          </div>
          <div className="text-2xl font-serif font-bold">
            {metrics.overdue}
          </div>
          <div className="text-[10px] opacity-80">Past scheduled due date</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by task title, client, or gallery..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="under_review">Under Review</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="all">All Categories</option>
              {PRODUCTION_TASK_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="due_asc">Sort: Due Date (Earliest)</option>
              <option value="due_desc">Sort: Due Date (Latest)</option>
              <option value="priority_desc">Sort: Priority (Urgent First)</option>
              <option value="created_desc">Sort: Created Date (Newest)</option>
            </select>

            {/* Overdue quick toggle */}
            <button
              onClick={() => setOverdueOnly(!overdueOnly)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                overdueOnly
                  ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue Only
            </button>
          </div>
        </div>
      </div>

      {/* Main Board View: Kanban or List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-400 font-mono">Loading production tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        /* Honest empty state when no tasks match or exist */
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center space-y-4 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
            <CheckSquare className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="font-serif font-bold text-base text-zinc-900 dark:text-zinc-100">
              {tasks.length === 0 ? 'No Production Tasks' : 'No Tasks Match Selected Filters'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {tasks.length === 0
                ? 'Your production board is clear. Create your first task to track photo culling, high-end retouching, client album approvals, or delivery milestones.'
                : 'Try adjusting your search criteria, clearing the overdue toggle, or selecting a different status/category filter.'}
            </p>
          </div>
          {tasks.length === 0 ? (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Task
            </button>
          ) : (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setPriorityFilter('all');
                setCategoryFilter('all');
                setOverdueOnly(false);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3 space-y-3 min-h-[400px] flex flex-col"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-1 pb-1 border-b border-zinc-200 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                      {col.title}
                    </span>
                    <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[10px] font-mono font-bold flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, status: col.id }));
                      openCreateModal();
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded"
                    title={`Add task to ${col.title}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Column Cards */}
                <div className="space-y-2.5 flex-1">
                  {colTasks.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-zinc-400 italic">
                      No tasks in {col.title}
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const overdue = isOverdue(task);
                      return (
                        <div
                          key={task.id}
                          onClick={() => setDetailTask(task)}
                          className={`group rounded-xl border bg-white dark:bg-zinc-900 p-3.5 space-y-2.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer relative ${
                            overdue
                              ? 'border-rose-500/50 hover:border-rose-500'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50'
                          }`}
                        >
                          {/* Priority & Category Header */}
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <Badge variant={getPriorityBadgeVariant(task.priority)} size="sm">
                              {task.priority.toUpperCase()}
                            </Badge>
                            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 capitalize">
                              {task.category.replace('_', ' ')}
                            </span>
                          </div>

                          {/* Task Title */}
                          <h4 className="font-serif font-bold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-amber-500 transition-colors line-clamp-2">
                            {task.title}
                          </h4>

                          {/* Description if present */}
                          {task.description && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Client / Gallery linkage tags */}
                          {(task.clientName || task.galleryTitle) && (
                            <div className="space-y-1 pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-[10px]">
                              {task.clientName && (
                                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 truncate">
                                  <Users className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                                  <span className="truncate">{task.clientName}</span>
                                </div>
                              )}
                              {task.galleryTitle && (
                                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 truncate">
                                  <Images className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                                  <span className="truncate">{task.galleryTitle}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Card Footer: Due date & Assignee & Quick Move */}
                          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 text-[10px]">
                            {/* Due date badge */}
                            <div className={`flex items-center gap-1 ${
                              overdue 
                                ? 'text-rose-600 dark:text-rose-400 font-bold' 
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}>
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span>{task.dueDate ? task.dueDate.split('T')[0] : 'No due date'}</span>
                              {overdue && <span className="px-1 py-0.2 bg-rose-500/10 rounded font-semibold text-[9px]">OVERDUE</span>}
                            </div>

                            {/* Assignee initials or unassigned */}
                            <div className="flex items-center gap-1" title={task.assigneeName || 'Unassigned'}>
                              <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-600 dark:text-zinc-300">
                                {task.assigneeName ? task.assigneeName.charAt(0).toUpperCase() : <User className="w-2.5 h-2.5 text-zinc-400" />}
                              </div>
                            </div>
                          </div>

                          {/* Quick Status Advance buttons */}
                          <div 
                            onClick={(e) => e.stopPropagation()} 
                            className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 text-[10px]"
                          >
                            <button
                              onClick={() => openEditModal(task)}
                              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center gap-1"
                            >
                              <Edit2 className="w-2.5 h-2.5" /> Edit
                            </button>

                            <select
                              value={task.status}
                              onChange={(e) => {
                                const nextStatus = e.target.value as ProductionTaskStatus;
                                setStatusChangeModal({ task, nextStatus });
                              }}
                              className="bg-transparent text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-semibold cursor-pointer border-0 p-0 focus:ring-0"
                            >
                              <option value="pending">Move: Pending</option>
                              <option value="in_progress">Move: In Progress</option>
                              <option value="under_review">Move: Under Review</option>
                              <option value="completed">Move: Completed</option>
                              <option value="blocked">Move: Blocked</option>
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850/60 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Task & Category</th>
                  <th className="py-3 px-4">Linked Context</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Assignee</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredTasks.map((task) => {
                  const overdue = isOverdue(task);
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setDetailTask(task)}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-amber-500 transition-colors">
                          {task.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 capitalize mt-0.5">
                          {task.category.replace('_', ' ')}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[160px]">
                        {task.clientName || task.galleryTitle ? (
                          <div className="space-y-0.5 text-[11px]">
                            {task.clientName && (
                              <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                                <Users className="w-3 h-3 text-zinc-400" />
                                <span>{task.clientName}</span>
                              </div>
                            )}
                            {task.galleryTitle && (
                              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                                <Images className="w-3 h-3 text-zinc-400" />
                                <span>{task.galleryTitle}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-[10px] italic">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={getPriorityBadgeVariant(task.priority)} size="sm">
                          {task.priority.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge 
                          variant={
                            task.status === 'completed' ? 'emerald' :
                            task.status === 'in_progress' ? 'blue' :
                            task.status === 'under_review' ? 'amber' :
                            task.status === 'blocked' ? 'rose' : 'slate'
                          } 
                          size="sm"
                        >
                          {task.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className={`font-mono text-[11px] ${overdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-zinc-600 dark:text-zinc-300'}`}>
                          {task.dueDate ? task.dueDate.split('T')[0] : '—'}
                        </div>
                        {overdue && (
                          <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wide">
                            Overdue
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-300">
                        {task.assigneeName || <span className="text-zinc-400 italic">Unassigned</span>}
                      </td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(task)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded"
                            title="Edit Task"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setTaskToArchive({ task, archive: !task.isArchived })}
                            className="p-1 text-zinc-400 hover:text-amber-500 rounded"
                            title={task.isArchived ? 'Restore' : 'Archive'}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Create Production Task
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Assign tasks to client galleries with strict studio tenancy and real Firestore persistence.
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Task Title */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Color grade wedding reception highlights"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Category & Priority Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Workflow Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {PRODUCTION_TASK_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Priority <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Initial Status & Dates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="under_review">Under Review</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Start Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Due Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Client & Gallery Associations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Link to Client (CRM)
                  </label>
                  <select
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">None (Unlinked)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Link to Gallery
                  </label>
                  <select
                    value={formData.galleryId}
                    onChange={(e) => setFormData({ ...formData, galleryId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">None (Unlinked)</option>
                    {galleries.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Assignee Selection (Optional - only authorized studio members, or unassigned) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Assignee (Studio Team)
                </label>
                <select
                  value={formData.assigneeId}
                  onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">Unassigned (Optional)</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.email} ({m.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
                {teamMembers.length === 0 && (
                  <p className="text-[10px] text-zinc-400 mt-1 italic">
                    No studio team members rostered yet. Tasks can remain unassigned until team members exist.
                  </p>
                )}
              </div>

              {/* Instructions / Description */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Scope of Work & Retouching Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Specific instructions, color grading LUT references, export aspect ratios..."
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold transition-colors shadow-2xs"
                >
                  {isSubmitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Edit Production Task
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Update task details, scheduled dates, and associated client/gallery.
                </p>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Workflow Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {PRODUCTION_TASK_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="under_review">Under Review</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Due Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Linked Client
                  </label>
                  <select
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">None (Unlinked)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Linked Gallery
                  </label>
                  <select
                    value={formData.galleryId}
                    onChange={(e) => setFormData({ ...formData, galleryId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">None (Unlinked)</option>
                    {galleries.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Assignee
                </label>
                <select
                  value={formData.assigneeId}
                  onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || m.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Instructions & Notes
                </label>
                <textarea
                  rows={3}
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold transition-colors shadow-2xs"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DETAIL VIEW MODAL */}
      {detailTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-8 space-y-6">
            {/* Top Bar */}
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={
                    detailTask.status === 'completed' ? 'emerald' :
                    detailTask.status === 'in_progress' ? 'blue' :
                    detailTask.status === 'under_review' ? 'amber' :
                    detailTask.status === 'blocked' ? 'rose' : 'slate'
                  }>
                    {detailTask.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <Badge variant={getPriorityBadgeVariant(detailTask.priority)}>
                    {detailTask.priority.toUpperCase()}
                  </Badge>
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 capitalize">
                    {detailTask.category.replace('_', ' ')}
                  </span>
                  {detailTask.isArchived && (
                    <Badge variant="zinc">ARCHIVED</Badge>
                  )}
                </div>

                <h2 className="text-xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  {detailTask.title}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    openEditModal(detailTask);
                  }}
                  className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Edit Task"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTaskToDelete(detailTask)}
                  className="p-2 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20"
                  title="Delete Task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDetailTask(null)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Meta Information Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40 space-y-2">
                <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  Timeline & Schedules
                </div>
                <div className="space-y-1 text-zinc-600 dark:text-zinc-400">
                  <div>Start Date: <span className="font-mono text-zinc-900 dark:text-zinc-100">{detailTask.startDate ? detailTask.startDate.split('T')[0] : 'Not specified'}</span></div>
                  <div>Due Date: <span className={`font-mono font-bold ${isOverdue(detailTask) ? 'text-rose-500' : 'text-zinc-900 dark:text-zinc-100'}`}>{detailTask.dueDate ? detailTask.dueDate.split('T')[0] : 'Not set'}</span></div>
                  {isOverdue(detailTask) && (
                    <div className="text-rose-500 font-bold text-[11px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Overdue for completion
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40 space-y-2">
                <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  Assignments & Associations
                </div>
                <div className="space-y-1 text-zinc-600 dark:text-zinc-400">
                  <div>Assignee: <span className="font-medium text-zinc-900 dark:text-zinc-100">{detailTask.assigneeName || 'Unassigned'}</span></div>
                  <div>Client: <span className="font-medium text-zinc-900 dark:text-zinc-100">{detailTask.clientName || 'None'}</span></div>
                  <div>Gallery: <span className="font-medium text-zinc-900 dark:text-zinc-100">{detailTask.galleryTitle || 'None'}</span></div>
                </div>
              </div>
            </div>

            {/* Scope of Work & Instructions */}
            {detailTask.instructions && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  Instructions & Production Notes
                </h4>
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {detailTask.instructions}
                </div>
              </div>
            )}

            {/* Status Transition History (Persisted Timeline) */}
            <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                Status Transition History ({detailTask.statusHistory?.length || 0})
              </h4>

              {(!detailTask.statusHistory || detailTask.statusHistory.length === 0) ? (
                <p className="text-xs text-zinc-400 italic">No transition history recorded.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {detailTask.statusHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold capitalize text-zinc-900 dark:text-zinc-100">
                            {item.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-zinc-400">by {item.changedBy}</span>
                        </div>
                        {item.note && (
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400 italic">
                            "{item.note}"
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap">
                        {new Date(item.changedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Status Bar */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500 font-medium">Quick Advance:</span>
                {STATUS_COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    disabled={detailTask.status === col.id}
                    onClick={() => {
                      setStatusChangeModal({ task: detailTask, nextStatus: col.id });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                      detailTask.status === col.id
                        ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-bold opacity-100'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {col.title}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setDetailTask(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATUS CHANGE NOTE MODAL */}
      {statusChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
              Update Task Status
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Move <strong className="text-zinc-900 dark:text-zinc-100">"{statusChangeModal.task.title}"</strong> to{' '}
              <strong className="text-amber-500 uppercase">{statusChangeModal.nextStatus.replace('_', ' ')}</strong>?
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Optional Status Note / Hand-off Context
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Skin tones finalized, exported to album design folder"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setStatusChangeModal(null);
                  setStatusNote('');
                }}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStatusChange}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl shadow-2xs"
              >
                {isSubmitting ? 'Updating...' : 'Confirm Status Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVE CONFIRMATION MODAL */}
      {taskToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
              {taskToArchive.archive ? 'Archive Production Task' : 'Restore Production Task'}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to {taskToArchive.archive ? 'archive' : 'restore'}{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">"{taskToArchive.task.title}"</strong>?
              {taskToArchive.archive
                ? ' It will be hidden from the active board view but preserved in Firestore.'
                : ' It will return to the active production board.'}
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setTaskToArchive(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmArchive}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl shadow-2xs"
              >
                {isSubmitting ? 'Processing...' : taskToArchive.archive ? 'Archive Task' : 'Restore Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
              Delete Production Task
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-zinc-900 dark:text-zinc-100">"{taskToDelete.title}"</strong>?
              This action cannot be undone.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                {isSubmitting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
