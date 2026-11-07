import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK_BY_ID } from '@/data/books';
import { buildSearchUrl, getBookMeta, normalizeTitle, parseVolume, pickBestMatch } from './googleBooks';

// Google Books API の返り値の形を模した見本（中身は試験用）
const vol = (id: string, title: string, authors: string[], thumb = true) => ({
  id,
  volumeInfo: {
    title,
    authors,
    publisher: '試験出版',
    imageLinks: thumb ? { thumbnail: `http://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&edge=curl` } : undefined,
    infoLink: `http://books.google.co.jp/books?id=${id}`,
  },
});

describe('parseVolume', () => {
  it('表紙とリンクをhttpsにし、紙めくれ効果を外す', () => {
    const m = parseVolume(vol('abc', '三体', ['劉慈欣']))!;
    expect(m.thumbnail).toBe('https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1');
    expect(m.infoLink).toBe('https://books.google.co.jp/books?id=abc');
  });
  it('書名がなければ使わない', () => {
    expect(parseVolume({ id: 'x', volumeInfo: {} })).toBeNull();
  });
});

describe('pickBestMatch', () => {
  it('書名と著者が合うものを選ぶ', () => {
    const items = [
      vol('a', '三体世界の歩き方', ['別の人']),
      vol('b', '三体', ['劉 慈欣'], false),
      vol('c', '三体 II 黒暗森林', ['劉慈欣']),
    ];
    expect(pickBestMatch(BOOK_BY_ID.santai, items)?.volumeId).toBe('b');
  });
  it('書名が合わないものしかなければ null', () => {
    expect(pickBestMatch(BOOK_BY_ID.santai, [vol('z', 'まったく別の本', ['劉慈欣'])])).toBeNull();
  });
  it('表記ゆれをならして比べる', () => {
    expect(normalizeTitle('64（ロクヨン）')).toBe(normalizeTitle('64 ロクヨン'));
  });
});

describe('getBookMeta', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('検索して見つけた本を返す', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ items: [vol('q1', '告白', ['湊かなえ'])] })));
    vi.stubGlobal('fetch', fetchMock);
    const m = await getBookMeta(BOOK_BY_ID.kokuhaku);
    expect(m?.volumeId).toBe('q1');
    expect(String(fetchMock.mock.calls[0][0])).toBe(buildSearchUrl(BOOK_BY_ID.kokuhaku));
  });

  it('通信に失敗したら null を返し、例外を投げない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 503 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(getBookMeta(BOOK_BY_ID.kokuhaku)).resolves.toBeNull();
  });
});
