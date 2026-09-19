// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminPage } from '../src/components/AdminPage.js';
import { I18nProvider } from '../src/i18n/index.js';
import { api, ApiError } from '../src/api.js';

describe('Admin UI Components (AdminPage)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders login form when unauthenticated', async () => {
    vi.spyOn(api.admin, 'check').mockRejectedValue(new ApiError(401, 'Unauthorized'));

    render(
      <I18nProvider initialLanguage="en">
        <AdminPage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Access')).toBeDefined();
      expect(screen.getByPlaceholderText('Enter admin password...')).toBeDefined();
      expect(screen.getByRole('button', { name: /Sign In/i })).toBeDefined();
    });
  });

  it('handles invalid password error and displays attempts remaining', async () => {
    vi.spyOn(api.admin, 'check').mockRejectedValue(new ApiError(401, 'Unauthorized'));
    vi.spyOn(api.admin, 'login').mockRejectedValue(
      new ApiError(401, 'Incorrect password', { attemptsLeft: 3 })
    );

    render(
      <I18nProvider initialLanguage="en">
        <AdminPage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter admin password...')).toBeDefined();
    });

    const passwordInput = screen.getByPlaceholderText('Enter admin password...');
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    const signInBtn = screen.getByRole('button', { name: /Sign In/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(screen.getByText(/Incorrect password \(3 attempts remaining\)/i)).toBeDefined();
    });
  });

  it('handles lockout error (429) with wait countdown message', async () => {
    vi.spyOn(api.admin, 'check').mockRejectedValue(new ApiError(401, 'Unauthorized'));
    vi.spyOn(api.admin, 'login').mockRejectedValue(
      new ApiError(429, 'Locked out', { locked: true, waitSeconds: 900 })
    );

    render(
      <I18nProvider initialLanguage="en">
        <AdminPage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter admin password...')).toBeDefined();
    });

    const passwordInput = screen.getByPlaceholderText('Enter admin password...');
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    const signInBtn = screen.getByRole('button', { name: /Sign In/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please wait 900s before trying again/i)).toBeDefined();
    });
  });

  it('renders dashboard with stats and sessions list when authenticated', async () => {
    vi.spyOn(api.admin, 'check').mockResolvedValue({ authenticated: true });
    vi.spyOn(api.admin, 'getStats').mockResolvedValue({
      total_couples: 5,
      total_users: 10,
      total_sessions: 12,
      live_connections: 3,
    });
    vi.spyOn(api.admin, 'getSessions').mockResolvedValue({
      sessions: [
        {
          token: 'token1234567890abcdef',
          token_preview: 'token1...cdef',
          user_id: 'u1',
          user_nickname: 'Alex',
          user_slot: 1,
          couple_id: 'c1',
          couple_code: 'LOVE24',
          device_info: 'iPhone · Safari',
          user_agent: 'Mozilla/5.0...',
          created_at: '2026-09-19T10:00:00.000Z',
          last_active_at: '2026-09-19T10:05:00.000Z',
          is_online: true,
        },
        {
          token: 'tokenabcdef9876543210',
          token_preview: 'tokena...3210',
          user_id: 'u2',
          user_nickname: 'Jordan',
          user_slot: 2,
          couple_id: 'c1',
          couple_code: 'LOVE24',
          device_info: 'macOS · Chrome',
          user_agent: 'Mozilla/5.0...',
          created_at: '2026-09-19T09:00:00.000Z',
          last_active_at: '2026-09-19T09:30:00.000Z',
          is_online: false,
        },
      ],
    });

    render(
      <I18nProvider initialLanguage="en">
        <AdminPage />
      </I18nProvider>
    );

    await waitFor(() => {
      // Check stats cards
      expect(screen.getByText('5')).toBeDefined(); // Total couples
      expect(screen.getByText('10')).toBeDefined(); // Total users
      expect(screen.getByText('12')).toBeDefined(); // Total sessions
      expect(screen.getByText('3')).toBeDefined(); // Live connections

      // Check session details
      expect(screen.getByText('Alex')).toBeDefined();
      expect(screen.getByText('iPhone · Safari')).toBeDefined();
      expect(screen.getByText('Online (Live)')).toBeDefined();

      expect(screen.getByText('Jordan')).toBeDefined();
      expect(screen.getByText('macOS · Chrome')).toBeDefined();
      expect(screen.getByText('Offline')).toBeDefined();
    });
  });

  it('filters sessions using the search bar', async () => {
    vi.spyOn(api.admin, 'check').mockResolvedValue({ authenticated: true });
    vi.spyOn(api.admin, 'getStats').mockResolvedValue({
      total_couples: 2,
      total_users: 2,
      total_sessions: 2,
      live_connections: 1,
    });
    vi.spyOn(api.admin, 'getSessions').mockResolvedValue({
      sessions: [
        {
          token: 'tok-1',
          token_preview: 'tok-1...',
          user_id: 'u1',
          user_nickname: 'Sarah',
          user_slot: 1,
          couple_id: 'c1',
          couple_code: 'SARAH1',
          device_info: 'Android · Chrome',
          user_agent: 'Mozilla/5.0...',
          created_at: '2026-09-19T10:00:00.000Z',
          last_active_at: '2026-09-19T10:05:00.000Z',
          is_online: true,
        },
        {
          token: 'tok-2',
          token_preview: 'tok-2...',
          user_id: 'u2',
          user_nickname: 'Michael',
          user_slot: 1,
          couple_id: 'c2',
          couple_code: 'MIKE99',
          device_info: 'Windows · Edge',
          user_agent: 'Mozilla/5.0...',
          created_at: '2026-09-19T09:00:00.000Z',
          last_active_at: '2026-09-19T09:30:00.000Z',
          is_online: false,
        },
      ],
    });

    render(
      <I18nProvider initialLanguage="en">
        <AdminPage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Sarah')).toBeDefined();
      expect(screen.getByText('Michael')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search by nickname, couple code, or device...');
    fireEvent.change(searchInput, { target: { value: 'android' } });

    expect(screen.getByText('Sarah')).toBeDefined();
    expect(screen.queryByText('Michael')).toBeNull();
  });

  it('triggers revoke session confirmation dialog and calls revokeSession', async () => {
    vi.spyOn(api.admin, 'check').mockResolvedValue({ authenticated: true });
    vi.spyOn(api.admin, 'getStats').mockResolvedValue({
      total_couples: 1,
      total_users: 1,
      total_sessions: 1,
      live_connections: 0,
    });
    vi.spyOn(api.admin, 'getSessions').mockResolvedValue({
      sessions: [
        {
          token: 'target-session-token',
          token_preview: 'target...oken',
          user_id: 'u1',
          user_nickname: 'Sam',
          user_slot: 1,
          couple_id: 'c1',
          couple_code: 'SAM123',
          device_info: 'iPhone · Safari',
          created_at: '2026-09-19T10:00:00.000Z',
          last_active_at: '2026-09-19T10:05:00.000Z',
          is_online: false,
        },
      ],
    });
    const revokeSpy = vi.spyOn(api.admin, 'revokeSession').mockResolvedValue({ success: true });

    render(
      <I18nProvider initialLanguage="en">
        <AdminPage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Sam')).toBeDefined();
    });

    // Click Revoke Device button
    const revokeBtn = screen.getByRole('button', { name: /Revoke Device/i });
    fireEvent.click(revokeBtn);

    // Confirmation modal appears
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to revoke this device session\?/i)).toBeDefined();
    });

    // Click confirm (Delete button)
    const confirmDeleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(revokeSpy).toHaveBeenCalledWith('target-session-token');
    });
  });
});
