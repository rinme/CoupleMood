import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api.js';
import { SessionResponse, Mood, Partner, SetMoodRequest, SseEvent } from './types.js';
import { registerServiceWorker, subscribeToPush } from './sw-register.js';
import { Header } from './components/Header.js';
import { PairModal } from './components/PairModal.js';
import { PartnerCard } from './components/PartnerCard.js';
import { MyMoodCard } from './components/MyMoodCard.js';
import { PushPrompt } from './components/PushPrompt.js';
import { Heart } from 'lucide-react';
import { I18nProvider, useTranslation, useHasI18nProvider } from './i18n/index.js';

export const AppContent: React.FC = () => {
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [myMood, setMyMood] = useState<Mood | null>(null);
  const [partnerMood, setPartnerMood] = useState<Mood | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; emoji?: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const toastTimerRef = useRef<any>(null);
  const inFlightRef = useRef(false);
  const lastLoadTimeRef = useRef(0);

  // Helper to show transient toasts and clear existing timers
  const showToast = useCallback((toastData: { message: string; emoji?: string }) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(toastData);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  // Clear toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Revalidate moods & session from server with throttling
  const loadMoods = useCallback(async (force = false) => {
    const now = Date.now();
    // Throttle simultaneous focus + visibilitychange requests within 1500ms unless forced
    if (!force) {
      if (inFlightRef.current || now - lastLoadTimeRef.current < 1500) {
        return;
      }
    }
    inFlightRef.current = true;
    lastLoadTimeRef.current = now;

    try {
      const data = await api.mood.getMoods();
      setMyMood(data.myMood);
      setPartnerMood(data.partnerMood);
      if (data.partner) {
        setPartner(data.partner);
      }
    } catch (err) {
      console.error('Failed to load moods:', err);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Initial session check on mount
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const urlParams =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : null;
        const linkCode = urlParams ? urlParams.get('code') : null;
        let sessionData: SessionResponse;

        if (linkCode && /^\d{6}$/.test(linkCode)) {
          try {
            sessionData = await api.auth.verifyDeviceLink(linkCode);
            if (typeof window !== 'undefined' && window.history?.replaceState) {
              window.history.replaceState({}, '', '/');
            }
            showToast({ message: t.deviceLink.connectedSuccess, emoji: '📱' });
          } catch (linkErr) {
            console.warn('Auto-login with device link failed, falling back to getSession:', linkErr);
            if (typeof window !== 'undefined' && window.history?.replaceState) {
              window.history.replaceState({}, '', '/');
            }
            const errStatus = (linkErr as any)?.status;
            const errText = errStatus === 410 ? t.pairing.errorExpiredOtp : t.pairing.errorInvalidOtp;
            showToast({ message: errText, emoji: '⚠️' });
            sessionData = await api.auth.getSession();
          }
        } else {
          sessionData = await api.auth.getSession();
        }

        if (!mounted) return;
        setSession(sessionData);
        setPartner(sessionData.partner);

        // Fetch moods (forced on mount)
        await loadMoods(true);

        // Register Service Worker in background
        registerServiceWorker().catch((err) =>
          console.warn('SW registration deferred:', err)
        );
      } catch (err) {
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setIsInitialLoading(false);
        }
      }
    }

    initSession();

    return () => {
      mounted = false;
    };
  }, [loadMoods, showToast, t]);

  // Establish SSE connection when authenticated
  useEffect(() => {
    if (!session) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setSseConnected(false);
      return;
    }

    let reconnectTimer: any;
    let es: EventSource | null = null;

    const handleSseMessage = (event: MessageEvent) => {
      if (!event.data || event.data.trim() === 'ping') return;
      try {
        const payload = JSON.parse(event.data) as SseEvent;
        if (payload.type === 'mood_update') {
          if (payload.user?.id && session?.user?.id && payload.user.id === session.user.id) {
            setMyMood(payload.mood);
          } else {
            setPartnerMood(payload.mood);
            const partnerName = payload.user?.nickname || t.toasts.defaultPartnerName;
            showToast({
              message: `${partnerName} ${t.toasts.moodUpdated}`,
              emoji: payload.mood.emoji,
            });
          }
        } else if (payload.type === 'mood_cleared') {
          if (payload.user?.id && session?.user?.id && payload.user.id === session.user.id) {
            setMyMood(null);
          } else {
            setPartnerMood(null);
            const partnerName = payload.user?.nickname || t.toasts.defaultPartnerName;
            showToast({
              message: `${partnerName} ${t.toasts.moodCleared}`,
            });
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    function connectStream() {
      if (typeof EventSource === 'undefined') return;
      if (es) {
        es.removeEventListener('mood_update', handleSseMessage as EventListener);
        es.removeEventListener('mood_cleared', handleSseMessage as EventListener);
        es.close();
      }

      es = new EventSource('/api/stream');
      eventSourceRef.current = es;

      es.onopen = () => {
        setSseConnected(true);
      };

      es.onerror = () => {
        setSseConnected(false);
        if (es) {
          es.removeEventListener('mood_update', handleSseMessage as EventListener);
          es.removeEventListener('mood_cleared', handleSseMessage as EventListener);
          es.close();
          es = null;
        }
        // Attempt reconnect after 5s
        reconnectTimer = setTimeout(() => {
          if (session) {
            connectStream();
          }
        }, 5000);
      };

      // Register named SSE event listeners per W3C specification, plus onmessage fallback
      es.addEventListener('mood_update', handleSseMessage as EventListener);
      es.addEventListener('mood_cleared', handleSseMessage as EventListener);
      es.onmessage = handleSseMessage;
    }

    connectStream();

    return () => {
      clearTimeout(reconnectTimer);
      if (es) {
        es.removeEventListener('mood_update', handleSseMessage as EventListener);
        es.removeEventListener('mood_cleared', handleSseMessage as EventListener);
        es.close();
        es = null;
      }
      setSseConnected(false);
    };
  }, [session, showToast, t]);

  // Window focus & visibility revalidation
  useEffect(() => {
    if (!session) return;

    const handleFocus = () => {
      loadMoods();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadMoods();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, loadMoods]);

  // Service Worker message listener (for background notification click)
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof navigator.serviceWorker?.addEventListener !== 'function'
    ) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'REFRESH_MOOD') {
        loadMoods(true);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', handleMessage);
    };
  }, [loadMoods]);

  // Pair Success Handler
  const handlePairSuccess = async (newSession: SessionResponse) => {
    setSession(newSession);
    setPartner(newSession.partner);
    await loadMoods(true);
    registerServiceWorker().catch((err) =>
      console.warn('SW registration deferred:', err)
    );
  };

  // Mood Actions
  const handleSetMood = async (req: SetMoodRequest) => {
    const response = await api.mood.setMood(req);
    setMyMood(response.mood);
  };

  const handleClearMood = async () => {
    await api.mood.clearMood();
    setMyMood(null);
  };

  const handleUnpair = async () => {
    await api.auth.unpair();
    setSession(null);
    setMyMood(null);
    setPartnerMood(null);
    setPartner(null);
    setSseConnected(false);
  };

  const handleLogout = async () => {
    await api.auth.logout();
    setSession(null);
    setMyMood(null);
    setPartnerMood(null);
    setPartner(null);
    setSseConnected(false);
  };

  const handleSubscribePush = async () => {
    await subscribeToPush();
  };

  // Initial Loading Spinner
  if (isInitialLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF7F2] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-rose-100 to-rose-50 text-rose-500 flex items-center justify-center mb-3.5 border border-rose-200/70 shadow-cozy-xs animate-soft-pulse">
          <Heart className="w-7 h-7 fill-rose-500 text-rose-500" />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-[#8C827A]">
          {t.common.connecting}
        </p>
      </div>
    );
  }

  // Not Paired / Unauthenticated State
  if (!session) {
    return <PairModal onPairSuccess={handlePairSuccess} />;
  }

  // Main Dashboard
  return (
    <div className="min-h-[100dvh] bg-transparent text-[#2D2825] flex flex-col selection:bg-rose-200/80 selection:text-rose-950 relative">
      <Header
        coupleCode={session.couple.code}
        sseConnected={sseConnected}
        user={session.user}
        partner={partner}
        onUnpair={handleUnpair}
        onLogout={handleLogout}
      />

      {/* Real-time Toast Alert */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-[#1C1917]/95 backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-cozy-lg border border-white/10 flex items-center space-x-2 text-xs font-semibold animate-fade-in tracking-tight">
          {toast.emoji && <span className="text-base select-none">{toast.emoji}</span>}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="flex-1 max-w-lg w-full mx-auto p-4 sm:p-5 space-y-5 pb-safe">
        {/* Polite Web Push Prompt */}
        <PushPrompt onSubscribe={handleSubscribePush} />

        {/* Partner's Mood Card (Primary focal point) */}
        <PartnerCard
          partner={partner}
          partnerMood={partnerMood}
          coupleCode={session.couple.code}
        />

        {/* My Mood Card */}
        <MyMoodCard
          currentMood={myMood}
          onSetMood={handleSetMood}
          onClearMood={handleClearMood}
        />

        {/* Quiet footer */}
        <footer className="pt-6 pb-4 text-center text-[11px] text-[#8C827A] flex items-center justify-center space-x-1.5 font-medium">
          <span>{t.footer.craftedWith}</span>
          <Heart className="w-3 h-3 fill-rose-400 text-rose-400 inline" />
          <span>{t.footer.forCouples}</span>
        </footer>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  const hasProvider = useHasI18nProvider();
  if (hasProvider) {
    return <AppContent />;
  }
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
};

export default App;
