// 本選び画面の「テーマの棚」に並べる、選び始めのきっかけ用の本。
// 診断に使うタグはここには持たず、選ばれた本ごとに DeepSeek が付ける。
// 表紙や volumeId は Google Books から取る。ここにない本も検索して選べる。

export const THEMES = [
  { id: 'rules', label: '世界のルールを解く' },
  { id: 'mind', label: '頭脳戦・駆け引き' },
  { id: 'weakness', label: '人間の嘘や弱さ' },
  { id: 'outside', label: '社会からはみ出す人' },
  { id: 'work', label: '仕事や組織の裏側' },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];

export interface ShelfBook {
  title: string;
  author: string;
  theme: ThemeId;
}

export const SHELF_BOOKS: ShelfBook[] = [
  { title: '三体', author: '劉慈欣', theme: 'rules' },
  { title: '数学ガール', author: '結城浩', theme: 'rules' },
  { title: 'ハッカーと画家', author: 'ポール・グレアム', theme: 'rules' },
  { title: 'プロジェクト・ヘイル・メアリー', author: 'アンディ・ウィアー', theme: 'rules' },
  { title: '銀河ヒッチハイク・ガイド', author: 'ダグラス・アダムス', theme: 'rules' },
  { title: 'ゲーデル、エッシャー、バッハ', author: 'ダグラス・R・ホフスタッター', theme: 'rules' },

  { title: '六人の嘘つきな大学生', author: '浅倉秋成', theme: 'mind' },
  { title: '地雷グリコ', author: '青崎有吾', theme: 'mind' },
  { title: 'そして誰もいなくなった', author: 'アガサ・クリスティー', theme: 'mind' },
  { title: 'カササギ殺人事件', author: 'アンソニー・ホロヴィッツ', theme: 'mind' },
  { title: '十角館の殺人', author: '綾辻行人', theme: 'mind' },
  { title: 'マネー・ボール', author: 'マイケル・ルイス', theme: 'mind' },

  { title: '告白', author: '湊かなえ', theme: 'weakness' },
  { title: '火車', author: '宮部みゆき', theme: 'weakness' },
  { title: '白夜行', author: '東野圭吾', theme: 'weakness' },
  { title: '罪の声', author: '塩田武士', theme: 'weakness' },
  { title: '人間失格', author: '太宰治', theme: 'weakness' },
  { title: 'アルジャーノンに花束を', author: 'ダニエル・キイス', theme: 'weakness' },

  { title: 'コンビニ人間', author: '村田沙耶香', theme: 'outside' },
  { title: '流浪の月', author: '凪良ゆう', theme: 'outside' },
  { title: '何者', author: '朝井リョウ', theme: 'outside' },
  { title: 'ライ麦畑でつかまえて', author: 'J・D・サリンジャー', theme: 'outside' },
  { title: '博士の愛した数式', author: '小川洋子', theme: 'outside' },
  { title: '火花', author: '又吉直樹', theme: 'outside' },

  { title: '半沢直樹', author: '池井戸潤', theme: 'work' },
  { title: '下町ロケット', author: '池井戸潤', theme: 'work' },
  { title: '64', author: '横山秀夫', theme: 'work' },
  { title: '華麗なる一族', author: '山崎豊子', theme: 'work' },
  { title: 'ザ・ゴール', author: 'エリヤフ・ゴールドラット', theme: 'work' },
  { title: '舟を編む', author: '三浦しをん', theme: 'work' },
];
