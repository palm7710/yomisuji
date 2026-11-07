import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CORE_TAGS, TAGS } from '@/data/tags';
import { loadResult } from '@/lib/store';
import { AiNotice, GoogleAttribution, LinkedCover } from '@/components/BookCover';
import { ShareButtons } from '@/components/ShareButtons';

type Params = Promise<{ id: string }>;

const CONFIDENCE_LABEL = { clear: 'はっきり', leaning: '傾向あり', mixed: '混合型' } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = await loadResult((await params).id);
  if (!r) return { title: '読み筋診断（仮）' };
  const s = r.scoring;
  const title = `${s.modifier}${s.typeName}｜読み筋診断（仮）`;
  return { title, description: s.copy, openGraph: { title, description: s.copy }, twitter: { card: 'summary', title, description: s.copy } };
}

export default async function ResultPage({ params }: { params: Params }) {
  const r = await loadResult((await params).id);
  if (!r) notFound();
  const s = r.scoring;
  const bookById = new Map(r.books.map((b) => [b.volumeId, b]));

  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const shareUrl = `${origin}/r/${r.id}`;
  const shareText = `私の読み筋は「${s.modifier}${s.typeName}」でした。${s.copy}`;
  const coreRanked = [...CORE_TAGS].sort((a, b) => s.scores[b] - s.scores[a]);
  const reasonOf = new Map(r.text.evidence.map((e) => [e.bookId, e.reason]));

  return (
    <main className="page">
      <header style={{ background: 'var(--accent)', color: 'var(--accent-ink)', padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, letterSpacing: '0.16em' }}>あなたの読み筋</span>
          <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--card)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 999 }}>
            確からしさ：{CONFIDENCE_LABEL[s.confidence]}
          </span>
        </div>
        <div className="serif" style={{ fontWeight: 700, fontSize: 20, marginTop: 8 }}>{s.modifier}</div>
        <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 40, lineHeight: 1.2 }}>
          {s.typeName}
          {s.secondTypeName && <span style={{ display: 'block', fontSize: 22, marginTop: 6 }}>×{s.secondTypeName}</span>}
        </h1>
        <p className="serif" style={{ margin: '6px 0 0', fontSize: 17, lineHeight: 1.6 }}>{s.copy}</p>
        {!s.secondTypeName && <div style={{ fontSize: 13, opacity: 0.92 }}>サブタイプ：{TAGS[s.sub].label}</div>}
      </header>

      <div className="pad" style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ShareButtons url={shareUrl} text={shareText} />
        <AiNotice />
      </div>

      <div className="pad" style={{ paddingTop: 22, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="label">あなたの読み筋の説明</h2>
          <div className="card-strong" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 17, lineHeight: 1.8 }}>{r.text.summary}</p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--ink-2)' }}>{r.text.detail}</p>
            <span className="small muted">{r.fallbackText ? 'この説明は定型文です（AIの文章を用意できませんでした）' : 'この説明はAIが診断結果をもとに書いています'}</span>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="core-h">
          <h2 id="core-h" className="label">面白さの核</h2>
          {coreRanked.map((t, i) => (
            <div key={t} className="bar-row">
              <span style={i === 0 ? { fontWeight: 700, color: 'var(--accent)' } : { color: 'var(--ink-2)' }}>{TAGS[t].label}</span>
              <div className="bar-track" role="img" aria-label={`${TAGS[t].label} ${s.scores[t]}点`}>
                <div className="bar-fill" style={{ width: `${s.scores[t]}%`, background: i === 0 ? 'var(--accent)' : t === s.hidden ? 'rgba(46,74,115,0.55)' : undefined }} />
              </div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...(i === 0 ? { fontWeight: 700, color: 'var(--accent)' } : {}) }}>{s.scores[t]}</span>
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="small muted">好きな読後感</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--vermilion)' }}>{TAGS[s.aftertaste].label}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{r.text.aftertaste}</span>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="small muted">好きな語り方</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--green)' }}>{TAGS[s.style].label}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{r.text.style}</span>
          </div>
        </section>

        {s.hidden && r.text.hidden && (
          <section style={{ border: '2px dashed var(--accent)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em' }}>隠れた好み</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 20 }}>{TAGS[s.hidden].label}</span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>{r.text.hidden}</p>
          </section>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className="label">この結果になった理由</h2>
          {s.evidence.map((e) => {
            const b = bookById.get(e.bookId);
            if (!b) return null;
            return (
              <div key={e.bookId} style={{ display: 'grid', gridTemplateColumns: '56px 52px minmax(0, 1fr)', gap: 12, alignItems: 'start', padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
                <LinkedCover book={b} />
                <span className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                  {e.share}
                  <span style={{ fontSize: 12 }}>%</span>
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>『{b.title}』</span>
                  <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)' }}>
                    {reasonOf.get(e.bookId) ?? `「${TAGS[s.main].label}」の得点に効いた一冊です。`}
                  </span>
                </div>
              </div>
            );
          })}
          <span className="small muted" style={{ paddingTop: 6 }}>％は「{TAGS[s.main].label}」の得点に、その本がどれだけ効いたか</span>
        </section>

        {r.recommendations.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="label">次に読むなら</h2>
            {r.recommendations.map((rec) => (
              <div key={rec.book.volumeId} className="card" style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 14 }}>
                <LinkedCover book={rec.book} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>『{rec.book.title}』</span>
                    {rec.surprise && (
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--card)', background: 'var(--vermilion)', padding: '3px 8px', borderRadius: 3 }}>意外な一冊</span>
                    )}
                  </div>
                  <span className="small muted">
                    {rec.book.authors.join('、')}
                    {rec.book.publisher ? `・${rec.book.publisher}` : ''}
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>{rec.reason}</span>
                  {rec.tags.length > 0 && <span className="small muted">重なる面白さ：{rec.tags.map((t) => TAGS[t].label).join('・')}</span>}
                  <a href={rec.book.infoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Google Books で見る</a>
                </div>
              </div>
            ))}
          </section>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className="label">AIが読み取った、選んだ本の特徴</h2>
          {r.books.map((b) => (
            <div key={b.volumeId} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
              <LinkedCover book={b} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="serif" style={{ fontWeight: 700, fontSize: 14 }}>
                  『{b.title}』<span className="small muted" style={{ fontFamily: 'var(--sans)', fontWeight: 400 }}>　{b.genre}</span>
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{b.note}</span>
                <span className="small muted">
                  {CORE_TAGS.filter((t) => (b.weights[t] ?? 0) >= 2).map((t) => TAGS[t].label).join('・')}
                </span>
              </div>
            </div>
          ))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/diagnose" className="btn btn-ghost">もう一度診断する</Link>
          <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            結果は選んだ本から推定した読書傾向の仮説で、性格や能力を診断するものではありません。
            診断のために、選んだ本の情報をAI事業者（DeepSeek）に送っています。名前などあなたを特定する情報は送りません。
            このページのURLを共有すると、選んだ本も相手に見えます。
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            診断日時：{new Date(r.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </span>
        </section>
      </div>
      <GoogleAttribution />
    </main>
  );
}
