// 診断結果ページをXなどでシェアしたときに出る画像（1200×630）。
// 載せるのはプログラムが決めた項目（タイプ名・コピー・得点・書名）と、検査に通ったAIの二つ名だけ。
// 表紙画像は権利の確認ができるまで載せない。

import { ImageResponse } from 'next/og';
import { CORE_TAGS, TAGS } from '@/data/tags';
import { loadOgFonts } from '@/lib/ogFont';
import { loadResult } from '@/lib/store';

export const alt = '読み筋診断の結果';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = { paper: '#f6f2ea', ink: '#1e1c19', ink2: '#3a3630', muted: '#5f584d', track: '#e9e2d4', accent: '#2e4a73', accentInk: '#fffdf8', gray: '#8c8475' };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const r = await loadResult((await params).id);
  if (!r) return fallbackImage();

  const s = r.scoring;
  const top3 = [...CORE_TAGS].sort((a, b) => s.scores[b] - s.scores[a]).slice(0, 3);
  const titles = r.books.slice(0, 3).map((b) => `『${b.title.length > 14 ? b.title.slice(0, 13) + '…' : b.title}』`);
  const more = r.books.length > 3 ? `ほか${r.books.length - 3}冊` : '';
  const catchphrase = r.text.catchphrase;

  const text = [s.modifier, s.typeName, s.copy, catchphrase ?? '', ...top3.map((t) => TAGS[t].label), ...titles, more, 'あなたの読み筋', 'あなたの読み筋は？', '読み筋診断', 'を選んだ人の診断'].join('');
  const fonts = await loadOgFonts(text);

  // タイプ名が長いときは文字を小さくする
  const nameSize = Math.min(84, Math.floor(556 / s.typeName.length));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: 'Sans', color: C.ink }}>
        <div style={{ width: 680, height: '100%', background: C.accent, color: C.accentInk, padding: '56px 60px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 24, letterSpacing: 4, display: 'flex' }}>あなたの読み筋</div>
          <div style={{ marginTop: 34, fontFamily: 'Serif', fontWeight: 800, fontSize: 34, display: 'flex' }}>{s.modifier}</div>
          <div style={{ marginTop: 6, fontFamily: 'Serif', fontWeight: 800, fontSize: nameSize, lineHeight: 1.15, display: 'flex', flexWrap: 'wrap' }}>{s.typeName}</div>
          {catchphrase && (
            <div style={{ marginTop: 22, fontSize: 26, fontWeight: 700, display: 'flex', opacity: 0.95 }}>「{catchphrase}」</div>
          )}
          <div style={{ marginTop: 'auto', fontFamily: 'Serif', fontWeight: 800, fontSize: 28, lineHeight: 1.5, display: 'flex' }}>{s.copy}</div>
        </div>

        <div style={{ flex: 1, height: '100%', background: C.paper, padding: '56px 56px 48px 48px', display: 'flex', flexDirection: 'column' }}>
          {top3.map((t, i) => (
            <div key={t} style={{ display: 'flex', flexDirection: 'column', marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 27, fontWeight: 700, color: i === 0 ? C.accent : C.ink }}>
                <span>{TAGS[t].label}</span>
                <span>{s.scores[t]}</span>
              </div>
              <div style={{ marginTop: 8, height: 14, borderRadius: 7, background: C.track, display: 'flex' }}>
                <div style={{ width: `${s.scores[t]}%`, height: 14, borderRadius: 7, background: i === 0 ? C.accent : C.gray }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', fontFamily: 'Serif', fontWeight: 800, fontSize: 24, lineHeight: 1.55, color: C.ink2 }}>
            {titles.join('')}
            {more}
          </div>
          <div style={{ fontSize: 20, color: C.muted, display: 'flex' }}>を選んだ人の診断</div>
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: 'Serif', fontWeight: 800, fontSize: 30 }}>読み筋診断</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.accent }}>あなたの読み筋は？</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

async function fallbackImage() {
  const text = '読み筋診断好きな本から、本当に惹かれているものを言葉にします。';
  const fonts = await loadOgFonts(text);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: C.accent, color: C.accentInk, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, fontFamily: 'Serif' }}>
        <div style={{ fontSize: 40, fontWeight: 800, display: 'flex' }}>読み筋診断</div>
        <div style={{ marginTop: 24, fontSize: 56, fontWeight: 800, display: 'flex' }}>好きな本から、本当に惹かれているものを言葉にします。</div>
      </div>
    ),
    { ...size, fonts },
  );
}
