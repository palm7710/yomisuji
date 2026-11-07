// トップページなどをシェアしたときに出る画像（1200×630）
import { ImageResponse } from 'next/og';
import { loadOgFonts } from '@/lib/ogFont';

export const alt = '読み筋診断';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const LINES = ['小説も、マンガも、実用書も。', '好きな本から、', '本当に惹かれているもの', 'を言葉にします。'];
const TAG_SAMPLES = ['駆け引き', 'あたたかさ', '意外な展開', '余韻', '輪の外の視点', '別世界への没入'];

export default async function Image() {
  const fonts = await loadOgFonts([...LINES, ...TAG_SAMPLES, '読み筋診断', '5冊選ぶだけ・登録なし'].join(''));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f6f2ea', color: '#1e1c19', padding: '64px 72px', fontFamily: 'Sans' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Serif', fontWeight: 800, fontSize: 36 }}>読み筋診断</span>
          <span style={{ fontSize: 24, color: '#5f584d' }}>5冊選ぶだけ・登録なし</span>
        </div>
        <div style={{ marginTop: 44, fontSize: 30, fontWeight: 700, color: '#3a3630', display: 'flex' }}>{LINES[0]}</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', fontFamily: 'Serif', fontWeight: 800, fontSize: 64, lineHeight: 1.35 }}>
          <span>{LINES[1]}</span>
          <span style={{ color: '#2e4a73' }}>{LINES[2]}</span>
          <span>{LINES[3]}</span>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 12 }}>
          {TAG_SAMPLES.map((t) => (
            <span key={t} style={{ fontSize: 22, border: '2px solid #a39a8a', borderRadius: 999, padding: '6px 18px', color: '#3a3630' }}>{t}</span>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
