import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import {
  initDb,
  closeDb,
  getDb,
  getUserPresets,
  setUserPresets,
  resetUserPresets,
  DEFAULT_PRESETS_TH,
  DEFAULT_PRESETS_EN
} from '../src/db.js';

describe('Custom Mood Presets API & DB (/api/presets)', () => {
  let app: Express;

  beforeEach(() => {
    initDb(':memory:');
    app = createApp();
  });

  afterEach(() => {
    closeDb();
  });

  describe('1. Unauthenticated access', () => {
    it('GET /api/presets returns 401 without session cookie', async () => {
      const res = await request(app).get('/api/presets');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('PUT /api/presets returns 401 without session cookie', async () => {
      const res = await request(app)
        .put('/api/presets')
        .send({ presets: [{ emoji: '🎉', label: 'Party', colorTheme: 'amber' }] });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('DELETE /api/presets/reset returns 401 without session cookie', async () => {
      const res = await request(app).delete('/api/presets/reset');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('2. GET /api/presets (Defaults)', () => {
    it('returns default Thai presets by default when user has no custom presets', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-101', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/presets')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.presets).toBeDefined();
      expect(Array.isArray(res.body.presets)).toBe(true);
      expect(res.body.presets.length).toBe(7);

      // Verify Missing you and Hungry are top 2
      expect(res.body.presets[0].emoji).toBe('🥺');
      expect(res.body.presets[0].label).toBe('คิดถึง');
      expect(res.body.presets[0].color_theme).toBe('rose');
      expect(res.body.presets[0].sort_order).toBe(0);

      expect(res.body.presets[1].emoji).toBe('🤤');
      expect(res.body.presets[1].label).toBe('หิว');
      expect(res.body.presets[1].color_theme).toBe('amber');
      expect(res.body.presets[1].sort_order).toBe(1);

      expect(res.body.presets[2].emoji).toBe('🥰');
      expect(res.body.presets[2].label).toBe('รักนะ');

      expect(res.body.presets[3].emoji).toBe('😴');
      expect(res.body.presets[3].label).toBe('ง่วง');

      expect(res.body.presets[4].emoji).toBe('💻');
      expect(res.body.presets[4].label).toBe('ยุ่งมาก');

      expect(res.body.presets[5].emoji).toBe('☕');
      expect(res.body.presets[5].label).toBe('ชิลๆ');

      expect(res.body.presets[6].emoji).toBe('🤒');
      expect(res.body.presets[6].label).toBe('ไม่สบาย');
    });

    it('returns default English presets when ?lang=en is specified', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-102', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/presets?lang=en')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.presets).toBeDefined();
      expect(res.body.presets.length).toBe(7);

      expect(res.body.presets[0].emoji).toBe('🥺');
      expect(res.body.presets[0].label).toBe('Missing you');
      expect(res.body.presets[0].color_theme).toBe('rose');

      expect(res.body.presets[1].emoji).toBe('🤤');
      expect(res.body.presets[1].label).toBe('Hungry');
      expect(res.body.presets[1].color_theme).toBe('amber');

      expect(res.body.presets[2].emoji).toBe('🥰');
      expect(res.body.presets[2].label).toBe('Loving');

      expect(res.body.presets[3].emoji).toBe('😴');
      expect(res.body.presets[3].label).toBe('Sleepy');

      expect(res.body.presets[4].emoji).toBe('💻');
      expect(res.body.presets[4].label).toBe('Busy');

      expect(res.body.presets[5].emoji).toBe('☕');
      expect(res.body.presets[5].label).toBe('Cozy');

      expect(res.body.presets[6].emoji).toBe('🤒');
      expect(res.body.presets[6].label).toBe('Sick');
    });
  });

  describe('3. PUT /api/presets (Custom presets & validation)', () => {
    it('saves custom presets and returns them with sort_order', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-201', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const customList = [
        { emoji: '🎮', label: 'เล่นเกม', colorTheme: 'indigo' },
        { emoji: '🍕', label: 'กินพิซซ่า', colorTheme: 'amber' },
        { emoji: '❤️', label: 'รักเธอ', colorTheme: 'rose' }
      ];

      const putRes = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({ presets: customList });

      expect(putRes.status).toBe(200);
      expect(putRes.body.presets).toBeDefined();
      expect(putRes.body.presets.length).toBe(3);

      expect(putRes.body.presets[0].emoji).toBe('🎮');
      expect(putRes.body.presets[0].label).toBe('เล่นเกม');
      expect(putRes.body.presets[0].color_theme).toBe('indigo');
      expect(putRes.body.presets[0].sort_order).toBe(0);
      expect(putRes.body.presets[0].user_id).toBe(pairRes.body.user.id);

      expect(putRes.body.presets[1].emoji).toBe('🍕');
      expect(putRes.body.presets[1].label).toBe('กินพิซซ่า');
      expect(putRes.body.presets[1].sort_order).toBe(1);

      expect(putRes.body.presets[2].emoji).toBe('❤️');
      expect(putRes.body.presets[2].label).toBe('รักเธอ');
      expect(putRes.body.presets[2].sort_order).toBe(2);

      // Verify GET returns the saved custom presets
      const getRes = await request(app)
        .get('/api/presets')
        .set('Cookie', cookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.presets.length).toBe(3);
      expect(getRes.body.presets[0].emoji).toBe('🎮');
      expect(getRes.body.presets[1].emoji).toBe('🍕');
      expect(getRes.body.presets[2].emoji).toBe('❤️');
    });

    it('rejects empty array with 400 Bad Request', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-202', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({ presets: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1.*16/i);
    });

    it('rejects more than 16 presets with 400 Bad Request', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-203', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const tooMany = Array.from({ length: 17 }, (_, i) => ({
        emoji: '⭐',
        label: `Mood ${i + 1}`,
        colorTheme: 'rose'
      }));

      const res = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({ presets: tooMany });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1.*16/i);
    });

    it('rejects invalid presets where emoji is empty', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-204', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({
          presets: [{ emoji: '', label: 'No emoji', colorTheme: 'rose' }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/emoji/i);
    });

    it('rejects invalid presets where label exceeds 30 characters', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-205', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({
          presets: [{ emoji: '🥺', label: 'A'.repeat(31), colorTheme: 'rose' }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/30 characters/i);
    });

    it('rejects missing or invalid body structure', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-206', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res1 = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({});
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({ presets: 'not-an-array' });
      expect(res2.status).toBe(400);
    });
  });

  describe('4. DELETE /api/presets/reset', () => {
    it('clears custom presets and restores default presets', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-301', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      // First set custom preset
      await request(app)
        .put('/api/presets')
        .set('Cookie', cookie)
        .send({
          presets: [{ emoji: '🎉', label: 'Party', colorTheme: 'amber' }]
        });

      // Verify custom is saved
      const customGet = await request(app)
        .get('/api/presets')
        .set('Cookie', cookie);
      expect(customGet.body.presets.length).toBe(1);

      // Now reset
      const resetRes = await request(app)
        .delete('/api/presets/reset')
        .set('Cookie', cookie);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toBe('Presets reset to default');
      expect(resetRes.body.presets).toBeDefined();
      expect(resetRes.body.presets.length).toBe(7);
      expect(resetRes.body.presets[0].emoji).toBe('🥺');

      // Subsequent GET returns defaults
      const afterResetGet = await request(app)
        .get('/api/presets')
        .set('Cookie', cookie);
      expect(afterResetGet.body.presets.length).toBe(7);
      expect(afterResetGet.body.presets[0].label).toBe('คิดถึง');
    });

    it('DELETE /api/presets/reset respects ?lang=en query parameter', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-302', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const resetRes = await request(app)
        .delete('/api/presets/reset?lang=en')
        .set('Cookie', cookie);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.presets[0].label).toBe('Missing you');
    });
  });

  describe('5. Multi-user isolation & DB transactions', () => {
    it('custom presets of User A do not affect User B', async () => {
      const u1Res = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-401', nickname: 'Alice' });
      const u2Res = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PRESET-401', nickname: 'Bob' });

      const aliceCookie = u1Res.headers['set-cookie'];
      const bobCookie = u2Res.headers['set-cookie'];

      // Alice customizes presets
      await request(app)
        .put('/api/presets')
        .set('Cookie', aliceCookie)
        .send({
          presets: [{ emoji: '🌸', label: 'Alice Mood', colorTheme: 'rose' }]
        });

      // Bob checks presets: should still get default presets
      const bobGet = await request(app)
        .get('/api/presets')
        .set('Cookie', bobCookie);
      expect(bobGet.body.presets.length).toBe(7);
      expect(bobGet.body.presets[0].label).toBe('คิดถึง');

      // Alice checks presets: gets 1 custom preset
      const aliceGet = await request(app)
        .get('/api/presets')
        .set('Cookie', aliceCookie);
      expect(aliceGet.body.presets.length).toBe(1);
      expect(aliceGet.body.presets[0].label).toBe('Alice Mood');
    });

    it('DB helpers unit test: setUserPresets, getUserPresets, resetUserPresets', () => {
      const db = getDb();
      db.prepare("INSERT INTO couples (id, code) VALUES ('c1', 'UNIT-1')").run();
      db.prepare("INSERT INTO users (id, couple_id, nickname, slot) VALUES ('u1', 'c1', 'Alice', 1)").run();

      // Defaults
      const defaults = getUserPresets('u1');
      expect(defaults.length).toBe(7);
      expect(defaults[0].label).toBe('คิดถึง');

      const defaultsEn = getUserPresets('u1', 'en');
      expect(defaultsEn.length).toBe(7);
      expect(defaultsEn[0].label).toBe('Missing you');

      // Set custom
      const saved = setUserPresets('u1', [
        { emoji: '🚀', label: 'Fast', colorTheme: 'indigo' }
      ]);
      expect(saved.length).toBe(1);
      expect(saved[0].emoji).toBe('🚀');
      expect(saved[0].label).toBe('Fast');

      // Get custom
      const fetched = getUserPresets('u1');
      expect(fetched.length).toBe(1);
      expect(fetched[0].label).toBe('Fast');

      // Reset
      resetUserPresets('u1');
      const afterReset = getUserPresets('u1');
      expect(afterReset.length).toBe(7);
      expect(afterReset[0].label).toBe('คิดถึง');
    });

    it('cascade deletes user_presets when user is deleted', () => {
      const db = getDb();
      db.prepare("INSERT INTO couples (id, code) VALUES ('c2', 'CASCADE-1')").run();
      db.prepare("INSERT INTO users (id, couple_id, nickname, slot) VALUES ('u2', 'c2', 'Alice', 1)").run();

      setUserPresets('u2', [
        { emoji: '🎉', label: 'Party', colorTheme: 'amber' }
      ]);

      const countBefore = db.prepare('SELECT count(*) as c FROM user_presets WHERE user_id = ?').get('u2') as { c: number };
      expect(countBefore.c).toBe(1);

      db.prepare('DELETE FROM users WHERE id = ?').run('u2');

      const countAfter = db.prepare('SELECT count(*) as c FROM user_presets WHERE user_id = ?').get('u2') as { c: number };
      expect(countAfter.c).toBe(0);
    });
  });
});
