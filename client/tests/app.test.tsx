// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../src/App.js';
import { api } from '../src/api.js';

// Mock EventSource supporting W3C addEventListener/removeEventListener and dispatchEvent
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;
  listeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (this.onopen && !this.closed) this.onopen();
    }, 10);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string; data?: string }) {
    if (this.closed) return false;
    const set = this.listeners.get(event.type);
    if (set) {
      for (const listener of set) {
        listener(event as any);
      }
    }
    if (event.type === 'message' && this.onmessage) {
      this.onmessage(event as any);
    }
    return true;
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

  it('renders Dashboard, connects SSE, and handles named SSE events (mood_update and mood_cleared)', async () => {
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

    // Verify SSE was instantiated and registered named event listeners
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    const es = MockEventSource.instances[0];
    expect(es.listeners.get('mood_update')?.size).toBeGreaterThan(0);
    expect(es.listeners.get('mood_cleared')?.size).toBeGreaterThan(0);

    // 1. Simulate named SSE event 'mood_update' from Alex
    act(() => {
      es.dispatchEvent({
        type: 'mood_update',
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

    // 2. Simulate named SSE event 'mood_cleared' from Alex
    act(() => {
      es.dispatchEvent({
        type: 'mood_cleared',
        data: JSON.stringify({
          type: 'mood_cleared',
          mood: null,
          user: { id: 'u2', nickname: 'Alex' },
        }),
      });
    });

    // Check that partner mood was cleared
    await waitFor(() => {
      expect(screen.getByText(/Alex cleared their mood/i)).toBeTruthy();
      expect(screen.getByText(/Waiting for Alex/i)).toBeTruthy();
    });
  });

  it('handles broadcast mood and unpairing flow with SSE cleanup', async () => {
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

    const es = MockEventSource.instances[0];

    // Open settings and unpair
    const settingsBtn = screen.getByLabelText('Couple Settings');
    fireEvent.click(settingsBtn);

    const unpairBtn = screen.getByText('Unpair Couple');
    fireEvent.click(unpairBtn);

    await waitFor(() => {
      expect(api.auth.unpair).toHaveBeenCalled();
      expect(screen.getByText('Enter Room')).toBeTruthy();
      expect(es.closed).toBe(true);
    });
  });
});
