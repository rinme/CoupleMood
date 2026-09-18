import { describe, it, expect } from 'vitest';
import { PRESET_MOODS, getThemeStyles, formatRelativeTime } from '../src/presets.js';

describe('presets.ts', () => {
  it('defines the 8 preset moods with emoji, label, and colorTheme', () => {
    expect(PRESET_MOODS).toHaveLength(8);
    const labels = PRESET_MOODS.map(p => p.label);
    expect(labels).toContain('Loving');
    expect(labels).toContain('Cozy');
    expect(labels).toContain('Busy');
    expect(labels).toContain('Sleepy');
    expect(labels).toContain('Excited');
    expect(labels).toContain('Chilling');
    expect(labels).toContain('Stressed');
    expect(labels).toContain('Sick');

    for (const preset of PRESET_MOODS) {
      expect(preset.emoji).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.colorTheme).toBeTruthy();
    }
  });

  it('provides theme styles for each theme and falls back safely to rose', () => {
    const rose = getThemeStyles('rose');
    expect(rose.badgeText).toContain('rose');

    const amber = getThemeStyles('amber');
    expect(amber.badgeText).toContain('amber');

    const fallback = getThemeStyles('unknown-theme');
    expect(fallback.badgeText).toContain('rose');
  });

  it('formats relative time human-friendly', () => {
    const now = Date.now();
    expect(formatRelativeTime(new Date(now - 10 * 1000))).toBe('Just now');
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000))).toBe('5m ago');
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000))).toBe('2h ago');
    expect(formatRelativeTime(new Date(now - 26 * 60 * 60 * 1000))).toBe('Yesterday');
    expect(formatRelativeTime(new Date(now - 4 * 24 * 60 * 60 * 1000))).toBe('4d ago');
    expect(formatRelativeTime('')).toBe('Recently');
    expect(formatRelativeTime('invalid-date')).toBe('Recently');
  });
});
