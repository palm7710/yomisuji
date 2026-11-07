// 診断結果の保存。AIの結果は毎回変わるので、シェアされたURLでは保存した結果をそのまま見せる。
// - UPSTASH_REDIS_REST_URL と UPSTASH_REDIS_REST_TOKEN があれば Upstash Redis（本番向け）
// - なければ .data/results/ にJSONファイルで保存（手元の開発用。サーバーレス環境では消える）

import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiagnosisResult } from './types';

const TTL_SECONDS = 60 * 60 * 24 * 365;
const DIR = path.join(process.cwd(), '.data', 'results');

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

export async function saveResult(result: DiagnosisResult): Promise<void> {
  const up = upstash();
  if (up) {
    const res = await fetch(`${up.url}/set/r:${result.id}?EX=${TTL_SECONDS}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${up.token}` },
      body: JSON.stringify(result),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`結果を保存できませんでした（${res.status}）`);
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${result.id}.json`), JSON.stringify(result));
}

export async function loadResult(id: string): Promise<DiagnosisResult | null> {
  if (!isValidResultId(id)) return null;
  const up = upstash();
  if (up) {
    const res = await fetch(`${up.url}/get/r:${id}`, { headers: { authorization: `Bearer ${up.token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    return json.result ? (JSON.parse(json.result) as DiagnosisResult) : null;
  }
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), 'utf8')) as DiagnosisResult;
  } catch {
    return null;
  }
}
