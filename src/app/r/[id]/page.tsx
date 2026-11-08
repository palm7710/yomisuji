import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AFTERTASTE_TAGS, CORE_TAGS, STYLE_TAGS, TAGS, TYPE_NAMES, type TagId } from '@/data/tags';
import { LIKE_BY_ID } from '@/data/likes';
import { FOCUS_LABEL } from '@/lib/scoring';
import { loadResult } from '@/lib/store';
import { bookLinks } from '@/lib/bookLinks';
import { SHELF_INFO, SHELVES, shelfLead } from '@/data/shelves';
import { TrackedLink, TrackView } from '@/components/Tracked';
import { AiNotice, GoogleAttribution, LinkedCover } from '@/components/BookCover';
import { ShareButtons } from '@/components/ShareButtons';

type Params = Promise<{ id: string }>;

const CONFIDENCE_LABEL = { clear: 'はっきり', leaning: '傾向あり', mixed: '混合型' } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = await loadResult((await params).id);
  if (!r) return { title: '読み筋診断（仮）' };
  const s = r.scoring;
  const title = `${s.modifier}${s.typeName}｜読み筋診断（仮）`;
  return { title, description: s.copy, openGraph: { title, description: s.copy }, twitter: { card: 'summary_large_image', title, description: s.copy } };
}

function Bars({ tags, scores, color, highlight }: { tags: readonly TagId[]; scores: Record<TagId, number>; color: string; highlight?: TagId }) {
  const ranked = [...tags].sort((a, b) => scores[b] - scores[a]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ranked.map((t, i) => (
        <div key={t} className="bar-row">
          <span style={i === 0 ? { fontWeight: 700, color } : { color: 'var(--ink-2)' }}>{TAGS[t].label}</span>
          <div className="bar-track" role="img" aria-label={`${TAGS[t].label} ${scores[t]}点`}>
            <div className="bar-fill" style={{ width: `${scores[t]}%`, background: i === 0 ? color : t === highlight ? 'rgba(46,74,115,0.55)' : undefined }} />
          </div>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...(i === 0 ? { fontWeight: 700, color } : {}) }}>{scores[t]}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children, lead }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="label">{title}</h2>
      {lead && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--muted)' }}>{lead}</p>}
      {children}
    </section>
  );
}

