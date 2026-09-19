# Multi-Device Account Linking via OTP & QR Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to seamlessly connect multiple devices (phones, tablets, laptops) to their existing couple account using a short-lived 6-digit OTP or QR code scan.

**Architecture:** A new SQLite table `device_link_otps` stores cryptographically random 6-digit codes with 5-minute expiry and 5-attempt rate-limiting. Authenticated Device A creates the OTP and renders an SVG QR code pointing to a direct link `/link?code=123456`. Device B can either scan via phone camera, use an in-app camera viewfinder, or enter the digits manually. Redeeming the OTP issues a separate persistent session token for Device B. Real-time SSE updates both partner devices and the user's own secondary devices. Separate actions exist for "Log Out This Device" vs "Unpair Couple".

**Tech Stack:** Node.js v26 / Bun 1.4, TypeScript, Express 4, SQLite (`better-sqlite3`), React 19, Tailwind CSS v3, `qrcode`, `jsqr`, Vitest, Supertest.

**Spec:** [`docs/superpowers/specs/2026-09-19-multi-device-otp-qr-design.md`](file:///home/rinme/Projects/CoupleMood/docs/superpowers/specs/2026-09-19-multi-device-otp-qr-design.md)

## Global Constraints

- STRICT MANDATE: USE BUN ONLY. NEVER USE NPM OR NPX UNDER ANY CIRCUMSTANCE (`bun install`, `bun run build`, `bun test`, `bun run dev`).
- STRICT README CONSTRAINT: ZERO emojis and ZERO pictures in `README.md`.
- Git author/committer must strictly remain `rinme <rinmesk@yahoo.com>`.
- Default language is Thai (`th`) with an English (`en`) toggle; all new copy must have complete Thai and English translations.
- All existing 136 tests across 14 test files must continue to pass after each task.

---

### Task 1: Backend Database Migration, OTP Model & Unit Tests

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/db.ts`
- Create: `server/tests/device-link.test.ts`

**Interfaces:**
- `DeviceLinkOtp`: `{ code: string; user_id: string; expires_at: string; failed_attempts: number; created_at?: string }`
- `createDeviceLinkOtp(userId: string): { code: string; expiresAt: string }`
- `verifyDeviceLinkOtp(code: string): PairResult`
- `recordOtpFailure(code: string): void`
- `logoutSession(token: string): void`

- [ ] **Step 1: Write failing tests for OTP database methods**

Create `server/tests/device-link.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, pairUser, createDeviceLinkOtp, verifyDeviceLinkOtp, recordOtpFailure, logoutSession, getDb } from '../src/db.js';

