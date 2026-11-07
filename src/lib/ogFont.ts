// シェア画像（OGP）用の日本語フォントを用意する。サーバー側だけで使う。
// 画像の生成（Satori）は WOFF2 を読めないので、Google Fonts から「画像に出る文字だけ」の TrueType を取ってくる。
// 開発で Google Fonts につながらないときは OG_FONT_FILE にローカルの .ttf / .otf を指定すれば、それを使う。

import 'server-only';
import fs from 'node:fs/promises';

type Weight = 400 | 700 | 800;
export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: Weight;
  style: 'normal';
}

async function fetchGoogleFont(family: string, weight: Weight, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 60 * 60 * 24 * 7 } })).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch (e) {
    console.warn(`[ogFont] ${family} ${weight}: ${(e as Error).message}`);
    return null;
  }
}

/** 画像に出る文字（text）だけを含むフォントを返す。明朝（見出し）とゴシック（本文） */
export async function loadOgFonts(text: string): Promise<OgFont[]> {
  const local = process.env.OG_FONT_FILE;
  if (local) {
    const buf = await fs.readFile(local);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return [
      { name: 'Serif', data, weight: 800, style: 'normal' },
      { name: 'Sans', data, weight: 400, style: 'normal' },
      { name: 'Sans', data, weight: 700, style: 'normal' },
    ];
  }
  const chars = [...new Set(text + '0123456789%・、。「」『』（）')].join('');
  const [serif, sans, sansBold] = await Promise.all([
    fetchGoogleFont('Shippori Mincho B1', 800, chars),
    fetchGoogleFont('Zen Kaku Gothic New', 400, chars),
    fetchGoogleFont('Zen Kaku Gothic New', 700, chars),
  ]);
  const fonts: OgFont[] = [];
  if (serif) fonts.push({ name: 'Serif', data: serif, weight: 800, style: 'normal' });
  if (sans) fonts.push({ name: 'Sans', data: sans, weight: 400, style: 'normal' });
  if (sansBold) fonts.push({ name: 'Sans', data: sansBold, weight: 700, style: 'normal' });
  return fonts;
}
