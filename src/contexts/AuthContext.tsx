import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, testConnection } from '../firebase/config';
import { Studio, UserPublic, StudioRole } from '../types';
import { 
  getUserStudiosWithRoles, 
  createStudio, 
  verifyServerAdminStatus,
  getUserProfile,
  saveUserProfile,
  findStudioBySlug,
  joinStudioAsTeamMember,
  verifyStudioMembership
} from '../services/studioService';

export type ThemeMode = 'dark' | 'light';

export interface TenantAuthError {
  title: string;
  message: string;
  isRetryable: boolean;
  code?: string;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserPublic | null;
  activeStudio: Studio | null;
  activeRole: StudioRole | null;
  userStudios: Studio[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  authError: TenantAuthError | null;
  theme: ThemeMode;
  toggleTheme: () => void;
  signInWithGoogle: () => Promise<void>;
  signUpOwnerWithGoogle: (studioName?: string, studioSlug?: string) => Promise<void>;
  signUpMemberWithGoogle: (studioSlug: string) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpOwnerWithEmail: (params: {
    email: string;
    pass: string;
    displayName: string;
    studioName: string;
    studioSlug: string;
  }) => Promise<void>;
  signUpMemberWithEmail: (params: {
    email: string;
    pass: string;
    displayName: string;
    studioSlug: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveStudio: (studio: Studio | null) => void;
  reloadStudios: () => Promise<void>;
  createNewStudio: (name: string, slug: string, accentColor?: string) => Promise<Studio>;
  retryAuth: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getHumanAuthError(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/user-not-found':
      return 'No account registered with this email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email address or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please log in.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/invalid-email':
      return 'The email address format is invalid.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before authentication completed.';
    case 'auth/cancelled-popup-request':
      return 'Authentication request was replaced or closed.';
    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in provider is not yet enabled in your Firebase project. Please enable it in Firebase Console or sign in with Google.';
    case 'auth/network-request-failed':
      return 'Network error communicating with Firebase Authentication. Check your connection.';
    default:
      return error?.message || 'Authentication error occurred. Please try again.';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserPublic | null>(null);
  const [activeStudio, setActiveStudio] = useState<Studio | null>(null);
  const [activeRole, setActiveRole] = useState<StudioRole | null>(null);
  const [userStudios, setUserStudios] = useState<Studio[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [authError, setAuthError] = useState<TenantAuthError | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('studiocloud_theme') as ThemeMode) || 'dark';
  });

  // Track in-flight user session resolution to prevent duplicate concurrent calls
  const inFlightUidRef = useRef<string | null>(null);

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('studiocloud_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  /**
   * Resolves the authenticated user's tenant boundaries, profile, and role.
   * Enforces server-side verification, timeout protection, and request deduplication.
   */
  const resolveUserSession = async (currentUser: User | null): Promise<void> => {
    if (!currentUser) {
      inFlightUidRef.current = null;
      setUser(null);
      setUserProfile(null);
      setUserStudios([]);
      setActiveStudio(null);
      setActiveRole(null);
      setIsSuperAdmin(false);
      setAuthError(null);
      setIsLoading(false);
      return;
    }

    // Prevent duplicate simultaneous session resolution for the same user
    if (inFlightUidRef.current === currentUser.uid) {
      return;
    }
    inFlightUidRef.current = currentUser.uid;
    setIsLoading(true);

    // Timeout guard: Ensures loading never hangs indefinitely
    let isTimedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        isTimedOut = true;
        reject(new Error('TIMEOUT_EXCEEDED'));
      }, 8500);
    });

    const sessionTask = (async () => {
      setUser(currentUser);

      // 1. Server-verified Super Admin check
      // Security: Verified against Firestore /admins registry, NOT client email string
      const isVerifiedAdmin = await verifyServerAdminStatus(currentUser.uid, currentUser.email);
      setIsSuperAdmin(isVerifiedAdmin);

      // 2. Fetch or create user profile
      let profile: UserPublic | null = null;
      try {
        profile = await getUserProfile(currentUser.uid);
        if (!profile && currentUser.email) {
          await saveUserProfile(currentUser.uid, {
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email.split('@')[0],
          });
          profile = await getUserProfile(currentUser.uid);
        }
      } catch (profileErr: any) {
        console.warn('User profile lookup notice:', profileErr);
      }
      setUserProfile(profile);

      // 3. Fetch user studios and authorized roles
      const { studios, roles } = await getUserStudiosWithRoles(currentUser.uid);
      setUserStudios(studios);

      // 4. Determine active studio and verified role
      if (studios.length > 0) {
        const preferredId = profile?.activeStudioId;
        const matched = preferredId ? studios.find(s => s.id === preferredId) : null;
        const selected = matched || studios[0];
        setActiveStudio(selected);
        setActiveRole(roles[selected.id] || (selected.ownerId === currentUser.uid ? 'owner' : 'lead_photographer'));
      } else {
        setActiveStudio(null);
        setActiveRole(null);
      }

      setAuthError(null);
    })();

