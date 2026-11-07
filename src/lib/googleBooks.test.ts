import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFindUrl, collapseBookSeries, findBook, getVolume, normalizeTitle, parseVolume, pickBestMatch, searchBooks, splitSeriesTitle, toPublic } from './googleBooks';

// Google Books API の返り値の形を模した見本（中身は試験用）
const vol = (
  id: string,
  title: string,
  authors: string[],
  opts: { thumb?: boolean; desc?: string; ratings?: number; rating?: number; seriesId?: string; order?: number } = {},
) => ({
  id,
  volumeInfo: {
    title,
    authors,
    publisher: '試験出版',
    categories: ['Fiction'],
    description: opts.desc,
    ratingsCount: opts.ratings,
    averageRating: opts.rating,
    seriesInfo: opts.seriesId ? { volumeSeries: [{ seriesId: opts.seriesId, orderNumber: opts.order }] } : undefined,
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
    const pub = toPublic(parseVolume(vol('abc', '三体', ['劉慈欣'], { desc: 'x', ratings: 20, seriesId: 'series-1' }))!);
    expect(pub).not.toHaveProperty('description');
    expect(pub).not.toHaveProperty('categories');
    expect(pub).not.toHaveProperty('ratingsCount');
    expect(pub).not.toHaveProperty('seriesId');
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

describe('シリーズのまとめ表示と人気順', () => {
  it('題名の途中の数字は残し、末尾の巻数・上下巻だけを分ける', () => {
    expect(splitSeriesTitle('3月のライオン 17')).toEqual({ title: '3月のライオン', volume: 17 });
    expect(splitSeriesTitle('ONE PIECE 第100巻')).toEqual({ title: 'ONE PIECE', volume: 100 });
    expect(splitSeriesTitle('NARUTO Vol. 12')).toEqual({ title: 'NARUTO', volume: 12 });
    expect(splitSeriesTitle('海辺のカフカ 上')).toEqual({ title: '海辺のカフカ', volume: 1 });
    expect(splitSeriesTitle('海辺のカフカ 下巻')).toEqual({ title: '海辺のカフカ', volume: 3 });
    expect(splitSeriesTitle('海辺のカフカ（上）（新潮文庫）')).toEqual({ title: '海辺のカフカ', volume: 1 });
    expect(splitSeriesTitle('海辺のカフカ（下）（新潮文庫）')).toEqual({ title: '海辺のカフカ', volume: 3 });
    expect(splitSeriesTitle('大河小説 第2部')).toEqual({ title: '大河小説', volume: 2 });
    expect(splitSeriesTitle('1984')).toEqual({ title: '1984' });
  });

  it('同じ著者の巻違いをまとめ、若い巻を代表にする', () => {
    const books = [vol('v3', 'キングダム 3', ['原泰久']), vol('v1', 'キングダム 1', ['原泰久']), vol('other', 'キングダム 1', ['別の著者'])]
      .map(parseVolume)
      .filter((book): book is NonNullable<ReturnType<typeof parseVolume>> => book !== null);
    const grouped = collapseBookSeries(books);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ volumeId: 'v1', seriesTitle: 'キングダム', seriesCount: 2 });
    expect(grouped[1]).toMatchObject({ volumeId: 'other' });
  });

  it('Google BooksのシリーズIDが同じなら題名の異なる小説もまとめる', () => {
    const books = [
      vol('hp2', 'ハリー・ポッターと秘密の部屋', ['J.K.ローリング'], { seriesId: 'hp', order: 2 }),
      vol('hp1', 'ハリー・ポッターと賢者の石', ['J.K.ローリング'], { seriesId: 'hp', order: 1 }),
    ]
      .map(parseVolume)
      .filter((book): book is NonNullable<ReturnType<typeof parseVolume>> => book !== null);
    expect(collapseBookSeries(books)[0]).toMatchObject({ volumeId: 'hp1', seriesTitle: 'ハリー・ポッター', seriesCount: 2 });
  });

  it('評価件数が多い作品を先にし、評価がなければ関連度順を保つ', () => {
    const books = [
      vol('related', '検索語に近い本', ['著者A']),
      vol('popular', '人気の本', ['著者B'], { ratings: 120, rating: 4.2 }),
      vol('unrated', '評価なしの本', ['著者C']),
    ]
      .map(parseVolume)
      .filter((book): book is NonNullable<ReturnType<typeof parseVolume>> => book !== null);
    expect(collapseBookSeries(books).map((book) => book.volumeId)).toEqual(['popular', 'related', 'unrated']);
  });

  it('人気度より先に題名の完全一致を優先する', () => {
    const books = [
      vol('popular-related', '誰にも言えない秘密の告白', ['編集部'], { ratings: 500 }),
      vol('exact', '告白', ['湊かなえ'], { ratings: 20 }),
    ]
      .map(parseVolume)
      .filter((book): book is NonNullable<ReturnType<typeof parseVolume>> => book !== null);
    expect(collapseBookSeries(books, '告白').map((book) => book.volumeId)).toEqual(['exact', 'popular-related']);
  });

  it('著者名検索では本人の著作を優先する', () => {
    const books = [
      vol('guide', '東野圭吾公式ガイド', ['編集部'], { ratings: 100 }),
      vol('novel', '流星の絆', ['東野圭吾'], { ratings: 10 }),
    ]
      .map(parseVolume)
      .filter((book): book is NonNullable<ReturnType<typeof parseVolume>> => book !== null);
    expect(collapseBookSeries(books, '東野圭吾').map((book) => book.volumeId)).toEqual(['novel', 'guide']);
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
