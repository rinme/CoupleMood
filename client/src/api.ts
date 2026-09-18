import {
  PairRequest,
  SessionResponse,
  MoodResponse,
  SetMoodRequest,
  Mood,
  PresetMood,
} from './types.js';

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  let data: any = null;
  const contentType = response.headers?.get ? response.headers.get('content-type') : null;
  if (typeof response.json === 'function') {
    if (!contentType || contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
  }

  if (!response.ok) {
    const errorMsg = data?.error || response.statusText || 'Request failed';
    throw new ApiError(response.status, errorMsg, data);
  }

  return data as T;
}

export const api = {
  auth: {
    async pair(req: PairRequest): Promise<SessionResponse> {
      return fetchApi<SessionResponse>('/api/auth/pair', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async getSession(): Promise<SessionResponse> {
      return fetchApi<SessionResponse>('/api/auth/session', {
        method: 'GET',
      });
    },

    async unpair(): Promise<{ success: boolean }> {
      return fetchApi<{ success: boolean }>('/api/auth/unpair', {
        method: 'POST',
      });
    },
  },

  mood: {
    async getMoods(): Promise<MoodResponse> {
      return fetchApi<MoodResponse>('/api/mood', {
        method: 'GET',
      });
    },

    async setMood(req: SetMoodRequest): Promise<{ mood: Mood }> {
      return fetchApi<{ mood: Mood }>('/api/mood', {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },

    async clearMood(): Promise<{ ok: boolean }> {
      return fetchApi<{ ok: boolean }>('/api/mood', {
        method: 'DELETE',
      });
    },
  },

  push: {
    async getPublicKey(): Promise<{ publicKey: string }> {
      return fetchApi<{ publicKey: string }>('/api/push/key', {
        method: 'GET',
      });
    },

    async subscribe(sub: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }): Promise<{ success: boolean }> {
      return fetchApi<{ success: boolean }>('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(sub),
      });
    },

    async unsubscribe(endpoint: string): Promise<{ success: boolean }> {
      return fetchApi<{ success: boolean }>('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
      });
    },
  },

  presets: {
    async getPresets(lang?: string): Promise<PresetMood[] & { presets: PresetMood[] }> {
      const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
      const data = await fetchApi<{ presets: any[] }>(`/api/presets${query}`, {
        method: 'GET',
      });
      const list: PresetMood[] = (data.presets || []).map((p) => ({
        id: p.id,
        emoji: p.emoji,
        label: p.label,
        colorTheme: p.colorTheme || p.color_theme || 'rose',
        color_theme: p.color_theme || p.colorTheme || 'rose',
      }));
      const res = [...list] as any;
      res.presets = list;
      return res;
    },

    async savePresets(presets: PresetMood[]): Promise<PresetMood[] & { presets: PresetMood[] }> {
      const payload = presets.map((p) => ({
        id: p.id,
        emoji: p.emoji,
        label: p.label,
        colorTheme: p.colorTheme || p.color_theme || 'rose',
      }));
      const data = await fetchApi<{ presets: any[] }>('/api/presets', {
        method: 'PUT',
        body: JSON.stringify({ presets: payload }),
      });
      const list: PresetMood[] = (data.presets || []).map((p) => ({
        id: p.id,
        emoji: p.emoji,
        label: p.label,
        colorTheme: p.colorTheme || p.color_theme || 'rose',
        color_theme: p.color_theme || p.colorTheme || 'rose',
      }));
      const res = [...list] as any;
      res.presets = list;
      return res;
    },

    async resetPresets(lang?: string): Promise<PresetMood[] & { presets: PresetMood[]; message?: string }> {
      const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
      const data = await fetchApi<{ message: string; presets: any[] }>(`/api/presets/reset${query}`, {
        method: 'DELETE',
      });
      const list: PresetMood[] = (data.presets || []).map((p) => ({
        id: p.id,
        emoji: p.emoji,
        label: p.label,
        colorTheme: p.colorTheme || p.color_theme || 'rose',
        color_theme: p.color_theme || p.colorTheme || 'rose',
      }));
      const res = [...list] as any;
      res.presets = list;
      res.message = data.message;
      return res;
    },
  },

  async getPresets(lang?: string): Promise<PresetMood[] & { presets: PresetMood[] }> {
    return api.presets.getPresets(lang);
  },

  async savePresets(presets: PresetMood[]): Promise<PresetMood[] & { presets: PresetMood[] }> {
    return api.presets.savePresets(presets);
  },

  async resetPresets(lang?: string): Promise<PresetMood[] & { presets: PresetMood[]; message?: string }> {
    return api.presets.resetPresets(lang);
  },
};
