import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, expandLikes, normalizeRequest, runDiagnosis } from './analyze';
import { loadResult } from './store';

const IDS = ['vol00001', 'vol00002', 'vol00003', 'vol00004', 'vol00005'];
const TITLES: Record<string, string> = { vol00001: '三体', vol00002: '数学ガール', vol00003: 'ハッカーと画家', vol00004: '地雷グリコ', vol00005: '告白' };

const volume = (id: string, title: string, author = '著者') => ({
  id,
  volumeInfo: { title, authors: [author], description: `${title}の紹介`, infoLink: `https://books.google.com/books?id=${id}` },
});

// DeepSeek と Google Books を模した fetch。DeepSeek に送られた中身も記録する
function stubFetch(deepseekReplies: unknown[]) {
  const sent: { url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('deepseek')) {
        const reply = deepseekReplies.shift();
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
      }
      const byId = url.match(/volumes\/([^?]+)/);
      if (byId) return new Response(JSON.stringify(volume(byId[1], TITLES[byId[1]] ?? '不明')));
      // おすすめの実在確認：『悪人』だけ実在し、『架空の本』は見つからない
      if (decodeURIComponent(url).includes('悪人')) return new Response(JSON.stringify({ items: [volume('real0001', '悪人', '吉田修一')] }));
      return new Response(JSON.stringify({ items: [] }));
    }),
  );
  return sent;
}

const tagging = {
  books: IDS.map((id, i) => ({ id, genre: i < 2 ? 'SF' : 'ミステリー', weights: { mechanism: 3 - (i % 2), lies: i, exhilarating: 2, lecture: 2 }, note: 'メモ' })),
};
const analysis = {
  summary: 'ジャンルはSF。でも惹かれているのは、仕組みが見える瞬間かもしれません。',
  detail: '『告白』からは、人の弱さにも目が向いていそうです。',
  aftertaste: '爽快な読後感が合いそうです。',
  style: '説明を追う語りが好きそうです。',
  hidden: null,
  evidence: [{ book_id: 'vol00001', reason: '科学の前提が揺らぐ一冊です。' }],
  recommendations: [
    { title: '架空の本', author: '誰か', reason: 'ないはずの本です。', tags: ['mechanism'], surprise: false },
    { title: '悪人', author: '吉田修一', reason: '人の弱さを描く一冊です。', tags: ['lies'], surprise: true },
  ],
};

beforeEach(async () => {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  // テストごとに空の保存先を使う（タグの使い回しがテストどうしで混ざらないように）
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'yomisuji-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DATA_DIR;
});

describe('expandLikes', () => {
  it('選択肢を計算用のタグに置き換える', () => {
    expect(expandLikes(['vol00001:moved', 'vol00002:insight'])).toEqual(['vol00001:lingering', 'vol00001:loss', 'vol00002:mechanism']);
  });
});

describe('normalizeRequest', () => {
  it('重複・不正なID・選んでいない本への回答を捨てる', () => {
    const r = normalizeRequest({
      books: [...IDS, IDS[0], '../x'],
      favorite: 'nope',
      likes: ['vol00001:insight', 'vol00001:nope', 'other:honest'],
      disliked: ['vol00001', 'vol00009'],
      seriesTitles: { vol00001: ' 三体 シリーズ ', vol00009: '上下巻', other: '不正' },
    });
    expect(r.books).toEqual(IDS);
    expect(r.favorite).toBe('');
    expect(r.likes).toEqual(['vol00001:insight']);
    expect(r.disliked).toEqual(['vol00009']);
    expect(r.seriesTitles).toEqual({ vol00001: '三体 シリーズ', vol00009: '上下巻' });
  });
  it('5冊未満は受け付けない', () => {
    expect(() => normalizeRequest({ books: IDS.slice(0, 2) })).toThrow(BadRequestError);
  });
});

describe('runDiagnosis', () => {
  it('タグ付け→計算→文章→おすすめの実在確認→保存までつながる', async () => {
    const sent = stubFetch([tagging, analysis]);
    const r = await runDiagnosis({ books: IDS, favorite: 'vol00001', likes: ['vol00001:insight'], seriesTitles: { vol00001: '三体シリーズ' } });

    expect(r.scoring.main).toBe('mechanism');
    expect(r.fallbackText).toBe(false);
    expect(r.text.evidence[0].reason).toBe('科学の前提が揺らぐ一冊です。');
    // 架空の本は Google Books で見つからないので外れる
    expect(r.recommendations.map((x) => x.book.title)).toEqual(['悪人']);
    // 画面に出す本の情報に、内容紹介は含めない
    expect(r.books[0]).not.toHaveProperty('description');
    expect(r.books[0].title).toBe('三体シリーズ');

    const ds = sent.filter((s) => s.url.includes('deepseek'));
    expect(ds).toHaveLength(2);
    expect(ds[0].body).toMatchObject({ model: 'deepseek-flash', response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
    // 出力の上限は本の数に合わせて締めてある
    expect(ds[0].body?.max_tokens).toBe(150 + 120 * IDS.length);
    expect(ds[1].body?.max_tokens).toBe(2700 + 60 * IDS.length);
    // 送るJSONは改行・字下げなしで詰めてある
    const userMsg = (ds[0].body?.messages as { content: string }[])[1].content;
    expect(userMsg).not.toMatch(/\{\n /);

    expect(await loadResult(r.id)).toEqual(r);
  });

  it('文章が検査に2回落ちたら定型文で結果を出す', async () => {
    const bad = { ...analysis, summary: 'あなたの性格は〜' };
    stubFetch([tagging, bad, bad]);
    const r = await runDiagnosis({ books: IDS });
    expect(r.fallbackText).toBe(true);
    expect(r.text.summary).toContain('ジャンルは');
    expect(r.recommendations).toEqual([]);
  });

  it('一度タグを付けた本は保存したものを使い、AIはタグの付いていない本だけに頼む', async () => {
    stubFetch([tagging, analysis]);
    await runDiagnosis({ books: IDS });

    // 2回目：同じ5冊 → タグ付けは呼ばず、分析の1回だけ
    let sent = stubFetch([analysis]);
    await runDiagnosis({ books: IDS });
    expect(sent.filter((s) => s.url.includes('deepseek'))).toHaveLength(1);

    // 3回目：1冊だけ新しい本 → タグ付けはその1冊分だけ
    TITLES.vol00006 = '新しい本';
    const one = { books: [{ id: 'vol00006', genre: 'エッセイ', weights: { lies: 2, warm: 2, inner: 2 }, note: 'メモ' }] };
    sent = stubFetch([one, analysis]);
    await runDiagnosis({ books: [...IDS.slice(1), 'vol00006'] });
    const ds = sent.filter((s) => s.url.includes('deepseek'));
    expect(ds).toHaveLength(2);
    const asked = (ds[0].body?.messages as { content: string }[])[1].content;
    expect(asked).toContain('vol00006');
    expect(asked).not.toContain('vol00002');
  });

  it('タグが欠けた本があれば、その本だけやり直す', async () => {
    const partial = { books: tagging.books.slice(0, 3) };
    const rest = { books: tagging.books.slice(3) };
    const sent = stubFetch([partial, rest, analysis]);
    await runDiagnosis({ books: IDS });
    const ds = sent.filter((s) => s.url.includes('deepseek'));
    expect(ds).toHaveLength(3);
    const retryMsg = (ds[1].body?.messages as { content: string }[])[1].content;
    expect(retryMsg).toContain('vol00004');
    expect(retryMsg).not.toContain('vol00001');
  });
});
