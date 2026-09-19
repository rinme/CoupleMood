import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, RefreshCw, Smartphone, AlertCircle } from 'lucide-react';
import { api, ApiError } from '../api.js';
import { DeviceLinkCreateResponse } from '../types.js';
import { useTranslation } from '../i18n/index.js';

interface DeviceLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceLinkModal: React.FC<DeviceLinkModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<DeviceLinkCreateResponse | null>(null);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const timerRef = useRef<any>(null);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
      }
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
    return false;
  };

  const loadLinkCode = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.auth.createDeviceLink();
      setData(res);

      // Generate QR Code SVG
      const svg = await QRCode.toString(res.qrUrl, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#2D2825',
          light: '#FFFFFF',
        },
      });
      setQrSvg(svg);

      const remaining = Math.max(
        0,
        Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(remaining);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to generate device link code');
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch new link code on modal open
  useEffect(() => {
    if (isOpen) {
      loadLinkCode();
    } else {
      setData(null);
      setQrSvg('');
      setError(null);
    }
  }, [isOpen, loadLinkCode]);

  // Countdown timer tick
  useEffect(() => {
    if (!isOpen || !data?.expiresAt) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemainingSeconds(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOpen, data?.expiresAt]);

  if (!isOpen) return null;

  const isExpired = remainingSeconds <= 0;
  const isUrgent = remainingSeconds > 0 && remainingSeconds < 60;

  const formattedMinutes = Math.floor(remainingSeconds / 60);
  const formattedSeconds = remainingSeconds % 60;
  const formattedTimer = `${formattedMinutes}:${
    formattedSeconds < 10 ? '0' : ''
  }${formattedSeconds}`;

  const formattedCode =
    data?.code && data.code.length === 6
      ? `${data.code.slice(0, 3)} ${data.code.slice(3)}`
      : data?.code || '';

  const handleCopyCode = async () => {
    if (!data?.code) return;
    const ok = await copyToClipboard(data.code);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    if (!data?.qrUrl) return;
    const ok = await copyToClipboard(data.qrUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#FAF7F2] border border-[#E8E2D9] rounded-3xl p-6 max-w-sm w-full shadow-cozy-lg relative overflow-hidden">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="absolute top-4 right-4 text-[#8C827A] hover:text-[#2D2825] p-1.5 rounded-full hover:bg-black/5 active:scale-90 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mb-2.5 border border-rose-200/70 shadow-cozy-xs">
            <Smartphone className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-extrabold text-[#2D2825] tracking-tight">
            {t.deviceLink.modalTitle}
          </h3>
          <p className="text-xs text-[#8C827A] mt-1 leading-relaxed text-pretty">
            {t.deviceLink.modalSubtitle}
          </p>
        </div>

        {/* Loading Spinner */}
        {isLoading && !data && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-3 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
            <p className="text-xs font-semibold text-[#8C827A]">{t.common.loading}</p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-2.5 text-xs text-rose-800 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Content View */}
        {data && (
          <div className="space-y-4">
            {/* QR Code Container */}
            <div className="bg-white p-4 rounded-2xl border border-[#E8E2D9] flex flex-col items-center justify-center shadow-xs">
              <div
                className={`w-48 h-48 flex items-center justify-center transition-opacity ${
                  isExpired ? 'opacity-25 grayscale' : 'opacity-100'
                }`}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="text-[11px] font-medium text-[#8C827A] mt-2.5 text-center">
                {t.deviceLink.scanHelp}
              </p>
            </div>

            {/* 6-Digit OTP Box */}
            <div className="bg-white/80 p-4 rounded-2xl border border-[#E8E2D9] shadow-xs text-center">
              <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-1">
                {t.deviceLink.codeLabel}
              </div>
              <div className="flex items-center justify-center space-x-2 mb-2">
                <span className="text-3xl font-mono font-extrabold tracking-widest text-[#2D2825] tabular-nums select-all">
                  {formattedCode}
                </span>
              </div>

              {/* Timer Status Pill */}
              <div className="flex items-center justify-center">
                {isExpired ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold text-rose-700 bg-rose-100/70 border border-rose-200 animate-pulse">
                    <span>{t.deviceLink.expired}</span>
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium border ${
                      isUrgent
                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                        : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <span>{t.deviceLink.expiresIn}</span>
                    <span className="font-mono font-bold tabular-nums ml-1">
                      {formattedTimer}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Actions: Copy Code & Link / Refresh */}
            {isExpired ? (
              <button
                type="button"
                onClick={loadLinkCode}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs shadow-cozy-sm flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{t.deviceLink.generateNew}</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="py-2.5 px-3 bg-white hover:bg-white/80 border border-[#E8E2D9] text-[#2D2825] hover:border-rose-300 font-semibold text-xs rounded-xl shadow-cozy-xs flex items-center justify-center space-x-1.5 active:scale-[0.97] transition-all"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">{t.deviceLink.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#8C827A]" />
                      <span>{t.deviceLink.copyCode}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="py-2.5 px-3 bg-white hover:bg-white/80 border border-[#E8E2D9] text-[#2D2825] hover:border-rose-300 font-semibold text-xs rounded-xl shadow-cozy-xs flex items-center justify-center space-x-1.5 active:scale-[0.97] transition-all"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">{t.deviceLink.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#8C827A]" />
                      <span>{t.common.copy} Link</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
