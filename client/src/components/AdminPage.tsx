import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  Users,
  Smartphone,
  Radio,
  Trash2,
  RefreshCw,
  LogOut,
  ArrowLeft,
  Search,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Globe,
  Heart,
  CheckCircle,
} from 'lucide-react';
import { api, ApiError } from '../api.js';
import { AdminStats, AdminSessionDetail } from '../types.js';
import { useTranslation } from '../i18n/index.js';

export const AdminPage: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Login form state
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Dashboard data state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sessions, setSessions] = useState<AdminSessionDetail[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    type: 'session' | 'couple' | 'all';
    targetId?: string;
    title: string;
    message: string;
  } | null>(null);

  // Toast notification helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 3500);
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((sec) => {
        if (sec <= 1) {
          clearInterval(interval);
          setLoginError(null);
          return 0;
        }
        return sec - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Check current admin authentication status
  const checkAuth = useCallback(async () => {
    try {
      setCheckingAuth(true);
      const res = await api.admin.check();
      setIsAuthenticated(Boolean(res?.authenticated));
    } catch {
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load stats and sessions data
  const loadDashboardData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingData(true);
    try {
      const [statsData, sessionsData] = await Promise.all([
        api.admin.getStats(),
        api.admin.getSessions(),
      ]);
      setStats(statsData);
      setSessions(sessionsData.sessions || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      showToast('Failed to load admin dashboard data');
    } finally {
      setIsLoadingData(false);
    }
  }, [isAuthenticated, showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated, loadDashboardData]);

  // Handle Admin Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      await api.admin.login(password.trim());
      setIsAuthenticated(true);
      setPassword('');
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const wait = err.data?.waitSeconds || 900;
          setLockoutSeconds(wait);
          setLoginError(
            t.admin.lockoutWait.replace('{seconds}', String(wait))
          );
        } else if (err.status === 401 && err.data?.attemptsLeft !== undefined) {
          setLoginError(
            `${t.admin.errorInvalidPassword} (${t.admin.attemptsRemaining.replace(
              '{n}',
              String(err.data.attemptsLeft)
            )})`
          );
        } else {
          setLoginError(err.message || t.admin.errorInvalidPassword);
        }
      } else {
        setLoginError(err?.message || 'Login failed');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Admin Logout
  const handleLogout = async () => {
    try {
      await api.admin.logout();
    } catch (err) {
      console.warn('Logout error:', err);
    }
    setIsAuthenticated(false);
    setStats(null);
    setSessions([]);
  };

  // Session Revocation Handlers
  const handleExecuteRevoke = async () => {
    if (!confirmModal) return;
    const { type, targetId } = confirmModal;
    setConfirmModal(null);
    setActionLoading(targetId || type);

    try {
      if (type === 'session' && targetId) {
        await api.admin.revokeSession(targetId);
        showToast(t.admin.sessionRevokedToast);
      } else if (type === 'couple' && targetId) {
        const res = await api.admin.revokeCoupleSessions(targetId);
        showToast(
          t.admin.allRevokedToast.replace('{count}', String(res.revokedCount))
        );
      } else if (type === 'all') {
        const res = await api.admin.revokeAllSessions();
        showToast(
          t.admin.allRevokedToast.replace('{count}', String(res.revokedCount))
        );
      }
      await loadDashboardData();
    } catch (err: any) {
      console.error('Revocation error:', err);
      showToast(err?.message || 'Revocation failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter((s) => {
      return (
        s.user_nickname.toLowerCase().includes(q) ||
        s.couple_code.toLowerCase().includes(q) ||
        s.device_info.toLowerCase().includes(q) ||
        (s.user_agent && s.user_agent.toLowerCase().includes(q))
      );
    });
  }, [sessions, searchQuery]);

  // Format relative or date string
  const formatTimestamp = (ts?: string) => {
    if (!ts) return '-';
    try {
      const date = new Date(ts);
      if (Number.isNaN(date.getTime())) return ts;
      return date.toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    } catch {
      return ts;
    }
  };

  // Loading state while verifying authentication
  if (checkingAuth) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF7F2] flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center mb-3 animate-soft-pulse">
          <Shield className="w-7 h-7" />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-[#8C827A]">
          {t.common.loading}
        </p>
      </div>
    );
  }

  // View: Admin Login Form
  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF7F2] text-[#2D2825] flex flex-col items-center justify-center p-4 sm:p-6 relative selection:bg-rose-200">
        {/* Top bar with Language Switcher and Back link */}
        <div className="absolute top-4 right-4 flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 border border-[#E8E0D7] text-[#5C5248] hover:bg-white transition-all shadow-cozy-xs"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{language.toUpperCase()}</span>
          </button>
        </div>

        <div className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-[#E8E0D7] shadow-cozy-lg relative animate-fade-in">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-50 to-rose-50 border border-amber-200/60 text-amber-600 flex items-center justify-center mb-3.5 shadow-cozy-xs">
              <Shield className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-[#1C1917] tracking-tight">
              {t.admin.loginTitle}
            </h1>
            <p className="text-xs text-[#7A7067] mt-1">
              {t.admin.loginSubtitle}
            </p>
          </div>

          {loginError && (
            <div className="mb-5 p-3 rounded-2xl bg-rose-50/90 border border-rose-200/80 text-rose-800 text-xs flex items-start space-x-2.5 animate-shake">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{loginError}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password-input"
                className="block text-xs font-bold text-[#5C5248] uppercase tracking-wider mb-1.5"
              >
                {t.admin.passwordLabel}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C827A]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoggingIn || lockoutSeconds > 0}
                  placeholder={t.admin.passwordPlaceholder}
                  className="w-full pl-10 pr-10 py-3 bg-[#FAF7F2] border border-[#E2D8CF] rounded-2xl text-sm text-[#2D2825] focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all placeholder:text-[#A89F95] disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8C827A] hover:text-[#5C5248] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || !password.trim() || lockoutSeconds > 0}
              className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white rounded-2xl font-bold text-sm shadow-cozy-sm transition-all disabled:opacity-50 active:scale-[0.99] flex items-center justify-center space-x-2"
            >
              <Shield className="w-4 h-4" />
              <span>
                {isLoggingIn ? t.admin.loggingIn : t.admin.loginButton}
              </span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#F0EBE6] text-center">
            <a
              href="/"
              className="inline-flex items-center space-x-1.5 text-xs text-[#7A7067] hover:text-[#2D2825] transition-colors font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.admin.backToApp}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // View: Authenticated Admin Dashboard
  return (
    <div className="min-h-[100dvh] bg-[#FAF7F2] text-[#2D2825] flex flex-col selection:bg-rose-200">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#1C1917]/95 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-cozy-lg border border-white/10 flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-[#E8E0D7] sticky top-0 z-30 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-50 to-rose-50 border border-amber-200/70 text-amber-600 flex items-center justify-center shadow-cozy-xs">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-black tracking-tight text-[#1C1917]">
                  {t.header.appName}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-[#7A7067]">
                {t.admin.pageSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-[#FAF7F2] border border-[#E8E0D7] text-[#5C5248] hover:bg-white transition-all shadow-cozy-xs flex items-center space-x-1"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{language.toUpperCase()}</span>
            </button>

            <a
              href="/"
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FAF7F2] border border-[#E8E0D7] text-[#5C5248] hover:bg-white transition-all shadow-cozy-xs flex items-center space-x-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.admin.backToApp}</span>
            </a>

            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 border border-rose-200/70 text-rose-700 hover:bg-rose-100 transition-all shadow-cozy-xs flex items-center space-x-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.admin.logoutButton}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Total Couples */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#E8E0D7] shadow-cozy-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#7A7067] uppercase tracking-wider">
                {t.admin.statsCouples}
              </span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                <Heart className="w-4 h-4 fill-rose-500" />
              </div>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-[#1C1917]">
              {stats?.total_couples ?? '-'}
            </span>
          </div>

          {/* Total Users */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#E8E0D7] shadow-cozy-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#7A7067] uppercase tracking-wider">
                {t.admin.statsUsers}
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-[#1C1917]">
              {stats?.total_users ?? '-'}
            </span>
          </div>

          {/* Total Sessions */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#E8E0D7] shadow-cozy-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#7A7067] uppercase tracking-wider">
                {t.admin.statsSessions}
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-[#1C1917]">
              {stats?.total_sessions ?? '-'}
            </span>
          </div>

          {/* Live Online Connections */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#E8E0D7] shadow-cozy-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#7A7067] uppercase tracking-wider">
                {t.admin.statsLiveConnections}
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-2xl sm:text-3xl font-black text-emerald-600">
                {stats?.live_connections ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Sessions Section Header & Controls */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 border border-[#E8E0D7] shadow-cozy-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-[#1C1917]">
                  {t.admin.sessionsTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FAF7F2] text-[#5C5248] border border-[#E8E0D7]">
                  {filteredSessions.length}
                </span>
              </div>
              <p className="text-xs text-[#7A7067]">
                {t.admin.sessionsDesc}
              </p>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={loadDashboardData}
                disabled={isLoadingData}
                className="px-3 py-2 rounded-2xl bg-[#FAF7F2] hover:bg-[#F3ECE4] text-[#5C5248] border border-[#E8E0D7] text-xs font-bold flex items-center space-x-1.5 transition-all disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`}
                />
                <span>{t.admin.refresh}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setConfirmModal({
                    type: 'all',
                    title: t.admin.revokeAllButton,
                    message: t.admin.revokeAllConfirm,
                  })
                }
                disabled={actionLoading !== null || sessions.length === 0}
                className="px-3 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center space-x-1.5 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.admin.revokeAllButton}</span>
                <span className="sm:hidden">Revoke All</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C827A]">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.admin.searchPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 bg-[#FAF7F2] border border-[#E2D8CF] rounded-2xl text-xs sm:text-sm text-[#2D2825] focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all placeholder:text-[#A89F95]"
            />
          </div>

          {/* Sessions List */}
          {filteredSessions.length === 0 ? (
            <div className="py-12 text-center text-[#8C827A] space-y-2">
              <Smartphone className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-xs font-medium">{t.admin.noSessionsFound}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F0EBE6]">
              {filteredSessions.map((session) => (
                <div
                  key={session.token}
                  className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 group transition-colors hover:bg-[#FAF7F2]/60 -mx-2 px-2 rounded-2xl"
                >
                  {/* Left Column: Device and User Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Live Online Badge */}
                      {session.is_online ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{t.admin.onlineBadge}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                          <span>{t.admin.offlineBadge}</span>
                        </span>
                      )}

                      {/* Device name */}
                      <span className="text-sm font-bold text-[#1C1917]">
                        {session.device_info}
                      </span>

                      {/* Couple Code Badge */}
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-100">
                        {session.couple_code}
                      </span>

                      {/* Slot Badge */}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                        {session.user_slot === 1
                          ? t.admin.slot1Badge
                          : t.admin.slot2Badge}
                      </span>
                    </div>

                    <div className="text-xs text-[#7A7067] flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        <strong>{session.user_nickname}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        {t.admin.createdPrefix}:{' '}
                        {formatTimestamp(session.created_at)}
                      </span>
                      <span>•</span>
                      <span>
                        {t.admin.lastActivePrefix}:{' '}
                        {formatTimestamp(session.last_active_at)}
                      </span>
                      <span className="font-mono text-[10px] text-[#A89F95]">
                        ({session.token_preview})
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          type: 'couple',
                          targetId: session.couple_id,
                          title: `${t.admin.revokeCoupleButton} (${session.couple_code})`,
                          message: t.admin.revokeCoupleConfirm,
                        })
                      }
                      disabled={actionLoading !== null}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition-all disabled:opacity-50"
                      title={t.admin.revokeCoupleButton}
                    >
                      {t.admin.revokeCoupleButton}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          type: 'session',
                          targetId: session.token,
                          title: t.admin.revokeSessionButton,
                          message: t.admin.revokeSessionConfirm,
                        })
                      }
                      disabled={actionLoading !== null}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all disabled:opacity-50 flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t.admin.revokeSessionButton}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Dialog Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#E8E0D7] shadow-cozy-xl space-y-4 animate-scale-up">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <h3 className="font-bold text-base text-[#1C1917]">
                {confirmModal.title}
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-[#5C5248] leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-2xl bg-[#FAF7F2] hover:bg-[#F3ECE4] text-[#5C5248] text-xs font-bold transition-all border border-[#E8E0D7]"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleExecuteRevoke}
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-cozy-xs"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
