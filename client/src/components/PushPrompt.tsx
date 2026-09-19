import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { isPushSupported } from '../sw-register.js';
import { useTranslation } from '../i18n/index.js';

interface PushPromptProps {
  onSubscribe: () => Promise<void>;
}

export const PushPrompt: React.FC<PushPromptProps> = ({ onSubscribe }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    // Only show if push is supported, permission is not already granted or denied,
    // and user has not dismissed it in this session
    if (typeof window === 'undefined') return;

    const dismissed = sessionStorage.getItem('push_prompt_dismissed');
    if (dismissed) return;

    if (isPushSupported() && 'Notification' in window) {
      if (Notification.permission === 'default') {
        setIsVisible(true);
      }
    }
  }, []);

  const handleEnable = async () => {
    setIsSubscribing(true);
    try {
      await onSubscribe();
      setIsVisible(false);
    } catch (err) {
      console.error('Failed to enable push notifications:', err);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('push_prompt_dismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border border-rose-200/80 rounded-2xl p-4 shadow-sm relative mb-5 transition-all">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t.pushPrompt.dismissAria}
        className="absolute top-2.5 right-2.5 text-[#8C827A] hover:text-[#2D2825] p-1 rounded-full hover:bg-black/5"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start space-x-3 pr-6">
        <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bell className="w-4 h-4" />
        </div>

        <div className="flex-1">
          <h4 className="text-sm font-bold text-[#2D2825]">
            {t.pushPrompt.title}
          </h4>
          <p className="text-xs text-[#8C827A] mt-0.5 leading-relaxed">
            {t.pushPrompt.desc}
          </p>

          <div className="flex items-center space-x-2.5 mt-3">
            <button
              type="button"
              disabled={isSubscribing}
              onClick={handleEnable}
              className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold py-1.5 px-3.5 rounded-xl shadow-xs active:scale-95 transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              {isSubscribing ? (
                <span>{t.pushPrompt.enabling}</span>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5" />
                  <span>{t.pushPrompt.enable}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs font-medium text-[#8C827A] hover:text-[#2D2825] py-1.5 px-2.5 rounded-xl hover:bg-black/5 active:scale-95 transition-all"
            >
              {t.pushPrompt.notNow}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
