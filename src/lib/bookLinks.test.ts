import { describe, expect, it } from 'vitest';
import { bookLinks, toIsbn10 } from './bookLinks';

describe('bookLinks', () => {
  it('ISBN-13 を ISBN-10 に直す', () => {
    expect(toIsbn10('9784167110123')).toBe('4167110121');
    expect(toIsbn10('9784048975338')).toBe('4048975331');
    expect(toIsbn10('9791234567896')).toBeUndefined();
  });

  it('ISBN があれば図書館はカーリルの本のページ、感想サイトは書名＋著者で検索する', () => {
    const links = bookLinks({ title: '告白', authors: ['湊かなえ'], isbn: '9784575513440' });
    expect(links.find((l) => l.key === 'library')?.url).toBe('https://calil.jp/book/457551344X');
    expect(links.find((l) => l.key === 'bookmeter')?.url).toBe(`https://bookmeter.com/search?keyword=${encodeURIComponent('告白 湊かなえ')}`);
  });

  it('ISBN がなければ図書館も書名で検索する', () => {
    const links = bookLinks({ title: '近畿地方のある場所について', authors: ['背筋'] });
    expect(links.find((l) => l.key === 'library')?.url).toContain('https://calil.jp/search?q=');
  });
});
