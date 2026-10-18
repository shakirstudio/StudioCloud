import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Heart, 
  Check, 
  Star, 
  MessageSquare, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Lock, 
  Calendar, 
  Eye, 
  Send, 
  User, 
  Mail, 
  Info, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  ArrowLeft,
  Sparkles,
  Camera,
  Layers,
  Clock,
  ShieldCheck,
  MapPin,
  Phone,
  Globe,
  AlertTriangle
} from 'lucide-react';
import { Gallery, MediaItem, PhotoProofItem, Studio } from '../../types';
import { 
  getGalleryProofing, 
  savePhotoProofItem, 
  getEffectiveProofingSettings,
  submitClientProofingReview
} from '../../services/proofingService';
import { getStudioById, formatBytes, getFontFamilyStyle, resolveGalleryDesign } from '../../services/studioService';
import { auth } from '../../firebase/config';

interface ClientGalleryViewProps {
  galleryId: string;
  studioId: string;
  shareToken?: string | null;
  onBackToStudio?: () => void;
  isStudioPreview?: boolean;
}

export const ClientGalleryView: React.FC<ClientGalleryViewProps> = ({
  galleryId,
  studioId,
  shareToken,
  onBackToStudio,
  isStudioPreview = false,
}) => {
  // Gallery and Studio data
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [proofingItems, setProofingItems] = useState<PhotoProofItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [brokenMediaIds, setBrokenMediaIds] = useState<Record<string, boolean>>({});

  const markMediaBroken = (id: string) => {
    setBrokenMediaIds(prev => ({ ...prev, [id]: true }));
  };

  // Password Gate
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Client Identification & Session
  const [clientEmail, setClientEmail] = useState<string>(() => {
    return localStorage.getItem(`studiocloud_client_email_${galleryId}`) || auth.currentUser?.email || '';
  });
  const [clientName, setClientName] = useState<string>(() => {
    return localStorage.getItem(`studiocloud_client_name_${galleryId}`) || auth.currentUser?.displayName || '';
  });
  const [clientPassword, setClientPassword] = useState('');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [proofingError, setProofingError] = useState<string | null>(null);
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const [pendingActionMediaId, setPendingActionMediaId] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<'favourite' | 'album' | 'comment' | 'submit' | null>(null);

  // Filter & Navigation
  const [activeFilter, setActiveFilter] = useState<'all' | 'favourites' | 'album' | 'commented'>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Load gallery metadata, media, and client proofing via trusted backend proxy
  const fetchGalleryViaProxy = useCallback(async (passwordToAttempt?: string) => {
    setLoading(true);
    setAccessError(null);
    setPasswordError(null);

    try {
      let studioData: Studio | null = null;
      try {
        studioData = await getStudioById(studioId);
        if (studioData) setStudio(studioData);
      } catch {
        // Unauthenticated or external clients are isolated from studio tenant document; graceful fallback to embedded branding
      }

      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const effectivePassword = passwordToAttempt !== undefined ? passwordToAttempt : (passwordInput.trim() || undefined);

      const res = await fetch('/api/gallery/client/view', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          studioId,
          galleryId,
          shareToken: shareToken || undefined,
          password: effectivePassword,
          isStudioPreview,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401 && data.requiresPassword) {
        setGallery({
          id: galleryId,
          studioId,
          title: data.title || 'Protected Collection',
          privacy: 'password_protected',
          status: 'published',
        } as Gallery);
        setPasswordVerified(false);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        if (res.status === 403 && data.error === 'INVALID_GALLERY_PASSWORD') {
          setPasswordError(data.message || 'Incorrect collection password. Please re-enter the password provided by the studio.');
          setLoading(false);
          return;
        }
        if (res.status === 429) {
          setPasswordError(data.message || 'Too many failed access attempts. Please try again later.');
          setLoading(false);
          return;
        }
        if (res.status === 410) {
          setAccessError(data.message || 'This collection share link has expired. Please contact the studio for an extension.');
          setLoading(false);
          return;
        }
        setAccessError(data.message || 'You do not have permission to view this gallery.');
        setLoading(false);
        return;
      }

      // Successful 200 OK
      setGallery(data.gallery);
      setMediaItems(data.mediaItems || []);
      setPasswordVerified(true);
      setPasswordError(null);
      setAccessError(null);

      // Load client proofing via trusted backend proxy
      if (token) {
        try {
          const queryParams = new URLSearchParams({ studioId, galleryId });
          if (shareToken) queryParams.set('shareToken', shareToken);
          if (effectivePassword) queryParams.set('password', effectivePassword);

          const proofRes = await fetch(`/api/gallery/client/proofing?${queryParams.toString()}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (proofRes.ok) {
            const proofData = await proofRes.json();
            setProofingItems(proofData.proofingItems || []);
          }
        } catch (proofErr) {
          console.warn('Could not load client proofing records:', proofErr);
        }
      } else {
        setProofingItems([]);
      }
    } catch (err: any) {
      console.error('Error loading client gallery via proxy:', err);
      setAccessError(err?.message || 'Failed to connect to gallery service.');
    } finally {
      setLoading(false);
    }
  }, [galleryId, studioId, shareToken, isStudioPreview, passwordInput]);

  useEffect(() => {
    fetchGalleryViaProxy();
  }, [fetchGalleryViaProxy]);

  // Handle password submission to backend proxy
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPw = passwordInput.trim();
    if (!cleanPw) {
      setPasswordError('Please enter the access password.');
      return;
    }
    setIsSubmittingPassword(true);
    try {
      await fetchGalleryViaProxy(cleanPw);
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  // Proofing Map for quick lookup: mediaId -> PhotoProofItem
  const clientProofMap = useMemo(() => {
    const map = new Map<string, PhotoProofItem>();
    if (!clientEmail) return map;
    const normalized = clientEmail.toLowerCase().trim();

    for (const item of proofingItems) {
      if (item.clientEmail.toLowerCase().trim() === normalized) {
        map.set(item.mediaId, item);
      }
    }
    return map;
  }, [proofingItems, clientEmail]);

  // Filtered Media List
  const filteredMedia = useMemo(() => {
    if (activeFilter === 'all') return mediaItems;

    return mediaItems.filter(media => {
      const proof = clientProofMap.get(media.id);
      if (activeFilter === 'favourites') return proof?.isFavourite;
      if (activeFilter === 'album') return proof?.isApprovedForAlbum;
      if (activeFilter === 'commented') return proof?.comment && proof.comment.trim().length > 0;
      return true;
    });
  }, [mediaItems, activeFilter, clientProofMap]);

  // All comments for current photo in lightbox
  const lightboxItem = useMemo(() => {
    if (lightboxIndex === null || lightboxIndex < 0 || lightboxIndex >= filteredMedia.length) return null;
    return filteredMedia[lightboxIndex];
  }, [lightboxIndex, filteredMedia]);

  const currentPhotoComments = useMemo(() => {
    if (!lightboxItem) return [];
    return proofingItems.filter(
      p => p.mediaId === lightboxItem.id && p.comment && p.comment.trim().length > 0
    );
  }, [lightboxItem, proofingItems]);

  // Counts for tabs
  const favouritesCount = useMemo(() => {
    return Array.from(clientProofMap.values()).filter(p => p.isFavourite).length;
  }, [clientProofMap]);

  const albumCount = useMemo(() => {
    return Array.from(clientProofMap.values()).filter(p => p.isApprovedForAlbum).length;
  }, [clientProofMap]);

  // Proofing Settings & Policy
  const proofingSettings = useMemo(() => getEffectiveProofingSettings(gallery), [gallery]);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Quick Google authentication for client proofing
  const handleGoogleClientSignIn = async () => {
    setIsAuthenticating(true);
    setAuthNotice(null);
    try {
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      if (res.user) {
        const email = res.user.email || '';
        const name = res.user.displayName || email.split('@')[0];
        setClientEmail(email);
        setClientName(name);
        localStorage.setItem(`studiocloud_client_email_${galleryId}`, email);
        localStorage.setItem(`studiocloud_client_name_${galleryId}`, name);
        setShowIdentifyModal(false);

        // Fetch client proofing with authentic ID token
        const token = await res.user.getIdToken();
        const queryParams = new URLSearchParams({ studioId, galleryId });
        if (shareToken) queryParams.set('shareToken', shareToken);
        if (passwordInput) queryParams.set('password', passwordInput.trim());

        const proofRes = await fetch(`/api/gallery/client/proofing?${queryParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (proofRes.ok) {
          const proofData = await proofRes.json();
          setProofingItems(proofData.proofingItems || []);
        }

        // Resume pending actions
        if (pendingActionType === 'submit') {
          handleSubmitSelections(email, name);
          setPendingActionType(null);
        } else if (pendingActionMediaId && pendingActionType) {
          if (pendingActionType === 'favourite') {
            toggleFavourite(pendingActionMediaId, email, name);
          } else if (pendingActionType === 'album') {
            toggleAlbum(pendingActionMediaId, email, name);
          }
          setPendingActionMediaId(null);
          setPendingActionType(null);
        }
      }
    } catch (err: any) {
      setAuthNotice(err?.message || 'Google authentication was not completed.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Save client identity & authenticate
  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanE = clientEmail.trim().toLowerCase();
    const cleanN = clientName.trim() || cleanE.split('@')[0];

    if (!cleanE || !cleanE.includes('@')) {
      setAuthNotice('Please enter a valid email address.');
      return;
    }

    setAuthNotice(null);
    setIsAuthenticating(true);

    try {
      // If user is not yet signed into Firebase, establish client authentication session
      if (!auth.currentUser) {
        if (!clientPassword || clientPassword.length < 6) {
          setAuthNotice('Please provide a password (minimum 6 characters) to protect your client selections.');
          setIsAuthenticating(false);
          return;
        }

        try {
          const { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
          try {
            await signInWithEmailAndPassword(auth, cleanE, clientPassword);
          } catch (signInErr: any) {
            if (signInErr?.code === 'auth/user-not-found' || signInErr?.code === 'auth/invalid-credential') {
              const userCred = await createUserWithEmailAndPassword(auth, cleanE, clientPassword);
              if (userCred.user && cleanN) {
                await updateProfile(userCred.user, { displayName: cleanN }).catch(() => null);
              }
            } else {
              throw signInErr;
            }
          }
        } catch (authErr: any) {
          setAuthNotice(authErr?.message || 'Authentication failed. Please verify your credentials.');
          setIsAuthenticating(false);
          return;
        }
      }

      localStorage.setItem(`studiocloud_client_email_${galleryId}`, cleanE);
      localStorage.setItem(`studiocloud_client_name_${galleryId}`, cleanN);
      setShowIdentifyModal(false);

      // Re-fetch client proofing selections with new auth token
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        try {
          const queryParams = new URLSearchParams({ studioId, galleryId });
          if (shareToken) queryParams.set('shareToken', shareToken);
          if (passwordInput) queryParams.set('password', passwordInput.trim());

          const proofRes = await fetch(`/api/gallery/client/proofing?${queryParams.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (proofRes.ok) {
            const proofData = await proofRes.json();
            setProofingItems(proofData.proofingItems || []);
          }
        } catch {}
      }

      // Resume pending action if any
      if (pendingActionType === 'submit') {
        handleSubmitSelections(cleanE, cleanN);
        setPendingActionType(null);
      } else if (pendingActionMediaId && pendingActionType) {
        if (pendingActionType === 'favourite') {
          toggleFavourite(pendingActionMediaId, cleanE, cleanN);
        } else if (pendingActionType === 'album') {
          toggleAlbum(pendingActionMediaId, cleanE, cleanN);
        }
        setPendingActionMediaId(null);
        setPendingActionType(null);
      }
    } catch (generalErr: any) {
      setAuthNotice(generalErr?.message || 'An error occurred during identification.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Toggle Favourite
  const toggleFavourite = async (mediaId: string, emailOverride?: string, nameOverride?: string) => {
    if (!proofingSettings.enabled || !proofingSettings.allowFavourites) {
      return;
    }
    const email = emailOverride || clientEmail;
    const name = nameOverride || clientName;

    if (!email || !auth.currentUser) {
      setPendingActionMediaId(mediaId);
      setPendingActionType('favourite');
      setShowIdentifyModal(true);
      return;
    }

    const current = clientProofMap.get(mediaId);
    const nextVal = !current?.isFavourite;
    setProofingError(null);

    try {
      const updated = await savePhotoProofItem({
        studioId,
        galleryId,
        mediaId,
        clientEmail: email,
        clientName: name || email.split('@')[0],
        isFavourite: nextVal,
        existingItem: current,
        shareToken,
        password: passwordInput.trim() || undefined,
      });

      // Update local state
      setProofingItems(prev => {
        const without = prev.filter(p => p.id !== updated.id && p.mediaId !== mediaId);
        return [...without, updated];
      });
    } catch (err: any) {
      console.error('Failed to toggle favourite:', err);
      const msg = err?.message || 'Failed to toggle favourite selection.';
      if (msg.includes('AUTHENTICATION_REQUIRED')) {
        setPendingActionMediaId(mediaId);
        setPendingActionType('favourite');
        setShowIdentifyModal(true);
      } else {
        setProofingError(msg);
      }
    }
  };

  // Toggle Album Approval
  const toggleAlbum = async (mediaId: string, emailOverride?: string, nameOverride?: string) => {
    if (!proofingSettings.enabled || !proofingSettings.allowAlbumSelection) {
      return;
    }
    const email = emailOverride || clientEmail;
    const name = nameOverride || clientName;

    if (!email || !auth.currentUser) {
      setPendingActionMediaId(mediaId);
      setPendingActionType('album');
      setShowIdentifyModal(true);
      return;
    }

    const current = clientProofMap.get(mediaId);
    const nextVal = !current?.isApprovedForAlbum;

    // Check maximum selection quota if selecting a new photo
    if (nextVal && proofingSettings.maxAlbumSelections && albumCount >= proofingSettings.maxAlbumSelections) {
      setLimitWarning(`Album selection limit reached: You can choose a maximum of ${proofingSettings.maxAlbumSelections} photos. Please unselect another image first.`);
      return;
    }
    setLimitWarning(null);
    setProofingError(null);

    try {
      const updated = await savePhotoProofItem({
        studioId,
        galleryId,
        mediaId,
        clientEmail: email,
        clientName: name || email.split('@')[0],
        isApprovedForAlbum: nextVal,
        existingItem: current,
        shareToken,
        password: passwordInput.trim() || undefined,
      });

      setProofingItems(prev => {
        const without = prev.filter(p => p.id !== updated.id && p.mediaId !== mediaId);
        return [...without, updated];
      });
    } catch (err: any) {
      console.error('Failed to toggle album selection:', err);
      const msg = err?.message || 'Failed to toggle album selection.';
      if (msg.includes('AUTHENTICATION_REQUIRED')) {
        setPendingActionMediaId(mediaId);
        setPendingActionType('album');
        setShowIdentifyModal(true);
      } else {
        setProofingError(msg);
      }
    }
  };

  // Submit Selections to Studio
  const handleSubmitSelections = async (emailOverride?: string, nameOverride?: string) => {
    const email = emailOverride || clientEmail;
    const name = nameOverride || clientName;

    if (!email || !auth.currentUser) {
      setPendingActionType('submit');
      setShowIdentifyModal(true);
      return;
    }

    setIsSubmittingReview(true);
    setLimitWarning(null);
    setProofingError(null);
    try {
      await submitClientProofingReview({
        studioId,
        galleryId,
        clientEmail: email,
        clientName: name || email.split('@')[0],
        totalAlbumSelections: albumCount,
        totalFavourites: favouritesCount,
        shareToken,
        password: passwordInput.trim() || undefined,
      });
      setSubmissionSuccess(true);
    } catch (err: any) {
      console.error('Failed to submit client review:', err);
      const msg = err?.message || 'Failed to submit client review.';
      if (msg.includes('AUTHENTICATION_REQUIRED')) {
        setPendingActionType('submit');
        setShowIdentifyModal(true);
      } else {
        setProofingError(msg);
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Post Comment in Lightbox
  const handlePostComment = async () => {
    if (!lightboxItem || !newCommentText.trim() || !proofingSettings.allowComments) return;

    if (!clientEmail || !auth.currentUser) {
      setPendingActionMediaId(lightboxItem.id);
      setPendingActionType('comment');
      setShowIdentifyModal(true);
      return;
    }

    setIsPostingComment(true);
    setProofingError(null);
    try {
      const updated = await savePhotoProofItem({
        studioId,
        galleryId,
        mediaId: lightboxItem.id,
        clientEmail,
        clientName: clientName || clientEmail.split('@')[0],
        comment: newCommentText.trim(),
        existingItem: clientProofMap.get(lightboxItem.id),
        shareToken,
        password: passwordInput.trim() || undefined,
      });

      setProofingItems(prev => {
        const without = prev.filter(p => p.id !== updated.id && p.mediaId !== lightboxItem.id);
        return [...without, updated];
      });
      setNewCommentText('');
    } catch (err: any) {
      console.error('Failed to save comment:', err);
      const msg = err?.message || 'Failed to save comment.';
      if (msg.includes('AUTHENTICATION_REQUIRED')) {
        setPendingActionMediaId(lightboxItem.id);
        setPendingActionType('comment');
        setShowIdentifyModal(true);
      } else {
        setProofingError(msg);
      }
    } finally {
      setIsPostingComment(false);
    }
  };

  // Keyboard navigation for Lightbox
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return;

    if (e.key === 'ArrowLeft') {
      setLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : filteredMedia.length - 1));
    } else if (e.key === 'ArrowRight') {
      setLightboxIndex(prev => (prev !== null && prev < filteredMedia.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'Escape') {
      setLightboxIndex(null);
    }
  }, [lightboxIndex, filteredMedia.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <div className="font-serif text-xl font-bold tracking-tight">StudioCloud</div>
        <p className="text-xs text-zinc-400 font-mono mt-1">Loading gallery collection & proofing session...</p>
      </div>
    );
  }

  // Access Error State
  if (accessError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-6 sm:p-12 font-sans">
        <div className="max-w-md mx-auto text-center space-y-6 my-auto animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mx-auto flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-serif font-bold text-white tracking-tight">
              Access Restricted
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {accessError}
            </p>
          </div>

          {onBackToStudio && (
            <button
              onClick={onBackToStudio}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Studio Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  // Password Gate Form
  if (gallery?.privacy === 'password_protected' && !passwordVerified && !isStudioPreview) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-6 sm:p-12 font-sans">
        <div className="max-w-md mx-auto w-full my-auto space-y-6 text-center animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-amber-500 uppercase tracking-widest font-mono">
              {studio?.name || 'StudioCloud Photography'}
            </div>
            <h1 className="text-2xl font-serif font-bold text-white tracking-tight">
              {gallery.title}
            </h1>
            <p className="text-xs text-zinc-400">
              This client collection is protected. Please enter the gallery access password to view photos.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-sm mx-auto">
            {passwordError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="space-y-2">
              <input
                type="password"
                placeholder="Enter gallery password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-xs bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-center tracking-widest"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs"
            >
              Unlock Gallery
            </button>
          </form>

          {onBackToStudio && (
            <button
              onClick={onBackToStudio}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Studio
            </button>
          )}
        </div>
      </div>
    );
  }

  const branding = studio?.branding;
  const resolvedDesign = resolveGalleryDesign(gallery, studio);
  const accentColor = resolvedDesign.accentColor || branding?.galleryAccentColor || branding?.accentColor || branding?.primaryColor || '#c5a059';
  const secondaryColor = branding?.secondaryColor || '#27272a';
  const isLightTheme = resolvedDesign.galleryTheme === 'light' || (!isStudioPreview && branding?.galleryTheme === 'light');
  const fontFamilyStyle = getFontFamilyStyle(resolvedDesign.fontFamily || branding?.fontFamily);
  const logoPlacement = resolvedDesign.logoPlacement || branding?.logoPlacement || 'left';
  const coverStyle = resolvedDesign.coverStyle || branding?.coverStyle || 'hero_gradient';
  const galleryLayout = resolvedDesign.layout || 'grid';
  const columnsCount = resolvedDesign.columns || 3;
  const gridSpacing = resolvedDesign.spacing || 'normal';
  const studioDisplayName = studio?.displayName || studio?.name || 'StudioCloud Photography';
  const containerBg = branding?.galleryBackgroundColor 
    ? branding.galleryBackgroundColor 
    : isLightTheme ? '#fafaf9' : '#09090b';

  return (
    <div 
      className={`min-h-screen flex flex-col font-sans transition-colors ${
        isLightTheme ? 'text-zinc-900 bg-white' : 'text-zinc-100 bg-zinc-950'
      }`}
      style={{ 
        backgroundColor: containerBg,
        color: isLightTheme ? '#18181b' : '#fafafa' 
      }}
    >
      {/* Studio Preview Top Bar (if viewed from studio dashboard) */}
      {isStudioPreview && onBackToStudio && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs text-amber-300 font-medium">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Studio Staff Preview Mode — You are viewing this collection as your clients will see it.</span>
          </div>
          <button
            onClick={onBackToStudio}
            className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Studio
          </button>
        </div>
      )}

      {/* Client Proofing Notification / Error Notice */}
      {proofingError && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{proofingError}</span>
          </div>
          <button
            onClick={() => setProofingError(null)}
            className="text-amber-400 hover:text-white px-2 py-0.5 rounded-sm transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Honest Storage Notice Banner */}
      <div className={`border-b px-4 sm:px-8 py-2 flex items-center justify-between text-[11px] ${
        isLightTheme ? 'bg-zinc-100/80 border-zinc-200 text-zinc-600' : 'bg-zinc-900/80 border-zinc-800/80 text-zinc-400'
      }`}>
        <div className="flex items-center gap-2 truncate">
          <Info className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          <span className="truncate">
            <strong className={isLightTheme ? 'text-zinc-800' : 'text-zinc-300'}>Object Storage Status: Not Connected.</strong> Development preview mode active. Local media demonstrations are stored within temporary session memory.
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500 flex-shrink-0">
          <span>Tenant: @{studio?.slug || 'studio'}</span>
          <span>•</span>
          <span>Proofing: Active</span>
          <span>•</span>
          <span className={gallery?.downloadAccess ? 'text-emerald-400' : 'text-amber-400 font-medium'}>
            {gallery?.downloadAccess ? 'Downloads: Permitted' : 'View Only (Downloads Disabled)'}
          </span>
        </div>
      </div>

      {/* Hero Header & Studio Branding with Configurable Cover Styles */}
      <header className={`px-4 sm:px-8 lg:px-12 pt-10 pb-8 border-b ${
        isLightTheme ? 'border-zinc-200 bg-zinc-50/50' : 'border-zinc-900 bg-gradient-to-b from-zinc-900/40 to-transparent'
      }`}>
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Studio Brand Logo or Name with Configurable Placement */}
          <div className={`flex items-center ${
            logoPlacement === 'center' ? 'justify-center text-center' :
            logoPlacement === 'right' ? 'justify-end text-right' :
            'justify-start text-left'
          }`}>
            {branding?.logoUrl ? (
              <img 
                src={branding.logoUrl} 
                alt={studioDisplayName} 
                className="max-h-12 max-w-[220px] object-contain rounded-md"
              />
            ) : (
              <span 
                className="text-xs uppercase tracking-widest font-mono font-bold"
                style={{ color: accentColor }}
              >
                {studioDisplayName}
              </span>
            )}
          </div>

          {/* Cover Style Rendering */}
          {coverStyle === 'split' && gallery?.coverImageUrl ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center pt-2">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {gallery?.eventType && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {gallery.eventType}
                    </span>
                  )}
                  <span className="text-xs font-mono opacity-60">Verified Collection</span>
                </div>

                <h1 
                  className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
                  style={{ fontFamily: fontFamilyStyle }}
                >
                  {gallery?.title}
                </h1>

                {gallery?.description && (
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-xl">
                    {gallery.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
                  {gallery?.shootDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{new Date(gallery.shootDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 font-mono">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{mediaItems.length} Available Photos</span>
                  </div>
                </div>
              </div>

              <div className="relative aspect-16/10 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
                <img 
                  src={gallery.coverImageUrl} 
                  alt={gallery.title}
                  className="w-full h-full object-cover" 
                />
              </div>
            </div>
          ) : coverStyle === 'full' && gallery?.coverImageUrl ? (
            <div className="relative rounded-3xl overflow-hidden min-h-[320px] flex flex-col justify-end p-6 sm:p-10 border border-zinc-800 shadow-2xl">
              <img 
                src={gallery.coverImageUrl} 
                alt={gallery.title}
                className="absolute inset-0 w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
              <div className="relative z-10 space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  {gallery?.eventType && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-200 border border-zinc-700">
                      {gallery.eventType}
                    </span>
                  )}
                </div>
                <h1 
                  className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white"
                  style={{ fontFamily: fontFamilyStyle }}
                >
                  {gallery?.title}
                </h1>
                {gallery?.description && (
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    {gallery.description}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-3">
                  {gallery?.eventType && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {gallery.eventType}
                    </span>
                  )}
                </div>

                <h1 
                  className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
                  style={{ fontFamily: fontFamilyStyle }}
                >
                  {gallery?.title}
                </h1>

                {gallery?.description && (
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {gallery.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
                  {gallery?.shootDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{new Date(gallery.shootDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 font-mono">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{mediaItems.length} Available Photos</span>
                  </div>
                  {gallery?.expiresAt && (
                    <div className="flex items-center gap-1.5 text-amber-400/80">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Available until {new Date(gallery.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Identity Pill & Proofing Action */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {clientEmail ? (
                  <button
                    onClick={() => setShowIdentifyModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white flex items-center gap-2 transition-colors"
                    title="Change proofing profile"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-medium truncate max-w-[140px]">{clientName || clientEmail}</span>
                    <span className="text-[10px] text-zinc-500">Edit</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowIdentifyModal(true)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-xs font-semibold flex items-center gap-2 transition-colors"
                    style={{ color: accentColor }}
                  >
                    <User className="w-3.5 h-3.5" />
                    Sign in to Save Favourites
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 lg:px-12 py-8 space-y-6">
        {/* Navigation & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-900">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Photos ({mediaItems.length})
            </button>

            <button
              onClick={() => setActiveFilter('favourites')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === 'favourites'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              Favourites ({favouritesCount})
            </button>

            <button
              onClick={() => setActiveFilter('album')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === 'album'
                  ? 'bg-amber-400 text-zinc-950 shadow-xs'
                  : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              Album Selections ({albumCount})
            </button>

            <button
              onClick={() => setActiveFilter('commented')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === 'commented'
                  ? 'bg-zinc-200 text-zinc-950 shadow-xs'
                  : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Feedback Notes
            </button>
          </div>

          {/* Submission Notice Banner */}
          {albumCount > 0 && proofingSettings.enabled && proofingSettings.allowAlbumSelection && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-mono">
                {albumCount} {proofingSettings.maxAlbumSelections ? `/ ${proofingSettings.maxAlbumSelections}` : ''} Selected for Album
              </span>
              <button
                onClick={() => handleSubmitSelections()}
                disabled={isSubmittingReview}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSubmittingReview ? 'Submitting Choices...' : 'Submit Selections to Studio'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Limit Warning Alert */}
        {limitWarning && (
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{limitWarning}</span>
            </div>
            <button
              onClick={() => setLimitWarning(null)}
              className="text-xs hover:underline flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Proofing Guidance & Review Status Banner */}
        {(!proofingSettings.enabled || proofingSettings.instructions || proofingSettings.deadline || proofingSettings.reviewStatus === 'approved') && (
          <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in ${
            !proofingSettings.enabled
              ? 'border-zinc-800 bg-zinc-900/60 text-zinc-400'
              : proofingSettings.reviewStatus === 'approved'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-amber-500/30 bg-amber-500/5 text-zinc-300'
          }`}>
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
              <div>
                {!proofingSettings.enabled ? (
                  <span><strong>Proofing Closed:</strong> Photo selections and notes are currently paused for this gallery.</span>
                ) : proofingSettings.reviewStatus === 'approved' ? (
                  <span><strong>Selections Approved:</strong> The studio has accepted your album shortlist for album design production.</span>
                ) : (
                  <span><strong>Photographer Guidance:</strong> {proofingSettings.instructions || 'Review your gallery photos, click the heart for favourites, and select photos for album approval.'}</span>
                )}
              </div>
            </div>
            {proofingSettings.deadline && (
              <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-mono shrink-0">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Deadline: {new Date(proofingSettings.deadline).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Submission Confirmation Alert */}
        {submissionSuccess && (
          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>
                <strong>Album Choices Successfully Confirmed!</strong> Your {albumCount} selections and notes have been registered for {studio?.name}. Your photographer will review them for album production.
              </span>
            </div>
            <button
              onClick={() => setSubmissionSuccess(false)}
              className="text-xs hover:underline flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Empty State when no media available */}
        {filteredMedia.length === 0 ? (
          <div className="p-16 rounded-3xl border border-zinc-900 bg-zinc-900/30 text-center space-y-4 my-8 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 text-zinc-500 mx-auto flex items-center justify-center">
              <Camera className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-serif font-bold text-white">
                {activeFilter === 'all' 
                  ? 'No Photos Synchronized Yet' 
                  : activeFilter === 'favourites' 
                  ? 'No Favourites Chosen Yet' 
                  : activeFilter === 'album' 
                  ? 'No Album Selections' 
                  : 'No Notes Added'}
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                {activeFilter === 'all'
                  ? 'The photographer has created this collection, but media files have not yet been synchronized. Contact the studio for details.'
                  : 'Click the heart or star on any photo to add it to your proofing shortlist.'}
              </p>
            </div>
            {activeFilter !== 'all' && (
              <button
                onClick={() => setActiveFilter('all')}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              >
                Browse All Photos
              </button>
            )}
          </div>
        ) : galleryLayout === 'masonry' ? (
          /* Masonry Photography Layout */
          <div className={`columns-1 sm:columns-2 ${
            columnsCount === 2 ? 'lg:columns-2' :
            columnsCount === 4 ? 'md:columns-3 lg:columns-4' :
            'md:columns-3'
          } ${
            gridSpacing === 'compact' ? 'gap-3 space-y-3' :
            gridSpacing === 'spacious' ? 'gap-8 space-y-8' :
            'gap-4 sm:gap-6 space-y-4 sm:space-y-6'
          }`}>
            {filteredMedia.map((media, idx) => {
              const proof = clientProofMap.get(media.id);
              const isFav = proof?.isFavourite || false;
              const isAlb = proof?.isApprovedForAlbum || false;
              const hasComment = proof?.comment && proof.comment.trim().length > 0;

              return (
                <div
                  key={media.id}
                  className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 break-inside-avoid flex flex-col justify-between cursor-pointer transition-all hover:border-zinc-700 hover:shadow-xl mb-4 sm:mb-6"
                  onClick={() => setLightboxIndex(idx)}
                >
                  {brokenMediaIds[media.id] ? (
                    <div className="w-full aspect-4/3 bg-zinc-900/90 flex flex-col items-center justify-center p-4 text-center space-y-1.5 border border-zinc-800">
                      <Camera className="w-6 h-6 text-amber-500/80" />
                      <div className="text-[11px] font-medium text-zinc-300 truncate max-w-[160px]">{media.fileName}</div>
                      <div className="text-[10px] text-amber-400 font-mono">Image File Unavailable</div>
                      <div className="text-[9px] text-zinc-500">Storage Disconnected</div>
                    </div>
                  ) : (
                    <img
                      src={media.downloadUrl}
                      alt={media.fileName}
                      loading="lazy"
                      onError={() => markMediaBroken(media.id)}
                      className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}

                  {studio?.branding?.watermarkText && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white rotate-[-20deg] select-none">
                      {studio.branding.watermarkText}
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
                    {isFav && (
                      <span className="w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
                        <Heart className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                    {isAlb && (
                      <span className="w-7 h-7 rounded-full bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg">
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                    {hasComment && (
                      <span className="w-7 h-7 rounded-full bg-zinc-800/90 text-white flex items-center justify-center shadow-lg backdrop-blur-xs">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div 
                    className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[120px]">
                      {media.fileName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {proofingSettings.enabled && proofingSettings.allowFavourites && (
                        <button
                          type="button"
                          onClick={() => toggleFavourite(media.id)}
                          className={`p-2 rounded-xl transition-all ${
                            isFav ? 'bg-rose-500 text-white shadow-xs' : 'bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80'
                          }`}
                          title={isFav ? 'Remove from Favourites' : 'Mark as Favourite'}
                        >
                          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      {proofingSettings.enabled && proofingSettings.allowAlbumSelection && (
                        <button
                          type="button"
                          onClick={() => toggleAlbum(media.id)}
                          className={`p-2 rounded-xl transition-all ${
                            isAlb ? 'bg-amber-400 text-zinc-950 shadow-xs' : 'bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80'
                          }`}
                          title={isAlb ? 'Approved for Album' : 'Select for Album'}
                        >
                          <Star className={`w-4 h-4 ${isAlb ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      {proofingSettings.enabled && proofingSettings.allowComments && (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="p-2 rounded-xl bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 transition-all"
                          title="Add feedback comment"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : galleryLayout === 'large_image' ? (
          /* Editorial Large-Image Showcase */
          <div className={`grid grid-cols-1 ${
            columnsCount >= 3 ? 'md:grid-cols-2' : 'max-w-5xl mx-auto'
          } ${
            gridSpacing === 'compact' ? 'gap-4 sm:gap-6' :
            gridSpacing === 'spacious' ? 'gap-10 sm:gap-14' :
            'gap-6 sm:gap-8'
          }`}>
            {filteredMedia.map((media, idx) => {
              const proof = clientProofMap.get(media.id);
              const isFav = proof?.isFavourite || false;
              const isAlb = proof?.isApprovedForAlbum || false;
              const hasComment = proof?.comment && proof.comment.trim().length > 0;

              return (
                <div
                  key={media.id}
                  className="group space-y-3 cursor-pointer"
                  onClick={() => setLightboxIndex(idx)}
                >
                  <div className="relative aspect-16/10 rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-xl">
                    {brokenMediaIds[media.id] ? (
                      <div className="w-full h-full min-h-[220px] bg-zinc-900/90 flex flex-col items-center justify-center p-6 text-center space-y-2 border border-zinc-800">
                        <Camera className="w-8 h-8 text-amber-500/80" />
                        <div className="text-xs font-medium text-zinc-200 truncate max-w-xs">{media.fileName}</div>
                        <div className="text-[11px] text-amber-400 font-mono">Image File Unavailable</div>
                        <div className="text-[10px] text-zinc-500">Cloud Storage Disconnected</div>
                      </div>
                    ) : (
                      <img
                        src={media.downloadUrl}
                        alt={media.fileName}
                        loading="lazy"
                        onError={() => markMediaBroken(media.id)}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    )}

                    {studio?.branding?.watermarkText && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white rotate-[-20deg] select-none">
                        {studio.branding.watermarkText}
                      </div>
                    )}

                    <div className="absolute top-4 left-4 flex items-center gap-1.5 z-10 pointer-events-none">
                      {isFav && (
                        <span className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
                          <Heart className="w-4 h-4 fill-current" />
                        </span>
                      )}
                      {isAlb && (
                        <span className="w-8 h-8 rounded-full bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg">
                          <Star className="w-4 h-4 fill-current" />
                        </span>
                      )}
                      {hasComment && (
                        <span className="w-8 h-8 rounded-full bg-zinc-800/90 text-white flex items-center justify-center shadow-lg backdrop-blur-xs">
                          <MessageSquare className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div 
                    className="flex items-center justify-between px-2 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <div className="font-semibold text-sm tracking-tight" style={{ fontFamily: fontFamilyStyle }}>
                        {media.fileName.replace(/\.[^/.]+$/, "")}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {formatBytes(media.sizeBytes || 0)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {proofingSettings.enabled && proofingSettings.allowFavourites && (
                        <button
                          type="button"
                          onClick={() => toggleFavourite(media.id)}
                          className={`p-2.5 rounded-xl transition-all ${
                            isFav ? 'bg-rose-500 text-white shadow-xs' : 'bg-zinc-800 text-zinc-300 hover:text-white'
                          }`}
                          title={isFav ? 'Remove from Favourites' : 'Mark as Favourite'}
                        >
                          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      {proofingSettings.enabled && proofingSettings.allowAlbumSelection && (
                        <button
                          type="button"
                          onClick={() => toggleAlbum(media.id)}
                          className={`p-2.5 rounded-xl transition-all ${
                            isAlb ? 'bg-amber-400 text-zinc-950 shadow-xs' : 'bg-zinc-800 text-zinc-300 hover:text-white'
                          }`}
                          title={isAlb ? 'Approved for Album' : 'Select for Album'}
                        >
                          <Star className={`w-4 h-4 ${isAlb ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      {proofingSettings.enabled && proofingSettings.allowComments && (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white transition-all"
                          title="Comment / Inspect"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Classic Grid Photography Layout */
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${
            columnsCount === 2 ? 'lg:grid-cols-2' :
            columnsCount === 4 ? 'md:grid-cols-3 lg:grid-cols-4' :
            'md:grid-cols-3'
          } ${
            gridSpacing === 'compact' ? 'gap-3 sm:gap-4' :
            gridSpacing === 'spacious' ? 'gap-8 sm:gap-10' :
            'gap-4 sm:gap-6'
          }`}>
            {filteredMedia.map((media, idx) => {
              const proof = clientProofMap.get(media.id);
              const isFav = proof?.isFavourite || false;
              const isAlb = proof?.isApprovedForAlbum || false;
              const hasComment = proof?.comment && proof.comment.trim().length > 0;

              return (
                <div
                  key={media.id}
                  className="group relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 aspect-4/3 sm:aspect-square flex flex-col justify-between cursor-pointer transition-all hover:border-zinc-700 hover:shadow-xl"
                  onClick={() => setLightboxIndex(idx)}
                >
                  {/* Photo Display */}
                  {brokenMediaIds[media.id] ? (
                    <div className="w-full h-full bg-zinc-900/90 flex flex-col items-center justify-center p-4 text-center space-y-1.5 border border-zinc-800">
                      <Camera className="w-6 h-6 text-amber-500/80" />
                      <div className="text-[11px] font-medium text-zinc-300 truncate max-w-[150px]">{media.fileName}</div>
                      <div className="text-[10px] text-amber-400 font-mono">Image File Unavailable</div>
                      <div className="text-[9px] text-zinc-500">Storage Disconnected</div>
                    </div>
                  ) : (
                    <img
                      src={media.downloadUrl}
                      alt={media.fileName}
                      loading="lazy"
                      onError={() => markMediaBroken(media.id)}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}

                  {/* Watermark overlay if configured */}
                  {studio?.branding?.watermarkText && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white rotate-[-20deg] select-none">
                      {studio.branding.watermarkText}
                    </div>
                  )}

                  {/* Active badges (top-left) */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
                    {isFav && (
                      <span className="w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
                        <Heart className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                    {isAlb && (
                      <span className="w-7 h-7 rounded-full bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg">
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </span>
                    )}
                    {hasComment && (
                      <span className="w-7 h-7 rounded-full bg-zinc-800/90 text-white flex items-center justify-center shadow-lg backdrop-blur-xs">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Hover Actions Toolbar (bottom) */}
                  <div 
                    className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[120px]">
                      {media.fileName}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {proofingSettings.enabled && proofingSettings.allowFavourites && (
                        <button
                          type="button"
                          onClick={() => toggleFavourite(media.id)}
                          className={`p-2 rounded-xl transition-all ${
                            isFav 
                              ? 'bg-rose-500 text-white shadow-xs' 
                              : 'bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80'
                          }`}
                          title={isFav ? 'Remove from Favourites' : 'Mark as Favourite'}
                        >
                          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      )}

                      {proofingSettings.enabled && proofingSettings.allowAlbumSelection && (
                        <button
                          type="button"
                          onClick={() => toggleAlbum(media.id)}
                          className={`p-2 rounded-xl transition-all ${
                            isAlb 
                              ? 'bg-amber-400 text-zinc-950 shadow-xs' 
                              : 'bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80'
                          }`}
                          title={isAlb ? 'Approved for Album' : 'Select for Album'}
                        >
                          <Star className={`w-4 h-4 ${isAlb ? 'fill-current' : ''}`} />
                        </button>
                      )}

                      {proofingSettings.enabled && proofingSettings.allowComments && (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="p-2 rounded-xl bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 transition-all"
                          title="Add feedback comment"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && lightboxItem && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between animate-in fade-in select-none">
          {/* Top Bar */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-900 bg-black/60 backdrop-blur-sm z-20">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-400">
                Photo {lightboxIndex + 1} of {filteredMedia.length}
              </span>
              <span className="text-zinc-600">•</span>
              <span className="text-xs font-medium text-white truncate max-w-xs">
                {lightboxItem.fileName}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Proofing controls inside lightbox */}
              {proofingSettings.enabled && proofingSettings.allowFavourites && (
                <button
                  type="button"
                  onClick={() => toggleFavourite(lightboxItem.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    clientProofMap.get(lightboxItem.id)?.isFavourite
                      ? 'bg-rose-500 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${clientProofMap.get(lightboxItem.id)?.isFavourite ? 'fill-current' : ''}`} />
                  <span>Favourite</span>
                </button>
              )}

              {proofingSettings.enabled && proofingSettings.allowAlbumSelection && (
                <button
                  type="button"
                  onClick={() => toggleAlbum(lightboxItem.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    clientProofMap.get(lightboxItem.id)?.isApprovedForAlbum
                      ? 'bg-amber-400 text-zinc-950'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${clientProofMap.get(lightboxItem.id)?.isApprovedForAlbum ? 'fill-current' : ''}`} />
                  <span>Album Selection</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Limit Warning Alert */}
          {limitWarning && (
            <div className="px-6 py-2.5 bg-amber-500/20 border-b border-amber-500/30 text-amber-400 text-xs flex items-center justify-between gap-3 z-20 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{limitWarning}</span>
              </div>
              <button
                type="button"
                onClick={() => setLimitWarning(null)}
                className="text-xs hover:underline flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Central Image View */}
          <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 min-h-0">
            <button
              onClick={() => setLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : filteredMedia.length - 1))}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-zinc-900/80 text-white hover:bg-zinc-800 transition-colors z-20"
              title="Previous Photo (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <div className="relative max-w-5xl max-h-full flex items-center justify-center">
              {brokenMediaIds[lightboxItem.id] ? (
                <div className="max-h-[60vh] aspect-16/10 w-full max-w-2xl bg-zinc-900 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3 border border-zinc-800 shadow-2xl">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <h4 className="text-sm font-semibold text-white">{lightboxItem.fileName}</h4>
                    <p className="text-xs text-amber-400/90 font-mono">Image binary not found in cloud storage</p>
                    <p className="text-[11px] text-zinc-400">Metadata is recorded in Firestore, but object storage is currently disconnected. Proofing selections and notes can still be recorded on this item.</p>
                  </div>
                </div>
              ) : (
                <img
                  src={lightboxItem.downloadUrl}
                  alt={lightboxItem.fileName}
                  onError={() => markMediaBroken(lightboxItem.id)}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
                />
              )}

              {/* Watermark in lightbox */}
              {studio?.branding?.watermarkText && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25 text-sm sm:text-base font-mono font-bold tracking-widest text-white rotate-[-20deg] select-none">
                  {studio.branding.watermarkText}
                </div>
              )}
            </div>

            <button
              onClick={() => setLightboxIndex(prev => (prev !== null && prev < filteredMedia.length - 1 ? prev + 1 : 0))}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-zinc-900/80 text-white hover:bg-zinc-800 transition-colors z-20"
              title="Next Photo (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Bottom Comments / Proofing Drawer */}
          <div className="border-t border-zinc-900 bg-zinc-950/90 p-4 sm:px-8 max-w-4xl mx-auto w-full z-20">
            <div className="space-y-3">
              {/* Existing comments */}
              {currentPhotoComments.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-2 pr-2">
                  {currentPhotoComments.map((com) => (
                    <div key={com.id} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-200">
                          {com.clientName} <span className="font-normal text-zinc-500">({com.clientEmail})</span>
                        </div>
                        <div className="text-zinc-300 mt-0.5">{com.comment}</div>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono flex-shrink-0">
                        {new Date(com.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={clientEmail ? "Add photo retouching note or client feedback..." : "Sign in to leave feedback on this photo..."}
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handlePostComment}
                  disabled={isPostingComment || !newCommentText.trim()}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 disabled:opacity-40 transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Identify Client Modal */}
      {showIdentifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div 
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Client Identification</h3>
                  <p className="text-xs text-zinc-400">Save favourites and album choices</p>
                </div>
              </div>
              <button 
                onClick={() => setShowIdentifyModal(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {auth.currentUser ? (
              <div className="p-3 bg-zinc-850 border border-zinc-750 rounded-xl text-xs text-zinc-300 flex items-center justify-between">
                <span>Authenticated as: <strong className="text-amber-400">{auth.currentUser.email}</strong></span>
                <span className="text-[10px] font-mono text-emerald-400">Verified</span>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 leading-relaxed">
                Enter your details to create or sign into your client account. Your selections are securely bound to your verified credentials.
              </p>
            )}

            {authNotice && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authNotice}</span>
              </div>
            )}

            <form onSubmit={handleSaveIdentity} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Your Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-850 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Your Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. sarah@example.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-850 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {!auth.currentUser && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Client Account Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Choose password (min 6 characters)..."
                    value={clientPassword}
                    onChange={(e) => setClientPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-zinc-850 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-zinc-500">Secures your selections against tampering or unauthorized access.</p>
                </div>
              )}

              {!auth.currentUser && (
                <>
                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
                    <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-zinc-900 px-2 text-zinc-500 font-mono">Or quick sign in</span></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleClientSignIn}
                    disabled={isAuthenticating}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-750 transition-colors flex items-center justify-center gap-2"
                  >
                    <Globe className="w-4 h-4 text-amber-400" />
                    <span>Sign in with Google</span>
                  </button>
                </>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowIdentifyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 transition-colors shadow-xs disabled:opacity-50"
                >
                  {isAuthenticating ? 'Authenticating...' : (auth.currentUser ? 'Save Selections' : 'Sign In & Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer & Studio Contact Information */}
      <footer className={`mt-auto px-4 sm:px-8 py-10 border-t text-center text-xs space-y-3 ${
        isLightTheme ? 'border-zinc-200 bg-zinc-50/60 text-zinc-600' : 'border-zinc-900 bg-zinc-950/60 text-zinc-500'
      }`}>
        {/* Studio Contact Details */}
        {(branding?.contactEmail || branding?.phone || branding?.website || branding?.address) && (
          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] pb-2">
            {branding.contactEmail && (
              <a 
                href={`mailto:${branding.contactEmail}`} 
                className="flex items-center gap-1.5 hover:underline"
                style={{ color: accentColor }}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{branding.contactEmail}</span>
              </a>
            )}
            {branding.phone && (
              <a 
                href={`tel:${branding.phone}`} 
                className="flex items-center gap-1.5 hover:underline"
              >
                <Phone className="w-3.5 h-3.5 opacity-60" />
                <span>{branding.phone}</span>
              </a>
            )}
            {branding.website && (
              <a 
                href={branding.website.startsWith('http') ? branding.website : `https://${branding.website}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-1.5 hover:underline"
              >
                <Globe className="w-3.5 h-3.5 opacity-60" />
                <span>{branding.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            {branding.address && (
              <span className="flex items-center gap-1.5 opacity-80">
                <MapPin className="w-3.5 h-3.5 opacity-60" />
                <span>{branding.address}</span>
              </span>
            )}
          </div>
        )}

        <p className="font-medium">
          {branding?.footerText || `© ${new Date().getFullYear()} ${studioDisplayName}. All rights reserved.`}
        </p>
        <p className="text-[10px] opacity-60 font-mono">
          Powered by StudioCloud Client Proofing Engine • Secure Multi-Tenant Architecture
        </p>
      </footer>
    </div>
  );
};
