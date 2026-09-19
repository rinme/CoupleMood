import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../api/index.js';

describe('Vercel Serverless API Handler (api/index.ts)', () => {
  it('serves /api/health with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('serves /api/push/key with VAPID public key', async () => {
    const res = await request(app).get('/api/push/key');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBeDefined();
  });

  it('rejects unauthenticated /api/auth/session with 401', async () => {
    const res = await request(app).get('/api/auth/session');
    expect(res.status).toBe(401);
  });
});
