# Multi-Device Account Linking via OTP & QR Scan Design Specification

## Overview

This specification details the architecture, data models, security protocols, API endpoints, and user experience for connecting multiple devices to the same user account in **Mood Sender (CoupleMood)**.

Currently, couples pair using a shared couple code (`LOVE-XXXX`). Exactly two user slots exist per couple. If a user wants to access their mood dashboard from a second device (such as a laptop, tablet, or secondary phone), attempting to pair with the same couple code would either consume the partner's slot or fail with `409 Conflict: Couple code is full`.

With this feature, a user already authenticated on **Device A** can generate a secure, short-lived 6-digit OTP and QR code. **Device B** can then either:
1. Scan the QR code with its native phone camera (opening a direct link like `/link?code=123456` that auto-logs in),
2. Scan the QR code using the in-app camera viewfinder on Device B, or
3. Enter the 6-digit OTP manually on Device B.

Once linked, Device B shares the user's identity, can broadcast moods, receive real-time updates from the partner via SSE and Web Push, and synchronize with the user's other devices.

---

## Key Requirements & User Decisions

1. **OTP & QR Code Generation**:
   - Device A requests a 6-digit numeric OTP from the server (`POST /api/auth/device-link/create`).
   - Server returns a 6-digit OTP, expiration timestamp (5 minutes), and direct link URL.
   - Device A renders the OTP, a countdown timer, and a QR code encoding the direct URL (`${window.location.origin}/link?code=${code}`).
2. **Direct QR Link & Camera Scanner**:
   - Scanning the QR code with a native smartphone camera navigates to `/link?code=123456`.
   - On page load, the frontend detects `?code=...`, redeems it automatically, and navigates to the dashboard.
   - Device B also provides an in-app camera viewfinder scanner for users who prefer scanning directly within the web app.
3. **Security & Expiration**:
   - Expiration: Exactly 5 minutes from creation.
   - Single-use: Destroyed immediately upon successful redemption.
   - Rate limiting: Maximum 5 failed attempts per OTP before automatic deletion/lockout.
4. **Session & Logout Control**:
   - "Log Out This Device": Destroys the current device's session token only, leaving other devices and the couple room intact.
   - "Unpair Couple": Completely deletes the couple and destroys all sessions for both partners across all devices.
5. **Real-time SSE Sync Across Own Devices**:
   - When a user changes their mood on Device A, SSE broadcasts to the partner *and* all active connections of the user's other devices, so Device B updates its `myMood` instantly.
6. **Bilingual UI**:
   - Full Thai (default) and English translations for all new modals, buttons, alerts, and instructions.

---

## Data Model & Database Schema

### New SQLite Table: `device_link_otps`

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

### Methods in `server/src/db.ts`

- `createDeviceLinkOtp(userId: string): { code: string; expiresAt: string }`
  - Deletes any existing pending OTPs for this `userId`.
  - Generates a cryptographically random 6-digit numeric string (`100000` to `999999`).
  - Sets `expires_at = Date.now() + 5 * 60 * 1000`.
  - Inserts into `device_link_otps`.
- `verifyDeviceLinkOtp(code: string): PairResult`
  - Validates code format (`/^\d{6}$/`).
  - Queries `device_link_otps`. If not found: throws `404 Not Found: Invalid or expired code`.
  - Checks expiration. If `expires_at <= Date.now()`: deletes record and throws `410 Gone: Code has expired`.
  - Checks `failed_attempts`: If `>= 5`, deletes record and throws `429 Too Many Requests: Too many failed attempts`.
  - Fetches associated `user`, `couple`, and `partner`.
  - Generates a new 32-byte session token (`sessions` table) with 30-day expiry.
  - Deletes the redeemed OTP record.
  - Returns `{ user, couple, partner, token }`.
- `recordOtpFailure(code: string): void`
  - Increments `failed_attempts`. If `>= 5`, deletes the OTP.
- `logoutSession(token: string): void`
  - Deletes the single session matching `token` from `sessions` table.

---

## Backend API Endpoints

