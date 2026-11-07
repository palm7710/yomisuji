import { describe, expect, it } from 'vitest';
import { score, type TaggedBook } from './scoring';
import { fallbackText, InvalidAiOutputError, validateAnalysis, validateTagging, type AnalysisContext } from './prompts';

describe('validateTagging', () => {
  it('知らないタグ・範囲外の重みを取り除き、ジャンルを一覧に合わせる', () => {
    const r = validateTagging(
      { books: [{ id: 'a', genre: 'SF', weights: { mechanism: 3.4, foo: 2, lies: 9, warm: 0 }, note: 'メモ' }] },
      ['a'],
    );
    expect(r[0].weights).toEqual({ mechanism: 3, lies: 3 });
    expect(r[0].genre).toBe('SF');
  });
  it('一覧にないジャンルは「その他」', () => {
    expect(validateTagging({ books: [{ id: 'a', genre: '宇宙', weights: { mechanism: 2 } }] }, ['a'])[0].genre).toBe('その他');
  });
  it('タグが付かなかった本があればエラー（やり直しの合図）', () => {
    expect(() => validateTagging({ books: [{ id: 'a', weights: { mechanism: 2 } }] }, ['a', 'b'])).toThrow(InvalidAiOutputError);
  });
  it('面白さの核がひとつもない付け方は採らない', () => {
    expect(() => validateTagging({ books: [{ id: 'a', weights: { warm: 3 } }] }, ['a'])).toThrow(InvalidAiOutputError);
  });
  it('JSONの形が違えばエラー', () => {
    expect(() => validateTagging({ items: [] }, ['a'])).toThrow(InvalidAiOutputError);
  });
});

const tb = (id: string, title: string, w: TaggedBook['weights']): TaggedBook => ({ id, title, genre: 'ミステリー', weights: w });
const books = [
  tb('a', '告白', { lies: 3, bitter: 3, inner: 3 }),
  tb('b', '白夜行', { lies: 3, loss: 2, bitter: 3, ensemble: 3 }),
  tb('c', '火車', { lies: 2, loss: 2, lingering: 2, document: 1 }),
  tb('d', '十角館の殺人', { reversal: 3, unsettling: 2, ensemble: 2 }),
  tb('e', '罪の声', { lies: 2, organization: 2, document: 3 }),
];
const ctx: AnalysisContext = {
  scoring: score({ books, disliked: [], likes: [] }),
  books: books.map((x) => ({ id: x.id, title: x.title, author: '著者', genre: x.genre, note: 'メモ', likedTags: [], favorite: false })),
};
const good = {
  summary: 'ジャンルはミステリー。でも惹かれているのは、人が隠しているものかもしれません。',
  detail: '『白夜行』などからは、失ったあとの歩みにも目が向いていそうです。',
  aftertaste: '苦い後味が合いそうです。',
  style: '内面に入り込む語りが好きそうです。',
  hidden: null,
  evidence: [{ book_id: 'a', reason: '人の弱さが中心にある一冊です。' }, { book_id: 'zzz', reason: '関係ない' }],
  recommendations: [
    { title: '『悪人』', author: '吉田修一', reason: '人の弱さを描く一冊です。', tags: ['lies', 'nope'], surprise: true },
    { title: '告白', author: '湊かなえ', reason: '選んだ本そのもの', tags: [] },
  ],
};

describe('validateAnalysis', () => {
  it('正しい返り値を受け取り、知らない本ID・選んだ本と同じおすすめ・知らないタグを捨てる', () => {
    const r = validateAnalysis(good, ctx);
    expect(r.evidence.map((e) => e.bookId)).toEqual(['a']);
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]).toMatchObject({ title: '悪人', tags: ['lies'], surprise: true });
  });
  it('選んでいない本の題名が説明に出てきたらエラー', () => {
    expect(() => validateAnalysis({ ...good, detail: '『ハリー・ポッター』のような物語が好きそうです。' }, ctx)).toThrow(InvalidAiOutputError);
  });
  it('避けたい言葉があればエラー', () => {
    expect(() => validateAnalysis({ ...good, summary: 'あなたの性格は暗いです。' }, ctx)).toThrow(InvalidAiOutputError);
  });
  it('長すぎる文はエラー、少し長い文は切り詰める', () => {
    expect(() => validateAnalysis({ ...good, style: 'あ'.repeat(200) }, ctx)).toThrow(InvalidAiOutputError);
    expect(validateAnalysis({ ...good, style: 'あ'.repeat(80) }, ctx).style.length).toBe(70);
  });
  it('定型文は選んだ本の題名だけを使う', () => {
    const f = fallbackText(ctx);
    expect(f.summary).toContain('ミステリー');
    expect(() => validateAnalysis({ ...f, hidden: f.hidden ?? null, evidence: [], recommendations: [] }, ctx)).not.toThrow();
  });
});
