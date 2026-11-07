import { describe, expect, it } from 'vitest';
import { ALL_TAGS } from '@/data/tags';
import { score, type TaggedBook } from './scoring';

const b = (id: string, genre: TaggedBook['genre'], weights: TaggedBook['weights']): TaggedBook => ({ id, title: id, genre, weights });

const books: TaggedBook[] = [
  b('santai', 'SF', { mechanism: 3, immersion: 3, gamesmanship: 2, unsettling: 2, lecture: 2 }),
  b('sugaku', '科学・数学', { mechanism: 3, warm: 2, dialogue: 3, lecture: 3 }),
  b('hacker', 'ノンフィクション', { mechanism: 2, outsider: 2, lecture: 3 }),
  b('rokunin', 'ミステリー', { gamesmanship: 3, reversal: 3, lies: 2, ensemble: 2 }),
  b('jirai', 'ミステリー', { gamesmanship: 3, mechanism: 2, exhilarating: 3, dialogue: 2 }),
  b('hanzawa', 'ビジネス', { organization: 3, gamesmanship: 3, exhilarating: 3 }),
];

describe('score', () => {
  it('仕組み寄りの好きなところを選ぶと「仕組みを解く人」になる', () => {
    const r = score({ books, disliked: [], favorite: 'santai', likes: ['santai:mechanism', 'sugaku:mechanism', 'jirai:mechanism'] });
    expect(r.main).toBe('mechanism');
    expect(r.typeName).toBe('仕組みを解く人');
    expect(r.evidence[0].bookId).toBe('santai');
    expect(r.evidence[0].liked).toBe(true);
    expect(r.evidence.reduce((a, e) => a + e.share, 0)).toBeGreaterThanOrEqual(80);
  });

  it('駆け引きを好きなところに選ぶと結果が動く', () => {
    const r = score({ books, disliked: [], favorite: 'hanzawa', likes: ['hanzawa:gamesmanship', 'jirai:gamesmanship', 'rokunin:gamesmanship'] });
    expect(r.main).toBe('gamesmanship');
  });

  it('得点はすべて0〜100の整数', () => {
    const r = score({ books, disliked: [], likes: [] });
    for (const t of ALL_TAGS) {
      expect(Number.isInteger(r.scores[t])).toBe(true);
      expect(r.scores[t]).toBeGreaterThanOrEqual(0);
      expect(r.scores[t]).toBeLessThanOrEqual(100);
    }
  });

  it('同じ入力なら同じ結果（並び順にもよらない）', () => {
    const a = score({ books, disliked: [], likes: [] });
    const c = score({ books: [...books].reverse(), disliked: [], likes: [] });
    expect(c.main).toBe(a.main);
    expect(c.scores).toEqual(a.scores);
  });

  it('合わなかった本はそのタグを下げる', () => {
    const base = score({ books, disliked: [], likes: [] });
    const minus = score({ books, disliked: [b('goal', 'ビジネス', { mechanism: 3 })], likes: [] });
    expect(minus.scores.mechanism).toBeLessThan(base.scores.mechanism);
  });

  it('AIが範囲外の重みを付けても0〜3に収める', () => {
    const odd = books.map((x, i) => (i === 0 ? { ...x, weights: { mechanism: 99, lies: -5 } } : x));
    const r = score({ books: odd, disliked: [], likes: [] });
    expect(r.scores.lies).toBe(score({ books: odd.map((x, i) => (i === 0 ? { ...x, weights: { mechanism: 3 } } : x)), disliked: [], likes: [] }).scores.lies);
  });

  it('5冊未満はエラー', () => {
    expect(() => score({ books: books.slice(0, 3), disliked: [], likes: [] })).toThrow();
  });
});
