import { describe, expect, it } from 'vitest';
import { BOOKS, BOOK_BY_ID } from '@/data/books';
import { ALL_TAGS, CORE_TAGS } from '@/data/tags';
import { diagnose, InvalidInputError, normalizeInput } from './diagnose';
import { inputFromParams, resultPath } from './selection';

const sample = {
  books: ['santai', 'sugaku', 'hacker', 'rokunin', 'jirai', 'hanzawa'],
  favorite: 'santai',
  likes: ['santai:0', 'sugaku:0', 'jirai:0'],
};

describe('作品データ', () => {
  it('IDが重複していない', () => {
    expect(new Set(BOOKS.map((b) => b.id)).size).toBe(BOOKS.length);
  });
  it('どの本にも面白さの核のタグが1つ以上あり、重みは1〜3', () => {
    for (const b of BOOKS) {
      expect(CORE_TAGS.some((t) => b.weights[t]), b.id).toBe(true);
      for (const w of Object.values(b.weights)) expect([1, 2, 3]).toContain(w);
    }
  });
  it('「どこが好き？」の選択肢は既知のタグだけを指す', () => {
    for (const b of BOOKS) for (const o of b.likes) for (const t of o.tags) expect(ALL_TAGS).toContain(t);
  });
  it('どの面白さの核にも、重み3の本が2冊以上ある', () => {
    for (const t of CORE_TAGS) expect(BOOKS.filter((b) => b.weights[t] === 3).length, t).toBeGreaterThanOrEqual(2);
  });
});

describe('diagnose', () => {
  it('『三体』『数学ガール』などを選ぶと「仕組みを解く人」になる', () => {
    const d = diagnose(sample);
    expect(d.main).toBe('mechanism');
    expect(d.typeName).toBe('仕組みを解く人');
    expect(d.sub).toBe('gamesmanship');
    expect(d.aftertaste).toBe('exhilarating');
    expect(d.modifier).toBe('爽快に、');
    expect(d.text.summary).toContain('仕組み');
  });

  it('同じ入力なら、順番が違っても同じ結果になる', () => {
    const a = diagnose(sample);
    const b = diagnose({ ...sample, books: [...sample.books].reverse(), likes: [...sample.likes].reverse() });
    expect(b).toEqual(a);
  });

  it('得点はすべて0〜100の整数', () => {
    const d = diagnose(sample);
    for (const t of ALL_TAGS) {
      expect(Number.isInteger(d.scores[t])).toBe(true);
      expect(d.scores[t]).toBeGreaterThanOrEqual(0);
      expect(d.scores[t]).toBeLessThanOrEqual(100);
    }
  });

  it('根拠の本は選んだ本からメインタグに効いた順に最大3冊', () => {
    const d = diagnose(sample);
    expect(d.evidence.length).toBeLessThanOrEqual(3);
    expect(d.evidence[0].bookId).toBe('santai');
    for (const e of d.evidence) expect(sample.books).toContain(e.bookId);
    expect(d.evidence[0].likedLabels).toContain('世界のルールがひっくり返る');
  });

  it('おすすめは選んでいない本から3冊で、意外な一冊は選んだ本にないジャンル', () => {
    const d = diagnose(sample);
    expect(d.recommendations).toHaveLength(3);
    const genres = new Set(sample.books.map((id) => BOOK_BY_ID[id].genre));
    for (const r of d.recommendations) expect(sample.books).not.toContain(r.bookId);
    const surprise = d.recommendations.find((r) => r.surprise);
    if (surprise) expect(genres.has(BOOK_BY_ID[surprise.bookId].genre)).toBe(false);
  });

  it('いちばん好きな本と「どこが好き？」で結果が動く', () => {
    const base = { books: ['konbini', 'shikkaku', 'kokuhaku', 'hanzawa', 'rokuyon', 'karei'] };
    const plain = diagnose(base);
    const pushed = diagnose({ ...base, favorite: 'hanzawa', likes: ['hanzawa:0', 'rokuyon:0', 'karei:0'] });
    expect(pushed.scores.organization).toBeGreaterThan(plain.scores.organization);
  });

  it('合わなかった本はその本のタグを下げる', () => {
    const base = { books: ['santai', 'sugaku', 'hacker', 'hail', 'jirai'] };
    const d1 = diagnose(base);
    const d2 = diagnose({ ...base, disliked: ['geb', 'goal'] });
    expect(d2.scores.mechanism).toBeLessThan(d1.scores.mechanism);
  });

  it('文芸中心の選び方では反転やはみ出し者などが上位に来る', () => {
    const d = diagnose({ books: ['konbini', 'shikkaku', 'raimugi', 'rufu', 'hibana'] });
    expect(d.main).toBe('outsider');
    expect(d.majorityGenre).toBe('文芸');
  });

  it('5冊未満はエラー', () => {
    expect(() => diagnose({ books: ['santai', 'sugaku'] })).toThrow(InvalidInputError);
  });

  it('知らないIDや選んでいない本への回答は捨てる', () => {
    const n = normalizeInput({ ...sample, books: [...sample.books, 'nope'], likes: ['dare:0', 'santai:9', 'santai:1'] });
    expect(n.books).not.toContain('nope');
    expect(n.likes).toEqual(['santai:1']);
  });
});

describe('URLとの変換', () => {
  it('結果ページのURLから同じ入力に戻せる', () => {
    const path = resultPath(sample);
    const params = Object.fromEntries(new URL(path, 'https://example.com').searchParams);
    expect(normalizeInput(inputFromParams(params))).toEqual(normalizeInput(sample));
  });
});
