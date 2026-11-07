import Link from 'next/link';
import type { TagId } from '@/data/tags';
import { TAGS } from '@/data/tags';
import { MIN_BOOKS } from '@/lib/scoring';
import { AiNotice } from '@/components/BookCover';

// 診断結果の例。いろいろなジャンルの読み手が「自分のことかも」と思えるよう、ジャンルをばらして並べる。
// 実際の結果はAIが作るので、ここの文はあくまで見本。
const EXAMPLES: { genre: string; books: string[]; before: string; essence: string }[] = [
  {
    genre: 'ミステリー・マンガ',
    books: ['DEATH NOTE', '容疑者Xの献身', '六人の嘘つきな大学生'],
    before: 'ジャンルはミステリー。でも惹かれているのは、謎そのものより',
    essence: '“相手の手を読み合う緊張”',
  },
  {
    genre: '青春・恋愛',
    books: ['君の膵臓をたべたい', 'かがみの孤城', '博士の愛した数式'],
    before: 'ジャンルは青春小説。でも惹かれているのは、恋や友情より',
    essence: '“失ったあとに残るもの”',
  },
  {
    genre: 'ファンタジー・ライトノベル',
    books: ['転生したらスライムだった件', '鋼の錬金術師', 'ハリー・ポッター'],
    before: 'ジャンルはファンタジー。でも惹かれているのは、魔法より',
    essence: '“世界の仕組みを解き明かす手応え”',
  },
  {
    genre: 'ビジネス書・ノンフィクション',
    books: ['嫌われる勇気', 'サピエンス全史', 'FACTFULNESS'],
    before: 'ジャンルはビジネス書。でも惹かれているのは、ノウハウより',
    essence: '“当たり前がひっくり返る瞬間”',
  },
  {
    genre: 'ホラー・文芸',
    books: ['変な家', 'コンビニ人間', '告白'],
    before: 'ジャンルはばらばら。でも惹かれているのは、怖さより',
    essence: '“普通の顔をした人の内側”',
  },
];

const GENRES = ['小説', 'マンガ', 'ライトノベル', 'エッセイ', 'ビジネス書', 'ノンフィクション', '絵本・児童書', '海外文学', '歴史・時代小説'];

// 3つの層からまんべんなく見せる
const SAMPLE_TAGS: TagId[] = ['gamesmanship', 'warm', 'reversal', 'lingering', 'outsider', 'inner', 'immersion', 'exhilarating'];

export default function Home() {
  return (
    <main className="page" style={{ paddingTop: 40, paddingBottom: 32, gap: 24 }}>
      <div className="pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="serif" style={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.08em' }}>
          読み筋診断
        </span>
        <span className="small muted">アプリ名は仮</span>
      </div>

      <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="serif" style={{ margin: '8px 0 0', fontWeight: 700, fontSize: 17, color: 'var(--ink-2)' }}>
          小説も、マンガも、実用書も。
        </p>
        <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 28, lineHeight: 1.5 }}>
          好きな本から、
          <br />
          <span style={{ color: 'var(--accent)' }}>本当に惹かれているもの</span>
          <br />
          を言葉にします。
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: 'var(--ink-2)' }}>
          ジャンル分けでは見えない、「謎が解ける瞬間」「失ったあとの静けさ」「人の本音」といった好みのかたちを、選んだ本から読み解きます。
        </p>
        <ul aria-label="選べる本の例" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {GENRES.map((g) => (
            <li key={g} style={{ fontSize: 12, background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 4, padding: '3px 8px', color: 'var(--ink-2)' }}>
              {g}
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="ex-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="ex-h" className="label">診断結果の例</h2>
          <span className="small muted">横にスクロール →</span>
        </div>
        <div className="example-row">
          {EXAMPLES.map((ex) => (
            <figure key={ex.genre} className="card-strong example-card">
              <span className="small" style={{ fontWeight: 700, color: 'var(--accent)' }}>{ex.genre}が好きな人の例</span>
              <blockquote className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 16, lineHeight: 1.75 }}>
                {ex.before}
                <span style={{ color: 'var(--accent)' }}>{ex.essence}</span>かもしれません。
              </blockquote>
              <figcaption className="small muted" style={{ marginTop: 'auto' }}>
                {ex.books.map((b) => `『${b}』`).join('')}を選んだ場合
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SAMPLE_TAGS.map((t) => (
          <span key={t} style={{ fontSize: 12, border: '1px solid var(--rule-strong)', borderRadius: 999, padding: '4px 10px', color: 'var(--ink-2)' }}>
            {TAGS[t].label}
          </span>
        ))}
        <span className="small muted" style={{ padding: '4px 2px' }}>
          など18の手がかりで読み解きます
        </span>
      </div>

      <div className="pad" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link href="/diagnose" className="btn btn-primary">
          本を選んで診断する
        </Link>
        <span className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
          登録なし・どんな本でも{MIN_BOOKS}冊から
        </span>
        <AiNotice compact />
        <span className="muted" style={{ textAlign: 'center', fontSize: 11.5 }}>
          結果は読書傾向の仮説です。性格を診断するものではありません。
        </span>
      </div>
    </main>
  );
}
