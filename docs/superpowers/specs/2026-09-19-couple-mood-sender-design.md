# Design Specification: Mood Sender PWA

**Date:** 2026-09-19  
**Status:** Approved  
**Author:** Senior Full-Stack Developer & Antigravity  

---

## 1. Overview & Objectives

**Mood Sender** is a lightweight, responsive Progressive Web App (PWA) tailored for couples to share ambient status updates. The app allows two partners to pair seamlessly using a shared couple code, maintain persistent sessions across visits without recurring logins, broadcast their current mood/note in real time, and receive instant Web Push notifications even when the application or browser tab is closed.

---

## 2. Technical Stack

- **Frontend:**
  - React 19 / Vite
  - TypeScript
  - Tailwind CSS (Cozy Warm design palette)
  - Progressive Web App (PWA): Web App Manifest (`manifest.json`), Service Worker (`sw.js`), Web Push API
- **Backend:**
  - Node.js + Express (TypeScript)
  - `better-sqlite3` (with WAL mode enabled)
  - `web-push` for VAPID push notification payload encryption and delivery
  - Native Server-Sent Events (SSE) for sub-second synchronization in active tabs
  - `cookie-parser` for secure HTTP-only session cookies
- **Storage:**
  - Embedded SQLite database (`data/mood.db`) with auto-migrations on startup

---

## 3. Database Schema

The database runs on SQLite via `better-sqlite3`.

```sql
-- Couples: 1 row per paired couple room
CREATE TABLE IF NOT EXISTS couples (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- Upper-case normalized code (e.g. 'LOVE-8241' or custom)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users: Strictly 2 users per couple (slot 1 and slot 2)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE,
  UNIQUE(couple_id, slot)
);

-- Sessions: Persistent authentication tokens via HTTP-only cookies
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Moods: 1 active mood per user
CREATE TABLE IF NOT EXISTS moods (
  user_id TEXT PRIMARY KEY,
  emoji TEXT NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  color_theme TEXT DEFAULT 'rose',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Push Subscriptions: Allows multiple devices per user (phone + laptop)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Server Settings: Stores auto-generated VAPID keys if not present in .env
CREATE TABLE IF NOT EXISTS server_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 4. API Endpoints

### 4.1 Authentication & Pairing (`/api/auth`)
- `POST /api/auth/pair`:
  - Request: `{ code: string, nickname: string }`
  - Logic:
    - Normalizes code (trim, uppercase).
    - Fetches or creates couple row.
    - Counts active users:
      - 0 users: creates user with slot 1.
      - 1 user: creates user with slot 2.
      - 2 users: checks if current session already belongs to this couple; otherwise rejects with 409 Conflict ("Couple code is full").
    - Generates 32-byte cryptographic session token, stores in `sessions` table (30-day expiration).
    - Sets HTTP-only cookie `mood_session` (`SameSite=Lax`, `Path=/`, `HttpOnly=true`).
    - Returns `{ user: { id, nickname, slot }, couple: { id, code }, partner: { id, nickname } | null }`.
- `GET /api/auth/session`:
  - Validates `mood_session` cookie.
  - Returns current user, couple info, and partner info.
- `POST /api/auth/unpair`:
  - Clears session token from DB.
  - Clears `mood_session` cookie.

### 4.2 Mood Status (`/api/mood`)
- `GET /api/mood`:
  - Authenticated via session cookie.
  - Returns `{ myMood: Mood | null, partnerMood: Mood | null, partner: { id, nickname } | null }`.
- `POST /api/mood`:
  - Request: `{ emoji: string, label: string, note?: string, colorTheme?: string }`
  - Upserts `moods` record for the authenticated user.
  - Dispatches live SSE message to partner's connected stream.
  - Dispatches Web Push notification to all active push subscriptions for partner.
- `DELETE /api/mood`:
  - Deletes current user's mood record.
  - Broadcasts cleared mood event via SSE and Web Push ("{nickname} cleared their mood status").

### 4.3 Web Push Management (`/api/push`)
- `GET /api/push/key`:
  - Returns `{ publicKey: string }` for the browser to subscribe.
- `POST /api/push/subscribe`:
  - Request: `{ endpoint: string, keys: { p256dh: string, auth: string } }`
  - Stores or updates subscription for current user in `push_subscriptions`.
- `POST /api/push/unsubscribe`:
  - Request: `{ endpoint: string }`
  - Removes subscription for current user.

### 4.4 Live SSE Stream (`/api/stream`)
- `GET /api/stream`:
  - Subscribes client to Server-Sent Events.
  - Heartbeat every 25 seconds (`: ping\n\n`).
  - Broadcasts `mood_update` payload whenever partner submits or clears their mood.

---

## 5. Service Worker & Push Notifications (`sw.js`)

1. **Caching & PWA Lifecycle:**
   - Pre-caches core app shell: `/`, `/manifest.json`, icon assets.
   - Network-first caching strategy for API requests to ensure fresh mood state.
2. **Push Event:**
   - Listens for `'push'` event.
   - Unpacks JSON `{ title, body, icon, badge, url, data }`.
   - Invokes `self.registration.showNotification(title, { body, icon, badge, tag: 'couple-mood', data, renotify: true })`.
3. **Notification Click Event:**
   - Listens for `'notificationclick'`.
   - Closes notification.
   - Finds existing client window with root URL:
     - If open, focuses tab and sends message `{ type: 'REFRESH_MOOD' }`.
     - If closed, opens a new window via `clients.openWindow('/')`.

---

## 6. Frontend UI & Experience

### 6.1 Design Direction: Cozy Warm & Modern
- Warm background (`#FAF7F2` / `#FDFBF7`), subtle slate/rose borders, tactile buttons, soft shadows (`shadow-sm`, `shadow-md`).
- Fluid typography and responsive touch targets (44px+).

