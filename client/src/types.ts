export interface User {
  id: string;
  couple_id?: string;
  nickname: string;
  slot: 1 | 2;
  created_at?: string;
}

export interface Couple {
  id: string;
  code: string;
  created_at?: string;
}

export interface Partner {
  id: string;
  nickname: string;
}

export interface Mood {
  user_id?: string;
  emoji: string;
  label: string;
  note?: string | null;
  color_theme?: string;
  colorTheme?: string;
  updated_at?: string;
}

export interface SessionResponse {
  user: User;
  couple: Couple;
  partner: Partner | null;
}

export interface DeviceLinkCreateResponse {
  code: string;
  expiresAt: string;
  qrUrl: string;
}

export interface MoodResponse {
  myMood: Mood | null;
  partnerMood: Mood | null;
  partner: Partner | null;
}

export interface PairRequest {
  code: string;
  nickname: string;
}

export interface SetMoodRequest {
  emoji: string;
  label: string;
  note?: string | null;
  colorTheme?: string;
}

export interface PresetMood {
  id?: string;
  emoji: string;
  label: string;
  colorTheme: string;
  color_theme?: string;
  description?: string;
}

export type SseEvent =
  | {
      type: 'mood_update';
      mood: Mood;
      user: { id: string; nickname: string };
    }
  | {
      type: 'mood_cleared';
      mood: null;
      user: { id: string; nickname: string };
    }
  | {
      type: 'session_revoked';
      reason?: string;
    };

export interface AdminSessionDetail {
  token: string;
  token_preview: string;
  user_id: string;
  user_nickname: string;
  user_slot: 1 | 2;
  couple_id: string;
  couple_code: string;
  device_info: string;
  user_agent?: string | null;
  created_at: string;
  last_active_at: string;
  is_online: boolean;
}

export interface AdminStats {
  total_couples: number;
  total_users: number;
  total_sessions: number;
  live_connections: number;
}

export interface AdminCoupleMember {
  id: string;
  nickname: string;
  slot: 1 | 2;
  created_at?: string;
  mood?: {
    emoji: string;
    label: string;
    note?: string | null;
    updated_at?: string;
  } | null;
}

export interface AdminCoupleDetail {
  id: string;
  code: string;
  created_at: string;
  members: AdminCoupleMember[];
  active_sessions_count: number;
}


