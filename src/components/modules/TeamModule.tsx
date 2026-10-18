import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Plus, 
  Mail, 
  ShieldCheck, 
  Trash2, 
  Check, 
  X, 
  Sparkles,
  Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getTeamMembers, 
  inviteTeamMember, 
  removeTeamMember 
} from '../../services/studioService';
import { StudioMember, StudioRole } from '../../types';
import { Badge } from '../common/Badge';

const ROLE_PERMISSIONS: Record<StudioRole, { label: string; desc: string; perms: string[] }> = {
  owner: {
    label: 'Studio Owner',
    desc: 'Complete administrative control over studio settings, tenant billing, and collections.',
    perms: ['Full Studio Admin', 'Manage Quota & Plans', 'Publish & Delete Galleries', 'Full Client CRM', 'Invite / Remove Staff']
  },
  lead_photographer: {
    label: 'Lead Photographer',
    desc: 'Primary artist who can manage shoots, publish galleries, and communicate with clients.',
    perms: ['Create & Publish Galleries', 'Full Client CRM', 'Upload High-Res Assets', 'View Team Roster']
  },
  associate_photographer: {
    label: 'Associate Photographer',
    desc: 'Shooter who uploads collections and manages assigned shoots.',
    perms: ['Create Draft Galleries', 'Upload Assets', 'View Assigned Clients']
  },
  retoucher: {
    label: 'Post-Production / Retoucher',
    desc: 'Color grader and editor managing asset quality and proof replacements.',
    perms: ['Upload Edited Assets', 'View In-Review Proofs', 'No Client PII Access']
  },
  assistant: {
    label: 'Studio Assistant',
    desc: 'Operations coordinator for scheduling and gallery preparation.',
    perms: ['View Drafts', 'Prepare Client Listings', 'Read Only Access']
  }
};

export const TeamModule: React.FC = () => {
  const { activeStudio, user } = useAuth();
  const [members, setMembers] = useState<StudioMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<StudioMember | null>(null);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Invite form
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    role: 'lead_photographer' as StudioRole,
    memberUid: '',
  });

  const loadData = async () => {
    if (!activeStudio) return;
    setLoading(true);
    try {
      const list = await getTeamMembers(activeStudio.id);
      setMembers(list);
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStudio]);

  const handleCopyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio || !formData.displayName.trim() || !formData.email.trim()) return;

    setIsSubmitting(true);
    try {
      await inviteTeamMember({
        studioId: activeStudio.id,
        email: formData.email,
        displayName: formData.displayName,
        role: formData.role,
        memberUid: formData.memberUid.trim() || undefined,
      });

      setInviteModalOpen(false);
      setFormData({
        displayName: '',
        email: '',
        role: 'lead_photographer',
        memberUid: '',
      });
      await loadData();
    } catch (err) {
      console.error('Error inviting team member:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = (member: StudioMember) => {
    if (member.role === 'owner') {
      setRemoveNotice('The Studio Owner cannot be removed from the studio roster.');
      return;
    }
    setMemberToRemove(member);
  };

  const confirmRemoveMember = async () => {
    if (!activeStudio || !memberToRemove) return;

    try {
      await removeTeamMember(activeStudio.id, memberToRemove.id, memberToRemove.displayName);
      setMemberToRemove(null);
      await loadData();
    } catch (err) {
      console.error('Error removing team member:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Studio Team & Collaborators
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Role-based staff permissions for {activeStudio?.name}
          </p>
        </div>
        <button
          onClick={() => setInviteModalOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors shadow-xs flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Authorize Team Member
        </button>
      </div>

      {/* User UID share bar */}
      {user?.uid && (
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="text-zinc-600 dark:text-zinc-400">
              Your Authenticated Account UID: <span className="font-mono text-zinc-900 dark:text-zinc-100 font-medium">{user.uid}</span>
            </span>
          </div>
          <button
            onClick={handleCopyUid}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors self-start sm:self-auto flex items-center gap-1.5"
          >
            {copiedUid ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Mail className="w-3.5 h-3.5" />}
            {copiedUid ? 'Copied to Clipboard' : 'Copy UID'}
          </button>
        </div>
      )}

      {removeNotice && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>{removeNotice}</span>
          </div>
          <button onClick={() => setRemoveNotice(null)} className="text-amber-500 hover:text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Team Roster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-xs text-zinc-400">Loading team members...</div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-4 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center font-bold text-sm">
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      {member.displayName}
                    </div>
                    <div className="text-xs text-zinc-400 flex items-center gap-1">
                      <Mail className="w-3 h-3 text-zinc-400" />
                      <span>{member.email}</span>
                    </div>
                  </div>
                </div>

                <Badge variant={
                  member.role === 'owner' ? 'gold' :
                  member.role === 'lead_photographer' ? 'blue' :
                  member.role === 'associate_photographer' ? 'emerald' :
                  member.role === 'retoucher' ? 'amber' : 'zinc'
                }>
                  {ROLE_PERMISSIONS[member.role]?.label || member.role}
                </Badge>
              </div>

              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-1">
                <div>Status: <span className="font-medium capitalize text-zinc-700 dark:text-zinc-300">{member.status}</span></div>
                <div>Joined: <span className="font-mono text-zinc-400">{new Date(member.joinedAt).toLocaleDateString()}</span></div>
              </div>

              {member.role !== 'owner' && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => handleRemove(member)}
                    className="text-[11px] text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Revoke Access
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Permissions Hierarchy Reference Matrix */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
            Role-Based Authorization Architecture (RBAC)
          </h2>
        </div>
        <p className="text-xs text-zinc-500 max-w-2xl">
          StudioCloud strictly enforces data tenancy and member roles at the Firestore Security Rules level. Staff members cannot access unauthorized documents or execute administrative operations without explicit clearance.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {Object.entries(ROLE_PERMISSIONS).map(([roleKey, roleInfo]) => (
            <div key={roleKey} className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-2">
              <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-200">
                {roleInfo.label}
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {roleInfo.desc}
              </p>
              <ul className="space-y-1 pt-1">
                {roleInfo.perms.map((p, idx) => (
                  <li key={idx} className="text-[10px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Invite Team Member
                </h2>
                <p className="text-xs text-zinc-500">
                  Add staff to {activeStudio?.name}
                </p>
              </div>
              <button 
                onClick={() => setInviteModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Julian Hayes"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="photographer@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Teammate Account UID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 5qK9jWz... (for instant zero-trust authorization)"
                  value={formData.memberUid}
                  onChange={(e) => setFormData({ ...formData, memberUid: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:border-amber-500"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  If your teammate has already created their account, providing their UID enables immediate Firestore clearance.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Assigned Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as StudioRole })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-amber-500"
                >
                  <option value="lead_photographer">Lead Photographer</option>
                  <option value="associate_photographer">Associate Photographer</option>
                  <option value="retoucher">Post-Production / Retoucher</option>
                  <option value="assistant">Studio Assistant</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending Invitation...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVE MEMBER CONFIRMATION MODAL */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Revoke Studio Team Access
              </h3>
              <button 
                onClick={() => setMemberToRemove(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to remove <strong className="text-zinc-900 dark:text-zinc-100">"{memberToRemove.displayName}"</strong> from {activeStudio?.name}? 
              They will no longer be able to access studio galleries or client records.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setMemberToRemove(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveMember}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
