import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  Lock, 
  Globe, 
  EyeOff, 
  ShieldAlert, 
  Calendar, 
  Key, 
  RefreshCw, 
  ExternalLink,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Gallery, GalleryPrivacy } from '../../types';
import { generateGalleryShareToken } from '../../services/proofingService';
import { updateGallery } from '../../services/studioService';

interface ShareGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gallery: Gallery;
  studioSlug?: string;
  onGalleryUpdated: (updatedGallery: Partial<Gallery>) => void;
  onOpenClientPreview: () => void;
}

export const ShareGalleryModal: React.FC<ShareGalleryModalProps> = ({
  isOpen,
  onClose,
  gallery,
  studioSlug,
  onGalleryUpdated,
  onOpenClientPreview,
}) => {
  const [privacy, setPrivacy] = useState<GalleryPrivacy>(gallery.privacy || 'unlisted');
  const [shareToken, setShareToken] = useState<string>(gallery.shareToken || '');
  const [accessPassword, setAccessPassword] = useState<string>(gallery.accessPassword || '');
  const [expiresAt, setExpiresAt] = useState<string>(gallery.expiresAt || '');
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize token if gallery does not have one
  useEffect(() => {
    if (isOpen) {
      setPrivacy(gallery.privacy || 'unlisted');
      setAccessPassword(gallery.accessPassword || '');
      setExpiresAt(gallery.expiresAt || '');
      setSaveSuccess(false);
      setErrorMessage(null);

      if (!gallery.shareToken) {
        setShareToken(generateGalleryShareToken());
      } else {
        setShareToken(gallery.shareToken);
      }
    }
  }, [isOpen, gallery]);

  if (!isOpen) return null;

  // Construct client gallery URL
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tokenParam = shareToken ? `&token=${encodeURIComponent(shareToken)}` : '';
  const shareUrl = `${origin}/?view=gallery&id=${gallery.id}&studio=${gallery.studioId}${tokenParam}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleRegenerateToken = () => {
    const newToken = generateGalleryShareToken();
    setShareToken(newToken);
  };

  const handleSetExpiryPreset = (days: number | null) => {
    if (days === null) {
      setExpiresAt('');
    } else {
      const d = new Date();
      d.setDate(d.getDate() + days);
      setExpiresAt(d.toISOString().split('T')[0]);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const updates: Partial<Gallery> = {
        privacy,
        shareToken,
        accessPassword: privacy === 'password_protected' ? accessPassword.trim() : accessPassword.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      };

      await updateGallery(gallery.studioId, gallery.id, updates);
      onGalleryUpdated(updates);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update gallery sharing settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div 
        className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Share Client Gallery
              </h2>
              <p className="text-xs text-zinc-500 truncate max-w-xs">
                {gallery.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Development Preview Mode Label */}
        <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Development Preview Mode:</strong> Client viewing, album approval, and proofing are active with real Firestore metadata.
          </span>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {errorMessage && (
            <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Sharing preferences successfully saved to Firestore!</span>
            </div>
          )}

          {/* Shareable Link Box */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Client Access URL</span>
              <span className="text-[11px] text-zinc-400 font-normal">Secure Share Link</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-800 dark:text-zinc-200 focus:outline-hidden select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-950" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Privacy & Visibility Settings */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Gallery Visibility & Access Tier
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPrivacy('unlisted')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  privacy === 'unlisted'
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 text-zinc-900 dark:text-zinc-100 ring-1 ring-amber-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <EyeOff className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Unlisted (Recommended)</div>
                  <div className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                    Requires unique cryptographic share link
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('password_protected')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  privacy === 'password_protected'
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 text-zinc-900 dark:text-zinc-100 ring-1 ring-amber-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Lock className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Password Protected</div>
                  <div className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                    Requires client security password
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('public')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  privacy === 'public'
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 text-zinc-900 dark:text-zinc-100 ring-1 ring-amber-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Globe className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Public Access</div>
                  <div className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                    Viewable by anyone with direct link
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('private')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  privacy === 'private'
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 text-zinc-900 dark:text-zinc-100 ring-1 ring-amber-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <ShieldAlert className="w-4 h-4 mt-0.5 text-zinc-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Private (Studio Only)</div>
                  <div className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                    Internal studio workspace only
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Password Input (if password_protected) */}
          {privacy === 'password_protected' && (
            <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 space-y-2 animate-in fade-in">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-500" />
                Gallery Access Password
              </label>
              <input
                type="text"
                placeholder="e.g. Wedding2026! or 4-digit PIN"
                value={accessPassword}
                onChange={(e) => setAccessPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <p className="text-[11px] text-zinc-500">
                Clients must enter this password to unlock gallery photos, favourites, and proofing.
              </p>
            </div>
          )}

          {/* Secure Share Token Management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Cryptographic Share Token
              </label>
              <button
                type="button"
                onClick={handleRegenerateToken}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate Token
              </button>
            </div>
            <input
              type="text"
              readOnly
              value={shareToken}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400"
            />
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Regenerating this token invalidates all previously shared links to prevent unauthorized access.
            </p>
          </div>

          {/* Link Expiration Date */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              Shared Link Expiration
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSetExpiryPreset(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  !expiresAt
                    ? 'bg-zinc-800 text-white border-zinc-700 dark:bg-zinc-200 dark:text-zinc-900'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Never
              </button>
              <button
                type="button"
                onClick={() => handleSetExpiryPreset(7)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 transition-colors"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => handleSetExpiryPreset(30)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 transition-colors"
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => handleSetExpiryPreset(90)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 transition-colors"
              >
                90 Days
              </button>
              <input
                type="date"
                value={expiresAt ? expiresAt.split('T')[0] : ''}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-850 text-zinc-700 dark:text-zinc-300 focus:outline-hidden"
              />
            </div>
            {expiresAt && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Access will automatically expire on {new Date(expiresAt).toLocaleDateString()}.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-850/60 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenClientPreview();
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview Client View
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Sharing Preferences'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
