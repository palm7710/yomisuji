'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIKE_OPTIONS } from '@/data/likes';
import { AiNotice, CoverImage, GoogleAttribution } from '@/components/BookCover';
import type { SearchBookMeta } from '@/lib/googleBooks';
import { MAX_BOOKS, MAX_DISLIKED, MAX_LIKE_BOOKS, MIN_BOOKS } from '@/lib/scoring';

const STORAGE_KEY = 'yomisuji:draft:v4';
const PROGRESS = ['本の情報を集めています', 'AIが本ごとの面白さを読み解いています', 'あなたの読み筋を計算しています', 'AIが説明文とおすすめを書いています', 'おすすめの本を Google Books で確かめています'];

interface Draft {
  selected: SearchBookMeta[];
  favorite: string;
  likes: string[];
  disliked: SearchBookMeta[];
}

const EMPTY: Draft = { selected: [], favorite: '', likes: [], disliked: [] };
const displayTitle = (book: SearchBookMeta) => book.seriesTitle ?? book.title;

/** Google Books の検索（入力が止まって0.4秒後に検索する） */
function useBookSearch(query: string) {
  const [results, setResults] = useState<SearchBookMeta[] | null>(null);
  const [searching, setSearching] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const seq = ++seqRef.current;
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { books: SearchBookMeta[] };
        if (seq === seqRef.current) setResults(json.books);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return { results, searching };
}

