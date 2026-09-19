// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Header } from '../src/components/Header.js';
import { PairModal } from '../src/components/PairModal.js';
import { PartnerCard } from '../src/components/PartnerCard.js';
import { MyMoodCard } from '../src/components/MyMoodCard.js';
import { PushPrompt } from '../src/components/PushPrompt.js';
import { I18nProvider } from '../src/i18n/index.js';
import { api, ApiError } from '../src/api.js';

describe('Frontend UI Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  describe('Header Component', () => {
    it('renders branding, live sync status, and couple code (default Thai)', () => {
      render(
        <Header
          coupleCode="LOVE-8241"
          sseConnected={true}
          user={{ nickname: 'Taylor', slot: 1 }}
          partner={{ nickname: 'Alex' }}
          onUnpair={vi.fn()}
        />
      );

      expect(screen.getByText('Mood Sender')).toBeTruthy();
      expect(screen.getByText('เชื่อมต่อสด')).toBeTruthy();
      expect(screen.getByText('LOVE-8241')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Toggle language/i })).toBeTruthy();
    });

    it('toggles language between Thai and English', () => {
      render(
        <I18nProvider>
          <Header
            coupleCode="LOVE-8241"
            sseConnected={true}
            user={{ nickname: 'Taylor', slot: 1 }}
            partner={{ nickname: 'Alex' }}
            onUnpair={vi.fn()}
          />
        </I18nProvider>
      );

      const toggleBtn = screen.getByRole('button', { name: /Toggle language/i });
      expect(screen.getByText('เชื่อมต่อสด')).toBeTruthy();

      // Toggle to English
      fireEvent.click(toggleBtn);
      expect(screen.getByText('Live sync')).toBeTruthy();

      // Toggle back to Thai
      fireEvent.click(toggleBtn);
      expect(screen.getByText('เชื่อมต่อสด')).toBeTruthy();
    });

    it('opens settings dialog and confirms unpair', async () => {
      const handleUnpair = vi.fn();
      render(
        <Header
          coupleCode="LOVE-8241"
          sseConnected={true}
          user={{ nickname: 'Taylor', slot: 1 }}
          partner={{ nickname: 'Alex' }}
          onUnpair={handleUnpair}
        />
      );

      const settingsBtn = screen.getByLabelText('ตั้งค่าคู่รัก');
      fireEvent.click(settingsBtn);

      expect(screen.getByText('ตั้งค่าคู่รัก')).toBeTruthy();
      expect(screen.getByText('Taylor')).toBeTruthy();
      expect(screen.getByText('Alex')).toBeTruthy();

      const unpairBtn = screen.getByText('ยกเลิกการเชื่อมต่อคู่');
      fireEvent.click(unpairBtn);

      await waitFor(() => {
        expect(handleUnpair).toHaveBeenCalledTimes(1);
      });
    });

    it('uses fallback execCommand copy when navigator.clipboard is unavailable', () => {
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });
      const execCommandMock = vi.fn().mockReturnValue(true);
      (document as any).execCommand = execCommandMock;

      render(
        <Header
          coupleCode="LOVE-8241"
          sseConnected={true}
          user={{ nickname: 'Taylor', slot: 1 }}
          partner={{ nickname: 'Alex' }}
          onUnpair={vi.fn()}
        />
      );

      const copyBtn = screen.getByTitle('คลิกเพื่อคัดลอกรหัสคู่รัก');
      fireEvent.click(copyBtn);

      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(screen.getByText('คัดลอกแล้ว!')).toBeTruthy();

      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
      });
    });
  });

  describe('PairModal Component', () => {
    it('generates random couple code and pairs user in default Thai', async () => {
      const handleSuccess = vi.fn();
      const mockResponse = {
        user: { id: 'u1', nickname: 'Taylor', slot: 1 as const },
        couple: { id: 'c1', code: 'LOVE-9999' },
        partner: null,
      };

      vi.spyOn(api.auth, 'pair').mockResolvedValue(mockResponse);

      render(<PairModal onPairSuccess={handleSuccess} />);

      const randomBtn = screen.getByText('สุ่มรหัส');
      fireEvent.click(randomBtn);

      const codeInput = screen.getByLabelText('รหัสคู่รัก') as HTMLInputElement;
      expect(codeInput.value).toMatch(/^LOVE-[A-Z0-9]{4}$/);

      const nickInput = screen.getByLabelText('ชื่อเล่นของคุณ') as HTMLInputElement;
      fireEvent.change(nickInput, { target: { value: 'Taylor' } });

      const submitBtn = screen.getByText('เข้าสู่ห้อง');
      const form = submitBtn.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(api.auth.pair).toHaveBeenCalledWith({
          code: codeInput.value,
          nickname: 'Taylor',
        });
        expect(handleSuccess).toHaveBeenCalledWith(mockResponse);
      });
    });

    it('shows inline error alert when couple code is full', async () => {
      vi.spyOn(api.auth, 'pair').mockRejectedValue(new ApiError(409, 'Couple code is full'));

      render(<PairModal onPairSuccess={vi.fn()} />);

      const codeInput = screen.getByLabelText('รหัสคู่รัก');
      const nickInput = screen.getByLabelText('ชื่อเล่นของคุณ');

      fireEvent.change(codeInput, { target: { value: 'LOVE-FULL' } });
      fireEvent.change(nickInput, { target: { value: 'Taylor' } });

      const submitBtn = screen.getByText('เข้าสู่ห้อง');
      const form = submitBtn.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/รหัสคู่รักนี้มีผู้ใช้งานครบแล้ว/i)).toBeTruthy();
      });
    });

    it('supports English language switching in PairModal', () => {
      render(
        <I18nProvider>
          <PairModal onPairSuccess={vi.fn()} />
        </I18nProvider>
      );
      const langToggle = screen.getByRole('button', { name: /Toggle language/i });
      fireEvent.click(langToggle);

      expect(screen.getByText('Generate Random')).toBeTruthy();
      expect(screen.getByLabelText('Couple Code')).toBeTruthy();
      expect(screen.getByLabelText('Your Nickname')).toBeTruthy();
      expect(screen.getByText('Enter Room')).toBeTruthy();
    });
  });

  describe('PartnerCard Component', () => {
    it('renders empty waiting card when partner is not joined', () => {
      render(
        <PartnerCard
          partner={null}
          partnerMood={null}
          coupleCode="LOVE-8888"
        />
      );

      expect(screen.getByText('กำลังรอแฟนของคุณ')).toBeTruthy();
      expect(screen.getByText('LOVE-8888')).toBeTruthy();
    });

    it('renders waiting state when partner is joined but has no mood set', () => {
      render(
        <PartnerCard
          partner={{ id: 'u2', nickname: 'Sam' }}
          partnerMood={null}
        />
      );

      expect(screen.getByText('ความรู้สึกของ Sam')).toBeTruthy();
      expect(screen.getByText(/กำลังรอ Sam/i)).toBeTruthy();
    });

    it('renders partner mood emoji, label, note, and relative timestamp in Thai and English', () => {
      const { rerender } = render(
        <PartnerCard
          partner={{ id: 'u2', nickname: 'Sam' }}
          partnerMood={{
            emoji: '🥰',
            label: 'รักนะ',
            note: 'คิดถึงจังเลย',
            colorTheme: 'rose',
            updated_at: new Date().toISOString(),
          }}
        />
      );

      expect(screen.getByText('ความรู้สึกของ Sam ในตอนนี้')).toBeTruthy();
      expect(screen.getByText('🥰')).toBeTruthy();
      expect(screen.getByText('รักนะ')).toBeTruthy();
      expect(screen.getByText('"คิดถึงจังเลย"')).toBeTruthy();
      expect(screen.getByText('เมื่อสักครู่')).toBeTruthy();

      // Verify English localization with I18nProvider
      rerender(
        <I18nProvider initialLanguage="en">
          <PartnerCard
            partner={{ id: 'u2', nickname: 'Sam' }}
            partnerMood={{
              emoji: '🥰',
              label: 'Loving',
              note: 'Can not wait to see you!',
              colorTheme: 'rose',
              updated_at: new Date().toISOString(),
            }}
          />
        </I18nProvider>
      );

      expect(screen.getByText("Sam's Current Mood")).toBeTruthy();
      expect(screen.getByText('Loving')).toBeTruthy();
      expect(screen.getByText('"Can not wait to see you!"')).toBeTruthy();
      expect(screen.getByText('Just now')).toBeTruthy();
    });
  });

  describe('MyMoodCard Component', () => {
    it('renders presets grid, updates note, and triggers onSetMood', async () => {
      const handleSet = vi.fn().mockResolvedValue(undefined);
      const handleClear = vi.fn().mockResolvedValue(undefined);

      render(
        <I18nProvider initialLanguage="en">
          <MyMoodCard
            currentMood={null}
            onSetMood={handleSet}
            onClearMood={handleClear}
          />
        </I18nProvider>
      );

      expect(screen.getByText('Loving')).toBeTruthy();
      expect(screen.getByText('Cozy')).toBeTruthy();
      expect(screen.getByText('Busy')).toBeTruthy();

      // Click Cozy preset
      const cozyBtn = screen.getByRole('button', { name: /☕ Cozy/i });
      fireEvent.click(cozyBtn);

      // Add a note
      const noteInput = screen.getByPlaceholderText(/dreaming of a latte/i);
      fireEvent.change(noteInput, { target: { value: 'Drinking warm tea' } });

      // Character counter
      expect(screen.getByText('17/100')).toBeTruthy();

      // Broadcast
      const broadcastBtn = screen.getByRole('button', { name: /Broadcast to Partner/i });
      fireEvent.click(broadcastBtn);

      await waitFor(() => {
        expect(handleSet).toHaveBeenCalledWith({
          emoji: '☕',
          label: 'Cozy',
          note: 'Drinking warm tea',
          colorTheme: 'amber',
        });
      });
    });

    it('renders and invokes clear status button when currentMood is present', async () => {
      const handleClear = vi.fn().mockResolvedValue(undefined);

      render(
        <I18nProvider initialLanguage="en">
          <MyMoodCard
            currentMood={{
              emoji: '🥰',
              label: 'Loving',
              note: 'Miss you',
              color_theme: 'rose',
            }}
            onSetMood={vi.fn()}
            onClearMood={handleClear}
          />
        </I18nProvider>
      );

      const clearBtn = screen.getByTitle('Clear your current status');
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(handleClear).toHaveBeenCalledTimes(1);
      });
    });

    it('preserves draft note during background re-render without timestamp change', () => {
      const { rerender } = render(
        <I18nProvider initialLanguage="en">
          <MyMoodCard
            currentMood={{
              emoji: '🥰',
              label: 'Loving',
              note: 'Original note',
              updated_at: '2026-09-19 01:00:00',
            }}
            onSetMood={vi.fn()}
            onClearMood={vi.fn()}
          />
        </I18nProvider>
      );

      const noteInput = screen.getByPlaceholderText(/dreaming of a latte/i) as HTMLInputElement;
      expect(noteInput.value).toBe('Original note');

      // User actively edits draft
      fireEvent.change(noteInput, { target: { value: 'My custom new draft note' } });
      expect(noteInput.value).toBe('My custom new draft note');

      // Rerender with same timestamp (e.g. background polling or focus revalidation)
      rerender(
        <I18nProvider initialLanguage="en">
          <MyMoodCard
            currentMood={{
              emoji: '🥰',
              label: 'Loving',
              note: 'Original note',
              updated_at: '2026-09-19 01:00:00',
            }}
            onSetMood={vi.fn()}
            onClearMood={vi.fn()}
          />
        </I18nProvider>
      );

      // Draft must NOT be overwritten
      expect(noteInput.value).toBe('My custom new draft note');

      // But when a fresh mood with new updated_at arrives, it updates
      rerender(
        <I18nProvider initialLanguage="en">
          <MyMoodCard
            currentMood={{
              emoji: '🥰',
              label: 'Loving',
              note: 'Fresh note from server',
              updated_at: '2026-09-19 01:05:00',
            }}
            onSetMood={vi.fn()}
            onClearMood={vi.fn()}
          />
        </I18nProvider>
      );

      expect(noteInput.value).toBe('Fresh note from server');
    });
  });

  describe('PushPrompt Component', () => {
    it('dismisses when Not now is clicked (Thai default)', () => {
      // Mock Notification
      (globalThis as any).Notification = {
        permission: 'default',
      };
      (globalThis as any).navigator.serviceWorker = {};
      (globalThis as any).PushManager = {};

      render(<PushPrompt onSubscribe={vi.fn()} />);

      expect(screen.getByText('ไม่พลาดทุกความรู้สึก')).toBeTruthy();

      const notNowBtn = screen.getByText('ไว้ทีหลัง');
      fireEvent.click(notNowBtn);

      expect(screen.queryByText('ไม่พลาดทุกความรู้สึก')).toBeNull();
      expect(sessionStorage.getItem('push_prompt_dismissed')).toBe('true');
    });

    it('invokes onSubscribe when Enable Notifications is clicked in Thai and English', async () => {
      (globalThis as any).Notification = {
        permission: 'default',
      };
      (globalThis as any).navigator.serviceWorker = {};
      (globalThis as any).PushManager = {};

      const handleSubscribe = vi.fn().mockResolvedValue(undefined);
      const { unmount } = render(<PushPrompt onSubscribe={handleSubscribe} />);

      const enableBtn = screen.getByRole('button', { name: /เปิดการแจ้งเตือน/i });
      fireEvent.click(enableBtn);

      await waitFor(() => {
        expect(handleSubscribe).toHaveBeenCalledTimes(1);
      });

      unmount();
      sessionStorage.clear();

      // Test English
      const handleSubscribeEn = vi.fn().mockResolvedValue(undefined);
      render(
        <I18nProvider initialLanguage="en">
          <PushPrompt onSubscribe={handleSubscribeEn} />
        </I18nProvider>
      );

      expect(screen.getByText('Never miss a mood update')).toBeTruthy();
      const enableBtnEn = screen.getByRole('button', { name: /Enable Notifications/i });
      fireEvent.click(enableBtnEn);

      await waitFor(() => {
        expect(handleSubscribeEn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
