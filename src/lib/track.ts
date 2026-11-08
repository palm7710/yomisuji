'use client';
// ブラウザから操作の回数を送る。失敗しても画面には何も起こさない
import type { EventName } from './events';

export function track(...events: EventName[]) {
  if (events.length === 0) return;
  try {
    const body = JSON.stringify({ events });
    const sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    if (!sent) void fetch('/api/track', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch {
    /* noop */
  }
}