describe('Device Link OTP Database Layer', () => {
  beforeEach(() => {
    initDb(':memory:');
  });

  it('generates a 6-digit numeric OTP with 5-minute expiration', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const { code, expiresAt } = createDeviceLinkOtp(user.id);

    expect(code).toMatch(/^\d{6}$/);
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('verifies valid OTP, creates new session, and deletes OTP (single-use)', () => {
    const { user, couple } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);

    const result = verifyDeviceLinkOtp(code);
    expect(result.user.id).toBe(user.id);
    expect(result.couple.code).toBe(couple.code);
    expect(result.token).toBeDefined();

    // Verify OTP is deleted after redemption
    expect(() => verifyDeviceLinkOtp(code)).toThrow(/Invalid or expired/i);
  });

  it('rejects expired OTP with 410 status', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);

    const db = getDb();
    // Force expired date
    db.prepare('UPDATE device_link_otps SET expires_at = ? WHERE code = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      code
    );

    try {
      verifyDeviceLinkOtp(code);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(410);
      expect(err.message).toMatch(/expired/i);
    }
  });

  it('locks out and deletes OTP after 5 failed attempts with 429 status', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);

    // Record 5 failed attempts
    for (let i = 0; i < 5; i++) {
      recordOtpFailure(code);
    }

    try {
      verifyDeviceLinkOtp(code);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(429);
      expect(err.message).toMatch(/Too many failed attempts/i);
    }
  });

  it('logoutSession deletes only targeted session', () => {
    const { user, token: token1 } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);
    const { token: token2 } = verifyDeviceLinkOtp(code);

    const db = getDb();
    const countSessions = () => (db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?').get(user.id) as any).cnt;

    expect(countSessions()).toBe(2);

    logoutSession(token2);
    expect(countSessions()).toBe(1);

    const remainingSession = db.prepare('SELECT token FROM sessions WHERE user_id = ?').get(user.id) as any;
    expect(remainingSession.token).toBe(token1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run server/tests/device-link.test.ts`
Expected: FAIL (`createDeviceLinkOtp is not defined`).

- [ ] **Step 3: Implement database schema and methods**

1. In `server/src/types.ts`:
   Add `DeviceLinkOtp` interface:
   ```ts
   export interface DeviceLinkOtp {
     code: string;
     user_id: string;
     expires_at: string;
     failed_attempts: number;
     created_at?: string;
   }
   ```
2. In `server/src/db.ts`:
   - Add `device_link_otps` table creation in `createSchema()`:
     ```sql
     CREATE TABLE IF NOT EXISTS device_link_otps (
       code TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       expires_at DATETIME NOT NULL,
       failed_attempts INTEGER NOT NULL DEFAULT 0,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     );
     CREATE INDEX IF NOT EXISTS idx_device_link_otps_user ON device_link_otps(user_id);
     ```
   - Add `createDeviceLinkOtp(userId: string)`:
     Generates 6-digit random code using `crypto.randomInt(100000, 999999).toString()`.
     Expires in 5 minutes (`Date.now() + 5 * 60 * 1000`).
     Deletes prior OTPs for `userId`.
   - Add `verifyDeviceLinkOtp(code: string)`:
     Fetches OTP, checks expiration and failures, generates 32-byte session token, deletes OTP, returns `{ user, couple, partner, token }`.
   - Add `recordOtpFailure(code: string)`:
     Increments `failed_attempts`. If `>= 5`, deletes the OTP.
   - Add `logoutSession(token: string)`:
     `DELETE FROM sessions WHERE token = ?`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run server/tests/device-link.test.ts`
Expected: PASS (all 5 tests pass).

- [ ] **Step 5: Commit Task 1**

```bash
git add server/src/types.ts server/src/db.ts server/tests/device-link.test.ts
git commit -m "feat: implement device link OTP schema and database lifecycle methods"
```

---

### Task 2: Backend API Routes & SSE Multi-Device Sync

**Files:**
- Create: `server/src/routes/device-link.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/sse.ts`
- Modify: `server/src/routes/mood.ts`
- Modify: `server/src/app.ts`
- Modify: `server/tests/device-link.test.ts`

**Interfaces:**
- `POST /api/auth/device-link/create` -> `{ code: string, expiresAt: string, qrUrl: string }`
- `POST /api/auth/device-link/verify` -> `{ user: User, couple: Couple, partner: User | null }` (sets `mood_session` cookie)
- `POST /api/auth/logout` -> `{ message: string }` (clears `mood_session` cookie)
- `notifyUser(userId: string, event: SseEvent): void`

- [ ] **Step 1: Write route integration tests**

In `server/tests/device-link.test.ts`, add route tests:
```ts
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Device Link API Routes', () => {
  it('creates OTP via authenticated POST /api/auth/device-link/create', async () => {
    const app = createApp(initDb(':memory:'));
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const res = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', cookie)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body.qrUrl).toContain(`/link?code=${res.body.code}`);
  });

  it('verifies OTP via public POST /api/auth/device-link/verify and sets session cookie', async () => {
    const app = createApp(initDb(':memory:'));
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const createRes = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', cookie)
      .send();

    const otpCode = createRes.body.code;

    // Verify OTP from second device
    const verifyRes = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: otpCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.nickname).toBe('Alice');
    expect(verifyRes.headers['set-cookie']).toBeDefined();
    expect(verifyRes.headers['set-cookie'][0]).toContain('mood_session=');
  });

  it('logs out individual device session via POST /api/auth/logout', async () => {
    const app = createApp(initDb(':memory:'));
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .send();

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers['set-cookie'][0]).toContain('Max-Age=0');

    // Confirm session is no longer authenticated
    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('Cookie', cookie)
      .send();

    expect(sessionRes.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run server/tests/device-link.test.ts`
Expected: FAIL (routes 404).

- [ ] **Step 3: Implement device-link router, logout route, and SSE user broadcast**

1. Create `server/src/routes/device-link.ts`:
   - `POST /create`: uses `requireAuth`, calls `createDeviceLinkOtp(req.user.id)`, constructs `qrUrl: \`${req.protocol}://${req.get('host')}/link?code=${code}\``, returns `{ code, expiresAt, qrUrl }`.
   - `POST /verify`: unauthenticated, parses `req.body.code`, verifies 6-digit regex, calls `verifyDeviceLinkOtp(code)`, sets `mood_session` cookie (`SameSite=Lax`, `Path=/`, `Max-Age=30*86400`), returns `{ user, couple, partner }`.
2. In `server/src/routes/auth.ts`:
   - Add `POST /logout`: uses `requireAuth`, calls `logoutSession(req.cookies.mood_session)`, clears cookie `res.clearCookie('mood_session', { path: '/' })`, returns `{ message: 'Logged out from this device' }`.
3. In `server/src/sse.ts`:
   - Support multiple client responses per `userId` (map `userId` to `Set<Response>`).
   - Add `notifyUser(userId: string, eventData: SseEvent)`: writes event to all active responses in `userId`'s connection set.
4. In `server/src/routes/mood.ts`:
   - In `POST /` and `DELETE /`, after `notifyPartner(partner.id, event)`, also call `notifyUser(req.user.id, event)`.
5. In `server/src/app.ts`:
   - Mount router: `app.use('/api/auth/device-link', deviceLinkRouter)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run server/tests/device-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full server test suite**

Run: `bun x vitest run server/tests/`
Expected: All server test files pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add server/src/routes/ server/src/sse.ts server/src/app.ts server/tests/device-link.test.ts
git commit -m "feat: implement device link API routes, logout endpoint, and multi-device SSE sync"
```

---

### Task 3: Client Types, API Wrapper, i18n Dictionaries & Unit Tests

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/api.ts`
- Modify: `client/src/i18n/types.ts`
- Modify: `client/src/i18n/th.ts`
- Modify: `client/src/i18n/en.ts`
- Create: `client/tests/device-link-api.test.ts`

**Interfaces:**
- `DeviceLinkCreateResponse`: `{ code: string; expiresAt: string; qrUrl: string }`
- `api.auth.createDeviceLink(): Promise<DeviceLinkCreateResponse>`
- `api.auth.verifyDeviceLink(code: string): Promise<SessionResponse>`
- `api.auth.logout(): Promise<void>`
- i18n translation keys: `t.deviceLink`, `t.pairing.tabs`, `t.header.logoutThisDevice`

- [ ] **Step 1: Write failing unit test for client API and i18n keys**

Create `client/tests/device-link-api.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { api } from '../src/api.js';
import { th } from '../src/i18n/th.js';
import { en } from '../src/i18n/en.js';

describe('Device Link Client API & i18n Keys', () => {
  it('calls createDeviceLink endpoint', async () => {
    const mockData = { code: '123456', expiresAt: '2026-09-19T10:00:00Z', qrUrl: 'https://test/link?code=123456' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as any);

    const res = await api.auth.createDeviceLink();
    expect(res.code).toBe('123456');
    expect(res.qrUrl).toBe('https://test/link?code=123456');
  });

  it('calls verifyDeviceLink endpoint', async () => {
    const mockSession = { user: { id: 'u1', nickname: 'Alice', slot: 1 }, couple: { id: 'c1', code: 'LOVE-9999' }, partner: null };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockSession,
    } as any);

    const res = await api.auth.verifyDeviceLink('123456');
    expect(res.user.nickname).toBe('Alice');
  });

  it('has identical keys between Thai and English for device link copy', () => {
    expect(th.deviceLink).toBeDefined();
    expect(en.deviceLink).toBeDefined();
    expect(Object.keys(th.deviceLink)).toEqual(Object.keys(en.deviceLink));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run client/tests/device-link-api.test.ts`
Expected: FAIL (`createDeviceLink is not defined`).

- [ ] **Step 3: Implement client types, api methods, and i18n dictionaries**

1. In `client/src/types.ts`:
   ```ts
   export interface DeviceLinkCreateResponse {
     code: string;
     expiresAt: string;
     qrUrl: string;
   }
   ```
2. In `client/src/api.ts`:
   Add to `api.auth`:
   ```ts
   createDeviceLink: (): Promise<DeviceLinkCreateResponse> =>
     request<DeviceLinkCreateResponse>('/api/auth/device-link/create', { method: 'POST' }),
   verifyDeviceLink: (code: string): Promise<SessionResponse> =>
     request<SessionResponse>('/api/auth/device-link/verify', {
       method: 'POST',
       body: JSON.stringify({ code }),
     }),
   logout: (): Promise<void> =>
     request<void>('/api/auth/logout', { method: 'POST' }),
   ```
3. In `client/src/i18n/types.ts`:
   Add `deviceLink` section:
   - `modalTitle`, `modalSubtitle`, `codeLabel`, `copyCode`, `copied`, `expiresIn`, `expired`, `generateNew`, `scanHelp`, `scanWithCamera`, `cameraTitle`, `closeCamera`, `cameraPermError`
   - In `pairing`: add `tabPair`, `tabLinkDevice`, `otpPlaceholder`, `connectDevice`, `scanningQr`, `errorInvalidOtp`, `errorExpiredOtp`, `errorLockoutOtp`
   - In `header`: add `linkNewDevice`, `logoutThisDevice`, `loggingOut`
4. In `client/src/i18n/th.ts` and `client/src/i18n/en.ts`:
   Add localized copy for all keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run client/tests/device-link-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add client/src/types.ts client/src/api.ts client/src/i18n/ client/tests/device-link-api.test.ts
git commit -m "feat: add device link client API methods, types, and bilingual translations"
```

---

### Task 4: Frontend UI (DeviceLinkModal, CameraScannerModal, Tabbed PairModal, URL Auto-Login)

**Files:**
- Create: `client/src/components/DeviceLinkModal.tsx`
- Create: `client/src/components/CameraScannerModal.tsx`
- Modify: `client/src/components/Header.tsx`
- Modify: `client/src/components/PairModal.tsx`
- Modify: `client/src/App.tsx`
- Create: `client/tests/device-link-components.test.tsx`

**Interfaces:**
- `DeviceLinkModal`: `{ isOpen: boolean; onClose: () => void }`
- `CameraScannerModal`: `{ isOpen: boolean; onClose: () => void; onScanSuccess: (code: string) => void }`
- `PairModal`: supports tabbed views and OTP input.
- `App.tsx`: parses `?code=...` and auto-verifies.

- [ ] **Step 1: Write failing component tests**

Create `client/tests/device-link-components.test.tsx`:
```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PairModal } from '../src/components/PairModal.js';
import { DeviceLinkModal } from '../src/components/DeviceLinkModal.js';
import { I18nProvider } from '../src/i18n/index.js';
import { api } from '../src/api.js';

describe('Device Link UI Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tabbed view in PairModal and submits 6-digit OTP', async () => {
    const handleSuccess = vi.fn();
    const mockSession = { user: { id: 'u1', nickname: 'Taylor', slot: 1 as const }, couple: { id: 'c1', code: 'LOVE-1111' }, partner: null };
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
      expect(screen.getByText(/Expires in/i)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run client/tests/device-link-components.test.tsx`
Expected: FAIL (components missing/tabs not yet implemented).

- [ ] **Step 3: Implement DeviceLinkModal, CameraScannerModal, PairModal tabs, Header buttons, and App URL auto-login**

1. Create `client/src/components/DeviceLinkModal.tsx`:
   - Renders QR code SVG using `qrcode.toString(qrUrl, { type: 'svg', margin: 1 })`.
   - Renders formatted 6-digit code (`code.slice(0,3) + ' ' + code.slice(3)`).
   - Shows countdown clock `m:ss`.
   - "Copy link" / "Copy code" button.
   - "Generate new code" button if expired.
2. Create `client/src/components/CameraScannerModal.tsx`:
   - Renders video viewfinder using `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`.
   - Periodically scans video frame using `jsQR(imageData.data, width, height)` or native `BarcodeDetector`.
   - When a QR code with `/link?code=(\d{6})` or a 6-digit number is detected, calls `onScanSuccess(code)`.
   - Handles camera permission denials gracefully.
3. In `client/src/components/Header.tsx`:
   - In Settings modal, add "เชื่อมต่ออุปกรณ์ใหม่" / "Link New Device" button -> opens `DeviceLinkModal`.
   - Add "ออกจากระบบอุปกรณ์นี้" / "Log Out This Device" button -> calls `api.auth.logout()`, clears state, opens `PairModal`.
4. In `client/src/components/PairModal.tsx`:
   - Add tab switcher at top: `role="tablist"`.
     - Tab 1: "คู่รักใหม่" / "Pair with Partner"
     - Tab 2: "เชื่อมต่ออุปกรณ์" / "Link Existing Device"
   - Under Tab 2:
     - 6-digit OTP numeric input (`maxLength={6}`, formatted).
     - "เปิดกล้องสแกน QR" button -> opens `CameraScannerModal`.
     - Submit button -> calls `api.auth.verifyDeviceLink(cleanCode)`.
5. In `client/src/App.tsx`:
   - In `useEffect` on mount:
     ```ts
     const urlParams = new URLSearchParams(window.location.search);
     const linkCode = urlParams.get('code');
     if (linkCode && /^\d{6}$/.test(linkCode)) {
       // auto-verify device link
       api.auth.verifyDeviceLink(linkCode).then((session) => {
         window.history.replaceState({}, '', '/');
         handlePairSuccess(session);
         showToast({ message: t.deviceLink.connectedSuccess, emoji: '📱' });
       }).catch((err) => {
         // show error toast and let user retry in PairModal
       });
     }
     ```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run client/tests/device-link-components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run existing client test suites**

Run: `bun x vitest run client/tests/`
Expected: All client component tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add client/src/components/ client/src/App.tsx client/tests/device-link-components.test.tsx
git commit -m "feat: implement DeviceLinkModal, camera scanner, PairModal tabs, and URL auto-login"
```

---

### Task 5: End-to-End Multi-Device Integration Tests, Docs & Verification

**Files:**
- Create: `tests/e2e-multi-device.test.ts`
- Modify: `README.md`

**Scenario to Test in `tests/e2e-multi-device.test.ts`:**
1. Device 1 (Alice) pairs with couple code `COUPLE-MULTI` (Slot 1).
2. Device 2 (Bob) pairs with couple code `COUPLE-MULTI` (Slot 2).
3. Device 1 (Alice on phone) calls `POST /api/auth/device-link/create` and obtains 6-digit OTP.
4. Device 3 (Alice on laptop) calls `POST /api/auth/device-link/verify` with Alice's OTP.
5. Verify Device 3 receives a session token belonging to Alice (`slot: 1`, `nickname: Alice`).
6. Device 3 posts mood `{ emoji: '💻', label: 'Busy' }`.
7. Verify Device 1 (Alice's phone) and Device 2 (Bob's phone) both retrieve this mood.
8. Device 3 calls `POST /api/auth/logout`.
9. Verify Device 3 is logged out, but Device 1 (Alice's phone) and Device 2 (Bob's phone) remain fully authenticated.
10. Device 1 calls `POST /api/auth/unpair`.
11. Verify all sessions for both partners across all devices are deleted.

- [ ] **Step 1: Write E2E multi-device integration test**

Create `tests/e2e-multi-device.test.ts` implementing the exact 11-step scenario above using `supertest` and `createApp(initDb(':memory:'))`.

- [ ] **Step 2: Run E2E multi-device test**

Run: `bun x vitest run tests/e2e-multi-device.test.ts`
Expected: PASS.

- [ ] **Step 3: Update `README.md` (STRICT: ZERO EMOJIS, ZERO PICTURES)**

Document:
- Multi-Device Account Linking via 6-digit OTP and QR Scan.
- How to connect a laptop, tablet, or secondary phone.
- Single device logout vs couple unpair.
- Verify zero pictures and zero emojis using script.

- [ ] **Step 4: Run full test suite across entire project**

Run: `bun run test`
Expected: All test suites pass.

- [ ] **Step 5: Run production build**

Run: `bun run build`
Expected: Production build succeeds cleanly.

- [ ] **Step 6: Commit Task 5**

```bash
git add tests/e2e-multi-device.test.ts README.md bun.lock client/package.json
git commit -m "feat: complete multi-device E2E integration tests and documentation"
```

- [ ] **Step 7: Push to GitHub**

```bash
git push origin main
```
