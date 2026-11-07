// 作品リストの各本を Google Books で検索し、volumeId を src/data/google-volume-ids.json に書き出す。
// 一度決めた volumeId を使うと、毎回の検索より速く、版の取り違えも起きにくい。
//
// 使い方：
//   GOOGLE_BOOKS_API_KEY=xxxx npm run books:resolve        # まだ決まっていない本だけ
//   GOOGLE_BOOKS_API_KEY=xxxx npm run books:resolve -- --all  # すべて決め直す
//
// 結果は scripts/resolve-report.md にも書き出すので、書名・著者・出版社が正しい版かを人が確認すること。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const booksFile = path.join(root, 'src/data/books.ts');
const idsFile = path.join(root, 'src/data/google-volume-ids.json');
const reportFile = path.join(root, 'scripts/resolve-report.md');
const all = process.argv.includes('--all');
const key = process.env.GOOGLE_BOOKS_API_KEY;

const src = await fs.readFile(booksFile, 'utf8');
const books = [...src.matchAll(/id: '([^']+)', title: '([^']+)', author: '([^']+)'/g)].map(([, id, title, author]) => ({
  id,
  title,
  author,
}));
const ids = JSON.parse(await fs.readFile(idsFile, 'utf8'));

const norm = (s) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・、。,.:：!！?？「」『』()（）\-‐―〜~]/g, '');

async function search(book) {
  const q = encodeURIComponent(`intitle:${book.title} inauthor:${book.author}`);
  let url = `https://www.googleapis.com/books/v1/volumes?q=${q}&printType=books&maxResults=10&langRestrict=ja`;
  if (key) url += `&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const want = norm(book.title);
  const wantAuthor = norm(book.author);
  const scored = (json.items ?? [])
    .map((v) => {
      const info = v.volumeInfo ?? {};
      const t = norm(info.title ?? '');
      const ts = t === want ? 3 : t.startsWith(want) ? 2 : t.includes(want) ? 1 : 0;
      const as = (info.authors ?? []).some((a) => norm(a).includes(wantAuthor) || wantAuthor.includes(norm(a))) ? 2 : 0;
      return { v, ts, score: ts * 10 + as * 5 + (info.imageLinks ? 1 : 0) };
    })
    .filter((x) => x.ts > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}

const lines = ['# Google Books 照合結果', '', '| 本ID | 作品リストの書名 | 見つかった書名 | 著者 | 出版社 | 発行日 | volumeId |', '| --- | --- | --- | --- | --- | --- | --- |'];
for (const book of books) {
  if (ids[book.id] && !all) {
    lines.push(`| ${book.id} | ${book.title} | （登録済み） | | | | ${ids[book.id]} |`);
    continue;
  }
  try {
    const v = await search(book);
    if (v) {
      ids[book.id] = v.id;
      const i = v.volumeInfo;
      lines.push(`| ${book.id} | ${book.title} | ${i.title} | ${(i.authors ?? []).join('、')} | ${i.publisher ?? ''} | ${i.publishedDate ?? ''} | ${v.id} |`);
      console.log(`✓ ${book.title} → ${i.title}（${v.id}）`);
    } else {
      lines.push(`| ${book.id} | ${book.title} | **見つからず** | | | | |`);
      console.log(`× ${book.title} 見つかりませんでした`);
    }
  } catch (e) {
    lines.push(`| ${book.id} | ${book.title} | **エラー** | | | | |`);
    console.error(`! ${book.title}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 300)); // API に負荷をかけない
}

await fs.writeFile(idsFile, JSON.stringify(ids, null, 2) + '\n');
await fs.writeFile(reportFile, lines.join('\n') + '\n');
console.log(`\n${Object.keys(ids).length}/${books.length} 冊の volumeId を書き出しました → ${path.relative(root, idsFile)}`);
console.log(`確認用の一覧 → ${path.relative(root, reportFile)}`);
