'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThemeId } from '@/data/books';
import { CORE_TAGS, TAGS } from '@/data/tags';
import { AiNotice, CoverImage, GoogleAttribution } from '@/components/BookCover';
import type { PublicBookMeta } from '@/lib/googleBooks';
import { MAX_BOOKS, MAX_DISLIKED, MAX_LIKE_BOOKS, MIN_BOOKS } from '@/lib/scoring';

const STORAGE_KEY = 'yomisuji:draft:v2';
const PROGRESS = ['本の情報を集めています', 'AIが本ごとの面白さを読み解いています', 'あなたの読み筋を計算しています', 'AIが説明文とおすすめを書いています', 'おすすめの本を Google Books で確かめています'];

export interface ShelfItem {
  theme: ThemeId;
  book: PublicBookMeta;
}

interface Draft {
  selected: PublicBookMeta[];
  favorite: string;
  likes: string[];
  disliked: PublicBookMeta[];
}

const EMPTY: Draft = { selected: [], favorite: '', likes: [], disliked: [] };

export function Picker({ themes, shelf }: { themes: { id: ThemeId; label: string }[]; shelf: ShelfItem[] }) {
  const router = useRouter();
  const [step, setStep] = useState<'pick' | 'deepen'>('pick');
  const [theme, setTheme] = useState<ThemeId>(themes[0].id);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicBookMeta[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showDisliked, setShowDisliked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const searchSeq = useRef(0);

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

  // Google Books の検索（入力が止まって0.4秒後）
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { books: PublicBookMeta[] };
        if (seq === searchSeq.current) setResults(json.books);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

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
  const visible = results ?? shelf.filter((s) => s.theme === theme).map((s) => s.book);

  const toggleBook = (b: PublicBookMeta) =>
    setDraft((d) => {
      if (d.selected.some((x) => x.volumeId === b.volumeId)) {
        return {
          ...d,
          selected: d.selected.filter((x) => x.volumeId !== b.volumeId),
          favorite: d.favorite === b.volumeId ? '' : d.favorite,
          likes: d.likes.filter((k) => !k.startsWith(`${b.volumeId}:`)),
        };
      }
      if (d.selected.length >= MAX_BOOKS) return d;
      return { ...d, selected: [...d.selected, b], disliked: d.disliked.filter((x) => x.volumeId !== b.volumeId) };
    });

  const toggleLike = (key: string) =>
    setDraft((d) => ({ ...d, likes: d.likes.includes(key) ? d.likes.filter((k) => k !== key) : [...d.likes, key] }));

  const toggleDisliked = (b: PublicBookMeta) =>
    setDraft((d) => {
      if (d.disliked.some((x) => x.volumeId === b.volumeId)) return { ...d, disliked: d.disliked.filter((x) => x.volumeId !== b.volumeId) };
      if (d.disliked.length >= MAX_DISLIKED) return d;
      return { ...d, disliked: [...d.disliked, b] };
    });

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

  const overlay = busy && (
    <div className="overlay" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 19 }}>{PROGRESS[progress]}</p>
      <p className="small muted" style={{ margin: 0 }}>20〜40秒ほどかかります。このままお待ちください。</p>
    </div>
  );

  if (step === 'pick') {
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
          <input id="q" className="input" type="search" placeholder="例：三体、東野圭吾" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>

        {!query && (
          <div className="hscroll pad" style={{ paddingTop: 14 }} aria-label="テーマの棚">
            {themes.map((t) => (
              <button key={t.id} className="chip" aria-pressed={t.id === theme} onClick={() => setTheme(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="pad" style={{ paddingTop: 16, paddingBottom: 20, flexGrow: 1 }}>
          {query && (
            <p className="small muted" style={{ margin: '0 0 12px' }} aria-live="polite">
              {searching ? '検索しています…' : results ? `${results.length}件見つかりました` : ''}
            </p>
          )}
          {visible.length === 0 && !searching ? (
            <p className="muted" style={{ fontSize: 14 }}>
              {query ? '見つかりませんでした。書名の一部や著者名でも探せます。' : 'この棚の本を読み込めませんでした。上の検索から探してください。'}
            </p>
          ) : (
            <div className="book-grid">
              {visible.map((b) => {
                const on = selectedIds.has(b.volumeId);
                return (
                  <button key={b.volumeId} className="book-tile" aria-pressed={on} onClick={() => toggleBook(b)}>
                    <CoverImage book={b} />
                    {on && (
                      <span className="check" aria-hidden="true">
                        <CheckIcon />
                      </span>
                    )}
                    <span className="book-title">{b.title}</span>
                    <span className="book-author">{b.authors.join('、')}</span>
                  </button>
                );
              })}
            </div>
          )}
          <GoogleAttribution />
        </div>

        <div className="sticky-foot">
          {count > 0 && (
            <div className="selected-strip" aria-label="選んだ本（タップで外す）">
              {draft.selected.map((b) => (
                <button key={b.volumeId} className="selected-pill" onClick={() => toggleBook(b)} aria-label={`『${b.title}』を外す`}>
                  <span>{b.title}</span>
                  <CloseIcon />
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }} aria-live="polite">
              選んだ本 <b className="serif" style={{ fontSize: 22 }}>{count}</b> 冊
            </span>
            <span className="small muted">{count >= MAX_BOOKS ? `${MAX_BOOKS}冊まで選べます` : `${MIN_BOOKS}〜${MAX_BOOKS}冊`}</span>
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
  const dislikeCandidates = shelf.map((s) => s.book).filter((b) => !selectedIds.has(b.volumeId));

  return (
    <main className="page">
      {overlay}
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
                {b.title}
              </button>
            ))}
          </div>
        </section>

        {likeBooks.map((b) => (
          <section key={b.volumeId} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500 }} className="muted">
              <span className="serif" style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{b.title}</span>　のどこが好き？
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CORE_TAGS.map((t) => {
                const key = `${b.volumeId}:${t}`;
                return (
                  <button key={key} className="chip accent" style={{ borderRadius: 6 }} aria-pressed={draft.likes.includes(key)} onClick={() => toggleLike(key)}>
                    {TAGS[t].label}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {dislikeCandidates.map((b) => (
                <button key={b.volumeId} className="chip" aria-pressed={draft.disliked.some((x) => x.volumeId === b.volumeId)} onClick={() => toggleDisliked(b)}>
                  {b.title}
                </button>
              ))}
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
