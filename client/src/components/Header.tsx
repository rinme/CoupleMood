import React, { useState } from 'react';
import { Heart, Copy, Check, Radio, Settings, LogOut, X } from 'lucide-react';

interface HeaderProps {
  coupleCode?: string;
  sseConnected: boolean;
  user?: { nickname: string; slot: number } | null;
  partner?: { nickname: string } | null;
  onUnpair: () => Promise<void> | void;
}

export const Header: React.FC<HeaderProps> = ({
  coupleCode,
  sseConnected,
  user,
  partner,
  onUnpair,
}) => {
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [unpairing, setUnpairing] = useState(false);

  const handleCopyCode = async () => {
    if (!coupleCode) return;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(coupleCode);
      } else if (typeof document !== 'undefined') {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement('textarea');
        textArea.value = coupleCode;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy couple code:', err);
    }
  };

  const handleConfirmUnpair = async () => {
    setUnpairing(true);
    try {
      await onUnpair();
      setShowSettings(false);
    } finally {
      setUnpairing(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E8E2D9] px-4 py-3 transition-colors">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-full bg-rose-100/90 text-rose-600 flex items-center justify-center shadow-sm">
              <Heart className="w-5 h-5 fill-rose-500 text-rose-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#2D2825] leading-tight">
                Mood Sender
              </h1>
              <div className="flex items-center space-x-1.5 text-xs text-[#8C827A]">
                <span className="relative flex h-2 w-2">
                  {sseConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      sseConnected ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                </span>
                <span>{sseConnected ? 'Live sync' : 'Connecting...'}</span>
              </div>
            </div>
          </div>

          {/* Right Action Area */}
          <div className="flex items-center space-x-2">
            {coupleCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                title="Click to copy Couple Code"
                className="group flex items-center space-x-1.5 bg-white/90 hover:bg-white text-xs font-medium text-[#2D2825] py-1.5 px-3 rounded-full border border-[#E8E2D9] shadow-sm hover:border-rose-300 active:scale-95 transition-all"
              >
                <span className="text-[#8C827A] group-hover:text-rose-500 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </span>
                <span className="font-mono font-semibold tracking-wide">
                  {copied ? 'Copied!' : coupleCode}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Couple Settings"
              className="p-2 rounded-full text-[#8C827A] hover:text-[#2D2825] hover:bg-white/80 active:scale-95 border border-transparent hover:border-[#E8E2D9] transition-all"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings / Unpair Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FAF7F2] border border-[#E8E2D9] rounded-3xl p-6 max-w-sm w-full shadow-cozy-lg relative">
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-[#8C827A] hover:text-[#2D2825] p-1.5 rounded-full hover:bg-black/5"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-[#2D2825] mb-1">Couple Settings</h3>
            <p className="text-xs text-[#8C827A] mb-5">Manage your shared room and session.</p>

            <div className="space-y-3 mb-6 bg-white/70 p-4 rounded-2xl border border-[#E8E2D9]">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">Your Nickname:</span>
                <span className="font-semibold text-[#2D2825]">{user?.nickname ?? 'You'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">Partner:</span>
                <span className="font-semibold text-[#2D2825]">
                  {partner?.nickname ?? 'Not joined yet'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">Couple Code:</span>
                <span className="font-mono font-bold text-rose-600">{coupleCode}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">Live Status:</span>
                <span className="inline-flex items-center space-x-1 font-medium text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                  <span>{sseConnected ? 'Connected' : 'Offline'}</span>
                </span>
              </div>
            </div>

            <div className="border-t border-[#E8E2D9] pt-4">
              <p className="text-xs text-[#8C827A] mb-3 leading-relaxed">
                Unpairing will clear your session on this device. You will need your Couple Code to reconnect.
              </p>
              <button
                type="button"
                disabled={unpairing}
                onClick={handleConfirmUnpair}
                className="w-full flex items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium py-2.5 px-4 rounded-xl border border-rose-200 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>{unpairing ? 'Unpairing...' : 'Unpair Couple'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
