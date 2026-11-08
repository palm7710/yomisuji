// 操作の回数を見るページ。/stats?key=<STATS_KEY> で開く（合言葉が合わない・未設定なら「見つかりません」）
// ページの閲覧数・流入元は Cloudflare のダッシュボード（Web Analytics）で見る
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { dayKey, EVENTS, type EventName } from '@/lib/events';
import { loadCounters } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '利用状況｜読み筋診断', robots: { index: false, follow: false } };

const DAYS = 14;

function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const secret = process.env.STATS_KEY;
  const { key } = await searchParams;
  if (!secret || !key || !sameKey(key, secret)) notFound();

  const today = new Date();
  const days = Array.from({ length: DAYS }, (_, i) => dayKey(new Date(today.getTime() - i * 24 * 60 * 60 * 1000)));
  const names = Object.keys(EVENTS) as EventName[];
  const counts = await loadCounters(days, names);
  const sum = (e: EventName, n: number) => days.slice(0, n).reduce((acc, d) => acc + (counts[d][e] ?? 0), 0);

  const groups = [...new Set(names.map((e) => EVENTS[e].group))];
  const w = (e: EventName) => sum(e, 7);

  return (
    <main className="page pad" style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 24, paddingBottom: 40 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 24 }}>利用状況</h1>
        <span className="small muted">
          日付は日本時間。ページの閲覧数・流入元・端末は Cloudflare のダッシュボード（Web Analytics）で見られます。
          保存先が Cloudflare KV のときは、同時に押された回数を取りこぼすことがあり、おおよその数です。
        </span>
      </header>

      <section className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        {[
          ['診断の完了（7日）', String(w('diagnose_done'))],
          ['選び始めた人のうち診断まで', pct(w('diagnose_done'), w('pick_start'))],
          ['診断1回あたりのシェア', pct(w('share_x') + w('share_copy'), w('diagnose_done'))],
          ['診断1回あたりのおすすめクリック', pct(w('rec_center') + w('rec_detour') + w('rec_stretch') + w('rec_surprise'), w('diagnose_done'))],
          ['検索が0件だった割合', pct(w('search_zero'), w('search'))],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="small muted">{label}</span>
            <span className="serif" style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          </div>
        ))}
      </section>

      {groups.map((g) => (
        <section key={g} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="label" style={{ margin: 0 }}>{g}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>操作</th>
                  <th>今日</th>
                  <th>7日</th>
                  <th>14日</th>
                  {days.map((d) => (
                    <th key={d}>{d.slice(5).replace('-', '/')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {names
                  .filter((e) => EVENTS[e].group === g)
                  .map((e) => (
                    <tr key={e}>
                      <td>{EVENTS[e].label}</td>
                      <td>{sum(e, 1)}</td>
                      <td>{sum(e, 7)}</td>
                      <td>{sum(e, DAYS)}</td>
                      {days.map((d) => (
                        <td key={d} className="muted">{counts[d][e] ?? 0}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
