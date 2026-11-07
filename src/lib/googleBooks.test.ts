import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFindUrl, findBook, getVolume, normalizeTitle, parseVolume, pickBestMatch, searchBooks, toPublic } from './googleBooks';

// Google Books API の返り値の形を模した見本（中身は試験用）
const vol = (id: string, title: string, authors: string[], opts: { thumb?: boolean; desc?: string } = {}) => ({
  id,
  volumeInfo: {
    title,
    authors,
    publisher: '試験出版',
    categories: ['Fiction'],
    description: opts.desc,
    imageLinks: opts.thumb === false ? undefined : { thumbnail: `http://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&edge=curl` },
    infoLink: `http://books.google.co.jp/books?id=${id}`,
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('parseVolume', () => {
  it('表紙とリンクをhttpsにし、紙めくれ効果を外す。内容紹介のHTMLは取り除く', () => {
    const m = parseVolume(vol('abc', '三体', ['劉慈欣'], { desc: '<p>地球<b>文明</b>と</p>' }))!;
    expect(m.thumbnail).toBe('https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1');
    expect(m.infoLink).toBe('https://books.google.co.jp/books?id=abc');
    expect(m.description).toBe('地球文明と');
  });
  it('ブラウザに渡す形には内容紹介と分類を含めない', () => {
    const pub = toPublic(parseVolume(vol('abc', '三体', ['劉慈欣'], { desc: 'x' }))!);
    expect(pub).not.toHaveProperty('description');
    expect(pub).not.toHaveProperty('categories');
  });
  it('書名がなければ使わない', () => {
    expect(parseVolume({ id: 'x', volumeInfo: {} })).toBeNull();
  });
});

describe('pickBestMatch', () => {
  it('書名と著者が合うものを選ぶ', () => {
    const items = [vol('a', '三体世界の歩き方', ['別の人']), vol('b', '三体', ['劉 慈欣'], { thumb: false }), vol('c', '三体 II 黒暗森林', ['劉慈欣'])];
    expect(pickBestMatch({ title: '三体', author: '劉慈欣' }, items)?.volumeId).toBe('b');
  });
  it('書名が合わないものしかなければ null（AIが挙げた架空の本を弾く）', () => {
    expect(pickBestMatch({ title: '存在しない本', author: '劉慈欣' }, [vol('z', '三体', ['劉慈欣'])])).toBeNull();
  });
  it('書名の一部だけが合い著者が違うものは採らない', () => {
    expect(pickBestMatch({ title: '告白', author: '湊かなえ' }, [vol('y', '告白の夜', ['別の作家'])])).toBeNull();
  });
  it('表記ゆれをならして比べる', () => {
    expect(normalizeTitle('64（ロクヨン）')).toBe(normalizeTitle('64 ロクヨン'));
  });
});

describe('通信', () => {
  it('検索結果から同じ本の重複をまとめる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [vol('1', '告白', ['湊かなえ']), vol('2', '告白', ['湊かなえ']), vol('3', '告白', ['町田康'])] }))));
    const r = await searchBooks('告白');
    expect(r.map((b) => b.volumeId)).toEqual(['1', '3']);
  });

  it('書名と著者で1冊特定する', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ items: [vol('q1', '告白', ['湊かなえ'])] })));
    vi.stubGlobal('fetch', fetchMock);
    const want = { title: '告白', author: '湊かなえ' };
    expect((await findBook(want))?.volumeId).toBe('q1');
    expect(String(fetchMock.mock.calls[0][0])).toBe(buildFindUrl(want));
  });

  it('おかしなvolumeIdでは通信しない', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await getVolume('../../etc')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('通信に失敗したら null / 空配列を返し、例外を投げない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 503 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(findBook({ title: '告白', author: '湊かなえ' })).resolves.toBeNull();
    await expect(searchBooks('告白')).resolves.toEqual([]);
  });
});
