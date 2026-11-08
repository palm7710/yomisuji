// ブラウザから送られた操作の回数を数える。決められた名前（src/lib/events.ts）だけ受け付ける
import { dayKey, EVENTS, isEventName } from '@/lib/events';
import { incrementCounters } from '@/lib/store';

// 送りすぎを防ぐ、IPごとの簡易な回数制限（1つのサーバーの中だけで数える。IPは保存しない）
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 200;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') ?? '';
  if (/bot|crawl|spider|preview|headless/i.test(ua)) return new Response(null, { status: 204 });
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (limited(ip)) return new Response(null, { status: 204 });

  let events: unknown[] = [];
  try {
    const body = (await req.json()) as { events?: unknown };
    events = Array.isArray(body.events) ? body.events : [];
  } catch {
    return new Response(null, { status: 400 });
  }
  // ブラウザから送ってよい名前だけ・同じ名前は1回だけ・一度に5個まで
  const valid = [...new Set(events.filter(isEventName))].filter((e) => EVENTS[e].client).slice(0, 5);
  await incrementCounters(dayKey(), valid);
  return new Response(null, { status: 204 });
}
