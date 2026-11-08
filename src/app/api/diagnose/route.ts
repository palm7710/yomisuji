import { NextResponse } from 'next/server';
import { BadRequestError, runDiagnosis } from '@/lib/analyze';
import { AiUnavailableError, isConfigured } from '@/lib/deepseek';
import { InvalidAiOutputError } from '@/lib/prompts';
import type { DiagnoseRequest } from '@/lib/types';
import { bookCountEvent, dayKey } from '@/lib/events';
import { incrementCounters } from '@/lib/store';

// DeepSeek を2回呼ぶので時間がかかる（Vercel などで関数の制限時間を延ばす）
export const maxDuration = 60;

// 使いすぎを防ぐ、IPごとの簡易な回数制限（1つのサーバーの中だけで数える）
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: '診断の準備ができていません（DEEPSEEK_API_KEY が未設定です）' }, { status: 503 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (limited(ip)) {
    return NextResponse.json({ error: '短い時間に何度も診断されました。少し時間をおいてからお試しください' }, { status: 429 });
  }

  let body: DiagnoseRequest;
  try {
    body = (await req.json()) as DiagnoseRequest;
  } catch {
    return NextResponse.json({ error: '送られた内容を読み取れませんでした' }, { status: 400 });
  }

  try {
    const result = await runDiagnosis(body);
    await incrementCounters(dayKey(), ['diagnose_done', bookCountEvent(result.books.length)]);
    return NextResponse.json({ id: result.id });
  } catch (e) {
    await incrementCounters(dayKey(), ['diagnose_error']);
    if (e instanceof BadRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof AiUnavailableError || e instanceof InvalidAiOutputError) {
      console.error('[diagnose]', e);
      return NextResponse.json({ error: 'AIが混み合っているようです。少し時間をおいてもう一度お試しください' }, { status: 503 });
    }
    console.error('[diagnose]', e);
    return NextResponse.json({ error: '診断中にエラーが起きました。もう一度お試しください' }, { status: 500 });
  }
}
