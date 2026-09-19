import { PresetMood } from './types.js';
import { Language } from './i18n/types.js';

export const DEFAULT_PRESETS_TH: PresetMood[] = [
  { emoji: '🥺', label: 'คิดถึง', colorTheme: 'rose' },
  { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
  { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
  { emoji: '😴', label: 'ง่วง', colorTheme: 'purple' },
  { emoji: '💻', label: 'ยุ่งมาก', colorTheme: 'indigo' },
  { emoji: '☕', label: 'ชิลๆ', colorTheme: 'amber' },
  { emoji: '🤒', label: 'ไม่สบาย', colorTheme: 'teal' },
];

export const DEFAULT_PRESETS_EN: PresetMood[] = [
  { emoji: '🥺', label: 'Missing you', colorTheme: 'rose' },
  { emoji: '🤤', label: 'Hungry', colorTheme: 'amber' },
  { emoji: '🥰', label: 'Loving', colorTheme: 'rose' },
  { emoji: '😴', label: 'Sleepy', colorTheme: 'purple' },
  { emoji: '💻', label: 'Busy', colorTheme: 'indigo' },
  { emoji: '☕', label: 'Cozy', colorTheme: 'amber' },
  { emoji: '🤒', label: 'Sick', colorTheme: 'teal' },
];

export function getDefaultPresets(lang: Language = 'th'): PresetMood[] {
  return lang === 'en' ? DEFAULT_PRESETS_EN : DEFAULT_PRESETS_TH;
}

export const PRESET_MOODS: PresetMood[] = DEFAULT_PRESETS_TH;

export interface ThemeStyles {
  bg: string;
  cardBg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
  ring: string;
  quoteBg: string;
  quoteBorder: string;
  glow: string;
}

export const THEME_STYLES: Record<string, ThemeStyles> = {
  rose: {
    bg: 'bg-rose-50/70',
    cardBg: 'bg-gradient-to-b from-rose-50/90 via-white/95 to-rose-50/40',
    border: 'border-rose-200/80',
    badgeBg: 'bg-rose-100/90',
    badgeText: 'text-rose-700',
    accent: 'bg-rose-500',
    ring: 'focus:ring-rose-400',
    quoteBg: 'bg-white/85 shadow-xs',
    quoteBorder: 'border-rose-200/70',
    glow: 'rgba(244, 63, 94, 0.18)',
  },
  amber: {
    bg: 'bg-amber-50/70',
    cardBg: 'bg-gradient-to-b from-amber-50/90 via-white/95 to-amber-50/40',
    border: 'border-amber-200/80',
    badgeBg: 'bg-amber-100/90',
    badgeText: 'text-amber-800',
    accent: 'bg-amber-500',
    ring: 'focus:ring-amber-400',
    quoteBg: 'bg-white/85 shadow-xs',
    quoteBorder: 'border-amber-200/70',
    glow: 'rgba(245, 158, 11, 0.18)',
  },
  indigo: {
    bg: 'bg-indigo-50/70',
    cardBg: 'bg-gradient-to-b from-indigo-50/90 via-white/95 to-indigo-50/40',
    border: 'border-indigo-200/80',
    badgeBg: 'bg-indigo-100/90',
    badgeText: 'text-indigo-700',
    accent: 'bg-indigo-500',
    ring: 'focus:ring-indigo-400',
    quoteBg: 'bg-white/85 shadow-xs',
    quoteBorder: 'border-indigo-200/70',
    glow: 'rgba(99, 102, 241, 0.18)',
  },
  purple: {
    bg: 'bg-purple-50/70',
    cardBg: 'bg-gradient-to-b from-purple-50/90 via-white/95 to-purple-50/40',
    border: 'border-purple-200/80',
    badgeBg: 'bg-purple-100/90',
    badgeText: 'text-purple-700',
    accent: 'bg-purple-500',
    ring: 'focus:ring-purple-400',
    quoteBg: 'bg-white/85 shadow-xs',
    quoteBorder: 'border-purple-200/70',
    glow: 'rgba(168, 85, 247, 0.18)',
  },
  emerald: {
    bg: 'bg-emerald-50/70',
    cardBg: 'bg-gradient-to-b from-emerald-50/90 via-white/95 to-emerald-50/40',
    border: 'border-emerald-200/80',
    badgeBg: 'bg-emerald-100/90',
    badgeText: 'text-emerald-800',
    accent: 'bg-emerald-500',
    ring: 'focus:ring-emerald-400',
    quoteBg: 'bg-white/85 shadow-xs',
    quoteBorder: 'border-emerald-200/70',
    glow: 'rgba(16, 185, 129, 0.18)',
  },
  teal: {
    bg: 'bg-teal-50/70',
    cardBg: 'bg-gradient-to-b from-teal-50/90 via-white/95 to-teal-50/40',
    border: 'border-teal-200/80',
    badgeBg: 'bg-teal-100/90',
    badgeText: 'text-teal-800',
    accent: 'bg-teal-500',
    ring: 'focus:ring-teal-400',
    quoteBg: 'bg-white/85 shadow-xs',
    quoteBorder: 'border-teal-200/70',
    glow: 'rgba(20, 184, 166, 0.18)',
  },
};

export function getThemeStyles(theme?: string): ThemeStyles {
  const normalized = (theme || 'rose').toLowerCase();
  return THEME_STYLES[normalized] || THEME_STYLES.rose;
}

/**
 * Formats date into a human-friendly relative timestamp.
 */
export function formatRelativeTime(
  dateInput?: string | Date | number | null,
  lang: Language = 'th'
): string {
  if (!dateInput) {
    return lang === 'th' ? 'เมื่อสักครู่' : 'Recently';
  }

  let date: Date;
  if (typeof dateInput === 'string') {
    // If it's a SQLite timestamp like '2026-09-19 02:00:00', append Z if no timezone
    let normalized = dateInput;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateInput)) {
      normalized = dateInput.replace(' ', 'T') + 'Z';
    }
    date = new Date(normalized);
  } else {
    date = new Date(dateInput);
  }

  const timestamp = date.getTime();
  if (isNaN(timestamp)) {
    return lang === 'th' ? 'เมื่อสักครู่' : 'Recently';
  }

  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (lang === 'th') {
    if (diffSec < 60) return 'เมื่อสักครู่';
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    if (diffHours < 24) return `${diffHours} ชม. ที่แล้ว`;
    if (diffDays === 1) return 'เมื่อวาน';
    if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
    return date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
  }

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