export default async function ResultPage({ params }: { params: Params }) {
  const r = await loadResult((await params).id);
  if (!r) notFound();
  const s = r.scoring;
  const t = r.text;
  const bookById = new Map(r.books.map((b) => [b.volumeId, b]));
  const reasonOf = new Map(t.evidence.map((e) => [e.bookId, e.reason]));
  const pointOf = new Map((t.perBook ?? []).map((p) => [p.bookId, p.point]));
  const likedOf = (id: string) => r.likes.filter((k) => k.startsWith(`${id}:`)).map((k) => LIKE_BY_ID[k.split(':')[1]]?.label).filter(Boolean);

  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const shareUrl = `${origin}/r/${r.id}`;
  const shareText = `私の読み筋は「${s.modifier}${s.typeName}」でした。${s.copy}`;

  // 選んだ本のジャンル内訳
  const genreCount = [...r.books.reduce((m, b) => m.set(b.genre, (m.get(b.genre) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <main className="page">
      <TrackView event="result_view" />
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {!s.secondTypeName && <span className="header-chip">サブ：{TAGS[s.sub].label}</span>}
          <span className="header-chip">読後感：{TAGS[s.aftertaste].label}</span>
          <span className="header-chip">書き方：{TAGS[s.style].label}</span>
          {s.focusType && <span className="header-chip">{FOCUS_LABEL[s.focusType].name}</span>}
        </div>
      </header>

      <div className="pad" style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ShareButtons url={shareUrl} text={shareText} />
        <AiNotice />
      </div>

      <div className="pad" style={{ paddingTop: 22, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {/* 1. ひと言と説明 */}
        <Section title="あなたの読み筋の説明">
          <div className="card-strong" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {t.catchphrase && (
              <p className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 21, color: 'var(--accent)' }}>「{t.catchphrase}」</p>
            )}
            {t.coreNeed && (
              <div className="core-need">
                <span className="small muted">あなたが本に求めているもの</span>
                <p className="serif">{t.coreNeed}</p>
              </div>
            )}
            {t.letter ? (
              // 手紙があるときは、それを主役にする（要点と補足は手紙に含まれるので出さない）
              <p className="letter">{t.letter}</p>
            ) : (
              <>
                <p className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 17, lineHeight: 1.8 }}>{t.summary}</p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--ink-2)' }}>{t.detail}</p>
              </>
            )}
            <span className="small muted">{r.fallbackText ? 'この説明は定型文です（AIの文章を用意できませんでした）' : 'この説明はAIが診断結果をもとに書いています'}</span>
          </div>
        </Section>

        {/* 2. 読み方のくせ */}
        {t.patterns && t.patterns.length > 0 && (
          <Section title="あなたの読み方のくせ">
            <ol className="pattern-list">
              {t.patterns.map((p, i) => (
                <li key={i} className="card">
                  <span className="pattern-no serif">{i + 1}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>{p.title}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--ink-2)' }}>{p.body}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* 3. 3層の得点 */}
        <Section title="面白さの核" lead="何に惹かれて本を読んでいるか（0〜100）">
          <Bars tags={CORE_TAGS} scores={s.scores} color="var(--accent)" highlight={s.hidden} />
        </Section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <span className="small muted">好きな読後感</span>
              <div className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--vermilion)' }}>{TAGS[s.aftertaste].label}</div>
            </div>
            <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{t.aftertaste}</span>
            <Bars tags={AFTERTASTE_TAGS} scores={s.scores} color="var(--vermilion)" />
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <span className="small muted">好きな書き方</span>
              <div className="serif" style={{ fontWeight: 800, fontSize: 22, color: 'var(--green)' }}>{TAGS[s.style].label}</div>
            </div>
            <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{t.style}</span>
            <Bars tags={STYLE_TAGS} scores={s.scores} color="var(--green)" />
          </div>
        </section>

        {/* 4. 隠れた好み */}
        {s.hidden && t.hidden && (
          <section style={{ border: '2px dashed var(--accent)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em' }}>隠れた好み</span>
            <span className="serif" style={{ fontWeight: 800, fontSize: 20 }}>{TAGS[s.hidden].label}</span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>{t.hidden}</p>
          </section>
        )}

        {/* 5. 読書の幅 */}
        {s.focusType && (
          <Section title="読書の幅">
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="serif" style={{ fontWeight: 800, fontSize: 20 }}>{FOCUS_LABEL[s.focusType].name}</span>
                <span className="small muted">好みの集中度 {s.focus}</span>
              </div>
              <div className="focus-scale" role="img" aria-label={`好みの集中度 ${s.focus}（雑食型〜一点集中型）`}>
                <span style={{ left: `${Math.min(97, Math.max(3, s.focus))}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }} className="small muted">
                <span>雑食型</span>
                <span>一点集中型</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75 }}>{FOCUS_LABEL[s.focusType].text}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="small muted">選んだ本のジャンル</span>
                <div className="genre-bar" aria-hidden="true">
                  {genreCount.map(([g, n], i) => (
                    <span key={g} style={{ flex: n, background: ['#2e4a73', '#b4442e', '#3d6a4c', '#a39a8a', '#5b3f78', '#6b4a2e'][i % 6] }} />
                  ))}
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{genreCount.map(([g, n]) => `${g} ${n}冊`).join('・')}</span>
              </div>
            </div>
          </Section>
        )}

        {/* 6. 本と本のつながり */}
        {t.connections && t.connections.length > 0 && (
          <Section title="ジャンルを越えたつながり">
            {t.connections.map((c, i) => {
              const [a, b] = c.bookIds.map((id) => bookById.get(id));
              if (!a || !b) return null;
              return (
                <div key={i} className="card" style={{ display: 'grid', gridTemplateColumns: '44px 20px 44px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
                  <LinkedCover book={a} />
                  <span className="serif muted" style={{ textAlign: 'center', fontSize: 18 }} aria-hidden="true">×</span>
                  <LinkedCover book={b} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 6 }}>
                    <span className="small muted">『{a.title}』×『{b.title}』</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>{c.text}</span>
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {/* 7. この結果になった理由 */}
        <Section title="この結果になった理由" lead={`「${TAGS[s.main].label}」の得点に、それぞれの本がどれだけ効いたか`}>
          <div>
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
                    <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)' }}>{reasonOf.get(e.bookId) ?? `「${TAGS[s.main].label}」の得点に効いた一冊です。`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* 8. 1冊ずつの読み解き */}
        <Section title="1冊ずつの読み解き" lead="AIが読み取った本の特徴と、あなたが惹かれていそうなところ">
          <div>
            {r.books.map((b) => {
              const liked = likedOf(b.volumeId);
              const strong = CORE_TAGS.filter((x) => (b.weights[x] ?? 0) >= 2);
              return (
                <div key={b.volumeId} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
                  <LinkedCover book={b} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="serif" style={{ fontWeight: 800, fontSize: 15 }}>
                      『{b.title}』
                      {r.favorite === b.volumeId && <span className="fav-badge">いちばん好き</span>}
                    </span>
                    <span className="small muted">
                      {b.genre}
                      {strong.length > 0 && `・${strong.map((x) => TAGS[x].label).join('・')}`}
                    </span>
                    {pointOf.get(b.volumeId) && <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>{pointOf.get(b.volumeId)}</span>}
                    <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--muted)' }}>{b.note}</span>
                    {liked.length > 0 && (
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {liked.map((l) => (
                          <span key={l} className="liked-tag">{l}</span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* 9. 相性と、合わないかもしれない本 */}
        {s.partner && s.contrast && (
          <Section title="ほかの読み筋との相性">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="small muted">話が合いそう</span>
                <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>{TYPE_NAMES[s.partner].name}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>同じ「{TAGS[s.partner].label}」の面白さを分かち合えそうです。</span>
              </div>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="small muted">新しい本を教えてくれそう</span>
                <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>{TYPE_NAMES[s.contrast].name}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>あなたがあまり手に取らない「{TAGS[s.contrast].label}」の本に詳しそうです。</span>
              </div>
            </div>
          </Section>
        )}

        {(t.mismatch || t.howToChoose) && (
          <Section title="本の選び方のヒント">
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t.howToChoose && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>次の本を探すなら</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.75 }}>{t.howToChoose}</span>
                </div>
              )}
              {t.mismatch && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vermilion)' }}>合わないかもしれない本</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.75 }}>{t.mismatch}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 10. おすすめ（AIの見立て＋次の一歩） */}
        {r.recommendations.length > 0 && (
          <Section title="次に読むなら">
            <span className="small muted" style={{ lineHeight: 1.7 }}>
              「読み味」と「引っかかるかも」は、AIによる見立てです。実際に読んだ人の感想は、各サイトのリンクからどうぞ。
            </span>
            {SHELVES.map((shelf) => {
              // 棚ができる前の結果は「意外な一冊」の印だけを見て振り分ける
              const items = r.recommendations.filter((rec) => (rec.shelf ?? (rec.surprise ? 'surprise' : 'center')) === shelf);
              if (items.length === 0) return null;
              return (
                <div key={shelf} className="shelf">
                  <div className="shelf-head">
                    <h3 className="serif">{SHELF_INFO[shelf].label}</h3>
                    <span className="small muted">{shelfLead(shelf, s)}</span>
                  </div>
                  {items.map((rec) => {
                    const shelfEvent = `rec_${shelf}` as const;
                    const links = bookLinks(rec.book);
                    const library = links.find((l) => l.key === 'library')!;
                    const reviews = links.filter((l) => l.key !== 'library');
                    const others = r.books.filter((b) => b.volumeId !== rec.book.volumeId).length;
                    return (
                      <div key={rec.book.volumeId} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 14 }}>
                          <LinkedCover book={rec.book} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                              <span className="serif" style={{ fontWeight: 800, fontSize: 16 }}>『{rec.book.title}』</span>
                            </div>
                            <span className="small muted">
                              {rec.book.authors.join('、')}
                              {rec.book.publisher ? `・${rec.book.publisher}` : ''}
                            </span>
                            <span style={{ fontSize: 13.5, lineHeight: 1.7 }}>{rec.reason}</span>
                            {rec.tags.length > 0 && <span className="small muted">重なる面白さ：{rec.tags.map((x) => TAGS[x].label).join('・')}</span>}
                          </div>
                        </div>

                        {(rec.feel || rec.caution) && (
                          <div className="rec-ai">
                            <span className="rec-ai-label">AIの見立て</span>
                            {rec.feel && (
                              <div className="rec-ai-row">
                                <span className="rec-ai-key">読み味</span>
                                <span>{rec.feel}</span>
                              </div>
                            )}
                            {rec.caution && (
                              <div className="rec-ai-row">
                                <span className="rec-ai-key rec-ai-key-caution">引っかかるかも</span>
                                <span>{rec.caution}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="rec-next">
                          <TrackedLink href={library.url} external events={[shelfEvent, 'rec_library']} className="btn btn-ghost rec-next-btn">
                            {library.label}
                          </TrackedLink>
                          <span className="small" style={{ lineHeight: 1.9 }}>
                            <span className="muted">感想を見る：</span>
                            {reviews.map((l, i) => (
                              <span key={l.key}>
                                {i > 0 && <span className="muted">・</span>}
                                <TrackedLink href={l.url} external events={[shelfEvent, 'rec_review']}>{l.label}</TrackedLink>
                              </span>
                            ))}
                            <span className="muted">・</span>
                            <TrackedLink href={rec.book.infoLink} external events={[shelfEvent, 'rec_google']}>Google Books</TrackedLink>
                          </span>
                          <TrackedLink href={`/diagnose?from=${r.id}&add=${rec.book.volumeId}`} events={[shelfEvent, 'rec_rediagnose']} className="small">
                            読んだら、この本も入れて診断し直す（いまの{others}冊＋1冊）→
                          </TrackedLink>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Section>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/diagnose" className="btn btn-ghost">もう一度診断する</Link>
          <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            結果は選んだ本から推定した読書傾向の仮説で、性格や能力を診断するものではありません。
            診断のために、選んだ本の情報をAI事業者（DeepSeek）に送っています。名前などあなたを特定する情報は送りません。
            このページのURLを共有すると、選んだ本も相手に見えます。
            利用状況を知るため、ページの閲覧数と操作の回数を数えています（Cookie は使わず、あなたを特定する情報は記録しません）。
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
