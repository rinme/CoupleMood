export interface Couple {
  id: string;
  code: string;
  created_at?: string;
}

export interface User {
  id: string;
  couple_id: string;
  nickname: string;
  slot: 1 | 2;
  created_at?: string;
}

export interface Session {
  token: string;
  user_id: string;
  user_agent?: string | null;
  device_info?: string | null;
  last_active_at?: string;
  created_at?: string;
  expires_at: string;
}

export interface AdminSession {
  token: string;
  created_at?: string;
  expires_at: string;
}

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


export interface Mood {
  user_id: string;
  emoji: string;
  label: string;
  note?: string | null;
  color_theme?: string;
  updated_at?: string;
}

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at?: string;
}

export interface ServerSetting {
  key: string;
  value: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PairResult {
  user: User;
  couple: Couple;
  partner: User | null;
  token: string;
}

export interface SessionResult {
  user: User;
  couple: Couple;
  partner: User | null;
}

export interface UserPreset {
  id: string;
  user_id: string;
  emoji: string;
  label: string;
  color_theme?: string;
  sort_order: number;
  created_at?: string;
}

export interface DeviceLinkOtp {
  code: string;
  user_id: string;
  expires_at: string;
  failed_attempts: number;
  created_at?: string;
}

