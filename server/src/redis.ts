import { Redis } from '@upstash/redis';

export interface IRedisClient {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, opts?: { ex?: number }): Promise<any>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<number | boolean>;
  scard(key: string): Promise<number>;
  lpush(key: string, ...elements: any[]): Promise<number>;
  lrange<T = any>(key: string, start: number, stop: number): Promise<T[]>;
  ltrim(key: string, start: number, stop: number): Promise<string>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  flushall(): Promise<string>;
  isMock(): boolean;
}

/**
 * In-memory Redis-compatible store for tests and local development when no Upstash credentials exist.
 */
class InMemoryRedisClient implements IRedisClient {
  private kv = new Map<string, { value: any; expiresAt?: number }>();
  private sets = new Map<string, { members: Set<string>; expiresAt?: number }>();
  private lists = new Map<string, { items: any[]; expiresAt?: number }>();

  isMock(): boolean {
    return true;
  }

  private isExpired(entry?: { expiresAt?: number }): boolean {
    if (!entry || !entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.kv.delete(key);
      return null;
    }
    // Deep clone to prevent accidental reference mutation
    return JSON.parse(JSON.stringify(entry.value));
  }

  async set(key: string, value: any, opts?: { ex?: number }): Promise<any> {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
    this.kv.set(key, { value: JSON.parse(JSON.stringify(value)), expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const k of keys) {
      if (this.kv.delete(k)) deleted++;
      if (this.sets.delete(k)) deleted++;
      if (this.lists.delete(k)) deleted++;
    }
    return deleted;
  }

  async keys(pattern: string): Promise<string[]> {
    const now = Date.now();
    const allKeys = new Set<string>();

    for (const [k, v] of this.kv.entries()) {
      if (!v.expiresAt || v.expiresAt > now) allKeys.add(k);
      else this.kv.delete(k);
    }
    for (const [k, v] of this.sets.entries()) {
      if (!v.expiresAt || v.expiresAt > now) allKeys.add(k);
      else this.sets.delete(k);
    }
    for (const [k, v] of this.lists.entries()) {
      if (!v.expiresAt || v.expiresAt > now) allKeys.add(k);
      else this.lists.delete(k);
    }

    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return Array.from(allKeys).filter((k) => regex.test(k));
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let entry = this.sets.get(key);
    if (!entry || this.isExpired(entry)) {
      entry = { members: new Set() };
      this.sets.set(key, entry);
    }
    let added = 0;
    for (const m of members) {
      if (!entry.members.has(m)) {
        entry.members.add(m);
        added++;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const entry = this.sets.get(key);
    if (!entry || this.isExpired(entry)) return 0;
    let removed = 0;
    for (const m of members) {
      if (entry.members.delete(m)) removed++;
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    const entry = this.sets.get(key);
    if (!entry) return [];
    if (this.isExpired(entry)) {
      this.sets.delete(key);
      return [];
    }
    return Array.from(entry.members);
  }

  async sismember(key: string, member: string): Promise<number | boolean> {
    const entry = this.sets.get(key);
    if (!entry || this.isExpired(entry)) return 0;
    return entry.members.has(member) ? 1 : 0;
  }

  async scard(key: string): Promise<number> {
    const entry = this.sets.get(key);
    if (!entry || this.isExpired(entry)) return 0;
    return entry.members.size;
  }

  async lpush(key: string, ...elements: any[]): Promise<number> {
    let entry = this.lists.get(key);
    if (!entry || this.isExpired(entry)) {
      entry = { items: [] };
      this.lists.set(key, entry);
    }
    for (const el of elements) {
      entry.items.unshift(JSON.parse(JSON.stringify(el)));
    }
    return entry.items.length;
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    const entry = this.lists.get(key);
    if (!entry) return [];
    if (this.isExpired(entry)) {
      this.lists.delete(key);
      return [];
    }
    const len = entry.items.length;
    let s = start < 0 ? Math.max(0, len + start) : start;
    let e = stop < 0 ? len + stop : stop;
    if (s > len) return [];
    return entry.items.slice(s, e + 1);
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    const entry = this.lists.get(key);
    if (!entry || this.isExpired(entry)) return 'OK';
    const len = entry.items.length;
    let s = start < 0 ? Math.max(0, len + start) : start;
    let e = stop < 0 ? len + stop : stop;
    entry.items = entry.items.slice(s, e + 1);
    return 'OK';
  }

  async expire(key: string, seconds: number): Promise<number> {
    const expiresAt = Date.now() + seconds * 1000;
    let exists = false;
    if (this.kv.has(key)) {
      this.kv.get(key)!.expiresAt = expiresAt;
      exists = true;
    }
    if (this.sets.has(key)) {
      this.sets.get(key)!.expiresAt = expiresAt;
      exists = true;
    }
    if (this.lists.has(key)) {
      this.lists.get(key)!.expiresAt = expiresAt;
      exists = true;
    }
    return exists ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.kv.get(key) || this.sets.get(key) || this.lists.get(key);
    if (!entry || !entry.expiresAt) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async flushall(): Promise<string> {
    this.kv.clear();
    this.sets.clear();
    this.lists.clear();
    return 'OK';
  }
}

let redisInstance: IRedisClient | null = null;

/**
 * Returns the Redis client. Uses Upstash Redis if UPSTASH_REDIS_REST_URL or KV_REST_API_URL is configured,
 * otherwise falls back to InMemoryRedisClient.
 */
export function getRedis(): IRedisClient {
  if (redisInstance) {
    return redisInstance;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    const realRedis = new Redis({ url, token });
    redisInstance = {
      isMock: () => false,
      get: (k) => realRedis.get(k),
      set: (k, v, opts) => realRedis.set(k, v, opts as any),
      del: (...k) => (realRedis.del as any)(...k),
      keys: (p) => realRedis.keys(p),
      sadd: (k, ...m) => (realRedis.sadd as any)(k, ...m),
      srem: (k, ...m) => (realRedis.srem as any)(k, ...m),
      smembers: (k) => realRedis.smembers(k),
      sismember: (k, m) => realRedis.sismember(k, m),
      scard: (k) => realRedis.scard(k),
      lpush: (k, ...e) => (realRedis.lpush as any)(k, ...e),
      lrange: (k, s, st) => realRedis.lrange(k, s, st),
      ltrim: (k, s, st) => realRedis.ltrim(k, s, st),
      expire: (k, s) => realRedis.expire(k, s),
      ttl: (k) => realRedis.ttl(k),
      flushall: () => realRedis.flushall(),
    };
  } else {
    redisInstance = new InMemoryRedisClient();
  }

  return redisInstance;
}

/**
 * Overrides or resets the Redis client instance (primarily for tests).
 */
export function setRedisClient(client: IRedisClient | null): void {
  redisInstance = client;
}

export function resetRedisMock(): void {
  redisInstance = new InMemoryRedisClient();
}
