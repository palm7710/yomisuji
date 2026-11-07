// 開発用：Google Books API の代わりに、それらしい返り値と仮の表紙画像を返す模擬サーバー。
// 使い方：node scripts/mock-google-books.mjs &
//         GOOGLE_BOOKS_API_BASE=http://localhost:4010/books/v1/volumes npm run dev
import http from 'node:http';

const colors = ['#2e4a73', '#7a3b2e', '#3d6a4c', '#5b3f78', '#6b4a2e', '#1e1c19'];
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/cover.svg') {
      const t = url.searchParams.get('t') ?? '';
      const c = colors[hash(t) % colors.length];
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="192"><rect width="128" height="192" fill="${c}"/><rect x="10" y="10" width="108" height="172" fill="none" stroke="#fffdf8" stroke-opacity=".5"/><text x="64" y="100" fill="#fffdf8" font-size="12" text-anchor="middle" font-family="serif">${t.slice(0, 9)}</text></svg>`);
      return;
    }
    const q = url.searchParams.get('q') ?? '';
    const title = (q.match(/intitle:(.*?) inauthor:/) ?? [])[1] ?? 'unknown';
    const author = (q.match(/inauthor:(.*)$/) ?? [])[1] ?? '';
    const id = `mock${hash(title)}`;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items: [{ id, volumeInfo: { title, authors: [author], publisher: '模擬出版', imageLinks: { thumbnail: `http://localhost:4010/cover.svg?t=${encodeURIComponent(title)}` }, infoLink: `https://books.google.co.jp/books?id=${id}` } }] }));
  })
  .listen(4010, () => console.log('mock Google Books on :4010'));
