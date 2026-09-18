import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError } from '../src/api.js';

describe('api.ts', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles successful auth.pair request', async () => {
    const mockResponse = {
      user: { id: 'u1', nickname: 'Taylor', slot: 1 },
      couple: { id: 'c1', code: 'LOVE-1234' },
      partner: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    const result = await api.auth.pair({ code: 'LOVE-1234', nickname: 'Taylor' });
    expect(result).toEqual(mockResponse);
    const callArgs = (globalThis.fetch as any).mock.calls[0];
    expect(callArgs[0]).toBe('/api/auth/pair');
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].credentials).toBe('include');
    expect(callArgs[1].headers.get('Content-Type')).toBe('application/json');
    expect(callArgs[1].body).toBe(JSON.stringify({ code: 'LOVE-1234', nickname: 'Taylor' }));
  });

  it('throws ApiError with message and status on 409 conflict', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ error: 'Couple code is full' }),
    } as any);

    await expect(api.auth.pair({ code: 'FULL-1234', nickname: 'Jordan' })).rejects.toThrow('Couple code is full');
  });

  it('handles auth.getSession and unpair', async () => {
    const mockSession = {
      user: { id: 'u1', nickname: 'Taylor', slot: 1 },
      couple: { id: 'c1', code: 'LOVE-1234' },
      partner: { id: 'u2', nickname: 'Sam' },
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockSession,
    } as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as any);

    const session = await api.auth.getSession();
    expect(session.user.nickname).toBe('Taylor');

    const unpair = await api.auth.unpair();
    expect(unpair.success).toBe(true);
  });

  it('handles mood GET, POST, and DELETE', async () => {
    const mockMoods = {
      myMood: { emoji: '🥰', label: 'Loving', color_theme: 'rose' },
      partnerMood: { emoji: '☕', label: 'Cozy', color_theme: 'amber' },
      partner: { id: 'u2', nickname: 'Sam' },
    };

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockMoods,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ mood: mockMoods.myMood }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as any);

    const moods = await api.mood.getMoods();
    expect(moods.partner?.nickname).toBe('Sam');

    const postRes = await api.mood.setMood({ emoji: '🥰', label: 'Loving' });
    expect(postRes.mood.emoji).toBe('🥰');

    const delRes = await api.mood.clearMood();
    expect(delRes.ok).toBe(true);
  });

  it('handles push getPublicKey, subscribe, and unsubscribe', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ publicKey: 'fake-vapid-key' }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any);

    const keyRes = await api.push.getPublicKey();
    expect(keyRes.publicKey).toBe('fake-vapid-key');

    const subRes = await api.push.subscribe({
      endpoint: 'https://push.example.com/sub/1',
      keys: { p256dh: 'p256', auth: 'auth' },
    });
    expect(subRes.success).toBe(true);

    const unsubRes = await api.push.unsubscribe('https://push.example.com/sub/1');
    expect(unsubRes.success).toBe(true);
  });
});
