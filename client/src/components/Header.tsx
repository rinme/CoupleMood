import React, { useState } from 'react';
import { Heart, Copy, Check, Radio, Settings, LogOut, X, Smartphone } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';
import { DeviceLinkModal } from './DeviceLinkModal.js';

interface HeaderProps {
  coupleCode?: string;
  sseConnected: boolean;
  user?: { nickname: string; slot: number } | null;
  partner?: { nickname: string } | null;
  onUnpair: () => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
}

export const Header: React.FC<HeaderProps> = ({
  coupleCode,
  sseConnected,
  user,
  partner,
  onUnpair,
  onLogout,
}) => {
  const { language, setLanguage, toggleLanguage, t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeviceLink, setShowDeviceLink] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      if (onLogout) {
        await onLogout();
      }
      setShowSettings(false);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FAF7F2]/85 backdrop-blur-md border-b border-[#E8E2D9]/80 px-4 py-3 transition-colors shadow-[0_1px_3px_0_rgba(45,40,37,0.02)]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-rose-100 to-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/70 shadow-cozy-xs">
              <Heart className="w-5 h-5 fill-rose-500 text-rose-500 animate-soft-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-[#2D2825] leading-tight">
                {t.header.appName}
              </h1>
              <div className="flex items-center space-x-1.5 text-xs text-[#8C827A]">
                <span className="relative flex h-2 w-2">
                  {sseConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      sseConnected ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-amber-400 ring-2 ring-amber-100'
                    }`}
                  />
                </span>
                <span className="font-medium text-[11px]">{sseConnected ? t.header.liveSync : t.header.connecting}</span>
              </div>
            </div>
          </div>

          {/* Right Action Area */}
          <div className="flex items-center space-x-2">
            {/* Clean Tactile TH | EN Language Switcher */}
            <button
              type="button"
              onClick={toggleLanguage}
              title={language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
              aria-label="Toggle language (TH / EN)"
              className="group inline-flex items-center bg-white/95 hover:bg-white text-xs font-semibold py-1 px-2.5 rounded-full border border-[#E8E2D9] shadow-cozy-xs hover:border-rose-300 active:scale-[0.96] transition-all text-[#2D2825]"
            >
              <span className={`transition-colors ${language === 'th' ? 'text-rose-600 font-bold' : 'text-[#8C827A] group-hover:text-[#2D2825]'}`}>
                TH
              </span>
              <span className="text-[#D3CBC2] mx-1 select-none">|</span>
              <span className={`transition-colors ${language === 'en' ? 'text-rose-600 font-bold' : 'text-[#8C827A] group-hover:text-[#2D2825]'}`}>
                EN
              </span>
            </button>

            {coupleCode && (
              <button
                type="button"
                onClick={handleCopyCode}
                title={t.header.copyCodeTooltip}
                className="group inline-flex items-center space-x-1.5 bg-white/95 hover:bg-white text-xs font-medium text-[#2D2825] py-1.5 px-3 rounded-full border border-[#E8E2D9] shadow-cozy-xs hover:border-rose-300 hover:shadow-cozy-sm active:scale-[0.96] transition-all"
              >
                <span className="text-[#8C827A] group-hover:text-rose-500 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </span>
                <span className="font-mono font-bold tracking-wider tabular-nums">
                  {copied ? t.header.copied : coupleCode}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label={t.header.settingsTitle}
              className="p-2 rounded-full text-[#8C827A] hover:text-[#2D2825] bg-white/60 hover:bg-white border border-[#E8E2D9]/60 hover:border-[#E8E2D9] shadow-cozy-xs active:scale-[0.95] transition-all"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings / Unpair Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FAF7F2] border border-[#E8E2D9] rounded-3xl p-6 max-w-sm w-full shadow-cozy-lg relative">
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-[#8C827A] hover:text-[#2D2825] p-1.5 rounded-full hover:bg-black/5 active:scale-90 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-[#2D2825] mb-1">{t.header.settingsTitle}</h3>
            <p className="text-xs text-[#8C827A] mb-5 text-pretty">{t.header.settingsDesc}</p>

            <div className="space-y-3 mb-6 bg-white/80 p-4 rounded-2xl border border-[#E8E2D9] shadow-xs">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">{t.header.yourNickname}</span>
                <span className="font-semibold text-[#2D2825]">{user?.nickname ?? t.header.you}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">{t.header.partner}</span>
                <span className="font-semibold text-[#2D2825]">
                  {partner?.nickname ?? t.header.notJoinedYet}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">{t.header.coupleCode}</span>
                <span className="font-mono font-bold text-rose-600 tracking-wider">{coupleCode}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#8C827A]">{t.header.liveStatus}</span>
                <span className="inline-flex items-center space-x-1 font-medium text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                  <span>{sseConnected ? t.header.connected : t.header.offline}</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-[#E8E2D9]/70">
                <span className="text-[#8C827A]">{t.header.language}:</span>
                <div className="flex items-center space-x-1 bg-[#FAF7F2] p-0.5 rounded-xl border border-[#E8E2D9]">
                  <button
                    type="button"
                    onClick={() => setLanguage('th')}
                    className={`px-2.5 py-0.5 text-xs rounded-lg font-medium transition-all ${
                      language === 'th'
                        ? 'bg-rose-500 text-white font-bold shadow-xs'
                        : 'text-[#8C827A] hover:text-[#2D2825]'
                    }`}
                  >
                    ไทย (TH)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`px-2.5 py-0.5 text-xs rounded-lg font-medium transition-all ${
                      language === 'en'
                        ? 'bg-rose-500 text-white font-bold shadow-xs'
                        : 'text-[#8C827A] hover:text-[#2D2825]'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              <button
                type="button"
                onClick={() => {
                  setShowSettings(false);
                  setShowDeviceLink(true);
                }}
                className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-[#FAF7F2] text-[#2D2825] font-semibold py-2.5 px-4 rounded-xl border border-[#E8E2D9] shadow-cozy-xs hover:border-rose-300 active:scale-[0.98] transition-all"
              >
                <Smartphone className="w-4 h-4 text-rose-500" />
                <span>{t.header.linkNewDevice}</span>
              </button>
            </div>

            <div className="border-t border-[#E8E2D9] pt-4 space-y-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleConfirmLogout}
                className="w-full flex items-center justify-center space-x-2 bg-stone-100/80 hover:bg-stone-200/80 text-stone-700 font-semibold py-2.5 px-4 rounded-xl border border-[#E8E2D9] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <LogOut className="w-4 h-4 text-stone-500" />
                <span>{loggingOut ? t.header.loggingOut : t.header.logoutThisDevice}</span>
              </button>

              <p className="text-xs text-[#8C827A] pt-2 mb-1 leading-relaxed text-pretty">
                {t.header.unpairDesc}
              </p>
              <button
                type="button"
                disabled={unpairing}
                onClick={handleConfirmUnpair}
                className="w-full flex items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold py-2.5 px-4 rounded-xl border border-rose-200 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>{unpairing ? t.header.unpairing : t.header.unpairButton}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Link Modal */}
      <DeviceLinkModal
        isOpen={showDeviceLink}
        onClose={() => setShowDeviceLink(false)}
      />
    </>
  );
};
