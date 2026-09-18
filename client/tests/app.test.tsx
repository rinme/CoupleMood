// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../src/App.js';
import { api } from '../src/api.js';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (this.onopen && !this.closed) this.onopen();
    }, 10);
  }

  close() {
    this.closed = true;
  }
}

describe('App Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    delete (globalThis as any).EventSource;
  });

  it('renders PairModal when user is not authenticated', async () => {
    vi.spyOn(api.auth, 'getSession').mockRejectedValue(new Error('Unauthorized'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Enter Room')).toBeTruthy();
      expect(screen.getByLabelText('Couple Code')).toBeTruthy();
    });
  });

  it('renders Dashboard, connects SSE, and updates on real-time SSE event', async () => {
    const mockSession = {
      user: { id: 'u1', nickname: 'Taylor', slot: 1 as const },
      couple: { id: 'c1', code: 'LOVE-1234' },
      partner: { id: 'u2', nickname: 'Alex' },
    };

    const mockMoods = {
      myMood: { emoji: '🥰', label: 'Loving', color_theme: 'rose' },
      partnerMood: { emoji: '☕', label: 'Cozy', color_theme: 'amber' },
      partner: { id: 'u2', nickname: 'Alex' },
    };

    vi.spyOn(api.auth, 'getSession').mockResolvedValue(mockSession);
    vi.spyOn(api.mood, 'getMoods').mockResolvedValue(mockMoods);

    render(<App />);

    // Waits for dashboard to load
    await waitFor(() => {
      expect(screen.getByText('LOVE-1234')).toBeTruthy();
      expect(api.mood.getMoods).toHaveBeenCalled();
      expect(screen.getByText(/Alex.*Mood/)).toBeTruthy();
      expect(screen.getAllByText('Cozy').length).toBeGreaterThanOrEqual(1);
    });

    // Verify SSE was instantiated
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    const es = MockEventSource.instances[0];

    // Simulate real-time SSE update from Alex
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'mood_update',
          mood: {
            emoji: '🥳',
            label: 'Excited',
            note: 'Passed my exam!',
            colorTheme: 'amber',
            updated_at: new Date().toISOString(),
          },
          user: { id: 'u2', nickname: 'Alex' },
        }),
      });
    });

    // Check that partner mood updated
    await waitFor(() => {
      expect(screen.getAllByText('Excited').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('"Passed my exam!"')).toBeTruthy();
      expect(screen.getByText(/Alex updated their mood/i)).toBeTruthy();
    });
  });

  it('handles broadcast mood and unpairing flow', async () => {
    const mockSession = {
      user: { id: 'u1', nickname: 'Taylor', slot: 1 as const },
      couple: { id: 'c1', code: 'LOVE-1234' },
      partner: { id: 'u2', nickname: 'Alex' },
    };

    vi.spyOn(api.auth, 'getSession').mockResolvedValue(mockSession);
    vi.spyOn(api.mood, 'getMoods').mockResolvedValue({
      myMood: null,
      partnerMood: null,
      partner: { id: 'u2', nickname: 'Alex' },
    });
    vi.spyOn(api.mood, 'setMood').mockResolvedValue({
      mood: {
        emoji: '😴',
        label: 'Sleepy',
        colorTheme: 'purple',
        note: 'Taking a nap',
      },
    });
    vi.spyOn(api.auth, 'unpair').mockResolvedValue({ success: true });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('How are you feeling right now?')).toBeTruthy();
    });

    // Select Sleepy preset
    const sleepyBtn = screen.getByRole('button', { name: /😴 Sleepy/i });
    fireEvent.click(sleepyBtn);

    // Enter note
    const noteInput = screen.getByPlaceholderText(/dreaming of a latte/i);
    fireEvent.change(noteInput, { target: { value: 'Taking a nap' } });

    // Submit broadcast
    const broadcastBtn = screen.getByRole('button', { name: /Broadcast to Partner/i });
    fireEvent.click(broadcastBtn);

    await waitFor(() => {
      expect(api.mood.setMood).toHaveBeenCalledWith({
        emoji: '😴',
        label: 'Sleepy',
        note: 'Taking a nap',
        colorTheme: 'purple',
      });
    });

    // Open settings and unpair
    const settingsBtn = screen.getByLabelText('Couple Settings');
    fireEvent.click(settingsBtn);

    const unpairBtn = screen.getByText('Unpair Couple');
    fireEvent.click(unpairBtn);

    await waitFor(() => {
      expect(api.auth.unpair).toHaveBeenCalled();
      expect(screen.getByText('Enter Room')).toBeTruthy();
    });
  });
});
