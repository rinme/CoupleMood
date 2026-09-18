# Mood Sender PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Progressive Web App (PWA) called "Mood Sender" for couples to pair with a shared code, broadcast ambient mood updates in real time, and receive Web Push notifications even when the browser is closed.

**Architecture:** Monorepo with a Node.js/Express backend (`server/`) and Vite + React frontend (`client/`). The backend uses SQLite (`better-sqlite3` in WAL mode) for persistence, Server-Sent Events (SSE) for instant synchronization in active tabs, and `web-push` for background push notifications via VAPID. The frontend is a responsive, mobile-first PWA with a Service Worker (`sw.js`) and Web App Manifest.

**Tech Stack:** Node.js, Express, TypeScript, better-sqlite3, web-push, cookie-parser, React 19, Vite, Tailwind CSS, Lucide React icons.

**Spec:** [`docs/superpowers/specs/2026-09-19-couple-mood-sender-design.md`](file:///home/rinme/Projects/CoupleMood/docs/superpowers/specs/2026-09-19-couple-mood-sender-design.md)

## Global Constraints
- Node.js runtime: v26.8.2
- Bun runtime available: 1.4.2
- Express 4.x/5.x with TypeScript
- SQLite via `better-sqlite3`
- Session cookie: `mood_session`, HTTP-only, `SameSite=Lax`, `Path=/`
- Exactly 2 users allowed per couple code
- Service worker at `/sw.js` with root scope
- Cozy Warm UI design palette

---

### Task 1: Project Setup, Database Schema & VAPID Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/db.ts`
- Create: `server/src/types.ts`
- Create: `server/tests/db.test.ts`

**Interfaces:**
- Produces:
  - `getDb(): Database`
  - `initDb(dbPath?: string): Database`
  - `getVapidKeys(): { publicKey: string, privateKey: string }`
  - `pairUser(code: string, nickname: string): { user: User, couple: Couple, partner: User | null, token: string }`
  - `getSession(token: string): { user: User, couple: Couple, partner: User | null } | null`
  - `deleteSession(token: string): void`

- [ ] **Step 1: Create root and server configuration files**

Initialize `package.json`, `tsconfig.json`, and `server/package.json` with scripts and dependencies (`express`, `better-sqlite3`, `web-push`, `cookie-parser`, `dotenv`, and devDependencies `vitest`, `ts-node`, `typescript`, `@types/...`).

- [ ] **Step 2: Write failing test for DB schema, VAPID generation, and pairing logic**

Write `server/tests/db.test.ts` testing:
1. Database tables creation (`couples`, `users`, `sessions`, `moods`, `push_subscriptions`, `server_settings`).
2. Auto-generation and persistence of VAPID keys in `server_settings`.
3. User 1 pairing creates couple and user with `slot = 1`.
4. User 2 pairing with same code joins couple with `slot = 2` and identifies User 1 as partner.
5. User 3 pairing with the same code is rejected with error `"Couple code is full"`.
6. Session persistence and lookup via token.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/tests/db.test.ts`  
Expected: FAIL (modules not found / not implemented)

- [ ] **Step 4: Implement `server/src/db.ts` and `server/src/types.ts`**

Implement SQLite initialization, table schemas, VAPID key initialization, and database query helpers.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/tests/db.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json server/
git commit -m "feat: setup project, SQLite schema, and pairing models"
```

---

### Task 2: Service Worker & PWA Assets

**Files:**
- Create: `client/public/manifest.json`
- Create: `client/public/sw.js`
- Create: `client/public/icons/icon-192.png`
- Create: `client/public/icons/icon-512.png`
- Create: `client/public/icons/badge.png`
- Create: `client/tests/sw.test.ts`

**Interfaces:**
- Produces:
  - Valid W3C `manifest.json` with `standalone` display and theme color `#FAF7F2`
  - Service worker `sw.js` with `'push'`, `'notificationclick'`, and offline shell fetch caching

- [ ] **Step 1: Write test for Service Worker & Manifest validation**

Write `client/tests/sw.test.ts` verifying:
1. `manifest.json` is valid JSON and contains required PWA properties (`name`, `short_name`, `start_url`, `display: "standalone"`, `icons`).
2. `sw.js` syntax parses without errors and registers event listeners for `push` and `notificationclick`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/tests/sw.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `client/public/sw.js`, `manifest.json`, and generate PWA icon assets**

Implement `sw.js` handling:
- `push` event: extracts payload, triggers `showNotification` with tag `'couple-mood'`, renotify `true`.
- `notificationclick` event: focuses client if open, or calls `clients.openWindow('/')`.
- Cache assets for instant offline shell loading.
- Generate high-quality SVG/PNG icons for the app.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/tests/sw.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/public/ client/tests/
git commit -m "feat: add PWA manifest, icons, and push service worker"
```

---

### Task 3: Backend API Routes, SSE Stream & Web Push Dispatch

**Files:**
- Create: `server/src/push.ts`
- Create: `server/src/sse.ts`
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/routes/mood.ts`
- Create: `server/src/routes/push.ts`
- Create: `server/src/routes/stream.ts`
- Create: `server/src/app.ts`
- Create: `server/tests/api.test.ts`

**Interfaces:**
- Consumes:
  - `db.ts` functions for sessions, users, moods, and push subscriptions
- Produces:
  - Express app with endpoints:
    - `POST /api/auth/pair`
    - `GET /api/auth/session`
    - `POST /api/auth/unpair`
    - `GET /api/mood`
    - `POST /api/mood`
    - `DELETE /api/mood`
    - `GET /api/push/key`
    - `POST /api/push/subscribe`
    - `POST /api/push/unsubscribe`
    - `GET /api/stream` (SSE)

- [ ] **Step 1: Write integration tests for API routes**

Write `server/tests/api.test.ts` using Supertest or Node fetch:
1. `POST /api/auth/pair`: Creates session cookie, rejects 3rd user with 409.
2. `GET /api/auth/session`: Validates session cookie.
3. `POST /api/mood`: Sets mood, dispatches notification, and triggers SSE event.
4. `GET /api/mood`: Returns user and partner mood.
5. `DELETE /api/mood`: Clears mood.
6. `POST /api/push/subscribe`: Stores subscription.
7. `POST /api/auth/unpair`: Clears session cookie and deletes session.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/tests/api.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Express app and routes**

Implement:
- `auth.ts` middleware reading `mood_session` cookie.
- `push.ts` dispatcher using `web-push`.
- `sse.ts` stream manager for live partner notification.
- Express route handlers with error handling and proper HTTP status codes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/tests/api.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/ server/tests/
git commit -m "feat: implement backend routes, SSE sync, and Web Push dispatch"
```

---

### Task 4: Frontend UI (Pairing, Dashboard, Real-time Sync & Push Prompt)

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tailwind.config.js`
- Create: `client/src/types.ts`
- Create: `client/src/api.ts`
- Create: `client/src/sw-register.ts`
- Create: `client/src/presets.ts`
- Create: `client/src/components/Header.tsx`
- Create: `client/src/components/PairModal.tsx`
- Create: `client/src/components/PartnerCard.tsx`
- Create: `client/src/components/MyMoodCard.tsx`
- Create: `client/src/components/PushPrompt.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/main.tsx`
- Create: `client/src/index.css`

**Interfaces:**
- Consumes:
  - Backend API at `/api/*` and `/sw.js`
- Produces:
  - Responsive, tactile Cozy Warm interface with 2 main cards ("Partner's Mood" and "My Mood"), pairing gate, push permission banner, and live SSE listener.

- [ ] **Step 1: Scaffold client dependencies and Tailwind CSS**

Set up `client/package.json` with React, Vite, Tailwind CSS, Lucide icons, and date-fns (or lightweight relative time helper).

- [ ] **Step 2: Implement client API, SSE listener, and Push Registration helpers**

Implement `api.ts`, `sw-register.ts`, and `presets.ts` with error handling and cookie credentials.

- [ ] **Step 3: Implement UI Components with Cozy Warm Design**

Build:
- `PairModal.tsx`: Code input/generation, nickname, pairing actions.
- `Header.tsx`: Title, connection status dot, couple code copy pill, and unpair modal/action.
- `PartnerCard.tsx`: Partner mood emoji, label, custom note quote bubble, dynamic ambient tint, relative timestamp.
- `MyMoodCard.tsx`: Quick emoji/feeling presets, custom note text field (with character counter), update button, and clear button.
- `PushPrompt.tsx`: Non-intrusive prompt to enable background push notifications.
- `App.tsx`: State coordination, SSE event listener, and focus revalidation.

- [ ] **Step 4: Verify frontend build compiles cleanly**

Run: `npm --prefix client run build`  
Expected: Build succeeds with zero TypeScript or bundling errors.

- [ ] **Step 5: Commit**

```bash
git add client/
git commit -m "feat: implement frontend UI, pairing modal, and mood dashboard"
```

---

### Task 5: End-to-End Verification & Production Integration

**Files:**
- Create: `server/src/index.ts` (serves client build statically in production, runs API server)
- Create: `tests/e2e.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes:
  - Built client in `client/dist` and Express backend
- Produces:
  - Single production-ready startup script (`npm start` / `npm run dev`)
  - Full E2E verification test simulating Partner A and Partner B pairing, updating mood, receiving SSE broadcast, and clearing status.

- [ ] **Step 1: Implement server static file hosting and unified entrypoint**

Configure `server/src/index.ts` to serve `client/dist` statically in production with SPA fallback to `index.html`.

- [ ] **Step 2: Write end-to-end integration test**

Write `tests/e2e.test.ts`:
1. Start test server.
2. Simulate Partner A (`Alice`) pairing with code `COUPLE-TEST`.
3. Simulate Partner B (`Bob`) pairing with same code `COUPLE-TEST`.
4. Verify Partner A's initial view shows Bob as partner.
5. Partner A posts mood: `{ emoji: '🥰', label: 'Loving', note: 'Can not wait for dinner!' }`.
6. Partner B fetches mood: confirms Partner A's mood is returned with timestamp.
7. Partner A clears mood: confirms Partner B sees cleared state.
8. Partner C attempts pairing with `COUPLE-TEST`: confirms 409 Conflict.
9. Partner A unpairs: confirms session is destroyed.

- [ ] **Step 3: Run all test suites across server, client, and e2e**

Run: `npm test`  
Expected: All tests pass.

- [ ] **Step 4: Create detailed README with setup and PWA installation instructions**

Document:
- Running dev server (`npm run dev`)
- Running production build (`npm run build && npm start`)
- Testing Web Push and installing to Home Screen on iOS / Android.

- [ ] **Step 5: Final Commit**

```bash
git add server/src/index.ts tests/ README.md
git commit -m "feat: complete production integration, E2E tests, and documentation"
```
