import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../src/api.js';
import { th } from '../src/i18n/th.js';
import { en } from '../src/i18n/en.js';

describe('Device Link Client API & i18n Keys', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('api.auth device link methods', () => {
    it('calls createDeviceLink endpoint with POST', async () => {
      const mockData = {
        code: '123456',
        expiresAt: '2026-09-19T10:00:00Z',
        qrUrl: 'https://test/link?code=123456',
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      } as any);

      const res = await api.auth.createDeviceLink();
      expect(res.code).toBe('123456');
      expect(res.qrUrl).toBe('https://test/link?code=123456');
      expect(res.expiresAt).toBe('2026-09-19T10:00:00Z');

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe('/api/auth/device-link/create');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].credentials).toBe('include');
    });

    it('calls verifyDeviceLink endpoint with code in POST body', async () => {
      const mockSession = {
        user: { id: 'u1', nickname: 'Alice', slot: 1 },
        couple: { id: 'c1', code: 'LOVE-9999' },
        partner: null,
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSession,
      } as any);

      const res = await api.auth.verifyDeviceLink('123456');
      expect(res.user.nickname).toBe('Alice');
      expect(res.couple.code).toBe('LOVE-9999');

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe('/api/auth/device-link/verify');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].credentials).toBe('include');
      expect(callArgs[1].headers.get('Content-Type')).toBe('application/json');
      expect(callArgs[1].body).toBe(JSON.stringify({ code: '123456' }));
    });

    it('calls logout endpoint with POST', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Logged out from this device' }),
      } as any);

      await api.auth.logout();

      const callArgs = (globalThis.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe('/api/auth/logout');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].credentials).toBe('include');
    });
  });

  describe('i18n translation parity and completeness', () => {
    it('has identical keys between Thai and English for device link copy', () => {
      const thDeviceLink = th.deviceLink;
      const enDeviceLink = en.deviceLink;

      expect(thDeviceLink).toBeDefined();
      expect(enDeviceLink).toBeDefined();

      const expectedDeviceLinkKeys = [
        'modalTitle',
        'modalSubtitle',
        'codeLabel',
        'copyCode',
        'copied',
        'expiresIn',
        'expired',
        'generateNew',
        'scanHelp',
        'scanWithCamera',
        'cameraTitle',
        'closeCamera',
        'cameraPermError',
        'connectedSuccess',
      ].sort();

      expect(Object.keys(thDeviceLink).sort()).toEqual(expectedDeviceLinkKeys);
      expect(Object.keys(enDeviceLink).sort()).toEqual(expectedDeviceLinkKeys);

      for (const key of expectedDeviceLinkKeys) {
        expect(thDeviceLink[key].trim().length).toBeGreaterThan(0);
        expect(enDeviceLink[key].trim().length).toBeGreaterThan(0);
      }
    });

    it('contains pairing multi-device keys in both Thai and English', () => {
      const thPairing = th.pairing;
      const enPairing = en.pairing;

      const expectedPairingKeys: (keyof typeof th.pairing)[] = [
        'tabPair',
        'tabLinkDevice',
        'otpPlaceholder',
        'connectDevice',
        'scanningQr',
        'errorInvalidOtp',
        'errorExpiredOtp',
        'errorLockoutOtp',
      ];

      for (const key of expectedPairingKeys) {
        expect(thPairing[key], `th.pairing.${key} should be defined`).toBeTruthy();
        expect(enPairing[key], `en.pairing.${key} should be defined`).toBeTruthy();
        expect(typeof thPairing[key]).toBe('string');
        expect(typeof enPairing[key]).toBe('string');
        expect(thPairing[key].trim().length).toBeGreaterThan(0);
        expect(enPairing[key].trim().length).toBeGreaterThan(0);
      }
    });

    it('contains header logout and device link keys in both Thai and English', () => {
      const thHeader = th.header;
      const enHeader = en.header;

      const expectedHeaderKeys: (keyof typeof th.header)[] = [
        'linkNewDevice',
        'logoutThisDevice',
        'loggingOut',
      ];

      for (const key of expectedHeaderKeys) {
        expect(thHeader[key], `th.header.${key} should be defined`).toBeTruthy();
        expect(enHeader[key], `en.header.${key} should be defined`).toBeTruthy();
        expect(typeof thHeader[key]).toBe('string');
        expect(typeof enHeader[key]).toBe('string');
        expect(thHeader[key].trim().length).toBeGreaterThan(0);
        expect(enHeader[key].trim().length).toBeGreaterThan(0);
      }
    });
  });
});
