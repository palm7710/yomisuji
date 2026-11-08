'use client';
// 押された回数を数えるリンクと、表示された回数を数える部品（サーバー側のページから使う）
import Link from 'next/link';
import { useEffect } from 'react';
import type { EventName } from '@/lib/events';
import { track } from '@/lib/track';

export function TrackedLink({
  href,
  events,
  external,
  className,
  children,
}: {
  href: string;
  events: EventName[];
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => track(...events)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={() => track(...events)}>
      {children}
    </Link>
  );
}

/** 表示されたときに1回だけ数える */
export function TrackView({ event }: { event: EventName }) {
  useEffect(() => {
    track(event);
  }, [event]);
  return null;
}