### 6.2 Screens & Components
1. **Pairing Modal / Gate (`PairModal.tsx`):**
   - Shown when unauthenticated.
   - Allows generating a random cute couple code (e.g., `LOVE-7482`) or entering a partner's code.
   - Nickname input field ("What does your partner call you?").
   - Clear feedback for errors (code full, invalid format).
2. **Main Dashboard:**
   - **Header:** App title ("Mood Sender"), Couple Code pill with copy-to-clipboard button, live SSE connection indicator, and settings popover (with "Unpair" action).
   - **Notification Banner (`PushPrompt.tsx`):**
     - Dismissible, non-intrusive prompt if `Notification.permission !== 'granted'`.
     - Toggle button to enable instant push notifications.
   - **Partner's Mood Card (`PartnerCard.tsx`):**
     - Primary focal point.
     - Dynamic background tint based on partner's mood theme (e.g. blush rose for Loving, warm amber for Cozy, sleepy lavender for Tired).
     - Large animated emoji, mood label, custom note displayed as an intimate quote bubble, and relative timestamp ("Just now", "12m ago", "3h ago").
     - Empty state with cute illustration/indicator if partner hasn't shared their mood yet.
   - **My Mood Card (`MyMoodCard.tsx`):**
     - Current active mood summary.
     - Grid of preset moods (Loving, Cozy, Busy, Sleepy, Excited, Chilling, Stressed, Sick).
     - Custom short note input (up to 100 characters).
     - Action buttons: "Broadcast Mood" (with tactile loading state) and "Clear Status".

---

## 7. Delivery Order

1. **Step 1:** Project initialization, dependencies, database schema migrations, and backend foundation.
2. **Step 2:** Service worker implementation (`sw.js`), Web App Manifest, and icon assets.
3. **Step 3:** Backend API routes (pairing, session authentication, mood CRUD, SSE streaming, and Web Push dispatch).
4. **Step 4:** Frontend implementation (API client, push manager, pairing screen, dashboard cards, real-time sync).
5. **Step 5:** End-to-end verification, testing, and production build readiness.
