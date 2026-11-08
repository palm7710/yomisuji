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
  books: books.map((x) => ({ id: x.id, title: x.title, author: '著者', genre: x.genre, note: 'メモ', likedTags: [], likedLabels: [], favorite: false })),
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
  it('おすすめの読み味・引っかかるかもを受け取り、他人の感想のような文や長すぎる文はその項目だけ捨てる', () => {
    const recs = [
      { title: '悪人', author: '吉田修一', reason: '人の弱さを描く一冊です。', feel: '読み終えたあと、静かに胸が重くなる。', caution: '救いの少なさが気になるかも。', tags: ['lies'], surprise: false },
      { title: '模倣犯', author: '宮部みゆき', reason: '人の事情を追う一冊です。', feel: '多くの読者が涙した名作。', caution: 'あ'.repeat(200), tags: [], surprise: false },
    ];
    const r = validateAnalysis({ ...good, recommendations: recs }, ctx);
    expect(r.recommendations[0]).toMatchObject({ feel: '読み終えたあと、静かに胸が重くなる。', caution: '救いの少なさが気になるかも。' });
    expect(r.recommendations[1].title).toBe('模倣犯');
    expect(r.recommendations[1].feel).toBeUndefined();
    expect(r.recommendations[1].caution).toBeUndefined();
  });

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
  it('詳しい分析は項目ごとに検査し、だめな項目だけ捨てる', () => {
    const r = validateAnalysis(
      {
        ...good,
        catchphrase: '人の奥をのぞく人',
        patterns: [{ title: '人物から入る', body: '気持ちの動きから本に入っていきそうです。' }, { title: '', body: '空の名前は捨てる' }],
        connections: [{ book_ids: ['a', 'b'], text: 'どちらも語られない心を描いています。' }, { book_ids: ['a', 'zzz'], text: '知らない本' }],
        per_book: [{ book_id: 'a', point: '語り手ごとの視点に惹かれていそうです。' }, { book_id: 'a', point: '重複' }, { book_id: 'b', point: '『ハリー・ポッター』と同じ' }],
        mismatch: 'あなたの性格では無理です。',
        how_to_choose: '紹介文に「真相」とある本を探すとよさそうです。',
      },
      ctx,
    );
    expect(r.catchphrase).toBe('人の奥をのぞく人');
    expect(r.patterns).toHaveLength(1);
    expect(r.connections).toEqual([{ bookIds: ['a', 'b'], text: 'どちらも語られない心を描いています。' }]);
    expect(r.perBook).toEqual([{ bookId: 'a', point: '語り手ごとの視点に惹かれていそうです。' }]);
    expect(r.mismatch).toBeUndefined();
    expect(r.howToChoose).toContain('真相');
  });
  it('詳しい分析がなくても、基本の項目がそろっていれば通る', () => {
    const r = validateAnalysis(good, ctx);
    expect(r.patterns).toEqual([]);
    expect(r.catchphrase).toBeUndefined();
  });
});
