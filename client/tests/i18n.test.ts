// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { th } from '../src/i18n/th.js';
import { en } from '../src/i18n/en.js';
import { I18nProvider, useTranslation, STORAGE_KEY } from '../src/i18n/index.js';
import { formatRelativeTime } from '../src/presets.js';
import type { Language } from '../src/i18n/types.js';

describe('i18n Subsystem', () => {
  describe('Translation Dictionaries & Parity', () => {
    it('defines non-empty objects for th and en', () => {
      expect(th).toBeDefined();
      expect(en).toBeDefined();
      expect(typeof th).toBe('object');
      expect(typeof en).toBe('object');
    });

    it('has identical top-level sections in th and en', () => {
      const thSections = Object.keys(th).sort();
      const enSections = Object.keys(en).sort();
      expect(thSections).toEqual(enSections);

      const expectedSections = [
        'common',
        'header',
        'pairing',
        'partnerCard',
        'myMoodCard',
        'manageModal',
        'pushPrompt',
        'toasts',
        'footer',
      ];
      for (const section of expectedSections) {
        expect(thSections).toContain(section);
      }
    });

    it('has identical keys and non-empty string values between th and en for all sections', () => {
      // Helper to recursively collect all leaf key-paths and their string values
      function getLeafPaths(obj: Record<string, any>, prefix = ''): Map<string, string> {
        const result = new Map<string, string>();
        for (const [key, value] of Object.entries(obj)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (typeof value === 'object' && value !== null) {
            const nested = getLeafPaths(value, path);
            for (const [k, v] of nested) {
              result.set(k, v);
            }
          } else {
            result.set(path, String(value));
          }
        }
        return result;
      }

      const thPaths = getLeafPaths(th as Record<string, any>);
      const enPaths = getLeafPaths(en as Record<string, any>);

      const thKeys = Array.from(thPaths.keys()).sort();
      const enKeys = Array.from(enPaths.keys()).sort();

      // Check key parity
      expect(thKeys).toEqual(enKeys);

      // Verify no empty or whitespace-only translation strings
      for (const [key, value] of thPaths) {
        expect(value.trim().length, `th translation for "${key}" should not be empty`).toBeGreaterThan(0);
      }
      for (const [key, value] of enPaths) {
        expect(value.trim().length, `en translation for "${key}" should not be empty`).toBeGreaterThan(0);
      }
    });

    it('contains comprehensive translation keys for all UI components', () => {
      // Header
      expect(th.header.appName).toBe('Mood Sender');
      expect(th.header.liveSync).toBeTruthy();
      expect(th.header.connecting).toBeTruthy();
      expect(th.header.settingsTitle).toBeTruthy();
      expect(th.header.unpairButton).toBeTruthy();

      // Pairing
      expect(th.pairing.coupleCodeLabel).toBeTruthy();
      expect(th.pairing.generateRandom).toBeTruthy();
      expect(th.pairing.nicknameLabel).toBeTruthy();
      expect(th.pairing.enterRoom).toBeTruthy();

      // Partner Card
      expect(th.partnerCard.waitingTitle).toBeTruthy();
      expect(th.partnerCard.waitingDesc).toBeTruthy();
      expect(th.partnerCard.quietForNow).toBeTruthy();

      // My Mood Card
      expect(th.myMoodCard.badge).toBeTruthy();
      expect(th.myMoodCard.title).toBeTruthy();
      expect(th.myMoodCard.broadcastButton).toBeTruthy();
      expect(th.myMoodCard.manage).toBe('จัดการ');
      expect(en.myMoodCard.manage).toBe('Manage');

      // Manage Modal
      expect(th.manageModal.title).toBe('จัดการความรู้สึก');
      expect(en.manageModal.title).toBe('Manage Reactions');
      expect(th.manageModal.resetDefaults).toBeTruthy();
      expect(th.manageModal.saveChanges).toBeTruthy();

      // Push prompt
      expect(th.pushPrompt.title).toBeTruthy();
      expect(th.pushPrompt.enable).toBeTruthy();

      // Toasts
      expect(th.toasts.moodUpdated).toBeTruthy();
      expect(th.toasts.moodCleared).toBeTruthy();
    });
  });

  describe('formatRelativeTime with Thai and English localization', () => {
    const now = Date.now();

    it('formats relative time in Thai by default (lang omitted)', () => {
      expect(formatRelativeTime(new Date(now - 15 * 1000))).toBe('เมื่อสักครู่');
      expect(formatRelativeTime(new Date(now - 5 * 60 * 1000))).toBe('5 นาทีที่แล้ว');
      expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000))).toBe('2 ชม. ที่แล้ว');
      expect(formatRelativeTime(new Date(now - 26 * 60 * 60 * 1000))).toBe('เมื่อวาน');
      expect(formatRelativeTime(new Date(now - 3 * 24 * 60 * 60 * 1000))).toBe('3 วันที่แล้ว');
      expect(formatRelativeTime('')).toBe('เมื่อสักครู่');
      expect(formatRelativeTime(null)).toBe('เมื่อสักครู่');
      expect(formatRelativeTime('invalid-date')).toBe('เมื่อสักครู่');
    });

    it('formats relative time in Thai when explicitly requested (lang="th")', () => {
      expect(formatRelativeTime(new Date(now - 10 * 1000), 'th')).toBe('เมื่อสักครู่');
      expect(formatRelativeTime(new Date(now - 5 * 60 * 1000), 'th')).toBe('5 นาทีที่แล้ว');
      expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000), 'th')).toBe('2 ชม. ที่แล้ว');
      expect(formatRelativeTime(new Date(now - 26 * 60 * 60 * 1000), 'th')).toBe('เมื่อวาน');
      expect(formatRelativeTime(new Date(now - 4 * 24 * 60 * 60 * 1000), 'th')).toBe('4 วันที่แล้ว');
    });

    it('formats relative time in English when explicitly requested (lang="en")', () => {
      expect(formatRelativeTime(new Date(now - 10 * 1000), 'en')).toBe('Just now');
      expect(formatRelativeTime(new Date(now - 5 * 60 * 1000), 'en')).toBe('5m ago');
      expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000), 'en')).toBe('2h ago');
      expect(formatRelativeTime(new Date(now - 26 * 60 * 60 * 1000), 'en')).toBe('Yesterday');
      expect(formatRelativeTime(new Date(now - 3 * 24 * 60 * 60 * 1000), 'en')).toBe('3d ago');
      expect(formatRelativeTime('', 'en')).toBe('Recently');
      expect(formatRelativeTime(null, 'en')).toBe('Recently');
      expect(formatRelativeTime('invalid-date', 'en')).toBe('Recently');
    });
  });

  describe('I18nProvider & useTranslation Hook', () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      const storageMock = {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, val: string) => {
          mockStorage[key] = String(val);
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
        clear: () => {
          mockStorage = {};
        },
      };
      Object.defineProperty(window, 'localStorage', {
        value: storageMock,
        writable: true,
        configurable: true,
      });
    });

    // Test consumer component using React.createElement (valid in .ts file)
    const TestComponent: React.FC = () => {
      const { language, setLanguage, t } = useTranslation();
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'current-lang' }, language),
        React.createElement('span', { 'data-testid': 'header-title' }, t.header.appName),
        React.createElement('span', { 'data-testid': 'manage-title' }, t.manageModal.title),
        React.createElement(
          'button',
          { 'data-testid': 'switch-en', onClick: () => setLanguage('en') },
          'EN'
        ),
        React.createElement(
          'button',
          { 'data-testid': 'switch-th', onClick: () => setLanguage('th') },
          'TH'
        )
      );
    };

    it('defaults to Thai ("th") when no localStorage value exists', () => {
      render(React.createElement(I18nProvider, null, React.createElement(TestComponent)));

      expect(screen.getByTestId('current-lang').textContent).toBe('th');
      expect(screen.getByTestId('manage-title').textContent).toBe('จัดการความรู้สึก');
    });

    it('respects initialLanguage prop if provided', () => {
      render(React.createElement(I18nProvider, { initialLanguage: 'en' }, React.createElement(TestComponent)));

      expect(screen.getByTestId('current-lang').textContent).toBe('en');
      expect(screen.getByTestId('manage-title').textContent).toBe('Manage Reactions');
    });

    it('initializes from localStorage if saved preference is English', () => {
      window.localStorage.setItem(STORAGE_KEY, 'en');

      render(React.createElement(I18nProvider, null, React.createElement(TestComponent)));

      expect(screen.getByTestId('current-lang').textContent).toBe('en');
      expect(screen.getByTestId('manage-title').textContent).toBe('Manage Reactions');
    });

    it('switches language and persists selection to localStorage', () => {
      render(React.createElement(I18nProvider, null, React.createElement(TestComponent)));

      expect(screen.getByTestId('current-lang').textContent).toBe('th');
      expect(screen.getByTestId('manage-title').textContent).toBe('จัดการความรู้สึก');

      // Switch to English
      act(() => {
        screen.getByTestId('switch-en').click();
      });

      expect(screen.getByTestId('current-lang').textContent).toBe('en');
      expect(screen.getByTestId('manage-title').textContent).toBe('Manage Reactions');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('en');

      // Switch back to Thai
      act(() => {
        screen.getByTestId('switch-th').click();
      });

      expect(screen.getByTestId('current-lang').textContent).toBe('th');
      expect(screen.getByTestId('manage-title').textContent).toBe('จัดการความรู้สึก');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('th');
    });

    it('provides safe fallback when useTranslation is used outside I18nProvider', () => {
      render(React.createElement(TestComponent));

      expect(screen.getByTestId('current-lang').textContent).toBe('th');
      expect(screen.getByTestId('manage-title').textContent).toBe('จัดการความรู้สึก');
    });
  });
});
