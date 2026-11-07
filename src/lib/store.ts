// 保存まわり。
// - 診断結果：AIの結果は毎回変わるので、シェアされたURLでは保存した結果をそのまま見せる
// - 本ごとのタグ：一度AIが付けたタグを保存し、同じ本が選ばれたらAIを呼ばずに使い回す（使用量を減らす）
// 保存先：UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN があれば Upstash Redis（本番向け）。
//         なければ DATA_DIR（省略時 .data/）にJSONファイルで保存（手元の開発用。サーバーレス環境では消える）

import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BookTagging } from './prompts';
import type { DiagnosisResult } from './types';

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const RESULT_TTL_SECONDS = 60 * 60 * 24 * 365;
const TAG_TTL_SECONDS = 60 * 60 * 24 * 180;
/** タグ付けの指示やタグの種類を変えたら上げる（古いタグを使い回さないため） */
export const TAG_CACHE_VERSION = 'v1';

const dataDir = () => process.env.DATA_DIR ?? path.join(process.cwd(), '.data');

export function isValidResultId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,32}$/.test(id);
}

export function newResultId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Buffer.from(bytes).toString('base64url');
}

function upstash(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** Cloudflare Workers では、書き込み可能なファイルシステムの代わりにKVを使う。 */
async function cloudflareKv(): Promise<KvNamespace | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { YOMISUJI_DATA?: KvNamespace }).YOMISUJI_DATA ?? null;
  } catch {
    // Node.jsでのローカル開発・テストでは cloudflare:workers は存在しない
    return null;
  }
}

async function upstashCommand(up: { url: string; token: string }, command: (string | number)[]): Promise<unknown> {
  const res = await fetch(up.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${up.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return ((await res.json()) as { result?: unknown }).result;
}

// ---------------------------------------------------------------------------
// 診断結果
// ---------------------------------------------------------------------------

export async function saveResult(result: DiagnosisResult): Promise<void> {
  const up = upstash();
  if (up) {
    await upstashCommand(up, ['SET', `r:${result.id}`, JSON.stringify(result), 'EX', RESULT_TTL_SECONDS]);
    return;
  }
  const kv = await cloudflareKv();
  if (kv) {
    await kv.put(`r:${result.id}`, JSON.stringify(result), { expirationTtl: RESULT_TTL_SECONDS });
    return;
  }
  const dir = path.join(dataDir(), 'results');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${result.id}.json`), JSON.stringify(result));
}

export async function loadResult(id: string): Promise<DiagnosisResult | null> {
  if (!isValidResultId(id)) return null;
  const up = upstash();
  if (up) {
    try {
      const raw = await upstashCommand(up, ['GET', `r:${id}`]);
      return typeof raw === 'string' ? (JSON.parse(raw) as DiagnosisResult) : null;
    } catch {
      return null;
    }
  }
  const kv = await cloudflareKv();
  if (kv) {
    try {
      const raw = await kv.get(`r:${id}`);
      return raw ? (JSON.parse(raw) as DiagnosisResult) : null;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir(), 'results', `${id}.json`), 'utf8')) as DiagnosisResult;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 本ごとのタグ（volumeId ごと）
// ---------------------------------------------------------------------------

const tagKey = (volumeId: string) => `t:${TAG_CACHE_VERSION}:${volumeId}`;

/** 保存済みのタグを返す。見つからない本は含まれない。読めなくても例外は投げない（AIで付け直すだけ） */
export async function loadTags(volumeIds: string[]): Promise<Map<string, BookTagging>> {
  const out = new Map<string, BookTagging>();
  if (volumeIds.length === 0) return out;
  try {
    const up = upstash();
    if (up) {
      const raws = (await upstashCommand(up, ['MGET', ...volumeIds.map(tagKey)])) as (string | null)[];
      raws.forEach((raw, i) => {
        if (raw) out.set(volumeIds[i], JSON.parse(raw) as BookTagging);
      });
      return out;
    }
    const kv = await cloudflareKv();
    if (kv) {
      const raws = await Promise.all(volumeIds.map((id) => kv.get(tagKey(id))));
      raws.forEach((raw, i) => {
        if (raw) out.set(volumeIds[i], JSON.parse(raw) as BookTagging);
      });
      return out;
    }
    const dir = path.join(dataDir(), 'tags', TAG_CACHE_VERSION);
    await Promise.all(
      volumeIds.map(async (id) => {
        try {
          out.set(id, JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as BookTagging);
        } catch {
          /* まだない */
        }
      }),
    );
  } catch (e) {
    console.warn(`[store] loadTags failed: ${(e as Error).message}`);
  }
  return out;
}

export async function saveTags(tags: BookTagging[]): Promise<void> {
  if (tags.length === 0) return;
  try {
    const up = upstash();
    if (up) {
      await Promise.all(tags.map((t) => upstashCommand(up, ['SET', tagKey(t.id), JSON.stringify(t), 'EX', TAG_TTL_SECONDS])));
      return;
    }
    const kv = await cloudflareKv();
    if (kv) {
      await Promise.all(tags.map((t) => kv.put(tagKey(t.id), JSON.stringify(t), { expirationTtl: TAG_TTL_SECONDS })));
      return;
    }
    const dir = path.join(dataDir(), 'tags', TAG_CACHE_VERSION);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all(tags.map((t) => fs.writeFile(path.join(dir, `${t.id}.json`), JSON.stringify(t))));
  } catch (e) {
    console.warn(`[store] saveTags failed: ${(e as Error).message}`);
  }
}
