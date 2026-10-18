import React, { useState } from 'react';
import { 
  Camera, 
  ShieldCheck, 
  HardDrive, 
  Users, 
  ArrowRight, 
  Sparkles,
  Lock,
  Building2,
  UserCheck,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth, getHumanAuthError } from '../../contexts/AuthContext';
import { SUPER_ADMIN_EMAIL } from '../../services/studioService';

type AuthTab = 'signin' | 'register_owner' | 'join_team';

export const AuthScreen: React.FC = () => {
  const { 
    signInWithGoogle, 
    signUpOwnerWithGoogle,
    signUpMemberWithGoogle,
    signInWithEmail, 
    signUpOwnerWithEmail, 
    signUpMemberWithEmail,
    isLoading 
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConsoleSteps, setShowConsoleSteps] = useState(false);

  // Sign In Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Studio Owner Registration Form State
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerConfirmPassword, setOwnerConfirmPassword] = useState('');
  const [studioName, setStudioName] = useState('');
  const [studioSlug, setStudioSlug] = useState('');

  // Team Member Join Form State
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [targetStudioSlug, setTargetStudioSlug] = useState('');

  const handleStudioNameChange = (val: string) => {
    setStudioName(val);
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setStudioSlug(slug);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signInWithEmail(loginEmail, loginPassword);
    } catch (err: any) {
      setErrorMessage(getHumanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setErrorMessage(getHumanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleOwnerRegister = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signUpOwnerWithGoogle(studioName, studioSlug);
    } catch (err: any) {
      setErrorMessage(getHumanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleMemberJoin = async () => {
    if (!targetStudioSlug.trim()) {
      setErrorMessage('Please enter the target studio vanity slug before joining with Google.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signUpMemberWithGoogle(targetStudioSlug);
    } catch (err: any) {
      setErrorMessage(getHumanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !ownerEmail.trim() || !ownerPassword || !studioName.trim() || !studioSlug.trim()) {
      setErrorMessage('Please fill in all required studio registration fields.');
      return;
    }

    if (ownerPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (ownerPassword !== ownerConfirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter your password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signUpOwnerWithEmail({
        email: ownerEmail,
        pass: ownerPassword,
        displayName: ownerName,
        studioName,
        studioSlug,
      });
    } catch (err: any) {
      setErrorMessage(getHumanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMemberJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim() || !memberEmail.trim() || !memberPassword || !targetStudioSlug.trim()) {
      setErrorMessage('Please fill in all required team membership fields.');
      return;
    }

    if (memberPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signUpMemberWithEmail({
        email: memberEmail,
        pass: memberPassword,
        displayName: memberName,
        studioSlug: targetStudioSlug,
      });
    } catch (err: any) {
      setErrorMessage(getHumanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-zinc-950 text-zinc-100 font-sans">
      {/* Left Column: Visual Brand Backdrop & Value Prop */}
      <div className="lg:w-1/2 relative min-h-[35vh] lg:min-h-screen flex flex-col justify-between p-8 sm:p-12 overflow-hidden border-b lg:border-b-0 lg:border-r border-zinc-800">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity scale-105"
          style={{ 
            backgroundImage: `url('https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=80')` 
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-zinc-950 flex items-center justify-center shadow-lg">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="font-serif font-bold text-xl tracking-tight text-white flex items-center gap-2">
              StudioCloud
              <span className="text-[10px] uppercase font-sans font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Phase 2
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 tracking-wide">
              Secure Multi-Tenant Photography Platform
            </div>
          </div>
        </div>

        <div className="relative z-10 my-auto py-8 max-w-lg space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-700 text-xs text-amber-300">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Server-Enforced Tenant Isolation</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-white tracking-tight leading-[1.15]">
            Secure workspace architecture for photography studios.
          </h1>

          <p className="text-sm text-zinc-300 leading-relaxed">
            StudioCloud protects your client CRM, proofing galleries, and photography assets with zero-trust Firestore Security Rules. Every studio is strictly isolated into its own tenancy boundary.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-3 text-xs text-zinc-300">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>10 GB Decimal Storage Quota</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Role-Based Access Control</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Real User Authentication</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Gated Super Admin Access</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Cloud Firestore Enterprise • Live Auth Tokens</span>
          <span className="font-mono text-zinc-400">totemic-metric-wmzf6</span>
        </div>
      </div>

      {/* Right Column: Secure Multi-Flow Authentication */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-zinc-900/40 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          {/* Access Flow Selection Tabs */}
          <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
            <button
              onClick={() => { setActiveTab('signin'); setErrorMessage(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'signin'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setActiveTab('register_owner'); setErrorMessage(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'register_owner'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Register Studio
            </button>
            <button
              onClick={() => { setActiveTab('join_team'); setErrorMessage(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'join_team'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Join Studio
            </button>
          </div>

          {/* Smart Error Banner & Action Handler */}
          {errorMessage && (
            <div className={`p-4 rounded-xl border text-xs animate-in fade-in ${
              errorMessage.toLowerCase().includes('operation-not-allowed') || errorMessage.toLowerCase().includes('email/password')
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  errorMessage.toLowerCase().includes('operation-not-allowed') || errorMessage.toLowerCase().includes('email/password')
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`} />
                <div className="flex-1 space-y-2">
                  <div className="font-semibold text-sm">
                    {errorMessage.toLowerCase().includes('operation-not-allowed') || errorMessage.toLowerCase().includes('email/password')
                      ? 'Email/Password Provider Disabled in Firebase'
                      : 'Authentication Notice'}
                  </div>
                  <div className="text-zinc-300 text-xs leading-relaxed">
                    {errorMessage}
                  </div>

                  {(errorMessage.toLowerCase().includes('operation-not-allowed') || errorMessage.toLowerCase().includes('email/password')) && (
                    <div className="pt-2 space-y-2.5">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeTab === 'register_owner') {
                              handleGoogleOwnerRegister();
                            } else if (activeTab === 'join_team') {
                              handleGoogleMemberJoin();
                            } else {
                              handleGoogleLogin();
                            }
                          }}
                          disabled={submitting || isLoading}
                          className="py-2 px-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span>Continue with Google (Instant & No Setup)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowConsoleSteps(!showConsoleSteps)}
                          className="py-2 px-3 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs transition-colors"
                        >
                          {showConsoleSteps ? 'Hide Console Steps' : 'How to Enable Email/Password'}
                        </button>
                      </div>

                      {showConsoleSteps && (
                        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 space-y-1.5 font-sans animate-in fade-in">
                          <div className="font-semibold text-amber-300">Enable in Firebase Console (1 Minute):</div>
                          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                            <li>Open <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-amber-400 underline hover:text-amber-300">Firebase Console</a> and select this project.</li>
                            <li>Go to <span className="text-zinc-200 font-medium">Build &gt; Authentication</span> in the left sidebar.</li>
                            <li>Click the <span className="text-zinc-200 font-medium">Sign-in method</span> tab.</li>
                            <li>Click on <span className="text-zinc-200 font-medium">Email/Password</span> in the providers list.</li>
                            <li>Turn the <span className="text-zinc-200 font-medium">Enable</span> switch ON and click <span className="text-zinc-200 font-medium">Save</span>.</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FLOW 1: SIGN IN (Studio Owners, Team Members & Super Admins) */}
          {activeTab === 'signin' && (
            <div className="space-y-5 animate-in fade-in">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-bold text-white tracking-tight">
                  Studio Sign In
                </h2>
                <p className="text-xs text-zinc-400">
                  Authenticate into your studio workspace or platform governance
                </p>
              </div>

              {/* Google One-Click Sign In */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={submitting || isLoading}
                className="w-full py-2.5 px-4 rounded-xl border border-zinc-700 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs transition-colors flex items-center justify-center gap-3 shadow-xs disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-zinc-800 w-full" />
                <span className="bg-zinc-950 px-3 text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Or Email & Password
                </span>
              </div>

              {/* Email / Password Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="photographer@studio.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || isLoading}
                  className="w-full py-3 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Verifying Credentials...' : 'Sign In to StudioCloud'}
                </button>
              </form>

              {/* Super Admin Notice (Explicit requirement: No public Super Admin registration) */}
              <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 text-xs text-purple-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-purple-300">
                  <ShieldCheck className="w-4 h-4 text-purple-400" /> Platform Super Admin Access
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Super Admin privileges are strictly restricted to verified platform administrators (<span className="font-mono text-purple-300">{SUPER_ADMIN_EMAIL}</span>). There is no public Super Admin registration. Sign in with your registered admin Google or email account to enter platform administration.
                </p>
              </div>
            </div>
          )}

          {/* FLOW 2: REGISTER NEW STUDIO (Studio Owner Flow) */}
          {activeTab === 'register_owner' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-bold text-white tracking-tight flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" /> Register Photography Studio
                </h2>
                <p className="text-xs text-zinc-400">
                  Set up your tenant photography business with 10 GB default storage
                </p>
              </div>

              {/* Instant Google One-Click Registration */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleOwnerRegister}
                  disabled={submitting || isLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-zinc-700 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs transition-colors flex items-center justify-center gap-3 shadow-xs disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Register Studio with Google (Instant & Recommended)</span>
                </button>
                <p className="text-[11px] text-zinc-400 text-center">
                  Uses your verified Google account. Zero configuration required.
                </p>
              </div>

              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-zinc-800 w-full" />
                <span className="bg-zinc-950 px-3 text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Or Register with Email & Password
                </span>
              </div>

              <form onSubmit={handleOwnerRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Studio Owner Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Marcus Vance"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Owner Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="marcus@studio.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={ownerConfirmPassword}
                      onChange={(e) => setOwnerConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Studio Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vance Fine Art & Portraits"
                    value={studioName}
                    onChange={(e) => handleStudioNameChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Public Studio Slug *
                  </label>
                  <div className="flex items-center">
                    <span className="px-2.5 py-2 text-xs bg-zinc-800 text-zinc-400 border border-r-0 border-zinc-700 rounded-l-xl font-mono">
                      studiocloud.io/p/
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="vance-fine-art"
                      value={studioSlug}
                      onChange={(e) => setStudioSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="w-full px-3 py-2 text-xs rounded-r-xl border border-zinc-700 bg-zinc-900 text-white font-mono focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 flex items-center justify-between">
                  <span>Default Storage Allocation:</span>
                  <span className="font-semibold text-white font-mono">10,000,000,000 bytes (10 GB)</span>
                </div>

                <button
                  type="submit"
                  disabled={submitting || isLoading}
                  className="w-full py-3 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Creating Studio Workspace...' : 'Register Studio & Owner Account'}
                </button>
              </form>
            </div>
          )}

          {/* FLOW 3: JOIN STUDIO AS TEAM MEMBER */}
          {activeTab === 'join_team' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-bold text-white tracking-tight flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-400" /> Join Existing Studio
                </h2>
                <p className="text-xs text-zinc-400">
                  Join as an associate photographer, retoucher, or studio assistant
                </p>
              </div>

              {/* Google One-Click Team Join */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <span className="px-2.5 py-2 text-xs bg-zinc-800 text-zinc-400 border border-r-0 border-zinc-700 rounded-l-xl font-mono">
                    @
                  </span>
                  <input
                    type="text"
                    placeholder="studio-slug (e.g. vance-fine-art)"
                    value={targetStudioSlug}
                    onChange={(e) => setTargetStudioSlug(e.target.value.toLowerCase().trim())}
                    className="w-full px-3 py-2 text-xs rounded-r-xl border border-zinc-700 bg-zinc-900 text-white font-mono focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleMemberJoin}
                  disabled={submitting || isLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-zinc-700 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs transition-colors flex items-center justify-center gap-3 shadow-xs disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Join Studio with Google</span>
                </button>
                <p className="text-[11px] text-zinc-400 text-center">
                  Enter target slug above, then sign in with your authorized Google account.
                </p>
              </div>

              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-zinc-800 w-full" />
                <span className="bg-zinc-950 px-3 text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Or Join with Email & Password
                </span>
              </div>

              <form onSubmit={handleMemberJoinSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Elena Rostova"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Your Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="elena@photographer.com"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Target Studio Vanity Slug *
                  </label>
                  <div className="flex items-center">
                    <span className="px-2.5 py-2 text-xs bg-zinc-800 text-zinc-400 border border-r-0 border-zinc-700 rounded-l-xl font-mono">
                      @
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="vance-fine-art"
                      value={targetStudioSlug}
                      onChange={(e) => setTargetStudioSlug(e.target.value.toLowerCase().trim())}
                      className="w-full px-3 py-2 text-xs rounded-r-xl border border-zinc-700 bg-zinc-900 text-white font-mono focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Enter the studio slug provided by your studio owner to request tenant membership.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || isLoading}
                  className="w-full py-3 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Connecting to Studio...' : 'Create Account & Join Studio'}
                </button>
              </form>
            </div>
          )}

          <div className="text-[11px] text-center text-zinc-500 pt-2 border-t border-zinc-800/80">
            Passwords are encrypted and verified via Firebase Authentication over TLS. No plain-text passwords are ever stored.
          </div>
        </div>
      </div>
    </div>
  );
};
