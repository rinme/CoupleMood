# Thai i18n & Customizable Mood Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Thai (th) internationalization as the default language with an English (en) toggle, update default mood presets to prioritize "Missing you" and "Hungry", and allow users to add, edit, and delete reaction presets with database persistence.

**Architecture:** Extend SQLite schema with `user_presets` table and provide REST endpoints (`/api/presets`). In the frontend, introduce a lightweight React i18n context providing Thai translations by default with an instant language toggle pill in the Header, update default reaction presets, and build a "Manage Reactions" modal with full CRUD capabilities.

**Tech Stack:** Bun 1.4.2, Node.js/Express, TypeScript, better-sqlite3, React 19, Vite, Tailwind CSS, Lucide icons, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-19-thai-i18n-and-custom-presets-design.md`](file:///home/rinme/Projects/CoupleMood/docs/superpowers/specs/2026-09-19-thai-i18n-and-custom-presets-design.md)

## Global Constraints
- STRICT CONSTRAINT: USE BUN ONLY. NEVER USE NPM OR NPX.
- Runtime: Bun 1.4.2
- Default language: Thai (`'th'`), with English (`'en'`) toggle
- New default presets must feature `🥺 คิดถึง (Missing you)` and `🤤 หิว (Hungry)` prominently
- User reaction customizations must persist in SQLite per user
- All existing functionality and test suites must continue passing cleanly

---

### Task 1: Backend Database Migration & Custom Presets API

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/types.ts`
- Create: `server/src/routes/presets.ts`
- Modify: `server/src/app.ts`
- Create: `server/tests/presets.test.ts`

**Interfaces:**
- Produces:
  - Database table `user_presets`
  - `getUserPresets(userId: string): UserPreset[]`
  - `setUserPresets(userId: string, presets: Array<{ emoji: string, label: string, colorTheme: string }>): UserPreset[]`
  - `resetUserPresets(userId: string): void`
  - `GET /api/presets`
  - `PUT /api/presets`
  - `DELETE /api/presets/reset`

- [ ] **Step 1: Write integration tests for presets API**

Write `server/tests/presets.test.ts`:
1. `GET /api/presets`: returns default presets (with Missing you and Hungry) when user has no custom presets.
2. `PUT /api/presets`: saves custom presets, enforces label length <= 30 and non-empty emoji.
3. `GET /api/presets`: returns updated custom presets.
4. `DELETE /api/presets/reset`: clears custom presets so defaults are returned.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run server/tests/presets.test.ts`  
Expected: FAIL (endpoints/methods not yet implemented)

- [ ] **Step 3: Implement database methods and routes**

Implement:
- `user_presets` table in `server/src/db.ts`
- Database helpers in `server/src/db.ts`
- `presets.ts` router in `server/src/routes/presets.ts`
- Mount `/api/presets` in `server/src/app.ts`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run server/tests/presets.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: implement user custom presets database table and API routes"
```

---

### Task 2: Frontend i18n Subsystem (Thai Default & English Toggle)

**Files:**
- Create: `client/src/i18n/types.ts`
- Create: `client/src/i18n/th.ts`
- Create: `client/src/i18n/en.ts`
- Create: `client/src/i18n/index.tsx`
- Modify: `client/src/presets.ts`
- Create: `client/tests/i18n.test.ts`

**Interfaces:**
- Produces:
  - `I18nProvider` and `useTranslation()` hook
  - `Language` type (`'th' | 'en'`)
  - `formatRelativeTime(date, lang)` with Thai and English time strings

- [ ] **Step 1: Write unit tests for i18n and localized relative time**

Write `client/tests/i18n.test.ts`:
1. Verifies all keys exist in both `th.ts` and `en.ts`.
2. Tests `formatRelativeTime` with `'th'` ("เมื่อสักครู่", "5 นาทีที่แล้ว", "2 ชม. ที่แล้ว", "เมื่อวาน").
3. Tests `formatRelativeTime` with `'en'` ("Just now", "5m ago", "2h ago", "Yesterday").

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run client/tests/i18n.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement translation dictionaries and provider**

