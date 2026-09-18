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

export const App: React.FC = () => {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [myMood, setMyMood] = useState<Mood | null>(null);
  const [partnerMood, setPartnerMood] = useState<Mood | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; emoji?: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Revalidate moods & session from server
  const loadMoods = useCallback(async () => {
    try {
      const data = await api.mood.getMoods();
      setMyMood(data.myMood);
      setPartnerMood(data.partnerMood);
      if (data.partner) {
        setPartner(data.partner);
      }
    } catch (err) {
      console.error('Failed to load moods:', err);
    }
  }, []);

  // Initial session check on mount
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const sessionData = await api.auth.getSession();
        if (!mounted) return;
        setSession(sessionData);
        setPartner(sessionData.partner);

        // Fetch moods
        await loadMoods();

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
  }, [loadMoods]);

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

    function connectStream() {
      if (es) {
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

      es.onmessage = (event) => {
        if (!event.data || event.data.trim() === 'ping') return;
        try {
          const payload = JSON.parse(event.data) as SseEvent;
          if (payload.type === 'mood_update') {
            setPartnerMood(payload.mood);
            setToast({
              message: `${payload.user?.nickname || 'Partner'} updated their mood`,
              emoji: payload.mood.emoji,
            });
            setTimeout(() => setToast(null), 3500);
          } else if (payload.type === 'mood_cleared') {
            setPartnerMood(null);
            setToast({
              message: `${payload.user?.nickname || 'Partner'} cleared their mood`,
            });
            setTimeout(() => setToast(null), 3500);
          }
        } catch (err) {
          console.error('Failed to parse SSE payload:', err);
        }
      };
    }

    connectStream();

    return () => {
      clearTimeout(reconnectTimer);
      if (es) {
        es.close();
        es = null;
      }
      setSseConnected(false);
    };
  }, [session]);

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
        loadMoods();
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
    await loadMoods();
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

  const handleSubscribePush = async () => {
    await subscribeToPush();
  };

  // Initial Loading Spinner
  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mb-3 animate-pulse shadow-sm">
          <Heart className="w-6 h-6 fill-rose-500 text-rose-500" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8C827A]">
          Connecting...
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
    <div className="min-h-screen bg-[#FAF7F2] text-[#2D2825] flex flex-col selection:bg-rose-100 selection:text-rose-900">
      <Header
        coupleCode={session.couple.code}
        sseConnected={sseConnected}
        user={session.user}
        partner={partner}
        onUnpair={handleUnpair}
      />

      {/* Real-time Toast Alert */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-[#2D2825] text-white px-4 py-2.5 rounded-full shadow-cozy-lg flex items-center space-x-2 text-xs font-medium animate-bounce">
          {toast.emoji && <span className="text-base">{toast.emoji}</span>}
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
        <footer className="pt-4 pb-2 text-center text-[11px] text-[#8C827A] flex items-center justify-center space-x-1">
          <span>Crafted with</span>
          <Heart className="w-3 h-3 fill-rose-400 text-rose-400 inline" />
          <span>for couples</span>
        </footer>
      </main>
    </div>
  );
};

export default App;
