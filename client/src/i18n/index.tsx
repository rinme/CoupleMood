import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { Language, TranslationSchema } from './types.js';
import { th } from './th.js';
import { en } from './en.js';

export * from './types.js';
export { th } from './th.js';
export { en } from './en.js';

export const STORAGE_KEY = 'couple_mood_lang';

export interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationSchema;
}

const translations: Record<Language, TranslationSchema> = {
  th,
  en,
};

const I18nContext = createContext<I18nContextType | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, initialLanguage }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (initialLanguage) return initialLanguage;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved === 'en' || saved === 'th') {
          return saved;
        }
      } catch {
        // Ignore localStorage access errors (e.g. security sandbox)
      }
    }
    return 'th';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // Ignore localStorage write errors
      }
    }
  }, []);

  const t = useMemo(() => translations[language] || translations.th, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      language: 'th',
      setLanguage: () => {},
      t: translations.th,
    };
  }
  return context;
}
