import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import webpush from 'web-push';
import type { Express } from 'express';
import { createProductionApp } from '../server/src/index.js';
import { initDb, closeDb } from '../server/src/db.js';
import { closeAllConnections } from '../server/src/sse.js';

describe('E2E Thai i18n & Customizable Mood Presets Integration', () => {
  let app: Express;

  beforeEach(() => {
    initDb(':memory:');
    app = createProductionApp();
    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as any);
  });

  afterEach(() => {
    closeAllConnections();
    closeDb();
    vi.restoreAllMocks();
  });

  it('verifies couple pairing, default Thai presets ("คิดถึง" & "หิว"), custom preset addition, live SSE broadcast, and reset', async () => {
    // 1. Couple pairing: Alice & Bob join room PRESET-E2E
    const pairAlice = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'PRESET-E2E', nickname: 'Alice' });
    expect(pairAlice.status).toBe(200);
    const cookieAlice = pairAlice.headers['set-cookie'];
    expect(cookieAlice).toBeDefined();

    const pairBob = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'PRESET-E2E', nickname: 'Bob' });
    expect(pairBob.status).toBe(200);
    const cookieBob = pairBob.headers['set-cookie'];
    expect(cookieBob).toBeDefined();

    // Verify default Thai presets contain "คิดถึง" and "หิว"
    const presetsResThai = await request(app)
      .get('/api/presets')
      .set('Cookie', cookieAlice);

    expect(presetsResThai.status).toBe(200);
    expect(Array.isArray(presetsResThai.body.presets)).toBe(true);
    expect(presetsResThai.body.presets.length).toBe(7);

    const thaiLabels = presetsResThai.body.presets.map((p: any) => p.label);
    expect(thaiLabels).toContain('คิดถึง');
    expect(thaiLabels).toContain('หิว');
    expect(presetsResThai.body.presets[0].label).toBe('คิดถึง');
    expect(presetsResThai.body.presets[0].emoji).toBe('🥺');
    expect(presetsResThai.body.presets[1].label).toBe('หิว');
    expect(presetsResThai.body.presets[1].emoji).toBe('🤤');

    // Also verify English default presets query (?lang=en)
    const presetsResEn = await request(app)
      .get('/api/presets?lang=en')
      .set('Cookie', cookieAlice);
    expect(presetsResEn.status).toBe(200);
    const enLabels = presetsResEn.body.presets.map((p: any) => p.label);
    expect(enLabels).toContain('Missing you');
    expect(enLabels).toContain('Hungry');

    // 2. Add custom preset "อยากกอด" (Hug me) via PUT /api/presets
    const customPresetsPayload = [
      { emoji: '🫂', label: 'อยากกอด', colorTheme: 'rose' },
      { emoji: '🥺', label: 'คิดถึง', colorTheme: 'rose' },
      { emoji: '🤤', label: 'หิว', colorTheme: 'amber' },
      { emoji: '🥰', label: 'รักนะ', colorTheme: 'rose' },
    ];

    const putPresetsRes = await request(app)
      .put('/api/presets')
      .set('Cookie', cookieAlice)
      .send({ presets: customPresetsPayload });

    expect(putPresetsRes.status).toBe(200);
    expect(putPresetsRes.body.presets.length).toBe(4);
    expect(putPresetsRes.body.presets[0].label).toBe('อยากกอด');
    expect(putPresetsRes.body.presets[0].emoji).toBe('🫂');

    // Verify customized presets persist for Alice
    const getUpdatedRes = await request(app)
      .get('/api/presets')
      .set('Cookie', cookieAlice);
    expect(getUpdatedRes.status).toBe(200);
    expect(getUpdatedRes.body.presets.length).toBe(4);
    expect(getUpdatedRes.body.presets[0].label).toBe('อยากกอด');

    // 3. Broadcast custom preset and verify partner receives updated mood via SSE
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const controller = new AbortController();

    try {
      const sseCookie = Array.isArray(cookieBob) ? cookieBob[0] : cookieBob;
      const sseResponse = await fetch(`http://127.0.0.1:${port}/api/stream`, {
        headers: { Cookie: sseCookie },
        signal: controller.signal,
      });

      expect(sseResponse.status).toBe(200);
      expect(sseResponse.headers.get('content-type')).toContain('text/event-stream');

      const reader = sseResponse.body?.getReader();
      const decoder = new TextDecoder();

      // Read initial connection chunk
      const initChunk = await reader?.read();
      expect(decoder.decode(initChunk?.value)).toContain(': connected');

      // Alice broadcasts custom preset "อยากกอด"
      const broadcastRes = await request(app)
        .post('/api/mood')
        .set('Cookie', cookieAlice)
        .send({
          emoji: '🫂',
          label: 'อยากกอด',
          note: 'อยากกอดแน่นๆ เลย',
          colorTheme: 'rose',
        });

      expect(broadcastRes.status).toBe(200);
      expect(broadcastRes.body.mood.label).toBe('อยากกอด');
      expect(broadcastRes.body.mood.emoji).toBe('🫂');
      expect(broadcastRes.body.mood.note).toBe('อยากกอดแน่นๆ เลย');

      // Bob receives SSE event
      const sseChunk = await reader?.read();
      const sseText = decoder.decode(sseChunk?.value);
      expect(sseText).toContain('event: mood_update');
      expect(sseText).toContain('อยากกอด');
      expect(sseText).toContain('🫂');
      expect(sseText).toContain('อยากกอดแน่นๆ เลย');

      // Bob verifies partner mood via API
      const bobMoodRes = await request(app)
        .get('/api/mood')
        .set('Cookie', cookieBob);

      expect(bobMoodRes.status).toBe(200);
      expect(bobMoodRes.body.partnerMood.emoji).toBe('🫂');
      expect(bobMoodRes.body.partnerMood.label).toBe('อยากกอด');
      expect(bobMoodRes.body.partnerMood.note).toBe('อยากกอดแน่นๆ เลย');
    } finally {
      controller.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 4. Reset presets and confirm original defaults are restored
    const resetRes = await request(app)
      .delete('/api/presets/reset?lang=th')
      .set('Cookie', cookieAlice);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toBe('Presets reset to default');
    expect(resetRes.body.presets.length).toBe(7);
    expect(resetRes.body.presets[0].label).toBe('คิดถึง');
    expect(resetRes.body.presets[1].label).toBe('หิว');

    // Subsequent GET confirms defaults
    const finalPresetsRes = await request(app)
      .get('/api/presets')
      .set('Cookie', cookieAlice);

    expect(finalPresetsRes.status).toBe(200);
    expect(finalPresetsRes.body.presets.length).toBe(7);
    expect(finalPresetsRes.body.presets.map((p: any) => p.label)).toContain('คิดถึง');
    expect(finalPresetsRes.body.presets.map((p: any) => p.label)).toContain('หิว');
  });
});
