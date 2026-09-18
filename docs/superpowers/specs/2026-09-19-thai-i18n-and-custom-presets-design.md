# Design Specification: Thai i18n & Customizable Mood Presets

**Date:** 2026-09-19  
**Status:** Approved  
**Author:** rinme <rinmesk@yahoo.com> & Antigravity  

---

## 1. Overview & Objectives

This specification defines the internationalization (i18n) subsystem and dynamic user reaction management for **Mood Sender** (CoupleMood).
Key goals:
1. Make **Thai (`th`)** the primary default language across the entire application, timestamps, and notifications, with an optional toggle for English (`en`).
2. Update default mood presets to prioritize **"Missing you" (คิดถึง)** and **"Hungry" (หิว)** alongside common couple statuses.
3. Allow users to add, edit, and delete their reaction presets based on personal preference, persisted per user in the SQLite database.
4. Provide an intuitive "Manage Reactions" modal on the dashboard for seamless preset customization.

---

## 2. Internationalization (i18n) Architecture

### 2.1 Language Configuration
- **Default Language:** Thai (`'th'`).
- **Secondary Language:** English (`'en'`).
- **Persistence:** LocalStorage key `'couple_mood_lang'`. On first visit, defaults to `'th'`.
- **Toggle:** Language switcher pill (`TH | EN`) displayed in the Header and Settings dropdown.

### 2.2 Translation Dictionaries (`client/src/i18n/`)
- `client/src/i18n/th.ts` (Thai)
- `client/src/i18n/en.ts` (English)
- `client/src/i18n/index.ts` (Types, Context, and `useTranslation()` hook)

### 2.3 Relative Timestamp Formatting
Relative time localization in `formatRelativeTime(dateInput, lang)`:
- Thai:
  - `< 60s`: "เมื่อสักครู่"
  - `< 60m`: `${min} นาทีที่แล้ว`
  - `< 24h`: `${hours} ชม. ที่แล้ว`
  - `1 day`: "เมื่อวาน"
  - `< 7 days`: `${days} วันที่แล้ว`
- English:
  - `< 60s`: "Just now"
  - `< 60m`: `${min}m ago`
  - `< 24h`: `${hours}h ago`
  - `1 day`: "Yesterday"
  - `< 7 days`: `${days}d ago`

---

## 3. Updated Default Presets

Default mood presets prioritize **"Missing you"** and **"Hungry"**:

1. `🥺` **คิดถึง** (Missing you) — Theme: `rose`
2. `🤤` **หิว** (Hungry) — Theme: `amber`
3. `🥰` **รักนะ** (Loving) — Theme: `rose`
4. `😴` **ง่วง** (Sleepy) — Theme: `purple`
5. `💻` **ยุ่งมาก** (Busy) — Theme: `indigo`
6. `☕` **ชิลๆ** (Cozy) — Theme: `amber`
7. `🤒` **ไม่สบาย** (Sick) — Theme: `teal`

---

## 4. Database Schema & Backend API

### 4.1 Database Migration (SQLite)
New table `user_presets`:
```sql
CREATE TABLE IF NOT EXISTS user_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  label TEXT NOT NULL,
  color_theme TEXT DEFAULT 'rose',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_presets_user ON user_presets(user_id, sort_order);
```

### 4.2 API Routes (`server/src/routes/presets.ts`)
- `GET /api/presets`:
  - Returns user's customized presets from `user_presets` table.
  - If no custom records exist, returns the default presets based on user's language query param (`?lang=th|en`).
- `PUT /api/presets`:
  - Body: `{ presets: Array<{ id?: string, emoji: string, label: string, colorTheme: string }> }`
  - Replaces all presets for the authenticated user atomically within a database transaction.
  - Enforces: minimum 1 preset, maximum 16 presets, label max length 30 chars.
- `DELETE /api/presets/reset`:
  - Clears all rows in `user_presets` for current user so defaults are used again.

---

## 5. Frontend UI ("Manage Reactions" Modal)

### 5.1 Entry Button
Located on the `MyMoodCard` header:
- Thai: "จัดการ" (with a small settings or edit icon)
- English: "Manage"

### 5.2 Modal (`ManagePresetsModal.tsx`)
- **Preset List**: Each reaction is displayed in a card with its emoji, label, and theme color swatch.
- **Actions**:
  - **Edit**: Tap to edit emoji, label (max 30 chars), and select from 6 themes (`rose`, `amber`, `indigo`, `purple`, `emerald`, `teal`).
  - **Delete**: Trash icon removes the preset (guarded to maintain at least 1 reaction).
  - **Add New**: "+ เพิ่มความรู้สึก" button opens a simple creation form with emoji input, label, and theme picker.
  - **Reset**: "คืนค่าเริ่มต้น" restores the 7 default presets.
- Saves changes directly to the backend via `PUT /api/presets`.

---

## 6. Global Constraints
- STRICT CONSTRAINT: USE BUN ONLY. NEVER USE NPM OR NPX.
- Runtime: Bun 1.4.2
- Maintain backward compatibility for existing pair and mood records.
- All existing and new tests must pass (`bun run test`).
