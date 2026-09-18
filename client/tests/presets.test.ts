import {
  PRESET_MOODS,
  DEFAULT_PRESETS_TH,
  DEFAULT_PRESETS_EN,
  getDefaultPresets,
  getThemeStyles,
  formatRelativeTime,
} from '../src/presets.js';

describe('presets.ts', () => {
  it('defines the 7 default preset moods prioritizing Missing you and Hungry', () => {
    expect(PRESET_MOODS).toHaveLength(7);
    const labels = PRESET_MOODS.map((p) => p.label);
    expect(labels[0]).toBe('คิดถึง');
    expect(labels[1]).toBe('หิว');
    expect(labels).toContain('รักนะ');
    expect(labels).toContain('ง่วง');
    expect(labels).toContain('ยุ่งมาก');
    expect(labels).toContain('ชิลๆ');
    expect(labels).toContain('ไม่สบาย');

    for (const preset of PRESET_MOODS) {
      expect(preset.emoji).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.colorTheme).toBeTruthy();
    }

    // English default presets
    const enPresets = getDefaultPresets('en');
    expect(enPresets).toHaveLength(7);
    expect(enPresets[0].label).toBe('Missing you');
    expect(enPresets[1].label).toBe('Hungry');
  });

  it('provides theme styles for each theme and falls back safely to rose', () => {
    const rose = getThemeStyles('rose');
    expect(rose.badgeText).toContain('rose');

    const amber = getThemeStyles('amber');
    expect(amber.badgeText).toContain('amber');

    const fallback = getThemeStyles('unknown-theme');
    expect(fallback.badgeText).toContain('rose');
  });

  it('formats relative time human-friendly in Thai by default and English when requested', () => {
    const now = Date.now();

    // Default Thai
    expect(formatRelativeTime(new Date(now - 10 * 1000))).toBe('เมื่อสักครู่');
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000))).toBe('5 นาทีที่แล้ว');
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000))).toBe('2 ชม. ที่แล้ว');
    expect(formatRelativeTime(new Date(now - 26 * 60 * 60 * 1000))).toBe('เมื่อวาน');
    expect(formatRelativeTime(new Date(now - 4 * 24 * 60 * 60 * 1000))).toBe('4 วันที่แล้ว');
    expect(formatRelativeTime('')).toBe('เมื่อสักครู่');
    expect(formatRelativeTime('invalid-date')).toBe('เมื่อสักครู่');

    // Explicit English
    expect(formatRelativeTime(new Date(now - 10 * 1000), 'en')).toBe('Just now');
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000), 'en')).toBe('5m ago');
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000), 'en')).toBe('2h ago');
    expect(formatRelativeTime(new Date(now - 26 * 60 * 60 * 1000), 'en')).toBe('Yesterday');
    expect(formatRelativeTime(new Date(now - 4 * 24 * 60 * 60 * 1000), 'en')).toBe('4d ago');
    expect(formatRelativeTime('', 'en')).toBe('Recently');
    expect(formatRelativeTime('invalid-date', 'en')).toBe('Recently');
  });
});
