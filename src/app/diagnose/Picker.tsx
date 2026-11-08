'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CoverImage, GoogleAttribution } from '@/components/BookCover';
import { ReadingCat } from '@/components/ReadingCat';
import type { SearchBookMeta } from '@/lib/googleBooks';
import { MAX_BOOKS, MIN_BOOKS } from '@/lib/scoring';
import { track } from '@/lib/track';

// 選んだ本は端末（localStorage）に保存し、タブを閉じて再訪問しても残す
const STORAGE_KEY = 'yomisuji:draft:v6';
/** 以前のタブ内だけの保存先（移行のために一度だけ読む） */
const LEGACY_SESSION_KEY = 'yomisuji:draft:v5';

/** 保存されていた中身を確かめて、本の一覧として使える形だけ返す */
function parseSaved(raw: string | null): SearchBookMeta[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!Array.isArray(parsed.selected)) return null;
    return parsed.selected
      .filter((b): b is SearchBookMeta => !!b && typeof b.volumeId === 'string' && typeof b.title === 'string' && Array.isArray(b.authors))
      .slice(0, MAX_BOOKS);
  } catch {
    return null;
  }
}

function loadDraft(): SearchBookMeta[] | null {
  try {
    const saved = parseSaved(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
    const legacy = parseSaved(sessionStorage.getItem(LEGACY_SESSION_KEY));
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    return legacy;
  } catch {
    return null; // 保存できない環境（プライベートモードなど）ではそのまま
  }
}

function saveDraft(draft: Draft) {
  try {
    if (draft.selected.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* noop */
  }
}

interface Draft {
  selected: SearchBookMeta[];
}

const EMPTY: Draft = { selected: [] };
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
        if (seq === seqRef.current) {
          setResults(json.books);
          // 回数だけ数える（検索語は送らない）
          track(...(json.books.length === 0 ? (['search', 'search_zero'] as const) : (['search'] as const)));
        }
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

export function Picker({ initial }: { initial?: SearchBookMeta[] } = {}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft>(initial ? { selected: initial } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useBookSearch(query);

  // 選んだ本を端末に保存し、再読み込みや再訪問でも消えないようにする。
  // 読み込みが終わるまでは保存しない（空の状態で上書きしないため）
  // 結果ページから「診断し直す」で来たときは、渡された本を優先して保存し直す
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!initial) {
      const saved = loadDraft();
      if (saved && saved.length > 0) setDraft({ selected: saved });
    }
    setRestored(true);
    // 最初の表示のときだけ読み込む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restored) saveDraft(draft);
  }, [draft, restored]);

  const selectedIds = useMemo(() => new Set(draft.selected.map((b) => b.volumeId)), [draft.selected]);
  const count = draft.selected.length;
  const ready = count >= MIN_BOOKS;
  const full = count >= MAX_BOOKS;

  const addBook = (b: SearchBookMeta) => {
    if (selectedIds.has(b.volumeId) || full) return;
    if (draft.selected.length === 0) track('pick_start');
    setDraft((d) => ({ selected: [...d.selected, b] }));
    // 選んだら検索を閉じて、選んだ本の並びに戻る
    setQuery('');
    setJustAdded(displayTitle(b));
    inputRef.current?.focus();
  };

  const removeBook = (b: SearchBookMeta) => setDraft((d) => ({ selected: d.selected.filter((x) => x.volumeId !== b.volumeId) }));

  const submit = async () => {
    if (!ready || busy) return;
    track('diagnose_submit');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          books: draft.selected.map((b) => b.volumeId),
          seriesTitles: Object.fromEntries(
            draft.selected.filter((b) => b.seriesTitle).map((b) => [b.volumeId, b.seriesTitle!]),
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

  const showingResults = query.trim().length > 0;
  return (
      <main className="page">
        {busy && <ReadingCat />}
        <div className="topbar">
          <Link href="/" className="iconbtn" aria-label="トップに戻る">
            <BackIcon />
          </Link>
          <div>
            <div className="small muted">読み筋診断</div>
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
                    ? search.results.some((b) => b.authorMatch)
                      ? `${search.results.length}件見つかりました。著者名が一致する本を先に表示しています`
                      : `${search.results.length}件見つかりました。書名が近い順に表示しています`
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
                {(search.results ?? []).map((b, i, list) => {
                  const on = selectedIds.has(b.volumeId);
                  const hasAuthor = list.some((x) => x.authorMatch);
                  // 著者名で見つかった本と、それ以外の本の境目に見出しを出す
                  const heading =
                    hasAuthor && i === 0
                      ? `「${query.trim()}」の本`
                      : hasAuthor && !b.authorMatch && list[i - 1]?.authorMatch
                        ? `「${query.trim()}」を含むほかの本`
                        : '';
                  return (
                    <li key={b.volumeId}>
                      {heading && <h3 className="result-heading">{heading}</h3>}
                      <button className="result-row" onClick={() => (on ? removeBook(b) : addBook(b))} aria-pressed={on}>
                        <span style={{ width: 44, flexShrink: 0 }}>
                          <CoverImage book={b} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexGrow: 1 }}>
                          <span className="book-title" style={{ fontSize: 14 }}>{displayTitle(b)}</span>
                          {(b.seriesCount ?? 0) > 1 && (
                            <span className="small muted">
                              {b.seriesRepresentativeVolume === 1 ? '1巻目' : '先頭の巻'}を表示し、同じシリーズの検索結果を1件にまとめています
                            </span>
                          )}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <h2 id="sel-h" className="label" style={{ margin: 0 }}>選んだ本（タップで外す）</h2>
                <button type="button" className="link-button small" onClick={() => setDraft(EMPTY)}>
                  すべて外す
                </button>
              </div>
              <p className="small muted" style={{ margin: '0 0 12px' }}>選んだ本はこの端末に保存され、次に開いたときも残っています。</p>
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
          {error && <p className="error-box" role="alert" style={{ margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }} aria-live="polite">
              選んだ本 <b className="serif" style={{ fontSize: 22 }}>{count}</b> 冊
            </span>
            <span className="small muted">{MIN_BOOKS}〜{MAX_BOOKS}冊</span>
          </div>
          <button className="btn btn-primary" disabled={!ready || busy} onClick={submit}>
            {ready ? 'この本で診断する' : `あと${MIN_BOOKS - count}冊選んでください`}
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
