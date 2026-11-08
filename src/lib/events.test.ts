import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { bookCountEvent, dayKey, isEventName } from './events';
import { incrementCounters, loadCounters } from './store';
import { POST } from '@/app/api/track/route';

beforeEach(async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'yomisuji-stats-'));
});

describe('events', () => {
  it('日付は日本時間で区切る', () => {
    expect(dayKey(new Date('2026-11-08T14:59:00Z'))).toBe('2026-11-08');
    expect(dayKey(new Date('2026-11-08T15:00:00Z'))).toBe('2026-11-09');
  });

  it('冊数を区分にする', () => {
    expect([5, 7, 8, 10, 11, 15].map(bookCountEvent)).toEqual(['books_5-7', 'books_5-7', 'books_8-10', 'books_8-10', 'books_11-15', 'books_11-15']);
  });

  it('決められた名前だけを操作として認める', () => {
    expect(isEventName('share_x')).toBe(true);
    expect(isEventName('toString')).toBe(false);
    expect(isEventName('検索語')).toBe(false);
  });
});

describe('回数の保存', () => {
  it('日ごと・操作ごとに足していく', async () => {
    await incrementCounters('2026-11-08', ['search', 'search']);
    await incrementCounters('2026-11-08', ['search', 'share_x']);
    const c = await loadCounters(['2026-11-08', '2026-11-07'], ['search', 'share_x']);
    expect(c['2026-11-08']).toEqual({ search: 3, share_x: 1 });
    expect(c['2026-11-07']).toEqual({});
  });
});

describe('/api/track', () => {
  const post = (body: unknown, ua = 'Mozilla/5.0') =>
    POST(new Request('http://localhost/api/track', { method: 'POST', body: JSON.stringify(body), headers: { 'user-agent': ua, 'cf-connecting-ip': '1.2.3.4' } }));

  it('ブラウザから送ってよい名前だけを数え、サーバーで数える名前や知らない名前は無視する', async () => {
    const res = await post({ events: ['share_x', 'share_x', 'diagnose_done', 'evil', 'search'] });
    expect(res.status).toBe(204);
    const c = await loadCounters([dayKey()], ['share_x', 'diagnose_done', 'search']);
    expect(c[dayKey()]).toEqual({ share_x: 1, search: 1 });
  });

  it('ボットからは数えない', async () => {
    await post({ events: ['share_x'] }, 'Twitterbot/1.0');
    expect((await loadCounters([dayKey()], ['share_x']))[dayKey()]).toEqual({});
  });
});
