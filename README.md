# Mood Sender (CoupleMood)

> A private, cozy warm Progressive Web App (PWA) designed for romantic partners to share current feelings, ambient status, and gentle notes in real-time with zero friction.

---

## Highlights

- **Private Couple Rooms**: Pair effortlessly using a simple 4-12 character shared code. Strict two-partner capacity prevents unauthorized access.
- **Multi-Device Account Linking**: Connect your account to laptops, tablets, and secondary phones via 6-digit OTP or QR code scan. Each device maintains an independent session with real-time sync.
- **Thai Default Localization & English Switcher**: Fully localized in Thai by default with intuitive relative timestamps and a tactile TH | EN header toggle.
- **Customizable Mood Reactions**: Tailor your reaction grid (1-16 items) via the "Manage Reactions" modal with custom emoji, label, and palette themes, saved per user in SQLite.
- **Updated Couple Presets**: Default presets prioritize intimate daily moments including "Missing you" and "Hungry".
- **Real-time Live Sync**: Server-Sent Events (SSE) push partner mood changes instantly across all connected devices without manual refreshing or aggressive battery drain.
- **Offline PWA & Service Worker**: Fully functional offline shell with network-first API caching, offline fallback, and standalone home-screen experience.
- **Web Push Notifications**: Background notifications alert your partner when you update your mood--even if the app is closed.
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

Execute all 209 unit, integration, service worker, component, edge proxy, and end-to-end tests across 20 test suites:
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
│   │   ├── components/         # Header, PairModal, PartnerCard, MyMoodCard, PushPrompt, ManagePresetsModal
│   │   ├── i18n/               # Thai (th) & English (en) dictionaries, context, hook
│   │   ├── api.ts              # Fetch client communicating with /api/*
│   │   ├── sw-register.ts      # Service worker registration & push subscription helpers
│   │   ├── presets.ts          # Default presets, themes, and relative time formatter
│   │   ├── App.tsx             # Main layout, SSE listener & state coordinator
│   │   └── main.tsx            # React root mount
│   └── vite.config.ts          # Vite configuration & Happy-DOM test environment
├── server/                     # Backend Express + SQLite
│   ├── src/
│   │   ├── routes/             # auth.ts, device-link.ts, mood.ts, presets.ts, push.ts, stream.ts (SSE)
│   │   ├── middleware/         # auth.ts cookie verification
│   │   ├── db.ts               # SQLite schema, queries, VAPID initialization
│   │   ├── push.ts             # Web Push dispatcher with 410/404 auto-pruning
│   │   ├── sse.ts              # Server-Sent Events client connection pool
│   │   ├── app.ts              # Express application factory
│   │   └── index.ts            # Production server entrypoint & SPA static hosting
├── tests/
│   ├── e2e.test.ts             # Complete 9-step partner interaction E2E test suite
│   ├── e2e-presets.test.ts     # E2E test for Thai defaults, custom presets, SSE, reset
│   └── e2e-multi-device.test.ts # E2E test for multi-device OTP linking, logout, and SSE sync
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
- **`user_presets`**: `id` (UUID), `user_id` (FK -> `users.id`), `emoji`, `label`, `color_theme`, `sort_order`, `created_at`
- **`device_link_otps`**: `code` (6-digit numeric, PK), `user_id` (FK -> `users.id`), `expires_at` (5-minute TTL), `failed_attempts` (lockout at 5)
- **`push_subscriptions`**: `id` (UUID), `user_id` (FK -> `users.id`), `endpoint` (UNIQUE), `p256dh`, `auth`, `created_at`
- **`server_settings`**: `key` (PK), `value` (persists auto-generated VAPID keys)

Foreign key enforcement is strictly enabled via `PRAGMA foreign_keys = ON;`.

### 2. Service Worker (`client/public/sw.js`)

The PWA Service Worker handles offline caching and background push:
- **Cache Name**: `mood-sender-v2`
- **Navigation Requests**: Network-first strategy for HTML documents with offline cache fallback to avoid serving stale chunk references.
- **App Shell & Assets Cache**: Cache-first strategy for static assets (`/manifest.json`, icon assets, hashed JS/CSS).
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
| `/api/auth/logout` | POST | Logs out current device only; other device sessions remain active |
| `/api/auth/device-link/create` | POST | Generates 6-digit OTP and QR URL for linking another device (authenticated) |
| `/api/auth/device-link/verify` | POST | Redeems 6-digit OTP to create a new session on a second device (public) |
| `/api/mood` | GET | Returns user mood, partner mood, and partner nickname |
| `/api/mood` | POST | Sets/updates mood, triggers partner SSE event and push notification |
| `/api/mood` | DELETE | Clears mood, broadcasts `mood_cleared` event to partner |
| `/api/presets` | GET | Returns customized or default presets for user (`?lang=th\|en`) |
| `/api/presets` | PUT | Saves customized presets atomically (1–16 items) |
| `/api/presets/reset` | DELETE | Resets user presets to defaults (`?lang=th\|en`) |
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

## Internationalization & Customizable Mood Presets

### Thai Language by Default with English Switcher

- **Default Language**: Thai (th) is the primary language across all views, pairing forms, modals, toasts, and relative timestamps.
- **Tactile Language Toggle**: A clean, tactile TH | EN switcher in the Header and Settings modal allows instant switching between Thai and English.
- **Persistence**: User language preference is saved in localStorage under `couple_mood_lang` and automatically restored on subsequent visits.
- **Localized Timestamps**: Relative times adapt dynamically based on the active language:
  - Thai: "เมื่อสักครู่", "5 นาทีที่แล้ว", "2 ชม. ที่แล้ว", "เมื่อวาน", "3 วันที่แล้ว"
  - English: "Just now", "5m ago", "2h ago", "Yesterday", "3d ago"

