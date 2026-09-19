import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import proxyHandler from '../api/[[...path]].js';

describe('Vercel Edge API Proxy (api/[[...path]].ts)', () => {
  const originalEnv = process.env.BACKEND_URL;

  afterEach(() => {
    process.env.BACKEND_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns 503 with configuration advice when BACKEND_URL is not set', async () => {
    delete process.env.BACKEND_URL;

    const req = new Request('https://couplemood.vercel.app/api/auth/session', {
      method: 'GET',
    });

    const res = await proxyHandler(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Backend not configured');
    expect(body.message).toContain('BACKEND_URL');
  });

  it('proxies GET request to target backend URL and preserves query params', async () => {
    process.env.BACKEND_URL = 'https://backend.example.com/';

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const req = new Request('https://couplemood.vercel.app/api/presets?lang=th', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cookie': 'mood_session=test-token-123',
      },
    });

    const res = await proxyHandler(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://backend.example.com/api/presets?lang=th');
    expect(calledInit.method).toBe('GET');
    expect(calledInit.body).toBeUndefined();

    const forwardHeaders = calledInit.headers as Headers;
    expect(forwardHeaders.get('accept')).toBe('application/json');
    expect(forwardHeaders.get('cookie')).toBe('mood_session=test-token-123');
    expect(forwardHeaders.get('host')).toBeNull();
  });

  it('proxies POST request with body and preserves Set-Cookie headers', async () => {
    process.env.BACKEND_URL = 'https://backend.example.com';

    const mockResponseHeaders = new Headers();
    mockResponseHeaders.append('Content-Type', 'application/json');
    mockResponseHeaders.append('Set-Cookie', 'mood_session=session_abc; Path=/; HttpOnly; SameSite=Lax');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: mockResponseHeaders,
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const req = new Request('https://couplemood.vercel.app/api/auth/pair', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 'LOVE-1234', nickname: 'Alice' }),
    });

    const res = await proxyHandler(req);
    expect(res.status).toBe(200);

    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    expect(cookies.some((c: string | null) => c && c.includes('mood_session=session_abc'))).toBe(true);

    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('returns 502 Bad Gateway when the backend cannot be reached', async () => {
    process.env.BACKEND_URL = 'https://offline-backend.internal';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    const req = new Request('https://couplemood.vercel.app/api/mood', {
      method: 'GET',
    });

    const res = await proxyHandler(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Bad Gateway');
    expect(body.message).toContain('Connection refused');
  });
});
