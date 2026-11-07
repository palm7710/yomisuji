import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { BOOK_BY_ID } from '@/data/books';
import { CORE_TAGS, TAGS } from '@/data/tags';
import { diagnose, InvalidInputError, type Diagnosis } from '@/lib/diagnose';
import { getBooksMeta } from '@/lib/googleBooks';
import { inputFromParams, resultPath } from '@/lib/selection';
import { GoogleAttribution, LinkedCover } from '@/components/BookCover';
import { ShareButtons } from './ShareButtons';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function tryDiagnose(params: Record<string, string | string[] | undefined>): Diagnosis | null {
  try {
    return diagnose(inputFromParams(params));
  } catch (e) {
    if (e instanceof InvalidInputError) return null;
    throw e;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const d = tryDiagnose(await searchParams);
  if (!d) return { title: '読み筋診断（仮）' };
  const title = `${d.modifier}${d.typeName}｜読み筋診断（仮）`;
  return { title, description: d.copy, openGraph: { title, description: d.copy }, twitter: { card: 'summary', title, description: d.copy } };
}

const CONFIDENCE_LABEL = { clear: 'はっきり', leaning: '傾向あり', mixed: '混合型' } as const;

export default async function ResultPage({ searchParams }: { searchParams: SearchParams }) {
  const d = tryDiagnose(await searchParams);
  if (!d) {
    return (
      <main className="page pad" style={{ paddingTop: 60, gap: 20 }}>
        <h1 className="serif" style={{ fontSize: 24 }}>結果を表示できませんでした</h1>
        <p style={{ lineHeight: 1.8 }}>本の選び方が読み取れませんでした。もう一度、本を選んで診断してください。</p>
        <Link href="/diagnose" className="btn btn-primary">本を選ぶ</Link>
      </main>
    );
  }

  const showBooks = [...d.evidence.map((e) => e.bookId), ...d.recommendations.map((r) => r.bookId)];
  const metas = await getBooksMeta(showBooks.map((id) => BOOK_BY_ID[id]));

  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const shareUrl = origin + resultPath(d.input);
  const shareText = `私の読み筋は「${d.modifier}${d.typeName}」でした。${d.copy}`;

  const coreRanked = [...CORE_TAGS].sort((a, b) => d.scores[b] - d.scores[a]);

  return (
    <main className="page">
      <header style={{ background: 'var(--accent)', color: 'var(--accent-ink)', padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, letterSpacing: '0.16em' }}>あなたの読み筋</span>
          <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--card)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 999 }}>
            確からしさ：{CONFIDENCE_LABEL[d.confidence]}
          </span>
        </div>
        <div className="serif" style={{ fontWeight: 700, fontSize: 20, marginTop: 8 }}>{d.modifier}</div>
        <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 42, lineHeight: 1.2 }}>
          {d.typeName}
          {d.secondTypeName && <span style={{ display: 'block', fontSize: 22, marginTop: 6 }}>×{d.secondTypeName}</span>}
        </h1>
        <p className="serif" style={{ margin: '6px 0 0', fontSize: 17, lineHeight: 1.6 }}>{d.copy}</p>
        {!d.secondTypeName && <div style={{ fontSize: 13, opacity: 0.92 }}>サブタイプ：{TAGS[d.sub].label}</div>}
      </header>

      <div className="pad" style={{ paddingTop: 16 }}>
        <ShareButtons url={shareUrl} text={shareText} />
      </div>

      <div className="pad" style={{ paddingTop: 22, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="label">あなたの読み筋の説明</h2>
          <div className="card-strong" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 17, lineHeight: 1.8 }}>{d.text.summary}</p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--ink-2)' }}>{d.text.sub}</p>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="core-h">
          <h2 id="core-h" className="label">面白さの核</h2>
          {coreRanked.map((t, i) => (
            <div key={t} className="bar-row">
              <span style={i === 0 ? { fontWeight: 700, color: 'var(--accent)' } : { color: 'var(--ink-2)' }}>{TAGS[t].label}</span>
              <div className="bar-track" role="img" aria-label={`${TAGS[t].label} ${d.scores[t]}点`}>
                <div
                  className="bar-fill"
                  style={{ width: `${d.scores[t]}%`, background: i === 0 ? 'var(--accent)' : t === d.hidden ? 'rgba(46,74,115,0.55)' : undefined }}
                />
              </div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...(i === 0 ? { fontWeight: 700, color: 'var(--accent)' } : {}) }}>
                {d.scores[t]}
              </span>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="small muted">好きな読後感</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--vermilion)' }}>{TAGS[d.aftertaste].label}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{d.text.aftertaste}</span>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="small muted">好きな語り方</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--green)' }}>{TAGS[d.style].label}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{d.text.style}</span>
          </div>
        </section>

        {d.hidden && d.text.hidden && (
          <section style={{ border: '2px dashed var(--accent)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em' }}>隠れた好み</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 20 }}>{TAGS[d.hidden].label}</span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>{d.text.hidden}</p>
          </section>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className="label">この結果になった理由</h2>
          {d.evidence.map((e) => {
            const b = BOOK_BY_ID[e.bookId];
            return (
              <div key={e.bookId} style={{ display: 'grid', gridTemplateColumns: '56px 52px minmax(0, 1fr)', gap: 12, alignItems: 'start', padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
                <LinkedCover book={b} meta={metas[b.id]} />
                <span className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                  {e.share}
                  <span style={{ fontSize: 12 }}>%</span>
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>『{b.title}』</span>
                  <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)' }}>
                    「{TAGS[d.main].label}」の得点に効いた一冊です。
                    {e.likedLabels.length > 0 && `「${e.likedLabels.join('」「')}」を選んだことも効いています。`}
                  </span>
                </div>
              </div>
            );
          })}
          <span className="small muted" style={{ paddingTop: 6 }}>％は「{TAGS[d.main].label}」の得点に、その本がどれだけ効いたか</span>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="label">次に読むなら</h2>
          {d.recommendations.map((r) => {
            const b = BOOK_BY_ID[r.bookId];
            const meta = metas[b.id];
            return (
              <div key={r.bookId} className="card" style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 14 }}>
                <LinkedCover book={b} meta={meta} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>『{b.title}』</span>
                    {r.surprise && (
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--card)', background: 'var(--vermilion)', padding: '3px 8px', borderRadius: 3 }}>
                        意外な一冊
                      </span>
                    )}
                  </div>
                  <span className="small muted">
                    {b.author}
                    {meta?.publisher ? `・${meta.publisher}` : ''}
                  </span>
                  {r.sharedTags.length > 0 && (
                    <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                      「{r.sharedTags.map((t) => TAGS[t].label).join('」「')}」があなたと重なる一冊です。
                    </span>
                  )}
                  {meta?.infoLink && (
                    <a href={meta.infoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                      Google Books で見る
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/diagnose" className="btn btn-ghost">本を選び直す</Link>
          <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            結果は選んだ本から推定した読書傾向の仮説です。性格や能力を診断するものではありません。結果のURLを共有すると、選んだ本も相手に見えます。
          </span>
        </section>
      </div>
      <GoogleAttribution />
    </main>
  );
}
