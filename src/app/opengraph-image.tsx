// サイトのサムネイル画像（トップページなどをシェアしたときに出る、1200×630）
// デザイン：藍一色の背景に、トップページと同じ見出しを白で置くだけのシンプルな形
import { ImageResponse } from 'next/og';
import { loadOgFonts } from '@/lib/ogFont';

export const alt = '読み筋診断｜好きな本から、本当に惹かれているものを言葉にします。';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#2e4a73';
const FG = '#fffdf8';
const KICKER = '小説も、マンガも、実用書も。';
const HEADLINE = ['好きな本から、', '本当に惹かれているもの', 'を言葉にします。'];
const LOGO = '読み筋診断';

export default async function Image() {
  const fonts = await loadOgFonts([KICKER, ...HEADLINE, LOGO].join(''));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: BG,
          color: FG,
          padding: '72px 96px',
          fontFamily: 'Serif',
          fontWeight: 800,
        }}
      >
        <span style={{ fontSize: 32, opacity: 0.85 }}>{KICKER}</span>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', fontSize: 72, lineHeight: 1.35 }}>
          {HEADLINE.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <span style={{ marginTop: 40, fontSize: 30, letterSpacing: '0.12em' }}>{LOGO}</span>
      </div>
    ),
    { ...size, fonts },
  );
}
