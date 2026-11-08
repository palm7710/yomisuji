'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

/** X への投稿（Web Intent）とリンクのコピー */
export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const intent = `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url, hashtags: '読み筋診断' })}`;

  const copy = async () => {
    track('share_copy');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('このURLをコピーしてください', url);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      <a href={intent} target="_blank" rel="noopener noreferrer" className="btn btn-dark" style={{ padding: '12px 0', fontSize: 14 }} onClick={() => track('share_x')}>
        Xに投稿
      </a>
      <button className="btn btn-ghost" style={{ padding: '12px 0', fontSize: 14 }} onClick={copy} aria-live="polite">
        {copied ? 'コピーしました' : 'リンクをコピー'}
      </button>
    </div>
  );
}
