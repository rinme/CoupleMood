# Mood Sender (CoupleMood)

> A private, cozy warm Progressive Web App (PWA) designed for romantic partners to share current feelings, ambient status, and gentle notes in real-time with zero friction.

---

## Highlights

- **Private Couple Rooms**: Pair effortlessly using a simple 4–12 character shared code. Strict two-partner capacity prevents unauthorized access.
- **Instant Mood Updates**: Choose expressive presets (Loving, Cozy, Sleepy, Excited, Missing you, Calm) or enter custom text and 100-character notes.
- **Real-time Live Sync**: Server-Sent Events (SSE) push partner mood changes instantly without manual refreshing or aggressive battery drain.
- **Offline PWA & Service Worker**: Fully functional offline shell with network-first API caching, offline fallback, and standalone home-screen experience.
- **Web Push Notifications**: Background notifications alert your partner when you update your mood—even if the app is closed.
- **Zero-Config VAPID**: VAPID keys for Web Push are automatically generated and securely persisted in SQLite on first boot.
- **Tactile "Cozy Warm" Aesthetic**: Styled with a warm paper backdrop (`#FAF7F2`), deep espresso typography (`#2D2825`), and dynamic ambient color tints tailored to your partner's current mood.

---

## Getting Started

> **CRITICAL MANDATE**: This project uses **Bun** exclusively. Do not use npm or npx under any circumstance.

### Prerequisites

