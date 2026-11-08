// 「次に読むなら」の棚。おすすめ本を「どの好みからすすめたか」で4つに分ける。
// candidates は AI に出させる候補の数。実在確認で落ちる本があるので、表示する冊数（show）より多めにする

import { TAGS } from './tags';
import type { ScoringResult } from '@/lib/scoring';

export const SHELVES = ['center', 'detour', 'stretch', 'surprise'] as const;
export type Shelf = (typeof SHELVES)[number];

export const SHELF_INFO: Record<Shelf, { label: string; show: number; candidates: number }> = {
  center: { label: 'ど真ん中', show: 2, candidates: 3 },
  detour: { label: '寄り道', show: 2, candidates: 3 },
  stretch: { label: 'ちょっと背伸び', show: 1, candidates: 2 },
  surprise: { label: '意外な一冊', show: 1, candidates: 2 },
};

export const isShelf = (v: unknown): v is Shelf => (SHELVES as readonly unknown[]).includes(v);

/** 棚の見出しに添える一言。その人の診断結果のタグ名を入れる */
export function shelfLead(shelf: Shelf, s: Pick<ScoringResult, 'main' | 'sub' | 'hidden' | 'contrast'>): string {
  switch (shelf) {
    case 'center':
      return `「${TAGS[s.main].label}」に一直線`;
    case 'detour':
      return `「${TAGS[s.sub].label}」${s.hidden ? `や「${TAGS[s.hidden].label}」` : ''}から寄り道`;
    case 'stretch':
      return `いちばん遠い「${TAGS[s.contrast].label}」に、やさしく触れる`;
    case 'surprise':
      return 'ジャンルは違っても、惹かれるところは同じ';
  }
}
