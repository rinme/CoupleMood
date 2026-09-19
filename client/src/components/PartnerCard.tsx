import React, { useState, useEffect } from 'react';
import { Clock, Copy, Check, Users, MessageSquareQuote, HeartHandshake } from 'lucide-react';
import { Partner, Mood } from '../types.js';
import { getThemeStyles, formatRelativeTime } from '../presets.js';
import { useTranslation } from '../i18n/index.js';

interface PartnerCardProps {
  partner: Partner | null;
  partnerMood: Mood | null;
  coupleCode?: string;
}

export const PartnerCard: React.FC<PartnerCardProps> = ({
  partner,
  partnerMood,
  coupleCode,
}) => {
  const { language, t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);

  // Periodic tick every 30 seconds to update relative time labels ("Just now" -> "1m ago")
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // 1. Partner has not joined yet
  if (!partner) {
    return (
      <section className="bg-white/80 border border-[#E8E2D9] rounded-3xl p-6 sm:p-7 shadow-cozy text-center transition-all">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-3 shadow-sm">
          <HeartHandshake className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold text-[#2D2825]">{t.partnerCard.waitingTitle}</h3>
        <p className="text-xs sm:text-sm text-[#8C827A] mt-1.5 max-w-xs mx-auto leading-relaxed">
          {t.partnerCard.waitingDesc}
        </p>

        {coupleCode && (
          <div className="mt-5 p-3.5 bg-[#FAF7F2] rounded-2xl border border-[#E8E2D9] inline-flex items-center space-x-3">
            <span className="font-mono text-base sm:text-lg font-bold tracking-widest text-rose-600">
              {coupleCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="p-1.5 rounded-xl bg-white border border-[#E8E2D9] hover:border-rose-300 text-[#2D2825] active:scale-95 shadow-xs transition-all flex items-center space-x-1 text-xs font-semibold px-2.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.partnerCard.copied : t.partnerCard.copy}</span>
            </button>
          </div>
        )}
      </section>
    );
  }

  // 2. Partner is joined, but has not set an active mood
  if (!partnerMood) {
    return (
      <section className="bg-white/80 border border-[#E8E2D9] rounded-3xl p-6 sm:p-7 shadow-cozy transition-all">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[#8C827A] flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5 text-rose-400" />
            <span>
              {language === 'th' ? `ความรู้สึกของ ${partner.nickname}` : `${partner.nickname}'s Mood`}
            </span>
          </span>
          <span className="text-[11px] text-[#8C827A] italic">{t.partnerCard.quietForNow}</span>
        </div>

        <div className="py-8 text-center flex flex-col items-center">
          <div className="text-5xl sm:text-6xl mb-3 select-none filter grayscale opacity-40">
            🌱
          </div>
          <h4 className="text-lg font-semibold text-[#2D2825]">
            {t.partnerCard.waitingFor} {partner.nickname}
          </h4>
          <p className="text-xs text-[#8C827A] mt-1 max-w-xs leading-relaxed">
            {partner.nickname} {t.partnerCard.notPostedYet}
          </p>
        </div>
      </section>
    );
  }

  // 3. Partner has an active mood
  const themeKey = partnerMood.colorTheme || partnerMood.color_theme || 'rose';
  const theme = getThemeStyles(themeKey);
  const relativeTime = formatRelativeTime(partnerMood.updated_at, language);

  return (
    <section
      className={`relative overflow-hidden rounded-3xl p-6 sm:p-7 border ${theme.border} ${theme.cardBg} shadow-cozy-lg transition-all duration-500`}
      style={{
        boxShadow: `0 8px 30px -6px ${theme.glow}, 0 2px 10px -2px rgba(45, 40, 37, 0.04)`,
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-[#2D2825]">
            {language === 'th'
              ? `ความรู้สึกของ ${partner.nickname} ในตอนนี้`
              : `${partner.nickname}${t.partnerCard.currentMoodSuffix}`}
          </span>
        </div>

        <div className="flex items-center space-x-1 text-xs text-[#8C827A]">
          <Clock className="w-3 h-3" />
          <span>{relativeTime}</span>
        </div>
      </div>

      {/* Main Mood Display */}
      <div className="flex flex-col items-center text-center py-3 sm:py-4">
        {/* Large Emoji */}
        <div className="text-6xl sm:text-7xl mb-3.5 select-none transform hover:scale-105 transition-transform drop-shadow-sm">
          {partnerMood.emoji}
        </div>

        {/* Mood Label */}
        <div className="inline-flex items-center space-x-2">
          <span
            className={`text-sm sm:text-base font-bold px-3.5 py-1 rounded-full ${theme.badgeBg} ${theme.badgeText} shadow-xs`}
          >
            {partnerMood.label}
          </span>
        </div>

        {/* Optional Custom Note */}
        {partnerMood.note && (
          <div
            className={`mt-4 max-w-sm w-full p-3.5 sm:p-4 rounded-2xl ${theme.quoteBg} border ${theme.quoteBorder} shadow-xs text-[#2D2825] text-center relative`}
          >
            <MessageSquareQuote className="w-4 h-4 text-[#8C827A] mx-auto mb-1 opacity-70" />
            <p className="text-sm font-medium italic leading-relaxed break-words">
              "{partnerMood.note}"
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