### Customizable Mood Presets

- **Default Couple Presets**: Prioritize intimate everyday check-ins:
  1. Missing you (คิดถึง) - Rose theme
  2. Hungry (หิว) - Amber theme
  3. Loving (รักนะ) - Rose theme
  4. Sleepy (ง่วง) - Purple theme
  5. Busy (ยุ่งมาก) - Indigo theme
  6. Cozy (ชิลๆ) - Amber theme
  7. Sick (ไม่สบาย) - Teal theme
- **Manage Reactions Modal**:
  - Open by clicking "Manage" (จัดการ) in the "My Mood" card header.
  - Add new reactions with custom emoji, text label (up to 30 characters), and 6 color themes (Rose, Amber, Indigo, Purple, Emerald, Teal).
  - Edit or delete reactions with strict validation enforcing 1 to 16 reactions.
  - Reset to original defaults anytime via the "Reset to Defaults" button.
  - Custom presets are persisted per user in the SQLite `user_presets` table and sync seamlessly across devices.

---

## Multi-Device Account Linking

Mood Sender supports connecting your account to multiple devices simultaneously. Each device maintains its own independent session, and mood updates sync in real-time across all your connected devices and your partner's devices.

### How It Works

1. **Generate a Link Code**: On your already-signed-in device, open Settings and tap "Link New Device". The app generates a 6-digit OTP code and displays a QR code.
2. **Connect the New Device**: On your second device (laptop, tablet, or another phone), you have three options:
   - **Scan the QR code** with your phone's native camera -- the link URL opens the app and connects automatically.
   - **Use the in-app QR scanner** on the "Link Existing Device" tab in the pairing screen.
   - **Enter the 6-digit code manually** on the "Link Existing Device" tab.
3. **Session Created**: The new device receives its own session cookie and immediately enters the dashboard with full access to your couple room.

### Security

- OTP codes expire after 5 minutes and are single-use (deleted upon successful redemption).
- After 5 failed verification attempts on a code, it is locked out and deleted (HTTP 429).
- Expired codes return HTTP 410; invalid codes return HTTP 404.

### Device Logout vs Couple Unpair

- **Log Out This Device**: Removes only the current device's session. All other devices (yours and your partner's) remain fully connected. Use this when switching between devices or removing access from a shared computer.
- **Unpair Couple**: Deletes the calling device's session and clears the session cookie. Use this to disconnect from your couple room entirely.

---

## Deploying to Vercel with Upstash Redis

CoupleMood is 100% serverless on Vercel with zero external server dependencies:
- **Frontend PWA**: Hosted on Vercel's global edge CDN with preconfigured caching rules in `vercel.json`.
- **Serverless API (`api/index.ts`)**: Serverless function running the Express API, automatically routed via `vercel.json` rewrites.
- **Database**: Serverless Redis powered by [Upstash](https://upstash.com) (or Vercel KV).

### Step 1: Create an Upstash Redis Database

1. Sign up or log into [Upstash](https://console.upstash.com) (or add the Upstash / Vercel KV integration directly in your Vercel project settings).
2. Create a free serverless Redis database.
3. In the database details, locate the **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### Step 2: Deploy to Vercel

1. Push your repository to GitHub.
2. In the Vercel Dashboard, click **Add New Project** and import **CoupleMood**.
3. Under **Environment Variables**, add:
   - `UPSTASH_REDIS_REST_URL`: Your Upstash REST URL (or use Vercel KV)
   - `UPSTASH_REDIS_REST_TOKEN`: Your Upstash REST token
   - `ADMIN_PASSWORD`: Secure password for the admin dashboard (defaults to `admin123` if omitted)
   - *(Optional)* `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: Custom Web Push credentials (auto-generated in Redis if omitted)
4. Click **Deploy**.
5. Your PWA will be live at `https://your-project.vercel.app` with instant global delivery, offline support, and serverless Redis persistence!

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

The project includes an exhaustive automated test suite covering all layers (181 tests across 18 test suites):

- **Database Unit Tests** (`server/tests/db.test.ts`): Tables, constraints, user presets table, VAPID generation, session expiry.
- **Device Link Unit Tests** (`server/tests/device-link.test.ts`): OTP generation, verification, expiration, lockout, session creation, logout.
- **Service Worker Tests** (`client/tests/sw.test.ts`, `sw-register.test.ts`): Caching policies, v2 cache cleanup, network-first navigation, push events, client focus.
- **API & Presets Tests** (`server/tests/api.test.ts`, `server/tests/presets.test.ts`): All routes, cookie auth, custom presets validation, reset, SSE stream, push subscription pruning.
- **Vercel Edge Proxy Tests** (`tests/vercel-proxy.test.ts`): Dynamic backend URL resolution, cookie header forwarding, error handling.
- **Client Components & App** (`client/tests/components.test.tsx`, `app.test.tsx`, `manage-presets.test.tsx`, `device-link-components.test.tsx`, `i18n.test.ts`): React components, Thai/English dictionary parity, language toggle, presets modal, device link modals, camera scanner, PairModal tabs, draft note preservation, SSE listeners.
- **End-to-End Test Suites** (`tests/e2e.test.ts`, `tests/e2e-presets.test.ts`, `tests/e2e-multi-device.test.ts`): Full partner interaction lifecycle, live SSE broadcasts, push notifications, default Thai presets, custom preset addition, multi-device OTP linking, single device logout, and unpairing.

Run tests at any time with:
```bash
bun run test
```

---

## License

MIT (c) CoupleMood Team

