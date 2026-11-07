// 作品リスト（試作用30冊）。
// タグの重み（0〜3）と「どこが好き？」の選択肢は仮の値。公開前に2人以上で確認・調整すること。
// 書誌情報（表紙・出版社など）は Google Books から取得し、ここには持たない。

import type { TagId } from './tags';

export type Genre =
  | 'SF'
  | 'ミステリー'
  | '文芸'
  | 'ノンフィクション'
  | 'ビジネス'
  | '数学読み物'
  | '企業小説';

export interface LikeOption {
  label: string;
  tags: TagId[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  genre: Genre;
  theme: ThemeId;
  weights: Partial<Record<TagId, 1 | 2 | 3>>;
  likes: LikeOption[];
}

export const THEMES = [
  { id: 'rules', label: '世界のルールを解く' },
  { id: 'mind', label: '頭脳戦・駆け引き' },
  { id: 'weakness', label: '人間の嘘や弱さ' },
  { id: 'outside', label: '社会からはみ出す人' },
  { id: 'work', label: '仕事や組織の裏側' },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];

export const BOOKS: Book[] = [
  // 世界のルールを解く
  {
    id: 'santai', title: '三体', author: '劉慈欣', genre: 'SF', theme: 'rules',
    weights: { mechanism: 3, immersion: 3, gamesmanship: 2, reversal: 1, unsettling: 2, exhilarating: 1, ensemble: 2, lecture: 2 },
    likes: [
      { label: '世界のルールがひっくり返る', tags: ['mechanism', 'reversal'] },
      { label: '科学の描写', tags: ['lecture'] },
      { label: '人類の駆け引き', tags: ['gamesmanship'] },
      { label: 'スケールの大きさ', tags: ['immersion'] },
    ],
  },
  {
    id: 'sugaku', title: '数学ガール', author: '結城浩', genre: '数学読み物', theme: 'rules',
    weights: { mechanism: 3, warm: 2, exhilarating: 1, dialogue: 3, lecture: 3 },
    likes: [
      { label: '数式の向こうに構造が見える', tags: ['mechanism'] },
      { label: '対話で進んでいく', tags: ['dialogue'] },
      { label: '解けたときの爽快感', tags: ['exhilarating'] },
      { label: '登場人物の関係', tags: ['warm'] },
    ],
  },
  {
    id: 'hacker', title: 'ハッカーと画家', author: 'ポール・グレアム', genre: 'ノンフィクション', theme: 'rules',
    weights: { mechanism: 2, outsider: 2, organization: 1, exhilarating: 1, lecture: 3, inner: 1 },
    likes: [
      { label: '常識をひっくり返す考え方', tags: ['mechanism'] },
      { label: 'はみ出す人への視線', tags: ['outsider'] },
      { label: '仕事と組織の話', tags: ['organization'] },
      { label: '語り口', tags: ['lecture'] },
    ],
  },
  {
    id: 'hail', title: 'プロジェクト・ヘイル・メアリー', author: 'アンディ・ウィアー', genre: 'SF', theme: 'rules',
    weights: { mechanism: 3, immersion: 2, loss: 1, exhilarating: 3, warm: 2, inner: 2, lecture: 2 },
    likes: [
      { label: '科学で問題を解いていく', tags: ['mechanism'] },
      { label: '未知との出会い', tags: ['immersion'] },
      { label: '前向きな語り', tags: ['exhilarating'] },
      { label: '友情', tags: ['warm'] },
    ],
  },
  {
    id: 'hitch', title: '銀河ヒッチハイク・ガイド', author: 'ダグラス・アダムス', genre: 'SF', theme: 'rules',
    weights: { immersion: 3, outsider: 1, mechanism: 1, exhilarating: 2, ensemble: 1, dialogue: 2 },
    likes: [
      { label: 'ナンセンスな笑い', tags: ['dialogue'] },
      { label: '宇宙の広がり', tags: ['immersion'] },
      { label: '皮肉の効いた世界観', tags: ['mechanism'] },
    ],
  },
  {
    id: 'geb', title: 'ゲーデル、エッシャー、バッハ', author: 'ダグラス・R・ホフスタッター', genre: 'ノンフィクション', theme: 'rules',
    weights: { mechanism: 3, immersion: 1, lingering: 1, dialogue: 2, lecture: 3 },
    likes: [
      { label: '分野をまたぐ発見', tags: ['mechanism'] },
      { label: '対話篇', tags: ['dialogue'] },
      { label: '知的な遊び', tags: ['lecture'] },
    ],
  },

  // 頭脳戦・駆け引き
  {
    id: 'rokunin', title: '六人の嘘つきな大学生', author: '浅倉秋成', genre: 'ミステリー', theme: 'mind',
    weights: { gamesmanship: 3, reversal: 3, lies: 2, organization: 1, unsettling: 1, warm: 1, ensemble: 2 },
    likes: [
      { label: '就活という舞台', tags: ['organization'] },
      { label: '疑い合いの心理戦', tags: ['gamesmanship'] },
      { label: '印象が裏返る展開', tags: ['reversal'] },
      { label: '人の裏表', tags: ['lies'] },
    ],
  },
  {
    id: 'jirai', title: '地雷グリコ', author: '青崎有吾', genre: 'ミステリー', theme: 'mind',
    weights: { gamesmanship: 3, mechanism: 2, reversal: 1, exhilarating: 3, dialogue: 2 },
    likes: [
      { label: 'ルールの穴を突く', tags: ['mechanism'] },
      { label: '心理の読み合い', tags: ['gamesmanship'] },
      { label: '勝負の爽快感', tags: ['exhilarating'] },
      { label: '会話のテンポ', tags: ['dialogue'] },
    ],
  },
  {
    id: 'dare', title: 'そして誰もいなくなった', author: 'アガサ・クリスティー', genre: 'ミステリー', theme: 'mind',
    weights: { reversal: 3, lies: 2, gamesmanship: 1, unsettling: 3, bitter: 1, ensemble: 2 },
    likes: [
      { label: '閉ざされた舞台の緊張', tags: ['unsettling'] },
      { label: '犯人当て', tags: ['reversal'] },
      { label: '登場人物の隠しごと', tags: ['lies'] },
    ],
  },
  {
    id: 'kasasagi', title: 'カササギ殺人事件', author: 'アンソニー・ホロヴィッツ', genre: 'ミステリー', theme: 'mind',
    weights: { reversal: 3, mechanism: 1, exhilarating: 1, lingering: 1, document: 2, ensemble: 1 },
    likes: [
      { label: '作中作の仕掛け', tags: ['document'] },
      { label: '伏線の回収', tags: ['reversal'] },
      { label: '本格ミステリーらしさ', tags: ['mechanism'] },
    ],
  },
  {
    id: 'jukkaku', title: '十角館の殺人', author: '綾辻行人', genre: 'ミステリー', theme: 'mind',
    weights: { reversal: 3, gamesmanship: 1, unsettling: 2, ensemble: 2 },
    likes: [
      { label: '一行で景色が変わる', tags: ['reversal'] },
      { label: '孤島の緊張感', tags: ['unsettling'] },
      { label: '推理合戦', tags: ['gamesmanship'] },
    ],
  },
  {
    id: 'money', title: 'マネー・ボール', author: 'マイケル・ルイス', genre: 'ノンフィクション', theme: 'mind',
    weights: { organization: 3, mechanism: 2, outsider: 2, gamesmanship: 2, exhilarating: 2, document: 2, ensemble: 1 },
    likes: [
      { label: 'データで常識を覆す', tags: ['mechanism'] },
      { label: '球団経営の裏側', tags: ['organization'] },
      { label: '異端者の挑戦', tags: ['outsider'] },
      { label: '交渉の駆け引き', tags: ['gamesmanship'] },
    ],
  },

  // 人間の嘘や弱さ
  {
    id: 'kokuhaku', title: '告白', author: '湊かなえ', genre: 'ミステリー', theme: 'weakness',
    weights: { lies: 3, reversal: 2, loss: 1, bitter: 3, unsettling: 2, inner: 3 },
    likes: [
      { label: '語り手ごとに見える真実', tags: ['inner', 'reversal'] },
      { label: '人の悪意と弱さ', tags: ['lies'] },
      { label: '救いのない後味', tags: ['bitter'] },
    ],
  },
  {
    id: 'kasha', title: '火車', author: '宮部みゆき', genre: 'ミステリー', theme: 'weakness',
    weights: { lies: 2, loss: 2, organization: 1, outsider: 1, bitter: 2, lingering: 2, ensemble: 1, document: 1 },
    likes: [
      { label: '人を追っていく捜査', tags: ['document'] },
      { label: '社会のしくみの影', tags: ['organization'] },
      { label: '消えた女性の人生', tags: ['loss'] },
    ],
  },
  {
    id: 'byakuya', title: '白夜行', author: '東野圭吾', genre: 'ミステリー', theme: 'weakness',
    weights: { lies: 3, loss: 2, reversal: 1, outsider: 1, bitter: 3, lingering: 2, ensemble: 3 },
    likes: [
      { label: '長い年月をたどる構成', tags: ['ensemble'] },
      { label: '語られない心', tags: ['lies'] },
      { label: '重い余韻', tags: ['lingering'] },
    ],
  },
  {
    id: 'tsumi', title: '罪の声', author: '塩田武士', genre: 'ミステリー', theme: 'weakness',
    weights: { lies: 2, organization: 2, loss: 2, mechanism: 1, lingering: 2, bitter: 1, document: 3 },
    likes: [
      { label: '取材を重ねていく描写', tags: ['document'] },
      { label: '巻き込まれた人の人生', tags: ['loss'] },
      { label: '真相に近づく過程', tags: ['mechanism'] },
    ],
  },
  {
    id: 'shikkaku', title: '人間失格', author: '太宰治', genre: '文芸', theme: 'weakness',
    weights: { lies: 3, outsider: 3, loss: 2, bitter: 3, inner: 3 },
    likes: [
      { label: '道化を演じる苦しさ', tags: ['lies'] },
      { label: '社会になじめない感覚', tags: ['outsider'] },
      { label: '独白の文体', tags: ['inner'] },
    ],
  },
  {
    id: 'algernon', title: 'アルジャーノンに花束を', author: 'ダニエル・キイス', genre: 'SF', theme: 'weakness',
    weights: { loss: 3, outsider: 2, lies: 1, lingering: 3, warm: 1, bitter: 1, inner: 3, document: 2 },
    likes: [
      { label: '経過報告の文体の変化', tags: ['document'] },
      { label: '知ることの喜びと痛み', tags: ['loss'] },
      { label: '主人公の孤独', tags: ['outsider'] },
    ],
  },

  // 社会からはみ出す人
  {
    id: 'konbini', title: 'コンビニ人間', author: '村田沙耶香', genre: '文芸', theme: 'outside',
    weights: { outsider: 3, organization: 1, lies: 1, unsettling: 3, inner: 3 },
    likes: [
      { label: '「普通」を問い直す視点', tags: ['outsider'] },
      { label: 'マニュアルの世界', tags: ['organization'] },
      { label: '静かな不気味さ', tags: ['unsettling'] },
    ],
  },
  {
    id: 'rufu', title: '流浪の月', author: '凪良ゆう', genre: '文芸', theme: 'outside',
    weights: { outsider: 3, lies: 2, loss: 2, lingering: 2, bitter: 1, warm: 1, inner: 2 },
    likes: [
      { label: '世間の目とのずれ', tags: ['outsider'] },
      { label: '二人だけの関係', tags: ['warm'] },
      { label: '言えない事情', tags: ['lies'] },
    ],
  },
  {
    id: 'nanimono', title: '何者', author: '朝井リョウ', genre: '文芸', theme: 'outside',
    weights: { lies: 3, reversal: 2, organization: 1, outsider: 1, bitter: 2, unsettling: 2, inner: 2, ensemble: 1 },
    likes: [
      { label: '就活とSNSのリアル', tags: ['organization'] },
      { label: '本音と建前', tags: ['lies'] },
      { label: '最後に突きつけられる視点', tags: ['reversal'] },
    ],
  },
  {
    id: 'raimugi', title: 'ライ麦畑でつかまえて', author: 'J・D・サリンジャー', genre: '文芸', theme: 'outside',
    weights: { outsider: 3, loss: 3, lies: 1, lingering: 2, bitter: 1, inner: 3 },
    likes: [
      { label: '大人の世界への反発', tags: ['outsider'] },
      { label: '語り口の生々しさ', tags: ['inner'] },
      { label: '喪失の痛み', tags: ['loss'] },
    ],
  },
  {
    id: 'hakase', title: '博士の愛した数式', author: '小川洋子', genre: '文芸', theme: 'outside',
    weights: { loss: 2, mechanism: 1, outsider: 1, warm: 3, lingering: 3, inner: 1 },
    likes: [
      { label: '数式の美しさ', tags: ['mechanism'] },
      { label: '三人の温かな関係', tags: ['warm'] },
      { label: '記憶をめぐる切なさ', tags: ['loss'] },
    ],
  },
  {
    id: 'hibana', title: '火花', author: '又吉直樹', genre: '文芸', theme: 'outside',
    weights: { outsider: 3, loss: 1, organization: 1, lingering: 2, bitter: 1, inner: 2, dialogue: 1 },
    likes: [
      { label: '芸に生きる人の姿', tags: ['outsider'] },
      { label: '先輩との関係', tags: ['lingering'] },
      { label: '漫才の会話', tags: ['dialogue'] },
    ],
  },

  // 仕事や組織の裏側
  {
    id: 'hanzawa', title: '半沢直樹シリーズ', author: '池井戸潤', genre: '企業小説', theme: 'work',
    weights: { organization: 3, gamesmanship: 3, reversal: 1, exhilarating: 3, dialogue: 1, ensemble: 1 },
    likes: [
      { label: '組織の中の攻防', tags: ['organization'] },
      { label: '逆転の爽快感', tags: ['exhilarating', 'reversal'] },
      { label: '仕事のリアルさ', tags: ['document'] },
      { label: '言葉での勝負', tags: ['gamesmanship'] },
    ],
  },
  {
    id: 'rocket', title: '下町ロケット', author: '池井戸潤', genre: '企業小説', theme: 'work',
    weights: { organization: 2, gamesmanship: 2, mechanism: 1, exhilarating: 3, warm: 2, ensemble: 2 },
    likes: [
      { label: 'ものづくりの情熱', tags: ['warm'] },
      { label: '大企業との対決', tags: ['gamesmanship'] },
      { label: '技術の描写', tags: ['mechanism'] },
    ],
  },
  {
    id: 'rokuyon', title: '64（ロクヨン）', author: '横山秀夫', genre: 'ミステリー', theme: 'work',
    weights: { organization: 3, lies: 2, reversal: 2, loss: 1, bitter: 2, lingering: 1, inner: 2, document: 1 },
    likes: [
      { label: '警察組織の内側', tags: ['organization'] },
      { label: '広報官の葛藤', tags: ['inner'] },
      { label: '終盤の仕掛け', tags: ['reversal'] },
    ],
  },
  {
    id: 'karei', title: '華麗なる一族', author: '山崎豊子', genre: '企業小説', theme: 'work',
    weights: { organization: 3, gamesmanship: 2, lies: 2, loss: 1, bitter: 3, ensemble: 3 },
    likes: [
      { label: '銀行と財閥の権力争い', tags: ['gamesmanship', 'organization'] },
      { label: '一族の確執', tags: ['lies'] },
      { label: '重厚な群像劇', tags: ['ensemble'] },
    ],
  },
  {
    id: 'goal', title: 'ザ・ゴール', author: 'エリヤフ・ゴールドラット', genre: 'ビジネス', theme: 'work',
    weights: { mechanism: 3, organization: 2, exhilarating: 2, lecture: 2, dialogue: 1 },
    likes: [
      { label: 'ボトルネックを見つける思考', tags: ['mechanism'] },
      { label: '工場の立て直し', tags: ['organization'] },
      { label: '小説で学べる', tags: ['lecture'] },
    ],
  },
  {
    id: 'fune', title: '舟を編む', author: '三浦しをん', genre: '文芸', theme: 'work',
    weights: { organization: 1, outsider: 1, mechanism: 1, warm: 3, lingering: 2, ensemble: 2 },
    likes: [
      { label: '辞書づくりの仕事', tags: ['organization'] },
      { label: '言葉へのこだわり', tags: ['mechanism'] },
      { label: '不器用な人たちの温かさ', tags: ['warm'] },
    ],
  },
];

export const BOOK_BY_ID: Record<string, Book> = Object.fromEntries(BOOKS.map((b) => [b.id, b]));
