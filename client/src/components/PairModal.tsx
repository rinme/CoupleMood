import React, { useState } from 'react';
import { Heart, AlertCircle, ArrowRight, Dices } from 'lucide-react';
import { api, ApiError } from '../api.js';
import { SessionResponse } from '../types.js';
import { useTranslation } from '../i18n/index.js';

interface PairModalProps {
  onPairSuccess: (session: SessionResponse) => void;
}

export const PairModal: React.FC<PairModalProps> = ({ onPairSuccess }) => {
  const { language, toggleLanguage, t } = useTranslation();
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generateRandomCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(`LOVE-${suffix}`);
    setErrorMessage(null);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setCode(cleaned);
    setErrorMessage(null);
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNickname(e.target.value);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanNick = nickname.trim();

    if (!cleanCode) {
      setErrorMessage(t.pairing.errorEmptyCode);
      return;
    }

    if (!cleanNick) {
      setErrorMessage(t.pairing.errorEmptyNickname);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.auth.pair({
        code: cleanCode,
        nickname: cleanNick,
      });
      onPairSuccess(response);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrorMessage(t.pairing.errorRoomFull);
        } else {
          setErrorMessage(err.message || t.pairing.errorDefault);
        }
      } else {
        setErrorMessage(t.pairing.errorNetwork);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#FAF7F2] flex items-center justify-center p-4 px-5 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-rose-200/30 blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-amber-200/25 blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />

      <div className="max-w-md w-full bg-white/85 backdrop-blur-md border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-cozy-lg relative z-10">
        {/* Language Switcher Pill */}
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={toggleLanguage}
            title={language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
            aria-label="Toggle language (TH / EN)"
            className="group inline-flex items-center bg-[#FAF7F2] hover:bg-white text-xs font-semibold py-1 px-2.5 rounded-full border border-[#E8E2D9] shadow-cozy-xs hover:border-rose-300 active:scale-[0.96] transition-all text-[#2D2825]"
          >
            <span className={`transition-colors ${language === 'th' ? 'text-rose-600 font-bold' : 'text-[#8C827A] group-hover:text-[#2D2825]'}`}>
              TH
            </span>
            <span className="text-[#D3CBC2] mx-1 select-none">|</span>
            <span className={`transition-colors ${language === 'en' ? 'text-rose-600 font-bold' : 'text-[#8C827A] group-hover:text-[#2D2825]'}`}>
              EN
            </span>
          </button>
        </div>

        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-100 to-rose-50 text-rose-500 mb-4 border border-rose-200/70 shadow-cozy-xs">
            <Heart className="w-8 h-8 fill-rose-500 text-rose-500 animate-soft-pulse" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2D2825] tracking-tight">
            {t.pairing.title}
          </h2>
          <p className="text-sm text-[#8C827A] mt-2 max-w-xs mx-auto leading-relaxed text-pretty">
            {t.pairing.tagline}
          </p>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-2.5 text-xs sm:text-sm text-rose-800 shadow-xs animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span className="leading-snug text-pretty">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Couple Code Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="couple-code" className="text-xs font-semibold text-[#2D2825] uppercase tracking-wider">
                {t.pairing.coupleCodeLabel}
              </label>
              <button
                type="button"
                onClick={generateRandomCode}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50/80 hover:bg-rose-100/80 px-2.5 py-1 rounded-xl border border-rose-200/70 shadow-cozy-xs active:scale-[0.96] transition-all"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>{t.pairing.generateRandom}</span>
              </button>
            </div>
            <div className="relative">
              <input
                id="couple-code"
                type="text"
                value={code}
                onChange={handleCodeChange}
                placeholder={t.pairing.codePlaceholder}
                maxLength={20}
                className="w-full bg-[#FAF7F2] border border-[#E8E2D9] rounded-2xl px-4 py-3 text-base font-mono font-bold tracking-wider text-[#2D2825] placeholder:text-[#8C827A]/60 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition-all uppercase shadow-inner tabular-nums"
                disabled={isLoading}
              />
            </div>
            <p className="text-[11px] text-[#8C827A] mt-1.5 leading-normal text-pretty">
              {t.pairing.codeHelp}
            </p>
          </div>

          {/* Nickname Section */}
          <div>
            <label htmlFor="nickname" className="block text-xs font-semibold text-[#2D2825] uppercase tracking-wider mb-1.5">
              {t.pairing.nicknameLabel}
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={handleNicknameChange}
              placeholder={t.pairing.nicknamePlaceholder}
              maxLength={30}
              className="w-full bg-[#FAF7F2] border border-[#E8E2D9] rounded-2xl px-4 py-3 text-base text-[#2D2825] placeholder:text-[#8C827A]/60 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:bg-white transition-all shadow-inner"
              disabled={isLoading}
            />
            <p className="text-[11px] text-[#8C827A] mt-1.5 leading-normal text-pretty">
              {t.pairing.nicknameHelp}
            </p>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isLoading || !code.trim() || !nickname.trim()}
            className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-b from-[#2D2825] to-[#1C1917] hover:from-black hover:to-[#1C1917] text-[#FAF7F2] font-semibold text-sm shadow-md hover:shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-white/10"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{t.pairing.enterRoom}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
