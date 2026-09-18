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
  created_at?: string;
  expires_at: string;
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
