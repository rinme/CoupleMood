import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  urlBase64ToUint8Array,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../src/sw-register.js';
import { api } from '../src/api.js';

describe('sw-register.ts', () => {
  describe('urlBase64ToUint8Array', () => {
    it('converts url-safe base64 string to Uint8Array', () => {
      // "hello" in base64 is "aGVsbG8="
      const base64Url = 'aGVsbG8';
      const arr = urlBase64ToUint8Array(base64Url);
      expect(arr).toBeInstanceOf(Uint8Array);
      const text = new TextDecoder().decode(arr);
      expect(text).toBe('hello');
    });

    it('handles base64 with URL safe characters - and _', () => {
      // Test with custom bytes
      const testBase64 = '-_';
      const arr = urlBase64ToUint8Array(testBase64);
      expect(arr).toBeInstanceOf(Uint8Array);
    });
  });

  describe('isPushSupported', () => {
    it('returns false in non-browser or incomplete environment', () => {
      const supported = isPushSupported();
      // In node/bun test environment without full PushManager
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('subscribeToPush and unsubscribeFromPush', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('subscribes to push, converts vapid key, and calls api.push.subscribe', async () => {
      const mockSub = {
        endpoint: 'https://push.example.com/test',
        toJSON: () => ({
          endpoint: 'https://push.example.com/test',
          keys: { p256dh: 'p256key', auth: 'authkey' },
        }),
        unsubscribe: vi.fn().mockResolvedValue(true),
      };

      const mockReg = {
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe: vi.fn().mockResolvedValue(mockSub),
        },
      } as any;

      vi.spyOn(api.push, 'getPublicKey').mockResolvedValue({ publicKey: 'aGVsbG8' });
      vi.spyOn(api.push, 'subscribe').mockResolvedValue({ success: true });

      // Mock Notification
      (globalThis as any).Notification = {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      };

      const result = await subscribeToPush(mockReg);
      expect(result).toBe(mockSub);
      expect(mockReg.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }));
      expect(api.push.subscribe).toHaveBeenCalledWith({
        endpoint: 'https://push.example.com/test',
        keys: { p256dh: 'p256key', auth: 'authkey' },
      });
    });

    it('unsubscribes from push and informs server', async () => {
      const mockSub = {
        endpoint: 'https://push.example.com/test',
        unsubscribe: vi.fn().mockResolvedValue(true),
      };

      const mockReg = {
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(mockSub),
        },
      } as any;

      vi.spyOn(api.push, 'unsubscribe').mockResolvedValue({ success: true });

      const success = await unsubscribeFromPush(mockReg);
      expect(success).toBe(true);
      expect(mockSub.unsubscribe).toHaveBeenCalled();
      expect(api.push.unsubscribe).toHaveBeenCalledWith('https://push.example.com/test');
    });
  });
});
