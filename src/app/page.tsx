import Link from 'next/link';
import { CORE_TAGS, TAGS } from '@/data/tags';
import { MIN_BOOKS } from '@/lib/scoring';
import { AiNotice } from '@/components/BookCover';

export default function Home() {
  return (
    <main className="page pad" style={{ paddingTop: 40, paddingBottom: 32, gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="serif" style={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.08em' }}>
          読み筋診断
        </span>
        <span className="small muted">アプリ名は仮</span>
      </div>

      <h1 className="serif" style={{ margin: '12px 0 0', fontWeight: 800, fontSize: 31, lineHeight: 1.45 }}>
        好きな本を選ぶと、
        <br />
        あなたが惹かれている
        <br />
        <span style={{ color: 'var(--accent)' }}>物語のかたち</span>がわかる。
      </h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: 'var(--ink-2)' }}>
        ジャンルではなく、謎解き・駆け引き・反転といった物語の構造から、あなたの「読み筋」を言葉にします。
      </p>

      <figure className="card-strong" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span
          style={{
            alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--card)',
            background: 'var(--ink)', padding: '3px 8px', borderRadius: 3,
          }}
        >
          診断結果の例
        </span>
        <blockquote className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 17, lineHeight: 1.75 }}>
          ジャンルはSF。でも惹かれているのは、壮大な世界観より
          <span style={{ color: 'var(--accent)' }}>“世界の仕組みが覆る瞬間”</span>かもしれません。
        </blockquote>
        <figcaption className="small muted">『三体』『数学ガール』『ハッカーと画家』を選んだ場合</figcaption>
      </figure>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CORE_TAGS.slice(0, 5).map((t) => (
          <span
            key={t}
            style={{ fontSize: 12, border: '1px solid var(--rule-strong)', borderRadius: 999, padding: '4px 10px', color: 'var(--ink-2)' }}
          >
            {TAGS[t].label}
          </span>
        ))}
        <span className="small muted" style={{ padding: '4px 2px' }}>
          ほか全18の手がかり・どんな本でも選べます
        </span>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link href="/diagnose" className="btn btn-primary">
          本を選んで診断する
        </Link>
        <span className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
          登録なし・約1分・{MIN_BOOKS}冊から
        </span>
        <AiNotice compact />
        <span className="muted" style={{ textAlign: 'center', fontSize: 11.5 }}>
          結果は読書傾向の仮説です。性格を診断するものではありません。
        </span>
      </div>
    </main>
  );
}