Ensure [Bun](https://bun.sh) (v1.1+) is installed on your system:
```bash
curl -fsSL https://bun.sh/install | bash
```

### Installation

Clone the repository and install all dependencies:
```bash
git clone https://github.com/rinme/CoupleMood.git
cd CoupleMood
bun install
```

### Building for Production

Compile the TypeScript React frontend into optimized static production assets in `client/dist`:
```bash
bun run build
```

### Running the Production Server

Start the unified production Express server, serving both API endpoints and the client PWA on port 3000:
```bash
bun start
```
Then visit `http://localhost:3000` in your web browser.

### Development Workflow

To run with live hot-reloading:

```bash
# Terminal 1 - Backend Server (Port 3000):
bun server/src/index.ts

# Terminal 2 - Frontend Vite Dev Server (Port 5173 with proxy to 3000):
bun run dev
```

### Running the Full Test Suite

Execute all 88 unit, integration, service worker, component, and end-to-end tests:
```bash
bun run test
# or
bun x vitest run
```

---

## Architecture & Technical Design

```
CoupleMood/
├── client/                     # Frontend React + TypeScript PWA
│   ├── public/
│   │   ├── manifest.json       # PWA manifest with standalone display & icons
│   │   └── sw.js               # Service worker (caching, offline, push listener)
│   ├── src/
│   │   ├── components/         # Header, PairModal, PartnerCard, MyMoodCard, PushPrompt
│   │   ├── api.ts              # Fetch client communicating with /api/*
│   │   ├── sw-register.ts      # Service worker registration & push subscription helpers
│   │   ├── presets.ts          # Default mood presets, color themes, and quick-picks
│   │   ├── App.tsx             # Main layout, SSE listener & state coordinator
│   │   └── main.tsx            # React root mount
│   └── vite.config.ts          # Vite configuration & Happy-DOM test environment
├── server/                     # Backend Express + SQLite
│   ├── src/
│   │   ├── routes/             # auth.ts, mood.ts, push.ts, stream.ts (SSE)
│   │   ├── middleware/         # auth.ts cookie verification
│   │   ├── db.ts               # SQLite schema, queries, VAPID initialization
│   │   ├── push.ts             # Web Push dispatcher with 410/404 auto-pruning
│   │   ├── sse.ts              # Server-Sent Events client connection pool
│   │   ├── app.ts              # Express application factory
│   │   └── index.ts            # Production server entrypoint & SPA static hosting
├── tests/
│   └── e2e.test.ts             # Complete 9-step partner interaction E2E test suite
├── package.json                # Root package configuration with Bun scripts
├── vitest.config.ts            # Vitest multi-project test runner configuration
└── README.md
```

### 1. Database Schema (`better-sqlite3`)

The database is stored in SQLite (defaulting to `data/mood.db` or `:memory:` during tests) with WAL mode enabled:

- **`couples`**: `id` (UUID), `code` (uppercase 4–12 chars, UNIQUE), `created_at`
- **`users`**: `id` (UUID), `couple_id` (FK -> `couples.id`), `nickname`, `slot` (1 or 2), `created_at`
- **`sessions`**: `token` (64-char crypto hex), `user_id` (FK -> `users.id`), `expires_at` (30 days rolling)
- **`moods`**: `user_id` (PK, FK -> `users.id`), `emoji`, `label`, `note` (<= 100 chars), `color_theme`, `updated_at`
- **`push_subscriptions`**: `id` (UUID), `user_id` (FK -> `users.id`), `endpoint` (UNIQUE), `p256dh`, `auth`, `created_at`
- **`server_settings`**: `key` (PK), `value` (persists auto-generated VAPID keys)

Foreign key enforcement is strictly enabled via `PRAGMA foreign_keys = ON;`.

### 2. Service Worker (`client/public/sw.js`)

The PWA Service Worker handles offline caching and background push:
- **Cache Name**: `mood-sender-v1`
- **App Shell Cache**: Cache-first strategy for static assets (`/`, `/manifest.json`, icon assets).
- **API Requests**: Network-first strategy for `/api/*` requests with cache fallback when offline.
- **SSE Stream**: Automatically bypasses service worker cache directly to network for `/api/stream`.
- **Headers on `/sw.js`**: `Service-Worker-Allowed: /` and `Cache-Control: no-cache, no-store, must-revalidate` ensure prompt updates and full-origin scope.
- **Push Handling**: Displays system notifications with partner mood and note. Clicking the notification focuses an open tab or launches the app.

### 3. REST API & Live SSE Stream

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/pair` | POST | Pair user with room code; sets `mood_session` HTTP-only cookie |
| `/api/auth/session` | GET | Validates session cookie; returns user and partner info |
| `/api/auth/unpair` | POST | Deletes active session and clears `mood_session` cookie |
| `/api/mood` | GET | Returns user mood, partner mood, and partner nickname |
| `/api/mood` | POST | Sets/updates mood, triggers partner SSE event and push notification |
| `/api/mood` | DELETE | Clears mood, broadcasts `mood_cleared` event to partner |
| `/api/push/key` | GET | Returns server's public VAPID key |
| `/api/push/subscribe` | POST | Registers browser Web Push subscription |
| `/api/push/unsubscribe` | POST | Removes Web Push subscription |
| `/api/stream` | GET | Real-time Server-Sent Events stream with 25s keepalive ping |

### 4. Web Push & Automatic VAPID Setup

- On first server boot, the application checks if VAPID keys exist in SQLite `server_settings`.
- If missing, standard NIST P-256 EC keys are automatically generated via `web-push.generateVAPIDKeys()` and persisted.
- If you prefer custom keys, provide `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in your environment variables.
- When browser push subscriptions expire or are revoked, web push services respond with `410 Gone` or `404 Not Found`; the server automatically prunes these dead subscriptions from SQLite.

---

## Installing the PWA on Mobile Devices

Mood Sender is optimized to run as an installed standalone application on mobile devices.

### iOS (Safari)

1. Open your hosted Mood Sender URL (or local network IP using HTTPS/localhost) in **Safari**.
2. Tap the **Share** button in the bottom navigation toolbar (the square icon with an upward arrow).
3. Scroll down the menu and tap **Add to Home Screen**.
4. Tap **Add** in the top-right corner.
5. Launch **Mood Sender** directly from your Home Screen. It runs full-screen without Safari browser chrome and supports background Web Push notifications (iOS 16.4+).

### Android (Chrome)

1. Open your hosted Mood Sender URL in **Google Chrome**.
2. Chrome will display an **"Add Mood Sender to Home screen"** prompt at the bottom of the screen.
   *(Alternatively, tap the three-dot menu in the upper-right corner and select **"Install app"** or **"Add to Home screen"**).*
3. Tap **Install** to confirm.
4. Mood Sender will appear in your App Drawer and Home Screen as a native-like app.

---

## Testing Verification

The project includes an exhaustive automated test suite covering all layers:

- **Database Unit Tests** (`server/tests/db.test.ts`): Tables, constraints, VAPID generation, session expiry.
- **Service Worker Tests** (`client/tests/sw.test.ts`, `sw-register.test.ts`): Caching policies, push events, client focus.
- **API & SSE Tests** (`server/tests/api.test.ts`): All routes, cookie auth, SSE stream, push subscription pruning.
- **Client Components & App** (`client/tests/components.test.tsx`, `app.test.tsx`): React components, draft note preservation, SSE listeners.
- **End-to-End Test Suite** (`tests/e2e.test.ts`): Full 9-step partner interaction lifecycle simulating pairing, live mood updates, timestamp verification, clearing, 409 conflict rejection, push simulation, and clean unpairing.

Run tests at any time with:
```bash
bun run test
```

---

## License

MIT (c) CoupleMood Team
