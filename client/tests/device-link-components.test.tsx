// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PairModal } from '../src/components/PairModal.js';
import { DeviceLinkModal } from '../src/components/DeviceLinkModal.js';
import { CameraScannerModal } from '../src/components/CameraScannerModal.js';
import { Header } from '../src/components/Header.js';
import { I18nProvider } from '../src/i18n/index.js';
import { api, ApiError } from '../src/api.js';

describe('Device Link UI Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('PairModal Tabs and OTP Linking', () => {
    it('renders tabbed view in PairModal and submits 6-digit OTP', async () => {
      const handleSuccess = vi.fn();
      const mockSession = {
        user: { id: 'u1', nickname: 'Taylor', slot: 1 as const },
        couple: { id: 'c1', code: 'LOVE-1111' },
        partner: null,
      };
      vi.spyOn(api.auth, 'verifyDeviceLink').mockResolvedValue(mockSession);

      render(
        <I18nProvider initialLanguage="en">
          <PairModal onPairSuccess={handleSuccess} />
        </I18nProvider>
      );

      // Click Link Device tab
      const linkTab = screen.getByRole('tab', { name: /Link Existing Device/i });
      fireEvent.click(linkTab);

      // Enter 6-digit OTP
      const otpInput = screen.getByPlaceholderText(/6-digit code/i);
      fireEvent.change(otpInput, { target: { value: '482915' } });

      // Click Connect
      const connectBtn = screen.getByRole('button', { name: /Connect/i });
      fireEvent.click(connectBtn);

      await waitFor(() => {
        expect(api.auth.verifyDeviceLink).toHaveBeenCalledWith('482915');
        expect(handleSuccess).toHaveBeenCalledWith(mockSession);
      });
    });

    it('handles formatted spaced OTP input and error responses', async () => {
      vi.spyOn(api.auth, 'verifyDeviceLink').mockRejectedValue(
        new ApiError(410, 'Code has expired')
      );

      render(
        <I18nProvider initialLanguage="en">
          <PairModal onPairSuccess={vi.fn()} />
        </I18nProvider>
      );

      const linkTab = screen.getByRole('tab', { name: /Link Existing Device/i });
      fireEvent.click(linkTab);

      const otpInput = screen.getByPlaceholderText(/6-digit code/i);
      fireEvent.change(otpInput, { target: { value: '481 923' } });

      const connectBtn = screen.getByRole('button', { name: /Connect/i });
      fireEvent.click(connectBtn);

      await waitFor(() => {
        expect(api.auth.verifyDeviceLink).toHaveBeenCalledWith('481923');
        expect(screen.getByText(/This code has expired/i)).toBeTruthy();
      });
    });

    it('opens camera scanner modal when scan QR button is clicked', () => {
      render(
        <I18nProvider initialLanguage="en">
          <PairModal onPairSuccess={vi.fn()} />
        </I18nProvider>
      );

      const linkTab = screen.getByRole('tab', { name: /Link Existing Device/i });
      fireEvent.click(linkTab);

      const scanBtn = screen.getByRole('button', { name: /Scan QR Code/i });
      fireEvent.click(scanBtn);

      // Camera modal should open
      expect(screen.getByRole('heading', { name: /Scan QR Code/i })).toBeTruthy();
    });
  });

  describe('DeviceLinkModal', () => {
    it('renders DeviceLinkModal with generated OTP and countdown timer', async () => {
      vi.spyOn(api.auth, 'createDeviceLink').mockResolvedValue({
        code: '829415',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        qrUrl: 'https://test/link?code=829415',
      });

      render(
        <I18nProvider initialLanguage="en">
          <DeviceLinkModal isOpen={true} onClose={vi.fn()} />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('829 415')).toBeTruthy();
        expect(screen.getByText(/Code expires in/i)).toBeTruthy();
      });
    });

    it('shows expired state and allows generating a new code', async () => {
      const createLinkMock = vi.spyOn(api.auth, 'createDeviceLink')
        .mockResolvedValueOnce({
          code: '111222',
          expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
          qrUrl: 'https://test/link?code=111222',
        })
        .mockResolvedValueOnce({
          code: '333444',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          qrUrl: 'https://test/link?code=333444',
        });

      render(
        <I18nProvider initialLanguage="en">
          <DeviceLinkModal isOpen={true} onClose={vi.fn()} />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Code has expired/i)).toBeTruthy();
      });

      const refreshBtn = screen.getByRole('button', { name: /Generate New Code/i });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(createLinkMock).toHaveBeenCalledTimes(2);
        expect(screen.getByText('333 444')).toBeTruthy();
      });
    });

    it('copies code and link when copy buttons are clicked', async () => {
      vi.spyOn(api.auth, 'createDeviceLink').mockResolvedValue({
        code: '829415',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        qrUrl: 'https://test/link?code=829415',
      });

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        configurable: true,
      });

      render(
        <I18nProvider initialLanguage="en">
          <DeviceLinkModal isOpen={true} onClose={vi.fn()} />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('829 415')).toBeTruthy();
      });

      const copyBtn = screen.getByRole('button', { name: /Copy Code/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith('829415');
      });
    });
  });

  describe('CameraScannerModal', () => {
    it('gracefully handles missing or denied camera permissions', async () => {
      // Mock getUserMedia rejecting with NotAllowedError
      const getUserMediaMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
      });

      render(
        <I18nProvider initialLanguage="en">
          <CameraScannerModal isOpen={true} onClose={vi.fn()} onScanSuccess={vi.fn()} />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Unable to access camera/i)).toBeTruthy();
      });
    });

    it('stops media stream tracks when closed', async () => {
      const stopTrackMock = vi.fn();
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([{ stop: stopTrackMock }]),
      };
      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock },
        configurable: true,
      });

      const handleClose = vi.fn();
      const { unmount } = render(
        <I18nProvider initialLanguage="en">
          <CameraScannerModal isOpen={true} onClose={handleClose} onScanSuccess={vi.fn()} />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(getUserMediaMock).toHaveBeenCalled();
      });

      unmount();
      expect(stopTrackMock).toHaveBeenCalled();
    });
  });

  describe('Header Multi-Device Settings Integration', () => {
    it('renders Link New Device button and opens DeviceLinkModal', async () => {
      vi.spyOn(api.auth, 'createDeviceLink').mockResolvedValue({
        code: '123456',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        qrUrl: 'https://test/link?code=123456',
      });

      render(
        <I18nProvider initialLanguage="en">
          <Header
            coupleCode="LOVE-8888"
            sseConnected={true}
            user={{ nickname: 'Taylor', slot: 1 }}
            partner={{ nickname: 'Alex' }}
            onUnpair={vi.fn()}
            onLogout={vi.fn()}
          />
        </I18nProvider>
      );

      const settingsBtn = screen.getByLabelText('Couple Settings');
      fireEvent.click(settingsBtn);

      const linkBtn = screen.getByRole('button', { name: /Link New Device/i });
      expect(linkBtn).toBeTruthy();

      fireEvent.click(linkBtn);

      await waitFor(() => {
        expect(screen.getByText('123 456')).toBeTruthy();
      });
    });

    it('renders Log Out This Device button and invokes onLogout', async () => {
      const handleLogout = vi.fn();
      render(
        <I18nProvider initialLanguage="en">
          <Header
            coupleCode="LOVE-8888"
            sseConnected={true}
            user={{ nickname: 'Taylor', slot: 1 }}
            partner={{ nickname: 'Alex' }}
            onUnpair={vi.fn()}
            onLogout={handleLogout}
          />
        </I18nProvider>
      );

      const settingsBtn = screen.getByLabelText('Couple Settings');
      fireEvent.click(settingsBtn);

      const logoutBtn = screen.getByRole('button', { name: /Log Out This Device/i });
      expect(logoutBtn).toBeTruthy();

      fireEvent.click(logoutBtn);

      await waitFor(() => {
        expect(handleLogout).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('App URL Auto-Login and SSE Multi-Device Sync', () => {
    it('detects ?code=654321 on mount, verifies device link, and cleans URL', async () => {
      const mockSession = {
        user: { id: 'u1', nickname: 'Taylor', slot: 1 as const },
        couple: { id: 'c1', code: 'LOVE-1234' },
        partner: { id: 'u2', nickname: 'Alex' },
      };

      vi.spyOn(api.auth, 'verifyDeviceLink').mockResolvedValue(mockSession);
      vi.spyOn(api.mood, 'getMoods').mockResolvedValue({
        myMood: null,
        partnerMood: null,
        partner: { id: 'u2', nickname: 'Alex' },
      });

      // Mock window.location.search
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = {
        ...originalLocation,
        search: '?code=654321',
        pathname: '/',
        origin: 'http://localhost:3000',
      } as any;

      const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

      const { App } = await import('../src/App.js');

      render(
        <I18nProvider initialLanguage="en">
          <App />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(api.auth.verifyDeviceLink).toHaveBeenCalledWith('654321');
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/');
        expect(screen.getByText('Device linked successfully!')).toBeTruthy();
        expect(screen.getByText('LOVE-1234')).toBeTruthy();
      });

      window.location = originalLocation;
    });

    it('synchronizes own mood across devices when SSE receives mood_update for current user', async () => {
      const mockSession = {
        user: { id: 'u1', nickname: 'Taylor', slot: 1 as const },
        couple: { id: 'c1', code: 'LOVE-1234' },
        partner: { id: 'u2', nickname: 'Alex' },
      };

      vi.spyOn(api.auth, 'getSession').mockResolvedValue(mockSession);
      vi.spyOn(api.mood, 'getMoods').mockResolvedValue({
        myMood: null,
        partnerMood: null,
        partner: { id: 'u2', nickname: 'Alex' },
      });

      // Simple mock EventSource
      class SimpleEventSource {
        static lastInstance: SimpleEventSource;
        listeners: Map<string, Set<EventListener>> = new Map();
        constructor(url: string) {
          SimpleEventSource.lastInstance = this;
        }
        addEventListener(type: string, listener: EventListener) {
          if (!this.listeners.has(type)) this.listeners.set(type, new Set());
          this.listeners.get(type)!.add(listener);
        }
        removeEventListener(type: string, listener: EventListener) {
          this.listeners.get(type)?.delete(listener);
        }
        close() {}
        dispatchEvent(event: { type: string; data?: string }) {
          const list = this.listeners.get(event.type);
          if (list) {
            for (const l of list) l(event as any);
          }
        }
      }
      (globalThis as any).EventSource = SimpleEventSource;

      const { App } = await import('../src/App.js');

      render(
        <I18nProvider initialLanguage="en">
          <App />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('How are you feeling right now?')).toBeTruthy();
      });

      // Dispatch mood_update from Taylor (own user on Device B)
      act(() => {
        SimpleEventSource.lastInstance.dispatchEvent({
          type: 'mood_update',
          data: JSON.stringify({
            type: 'mood_update',
            mood: {
              emoji: '☕',
              label: 'Cozy',
              note: 'Brewing morning coffee on laptop',
              colorTheme: 'amber',
              updated_at: new Date().toISOString(),
            },
            user: { id: 'u1', nickname: 'Taylor' },
          }),
        });
      });

      // MyMoodCard should reflect the updated note and clear status button
      await waitFor(() => {
        const input = screen.getByPlaceholderText(/dreaming of a latte/i) as HTMLInputElement;
        expect(input.value).toBe('Brewing morning coffee on laptop');
      });

      delete (globalThis as any).EventSource;
    });
  });
});
