import Link from 'next/link';
import { MIN_BOOKS } from '@/lib/scoring';

export default function Home() {
  return (
    <main className="page pad home">
      <span className="serif home-logo">読み筋診断</span>

      <div className="home-hero">
        <p className="serif home-kicker">小説も、マンガも、実用書も。</p>
        <h1 className="serif home-title">
          好きな本から、
          <br />
          <span style={{ color: 'var(--accent)' }}>本当に惹かれているもの</span>
          <br />
          を言葉にします。
        </h1>
        <Link href="/diagnose" className="btn btn-primary home-cta">
          本を選んで診断する
        </Link>
        <span className="muted home-meta">登録なし・{MIN_BOOKS}冊選ぶだけ</span>
      </div>

      <p className="muted home-note">
        AIが作る診断です。同じ本でも結果が少し変わることがあります。
        <br />
        結果は読書傾向の仮説で、性格を診断するものではありません。
      </p>
    </main>
  );
}