Implement:
- `th.ts` and `en.ts` dictionaries
- `I18nProvider` with localStorage persistence and default to `'th'`
- Update `formatRelativeTime` in `presets.ts` to accept `lang?: Language`

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run client/tests/i18n.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/ client/src/presets.ts client/tests/i18n.test.ts
git commit -m "feat: add Thai and English i18n subsystem and relative time localization"
```

---

### Task 3: Default Presets Update & "Manage Reactions" Modal

**Files:**
- Modify: `client/src/presets.ts`
- Modify: `client/src/api.ts`
- Create: `client/src/components/ManagePresetsModal.tsx`
- Modify: `client/src/components/MyMoodCard.tsx`
- Create: `client/tests/manage-presets.test.tsx`

**Interfaces:**
- Produces:
  - Updated default presets prioritizing `🥺 คิดถึง (Missing you)` and `🤤 หิว (Hungry)`
  - `api.getPresets()`, `api.savePresets()`, `api.resetPresets()`
  - `ManagePresetsModal` component allowing edit, add, delete, and reset of presets
  - "จัดการ" (Manage) button in `MyMoodCard`

- [ ] **Step 1: Write component tests for ManagePresetsModal and MyMoodCard**

Write `client/tests/manage-presets.test.tsx`:
1. Modal displays current presets.
2. User can delete a preset (safeguard prevents deleting last remaining preset).
3. User can edit an existing preset (emoji, label, theme).
4. User can add a new preset.
5. User can trigger "คืนค่าเริ่มต้น" (Reset to defaults).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run client/tests/manage-presets.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement ManagePresetsModal, API helpers, and MyMoodCard integration**

Implement:
- `api.getPresets`, `savePresets`, `resetPresets` in `client/src/api.ts`
- `ManagePresetsModal.tsx` with modal dialog, add/edit form, delete action, theme selector, and reset button
- Integrate into `MyMoodCard.tsx` with "จัดการ" button and dynamic preset rendering

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run client/tests/manage-presets.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/
git commit -m "feat: implement Manage Reactions modal and updated default presets"
```

---

### Task 4: Complete UI Localization, E2E Integration & Verification

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Header.tsx`
- Modify: `client/src/components/PairModal.tsx`
- Modify: `client/src/components/PartnerCard.tsx`
- Modify: `client/src/components/PushPrompt.tsx`
- Create: `tests/e2e-presets.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces:
  - Full application rendered in Thai by default
  - Language toggle (`TH | EN`) in Header
  - End-to-end integration test verifying Thai language, presets API, custom reactions, and live broadcast

- [ ] **Step 1: Write E2E integration test for Thai language and custom presets**

Write `tests/e2e-presets.test.ts`:
1. Tests couple pairing and verifies default presets contain "คิดถึง" and "หิว".
2. Adds custom preset "อยากกอด" (Hug me) via `PUT /api/presets`.
3. Broadcasts custom preset and verifies partner receives updated mood via SSE.
4. Resets presets and confirms original defaults are restored.

- [ ] **Step 2: Connect i18n across all components and add Language Toggle in Header**

Update:
- `Header.tsx`: add `TH | EN` toggle button and translate labels.
- `PairModal.tsx`: translate pairing forms and error alerts.
- `PartnerCard.tsx`: translate status card and pass current `lang` to `formatRelativeTime`.
- `PushPrompt.tsx`: translate notification prompt.
- `App.tsx`: wrap with `I18nProvider`.

- [ ] **Step 3: Verify all test suites and production build with Bun**

Run:
```bash
bun run test
bun run build
```
Expected: All 11 test suites pass (100+ tests) and production build succeeds cleanly.

- [ ] **Step 4: Update README.md documentation**

Document:
- Default Thai language and English toggle.
- Customizable mood reactions and how to use the "Manage Reactions" modal.

- [ ] **Step 5: Commit**

```bash
git add client/ tests/ README.md
git commit -m "feat: complete Thai i18n localization, Header language toggle, and E2E verification"
```
