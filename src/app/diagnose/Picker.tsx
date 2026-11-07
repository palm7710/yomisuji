'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Book, ThemeId } from '@/data/books';
import { CoverImage, GoogleAttribution, type ClientBookMeta } from '@/components/BookCover';
import { MAX_BOOKS, MAX_DISLIKED, MIN_BOOKS } from '@/lib/diagnose';
import { resultPath } from '@/lib/selection';

const MAX_LIKE_BOOKS = 5;
const STORAGE_KEY = 'yomisuji:draft:v1';

interface Draft {
  selected: string[];
  favorite: string;
  likes: string[];
  disliked: string[];
}

interface Props {
  books: Book[];
  themes: { id: ThemeId; label: string }[];
  metas: Record<string, ClientBookMeta | null>;
}

export function Picker({ books, themes, metas }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<'pick' | 'deepen'>('pick');
  const [theme, setTheme] = useState<ThemeId>(themes[0].id);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft>({ selected: [], favorite: '', likes: [], disliked: [] });
  const [showDisliked, setShowDisliked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 選んだ本を端末に一時保存し、戻る操作や再読み込みで消えないようにする
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setDraft(JSON.parse(saved));
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

  const byId = useMemo(() => Object.fromEntries(books.map((b) => [b.id, b])), [books]);
  const count = draft.selected.length;
  const ready = count >= MIN_BOOKS;

  const visible = useMemo(() => {
    const q = query.trim().normalize('NFKC').toLowerCase();
    if (q) return books.filter((b) => `${b.title}${b.author}`.normalize('NFKC').toLowerCase().includes(q));
    return books.filter((b) => b.theme === theme);
  }, [books, query, theme]);

  const toggleBook = (id: string) =>
    setDraft((d) => {
      if (d.selected.includes(id)) {
        return {
          ...d,
          selected: d.selected.filter((x) => x !== id),
          favorite: d.favorite === id ? '' : d.favorite,
          likes: d.likes.filter((k) => !k.startsWith(`${id}:`)),
        };
      }
      if (d.selected.length >= MAX_BOOKS) return d;
      return { ...d, selected: [...d.selected, id], disliked: d.disliked.filter((x) => x !== id) };
    });

  const toggleLike = (key: string) =>
    setDraft((d) => ({ ...d, likes: d.likes.includes(key) ? d.likes.filter((k) => k !== key) : [...d.likes, key] }));

  const toggleDisliked = (id: string) =>
    setDraft((d) => {
      if (d.disliked.includes(id)) return { ...d, disliked: d.disliked.filter((x) => x !== id) };
      if (d.disliked.length >= MAX_DISLIKED) return d;
      return { ...d, disliked: [...d.disliked, id] };
    });

  const submit = (withDetails: boolean) => {
    setSubmitting(true);
    router.push(
      resultPath({
        books: draft.selected,
        favorite: withDetails ? draft.favorite || undefined : undefined,
        likes: withDetails ? draft.likes : [],
        disliked: withDetails ? draft.disliked : [],
      }),
    );
  };

  if (step === 'pick') {
    return (
      <main className="page">
        <div className="topbar">
          <Link href="/" className="iconbtn" aria-label="トップに戻る">
            <BackIcon />
          </Link>
          <div>
            <div className="small muted">ステップ 1 / 2</div>
            <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 21 }}>
              読んだことのある本を選ぶ
            </h1>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="q" className="small muted">
            書名・著者でしぼりこむ
          </label>
          <input id="q" className="input" type="search" placeholder="例：三体" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {!query && (
          <div className="hscroll pad" style={{ paddingTop: 14 }} role="tablist" aria-label="テーマ">
            {themes.map((t) => (
              <button
                key={t.id}
                className="chip"
                role="tab"
                aria-selected={t.id === theme}
                aria-pressed={t.id === theme}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="pad" style={{ paddingTop: 16, paddingBottom: 20, flexGrow: 1 }}>
          {visible.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              見つかりませんでした。いまは作品リストの中から選べます。
            </p>
          ) : (
            <div className="book-grid">
              {visible.map((b) => {
                const on = draft.selected.includes(b.id);
                return (
                  <button key={b.id} className="book-tile" aria-pressed={on} onClick={() => toggleBook(b.id)}>
                    <CoverImage book={b} meta={metas[b.id]} />
                    {on && (
                      <span className="check" aria-hidden="true">
                        <CheckIcon />
                      </span>
                    )}
                    <span className="book-title">{b.title}</span>
                    <span className="book-author">{b.author}</span>
                  </button>
                );
              })}
            </div>
          )}
          <GoogleAttribution />
        </div>

        <div className="sticky-foot">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }} aria-live="polite">
              選んだ本 <b className="serif" style={{ fontSize: 22 }}>{count}</b> 冊
            </span>
            <span className="small muted">
              {count >= MAX_BOOKS ? `${MAX_BOOKS}冊まで選べます` : `${MIN_BOOKS}〜${MAX_BOOKS}冊・テーマをまたいでOK`}
            </span>
          </div>
          <button className="btn btn-primary" disabled={!ready} onClick={() => setStep('deepen')}>
            {ready ? '次へ' : `あと${MIN_BOOKS - count}冊選んでください`}
          </button>
        </div>
      </main>
    );
  }

  // ステップ2：もっと詳しく（任意）
  const likeBooks = draft.selected.map((id) => byId[id]).filter((b) => b.likes.length > 0).slice(0, MAX_LIKE_BOOKS);
  const clues = count + (draft.favorite ? 2 : 0) + draft.likes.length * 2 + draft.disliked.length;
  const unselected = books.filter((b) => !draft.selected.includes(b.id));

  return (
    <main className="page">
      <div className="topbar">
        <button className="iconbtn" aria-label="本選びに戻る" onClick={() => setStep('pick')}>
          <BackIcon />
        </button>
        <div>
          <div className="small muted">ステップ 2 / 2・任意</div>
          <h1 className="serif" style={{ margin: 0, fontWeight: 800, fontSize: 21 }}>
            もっと詳しく診断する
          </h1>
        </div>
      </div>

      <div className="pad" style={{ paddingTop: 14, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 18, flexGrow: 1 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>いちばん好きな1冊は？</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {draft.selected.map((id) => (
              <button
                key={id}
                className="chip red"
                aria-pressed={draft.favorite === id}
                onClick={() => setDraft((d) => ({ ...d, favorite: d.favorite === id ? '' : id }))}
              >
                {byId[id].title}
              </button>
            ))}
          </div>
        </section>

        {likeBooks.map((b) => (
          <section key={b.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500 }} className="muted">
              <span className="serif" style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                {b.title}
              </span>
              　のどこが好き？
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {b.likes.map((o, i) => {
                const key = `${b.id}:${i}`;
                return (
                  <button key={key} className="chip accent" style={{ borderRadius: 6 }} aria-pressed={draft.likes.includes(key)} onClick={() => toggleLike(key)}>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unselected.map((b) => (
                <button key={b.id} className="chip" aria-pressed={draft.disliked.includes(b.id)} onClick={() => toggleDisliked(b.id)}>
                  {b.title}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="sticky-foot">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
            読み取れる手がかり
          </span>
          <div className="bar-track" style={{ flexGrow: 1, height: 8 }}>
            <div className="bar-fill" style={{ width: `${Math.min(100, Math.round((clues / 30) * 100))}%`, background: 'var(--accent)' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{clues}個</span>
        </div>
        <button className="btn btn-primary" onClick={() => submit(true)} disabled={submitting}>
          {submitting ? '診断しています…' : '診断する'}
        </button>
        <button
          className="iconbtn"
          style={{ width: '100%', fontSize: 13, color: 'var(--muted)', height: 36 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          とばして結果を見る
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