export function Picker() {
  const router = useRouter();
  const [step, setStep] = useState<'pick' | 'deepen'>('pick');
  const [query, setQuery] = useState('');
  const [dislikeQuery, setDislikeQuery] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showDisliked, setShowDisliked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useBookSearch(query);
  const dislikeSearch = useBookSearch(dislikeQuery);

  // 選んだ本を端末に一時保存し、戻る操作や再読み込みで消えないようにする
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setDraft({ ...EMPTY, ...JSON.parse(saved) });
    } catch {
      /* 保存できない環境ではそのまま */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* noop */
    }
  }, [draft]);

  // 診断中の表示を少しずつ進める（実際の進み具合とは連動しない目安）
  useEffect(() => {
    if (!busy) return;
    setProgress(0);
    const t = setInterval(() => setProgress((p) => Math.min(PROGRESS.length - 1, p + 1)), 4500);
    return () => clearInterval(t);
  }, [busy]);

  const selectedIds = useMemo(() => new Set(draft.selected.map((b) => b.volumeId)), [draft.selected]);
  const count = draft.selected.length;
  const ready = count >= MIN_BOOKS;
  const full = count >= MAX_BOOKS;

  const addBook = (b: SearchBookMeta) => {
    if (selectedIds.has(b.volumeId) || full) return;
    setDraft((d) => ({ ...d, selected: [...d.selected, b], disliked: d.disliked.filter((x) => x.volumeId !== b.volumeId) }));
    // 選んだら検索を閉じて、選んだ本の並びに戻る
    setQuery('');
    setJustAdded(displayTitle(b));
    inputRef.current?.focus();
  };

  const removeBook = (b: SearchBookMeta) =>
    setDraft((d) => ({
      ...d,
      selected: d.selected.filter((x) => x.volumeId !== b.volumeId),
      favorite: d.favorite === b.volumeId ? '' : d.favorite,
      likes: d.likes.filter((k) => !k.startsWith(`${b.volumeId}:`)),
    }));

  const toggleLike = (key: string) =>
    setDraft((d) => ({ ...d, likes: d.likes.includes(key) ? d.likes.filter((k) => k !== key) : [...d.likes, key] }));

  const addDisliked = (b: SearchBookMeta) => {
    setDraft((d) => {
      if (d.disliked.some((x) => x.volumeId === b.volumeId) || d.disliked.length >= MAX_DISLIKED || selectedIds.has(b.volumeId)) return d;
      return { ...d, disliked: [...d.disliked, b] };
    });
    setDislikeQuery('');
  };
  const removeDisliked = (b: SearchBookMeta) => setDraft((d) => ({ ...d, disliked: d.disliked.filter((x) => x.volumeId !== b.volumeId) }));

  const submit = async (withDetails: boolean) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          books: draft.selected.map((b) => b.volumeId),
          favorite: withDetails ? draft.favorite || undefined : undefined,
          likes: withDetails ? draft.likes : [],
          disliked: withDetails ? draft.disliked.map((b) => b.volumeId) : [],
          seriesTitles: Object.fromEntries(
            [...draft.selected, ...(withDetails ? draft.disliked : [])]
              .filter((b) => b.seriesTitle)
              .map((b) => [b.volumeId, b.seriesTitle!]),
          ),
        }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? '診断できませんでした');
      router.push(`/r/${json.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (step === 'pick') {
    const showingResults = query.trim().length > 0;
    return (
      <main className="page">
        <div className="topbar">
          <Link href="/" className="iconbtn" aria-label="トップに戻る">
            <BackIcon />
          </Link>
          <div>
            <div className="small muted">ステップ 1 / 2</div>
            <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 21 }}>読んだことのある本を選ぶ</h1>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="q" className="small muted">書名・著者で探す（Google Books から検索）</label>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              id="q"
              className="input"
              type="search"
              placeholder="例：ワンピース、東野圭吾、エッセイ"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setJustAdded('');
              }}
              autoComplete="off"
              disabled={full}
            />
          </div>
          <p className="small muted" style={{ margin: 0, minHeight: 18 }} aria-live="polite">
            {full
              ? `${MAX_BOOKS}冊選びました。入れ替えるときは、下の本を外してください`
              : showingResults
                ? search.searching
                  ? '検索しています…'
                  : search.results
                    ? `${search.results.length}件見つかりました。タップで追加します`
                    : ''
                : justAdded
                  ? `『${justAdded}』を追加しました。続けて探せます`
                  : ''}
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 8, paddingBottom: 20, flexGrow: 1 }}>
          {showingResults ? (
            search.results && search.results.length === 0 && !search.searching ? (
              <p className="muted" style={{ fontSize: 14 }}>見つかりませんでした。書名の一部や著者名でも探せます。</p>
            ) : (
              <ul className="result-list" aria-label="検索結果">
                {(search.results ?? []).map((b) => {
                  const on = selectedIds.has(b.volumeId);
                  return (
                    <li key={b.volumeId}>
                      <button className="result-row" onClick={() => (on ? removeBook(b) : addBook(b))} aria-pressed={on}>
                        <span style={{ width: 44, flexShrink: 0 }}>
                          <CoverImage book={b} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
                          <span className="book-title" style={{ fontSize: 14 }}>{displayTitle(b)}</span>
                          {(b.seriesCount ?? 0) > 1 && <span className="small muted">同シリーズの{b.seriesCount}件をまとめて表示</span>}
                          <span className="book-author">
                            {b.authors.join('、')}
                            {b.publishedDate ? `・${b.publishedDate.slice(0, 4)}` : ''}
                          </span>
                        </span>
                        <span className={on ? 'row-action on' : 'row-action'} aria-hidden="true">
                          {on ? <CheckIcon /> : <PlusIcon />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : count === 0 ? (
            <div className="empty-state">
              <SearchIcon />
              <p className="serif" style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>読んだことのある本を探してください</p>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
                小説、マンガ、エッセイ、ビジネス書など、どんな本でも選べます。
                <br />
                好きだった本を{MIN_BOOKS}〜{MAX_BOOKS}冊選ぶと診断できます。
              </p>
            </div>
          ) : (
            <section aria-labelledby="sel-h">
              <h2 id="sel-h" className="label" style={{ marginBottom: 12 }}>選んだ本（タップで外す）</h2>
              <div className="book-grid">
                {draft.selected.map((b) => (
                  <button key={b.volumeId} className="book-tile" onClick={() => removeBook(b)} aria-label={`『${displayTitle(b)}』を外す`}>
                    <CoverImage book={b} />
                    <span className="check remove" aria-hidden="true">
                      <CloseIcon />
                    </span>
                    <span className="book-title">{displayTitle(b)}</span>
                    <span className="book-author">{b.authors.join('、')}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <GoogleAttribution />
        </div>

        <div className="sticky-foot">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }} aria-live="polite">
              選んだ本 <b className="serif" style={{ fontSize: 22 }}>{count}</b> 冊
            </span>
            <span className="small muted">{MIN_BOOKS}〜{MAX_BOOKS}冊</span>
          </div>
          <button className="btn btn-primary" disabled={!ready} onClick={() => setStep('deepen')}>
            {ready ? '次へ' : `あと${MIN_BOOKS - count}冊選んでください`}
          </button>
        </div>
      </main>
    );
  }

  // ステップ2：もっと詳しく（任意）
  const likeBooks = draft.selected.slice(0, MAX_LIKE_BOOKS);
  const clues = count + (draft.favorite ? 2 : 0) + draft.likes.length * 2 + draft.disliked.length;

  return (
    <main className="page">
      {busy && (
        <div className="overlay" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 19 }}>{PROGRESS[progress]}</p>
          <p className="small muted" style={{ margin: 0 }}>20〜40秒ほどかかります。このままお待ちください。</p>
        </div>
      )}
      <div className="topbar">
        <button className="iconbtn" aria-label="本選びに戻る" onClick={() => setStep('pick')}>
          <BackIcon />
        </button>
        <div>
          <div className="small muted">ステップ 2 / 2・任意</div>
          <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 21 }}>もっと詳しく診断する</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingTop: 14, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 18, flexGrow: 1 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>いちばん好きな1冊は？</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {draft.selected.map((b) => (
              <button
                key={b.volumeId}
                className="chip red"
                aria-pressed={draft.favorite === b.volumeId}
                onClick={() => setDraft((d) => ({ ...d, favorite: d.favorite === b.volumeId ? '' : b.volumeId }))}
              >
                {displayTitle(b)}
              </button>
            ))}
          </div>
        </section>

        {likeBooks.map((b) => (
          <section key={b.volumeId} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500 }} className="muted">
              <span className="serif" style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{displayTitle(b)}</span>　のどこが好き？<span style={{ fontSize: 12 }}>（いくつでも）</span>
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LIKE_OPTIONS.map((o) => {
                const key = `${b.volumeId}:${o.id}`;
                return (
                  <button key={key} className="chip accent like-chip" aria-pressed={draft.likes.includes(key)} onClick={() => toggleLike(key)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="iconbtn"
            style={{ width: 'auto', justifyContent: 'flex-start', fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'underline' }}
            aria-expanded={showDisliked}
            onClick={() => setShowDisliked((v) => !v)}
          >
            合わなかった本も伝える（任意・{MAX_DISLIKED}冊まで）
          </button>
          {showDisliked && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.disliked.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {draft.disliked.map((b) => (
                    <button key={b.volumeId} className="chip" aria-pressed="true" onClick={() => removeDisliked(b)} aria-label={`『${displayTitle(b)}』を外す`}>
                      {displayTitle(b)} ×
                    </button>
                  ))}
                </div>
              )}
              {draft.disliked.length < MAX_DISLIKED && (
                <>
                  <label htmlFor="dq" className="visually-hidden">合わなかった本を探す</label>
                  <input id="dq" className="input" type="search" placeholder="合わなかった本を探す" value={dislikeQuery} onChange={(e) => setDislikeQuery(e.target.value)} autoComplete="off" />
                  {dislikeQuery.trim() && (
                    <ul className="result-list" aria-label="合わなかった本の検索結果">
                      {dislikeSearch.searching && <li className="small muted">検索しています…</li>}
                      {(dislikeSearch.results ?? [])
                        .filter((b) => !selectedIds.has(b.volumeId))
                        .slice(0, 6)
                        .map((b) => (
                          <li key={b.volumeId}>
                            <button className="result-row" onClick={() => addDisliked(b)}>
                              <span style={{ width: 32, flexShrink: 0 }}>
                                <CoverImage book={b} />
                              </span>
                              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
                                <span className="book-title">{displayTitle(b)}</span>
                                {(b.seriesCount ?? 0) > 1 && <span className="small muted">同シリーズの{b.seriesCount}件をまとめて表示</span>}
                                <span className="book-author">{b.authors.join('、')}</span>
                              </span>
                              <span className="row-action" aria-hidden="true">
                                <PlusIcon />
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <AiNotice compact />
      </div>

      <div className="sticky-foot">
        {error && <p className="error-box" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>読み取れる手がかり</span>
          <div className="bar-track" style={{ flexGrow: 1, height: 8 }}>
            <div className="bar-fill" style={{ width: `${Math.min(100, Math.round((clues / 30) * 100))}%`, background: 'var(--accent)' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{clues}個</span>
        </div>
        <button className="btn btn-primary" onClick={() => submit(true)} disabled={busy}>診断する</button>
        <button className="iconbtn" style={{ width: '100%', fontSize: 13, color: 'var(--muted)', height: 36 }} onClick={() => submit(false)} disabled={busy}>
          とばして診断する
        </button>
      </div>
    </main>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--rule-strong)" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}