### 1. `POST /api/auth/device-link/create`
- **Auth**: Required (`requireAuth` middleware)
- **Response (200 OK)**:
  ```json
  {
    "code": "481923",
    "expiresAt": "2026-09-19T07:45:00.000Z",
    "qrUrl": "https://couple-mood.com/link?code=481923"
  }
  ```

### 2. `POST /api/auth/device-link/verify`
- **Auth**: Public (unauthenticated)
- **Request Body**:
  ```json
  {
    "code": "481923"
  }
  ```
- **Response (200 OK)**:
  - Sets HTTP-only cookie `mood_session=${token}; Path=/; SameSite=Lax; Max-Age=2592000`
  ```json
  {
    "user": { "id": "...", "nickname": "...", "slot": 1 },
    "couple": { "id": "...", "code": "LOVE-9999" },
    "partner": { "id": "...", "nickname": "...", "slot": 2 }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing or malformed 6-digit code.
  - `404 Not Found`: Invalid code.
  - `410 Gone`: Expired code.
  - `429 Too Many Requests`: Too many failed attempts.

### 3. `POST /api/auth/logout`
- **Auth**: Required (`requireAuth`)
- **Action**: Deletes session matching current `req.cookies.mood_session` and clears `mood_session` cookie (`Max-Age=0`).
- **Response (200 OK)**:
  ```json
  { "message": "Logged out from this device" }
  ```

---

## Real-Time SSE Multi-Device Synchronization

In `server/src/sse.ts`:
- Update connection tracking: allow multiple `Response` objects per `userId`.
- Add `notifyUser(userId: string, event: SseEvent)`:
  - Broadcasts `mood_update` or `mood_cleared` to all active SSE streams belonging to `userId`.
- In `server/src/routes/mood.ts`:
  - When a mood is posted or deleted:
    - `notifyPartner(partner.id, event)`
    - `notifyUser(user.id, event)` (updates all user's linked devices in real time).

---

## Frontend UI Architecture

### 1. Device A: "Link New Device" in Settings (`Header.tsx` & `DeviceLinkModal.tsx`)
- In `Header.tsx`'s settings dialog:
  - Add button: "เชื่อมต่ออุปกรณ์ใหม่" / "Link New Device".
  - Clicking opens `DeviceLinkModal`.
- `DeviceLinkModal`:
  - Displays generated QR code (rendered via SVG using `qrcode` or lightweight canvas).
  - Displays formatted 6-digit code with spacing: e.g. `481 923` with a Copy button.
  - Countdown timer: `4:59`, turns amber at `< 1:00`, and rose when expired with a "Generate New Code" refresh button.
  - Instruction copy: "สแกนด้วยกล้องมือถือ หรือใส่รหัส 6 หลักบนอุปกรณ์ใหม่" / "Scan with your camera or enter the 6-digit code on your new device".

### 2. Device B: Welcome Screen (`PairModal.tsx`)
- Tabbed interface at the top of `PairModal`:
  - **Tab 1**: "จับคู่คู่รัก" / "Pair with Partner" (existing couple code & nickname form).
  - **Tab 2**: "เชื่อมต่ออุปกรณ์" / "Link Existing Device":
    - 6-digit OTP input with large, spaced numeric typography.
    - "เปิดกล้องสแกน QR" / "Scan QR Code" button that toggles in-app camera viewfinder (`CameraScannerModal`).
    - "เชื่อมต่อ" / "Connect" submit button.
    - Inline error alerts for expired/invalid codes.

### 3. Native Phone Camera Auto-Login (`App.tsx`)
- On mount: checks `new URLSearchParams(window.location.search).get('code')`.
- If present and valid 6 digits:
  - Displays loading state: "กำลังเชื่อมต่ออุปกรณ์..." / "Connecting device...".
  - Calls `api.auth.verifyDeviceLink(code)`.
  - On success: cleans URL (`history.replaceState`), shows toast, and enters dashboard.
  - On error: displays alert and switches to Link Device tab.

### 4. Separate Device Logout vs. Couple Unpair
- In `Header.tsx` Settings modal:
  - "ออกจากระบบอุปกรณ์นี้" / "Log Out This Device" -> calls `api.auth.logout()`.
  - "ยกเลิกการเชื่อมต่อคู่" / "Unpair Couple" -> calls `api.auth.unpair()`.
