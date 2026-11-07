import type { Genre, TagId } from '@/data/tags';
import type { PublicBookMeta } from './googleBooks';
import type { AnalysisText } from './prompts';
import type { ScoringResult } from './scoring';

/** 診断APIに送る内容 */
export interface DiagnoseRequest {
  /** 選んだ本の Google Books volumeId（5〜15冊） */
  books: string[];
  favorite?: string;
  /** 「どこが好き？」で選んだもの。`<volumeId>:<選択肢ID>`（src/data/likes.ts） */
  likes?: string[];
  /** 合わなかった本の volumeId（3冊まで） */
  disliked?: string[];
  /** 検索画面でシリーズとして選んだときの表示名（volumeId → シリーズ名） */
  seriesTitles?: Record<string, string>;
}

export interface ResultBook extends PublicBookMeta {
  genre: Genre;
  weights: Partial<Record<TagId, number>>;
  note: string;
}

/** 保存して結果ページで表示する、診断1回分の結果 */
export interface DiagnosisResult {
  id: string;
  createdAt: string;
  /** 使ったAIのモデル名（模擬モードなら mock） */
  model: string;
  /** 文章がAIでなく定型文になったとき true */
  fallbackText: boolean;
  books: ResultBook[];
  favorite?: string;
  likes: string[];
  disliked: string[];
  scoring: ScoringResult;
  text: Omit<AnalysisText, 'recommendations'>;
  recommendations: { book: PublicBookMeta; reason: string; tags: TagId[]; surprise: boolean }[];
}