    try {
      await Promise.race([sessionTask, timeoutPromise]);
    } catch (err: any) {
      console.error('Session & tenant boundary resolution error:', err);
      if (err.message === 'TIMEOUT_EXCEEDED' || isTimedOut) {
        setAuthError({
          title: 'Tenant Resolution Timeout',
          message: 'Connecting to Firestore and verifying tenant boundaries took longer than expected. Please verify your connection and retry.',
          isRetryable: true,
          code: 'TIMEOUT',
        });
      } else {
        const errorMsg = err?.message || String(err);
        const isPermission = errorMsg.includes('permission-denied') || errorMsg.includes('insufficient permissions');
        const isOffline = errorMsg.includes('offline') || errorMsg.includes('unavailable') || errorMsg.includes('network');

        setAuthError({
          title: isPermission 
            ? 'Tenant Access Restricted' 
            : isOffline 
            ? 'Network Connection Issue' 
            : 'Authentication Notice',
          message: isPermission
            ? 'Firestore Security Rules verified your identity, but prevented access to the requested studio tenancy.'
            : isOffline
            ? 'Could not connect to Firebase Firestore. Please check your internet connection and retry.'
            : 'An unexpected issue occurred while authenticating session boundaries. Please retry.',
          isRetryable: true,
          code: isPermission ? 'PERMISSION_DENIED' : isOffline ? 'OFFLINE' : 'UNKNOWN',
        });
      }
    } finally {
      setIsLoading(false);
      inFlightUidRef.current = null;
    }
  };

  useEffect(() => {
    // Non-blocking connection check on startup
    testConnection().catch(() => {});

    // Single source of truth: Firebase Auth observer
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      resolveUserSession(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const retryAuth = async () => {
    inFlightUidRef.current = null;
    await resolveUserSession(auth.currentUser);
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      // NOTE: onAuthStateChanged listener automatically catches the new session and executes resolveUserSession.
    } catch (error: any) {
      console.error('Google Sign In Error:', error);
      setIsLoading(false);
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        // User closed popup willingly - cleanly stop loading
        return;
      }
      setAuthError({
        title: 'Google Sign-In Failed',
        message: getHumanAuthError(error),
        isRetryable: true,
        code: error?.code,
      });
      throw error;
    }
  };

  const signUpOwnerWithGoogle = async (studioName?: string, studioSlug?: string) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      if (cred.user && studioName?.trim() && studioSlug?.trim()) {
        // If the user signed up as a new studio owner and does not already have a studio
        const { studios } = await getUserStudiosWithRoles(cred.user.uid);
        if (studios.length === 0) {
          await createStudio({
            userId: cred.user.uid,
            userEmail: cred.user.email || '',
            name: studioName.trim(),
            slug: studioSlug.trim(),
          });
        }
      }
      // Session resolution will be coordinated by onAuthStateChanged observer
    } catch (error: any) {
      setIsLoading(false);
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.warn('Google Studio Owner Sign Up notice:', error?.message || error);
      setAuthError({
        title: 'Google Registration Notice',
        message: getHumanAuthError(error),
        isRetryable: true,
        code: error?.code,
      });
      throw error;
    }
  };

  const signUpMemberWithGoogle = async (studioSlug: string) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const targetStudio = await findStudioBySlug(studioSlug.trim());
      if (!targetStudio) {
        throw new Error(`No studio found with vanity slug "@${studioSlug.trim()}". Check with your studio owner.`);
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      if (cred.user) {
        // Validate whether user has an approved membership on the studio roster
        const check = await verifyStudioMembership(targetStudio.id, cred.user.uid);
        if (check.verified) {
          await joinStudioAsTeamMember({
            studioId: targetStudio.id,
            userId: cred.user.uid,
            userEmail: cred.user.email || '',
            displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'Team Member',
          });
        }
        inFlightUidRef.current = null;
        await resolveUserSession(cred.user);
      }
    } catch (error: any) {
      setIsLoading(false);
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.warn('Google Team Join notice:', error?.message || error);
      setAuthError({
        title: 'Team Join Notice',
        message: getHumanAuthError(error),
        isRetryable: true,
        code: error?.code,
      });
      throw error;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      // NOTE: onAuthStateChanged listener automatically catches the session
    } catch (error: any) {
      setIsLoading(false);
      if (error?.code === 'auth/operation-not-allowed') {
        console.warn('Firebase Auth: Email/Password sign-in provider is disabled in Firebase Console.');
      } else {
        console.warn('Email Sign In Notice:', error?.message || error);
      }
      setAuthError({
        title: error?.code === 'auth/operation-not-allowed' ? 'Email/Password Provider Disabled' : 'Sign In Failed',
        message: getHumanAuthError(error),
        isRetryable: true,
        code: error?.code,
      });
      throw error;
    }
  };

  const signUpOwnerWithEmail = async (params: {
    email: string;
    pass: string;
    displayName: string;
    studioName: string;
    studioSlug: string;
  }) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.pass);
      if (cred.user) {
        await updateProfile(cred.user, { displayName: params.displayName.trim() });
        
        // Create initial studio for Studio Owner with enforced 10 GB decimal
        await createStudio({
          userId: cred.user.uid,
          userEmail: params.email.trim(),
          name: params.studioName.trim(),
          slug: params.studioSlug.trim(),
        });

        // Trigger session resolution for the newly created tenant
        inFlightUidRef.current = null;
        await resolveUserSession(cred.user);
      }
    } catch (error: any) {
      setIsLoading(false);
      if (error?.code === 'auth/operation-not-allowed') {
        console.warn('Firebase Auth: Email/Password sign-up provider is disabled in Firebase Console (auth/operation-not-allowed).');
      } else {
        console.warn('Studio Owner Sign Up Notice:', error?.message || error);
      }
      setAuthError({
        title: error?.code === 'auth/operation-not-allowed' ? 'Email/Password Provider Disabled' : 'Studio Registration Failed',
        message: getHumanAuthError(error),
        isRetryable: true,
        code: error?.code,
      });
      throw error;
    }
  };

  const signUpMemberWithEmail = async (params: {
    email: string;
    pass: string;
    displayName: string;
    studioSlug: string;
  }) => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const targetStudio = await findStudioBySlug(params.studioSlug.trim());
      if (!targetStudio) {
        throw new Error(`No studio found with vanity slug "@${params.studioSlug.trim()}". Check with your studio owner.`);
      }

      const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.pass);
      if (cred.user) {
        await updateProfile(cred.user, { displayName: params.displayName.trim() });
        
        // Validate whether user has an approved membership on the studio roster
        const check = await verifyStudioMembership(targetStudio.id, cred.user.uid);
        if (check.verified) {
          await joinStudioAsTeamMember({
            studioId: targetStudio.id,
            userId: cred.user.uid,
            userEmail: params.email.trim(),
            displayName: params.displayName.trim(),
          });
        }

        inFlightUidRef.current = null;
        await resolveUserSession(cred.user);
      }
    } catch (error: any) {
      setIsLoading(false);
      if (error?.code === 'auth/operation-not-allowed') {
        console.warn('Firebase Auth: Email/Password sign-up provider is disabled in Firebase Console (auth/operation-not-allowed).');
      } else {
        console.warn('Team Member Sign Up Notice:', error?.message || error);
      }
      setAuthError({
        title: error?.code === 'auth/operation-not-allowed' ? 'Email/Password Provider Disabled' : 'Team Join Failed',
        message: getHumanAuthError(error),
        isRetryable: true,
        code: error?.code,
      });
      throw error;
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    inFlightUidRef.current = null;
    try {
      await fbSignOut(auth);
      setUser(null);
      setUserProfile(null);
      setActiveStudio(null);
      setActiveRole(null);
      setUserStudios([]);
      setIsSuperAdmin(false);
      setAuthError(null);
    } catch (err) {
      console.error('Sign Out Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadStudios = async () => {
    if (auth.currentUser) {
      inFlightUidRef.current = null;
      await resolveUserSession(auth.currentUser);
    }
  };

  const createNewStudio = async (name: string, slug: string, accentColor?: string): Promise<Studio> => {
    if (!user) throw new Error('Must be signed in to create a studio');
    setIsLoading(true);
    try {
      const created = await createStudio({
        userId: user.uid,
        userEmail: user.email || 'photographer@studiocloud.io',
        name,
        slug,
        accentColor,
      });

      inFlightUidRef.current = null;
      await resolveUserSession(user);
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        activeStudio,
        activeRole,
        userStudios,
        isLoading,
        isSuperAdmin,
        authError,
        theme,
        toggleTheme,
        signInWithGoogle,
        signUpOwnerWithGoogle,
        signUpMemberWithGoogle,
        signInWithEmail,
        signUpOwnerWithEmail,
        signUpMemberWithEmail,
        signOut,
        setActiveStudio,
        reloadStudios,
        createNewStudio,
        retryAuth,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
