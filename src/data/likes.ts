// 「この本のどこが好き？」の選択肢。
// 物語の構造の言葉（仕組みを解く・反転…）は小説以外の本だと選びにくいので、
// 小説・マンガ・エッセイ・実用書のどれを読んだ人でも選べる、ふだんの言葉にしている。
// 選ばれた選択肢は、裏で物語構造タグ（tags）に置き換えて計算に使う。18種のタグすべてにどれかがつながる。

import type { TagId } from './tags';

export interface LikeOption {
  id: string;
  label: string;
  tags: TagId[];
}

export const LIKE_OPTIONS: LikeOption[] = [
  { id: 'moved', label: '泣けた・胸に残った', tags: ['lingering', 'loss'] },
  { id: 'warm', label: '心があたたまった', tags: ['warm'] },
  { id: 'refresh', label: 'スカッとした', tags: ['exhilarating'] },
  { id: 'twist', label: '最後に驚かされた', tags: ['reversal'] },
  { id: 'world', label: '世界観に浸れた', tags: ['immersion'] },
  { id: 'empathy', label: '気持ちに入り込めた', tags: ['inner'] },
  { id: 'chara', label: 'キャラ同士の関係・掛け合い', tags: ['dialogue', 'ensemble'] },
  { id: 'insight', label: 'ものの見方が変わった', tags: ['mechanism'] },
  { id: 'learn', label: '知らないことを知れた', tags: ['lecture'] },
  { id: 'battle', label: '頭脳戦・駆け引き', tags: ['gamesmanship'] },
  { id: 'honest', label: '人の本音や弱さ', tags: ['lies'] },
  { id: 'misfit', label: '生きづらさに共感した', tags: ['outsider'] },
  { id: 'recover', label: '失ったあと前を向く姿', tags: ['loss'] },
  { id: 'work', label: '仕事や組織のリアル', tags: ['organization'] },
  { id: 'chill', label: 'ゾクッとした・不穏さ', tags: ['unsettling'] },
  { id: 'bitter', label: 'ほろ苦さ・やるせなさ', tags: ['bitter'] },
  { id: 'real', label: '本当にあった話のような手触り', tags: ['document'] },
];

export const LIKE_BY_ID: Record<string, LikeOption> = Object.fromEntries(LIKE_OPTIONS.map((o) => [o.id, o]));
