import { describe, expect, it } from 'vitest';
import { LIKE_OPTIONS } from './likes';
import { ALL_TAGS } from './tags';

describe('「どこが好き？」の選択肢', () => {
  it('IDが重複せず、既知のタグだけを指す', () => {
    expect(new Set(LIKE_OPTIONS.map((o) => o.id)).size).toBe(LIKE_OPTIONS.length);
    for (const o of LIKE_OPTIONS) for (const t of o.tags) expect(ALL_TAGS).toContain(t);
  });
  it('18種のタグすべてに、どれかの選択肢がつながる', () => {
    const covered = new Set(LIKE_OPTIONS.flatMap((o) => o.tags));
    for (const t of ALL_TAGS) expect(covered.has(t), t).toBe(true);
  });
});
