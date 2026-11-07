# 読み筋診断（仮）

好きな本を選ぶと、ジャンルではなく「物語のどんな構造に惹かれているか」をAIが言葉にする読書タイプ診断です。

- **本：** 最初は何も並ばず、Google Books で検索して選んだ本が並んでいきます。どんな本でも選べます。
- **タグ・分析・説明文・おすすめ：** DeepSeek が担当します。得点とタイプの計算だけはプログラムで行います（`src/lib/scoring.ts`）。
- **結果は毎回変わります：** AIが付けるので、同じ本を選んでも診断するたびに結果が変わることがあります。画面にもそう明記しています。シェアされたURLでは、保存した結果をそのまま表示します。

## 動かし方

```bash
npm install
cp .env.example .env.local   # GOOGLE_BOOKS_API_KEY と DEEPSEEK_API_KEY を入れる
npm run dev                  # http://localhost:3000
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm test` | テスト（Google Books と DeepSeek は模擬の返り値で試す） |
| `npm run typecheck` | 型チェック |
| `npm run build` / `npm start` | 本番ビルドと起動 |

### キーがなくても画面を試す

```bash
node scripts/mock-google-books.mjs &
GOOGLE_BOOKS_API_BASE=http://localhost:4010/books/v1/volumes DEEPSEEK_MOCK=1 npm run dev
```

## 診断の流れ（`src/lib/analyze.ts`）

1. 選ばれた本（5〜15冊）の書誌を Google Books から取る。分類と内容紹介はAIへの手がかりとしてだけ使う
2. **DeepSeek 1回目：** 本ごとに18種のタグの重み（0〜3）、ジャンル、ネタバレなしの短いメモを付ける
3. タグからプログラムで得点・タイプ・確からしさ・根拠の本・隠れた好みを計算する
4. **DeepSeek 2回目：** 説明文と、おすすめの候補6冊を書く
5. 返り値を検査する。題名のずれ、避けたい言葉、長すぎる文などを見る。2回とも不合格なら、人が書いた定型文に切り替える
6. おすすめの候補を Google Books で検索し、実在して選ばれていない本を3冊だけ残す（架空の本は出ない）
7. 結果を保存して `/r/<ID>` に移る

## AIの使用量を抑える工夫

- **思考モードを切っている：** DeepSeek の思考モードは初期設定でオンで、画面に出ない思考の分だけ出力が増えます。必要なら `DEEPSEEK_THINKING=enabled` で戻せます。
- **タグを使い回す：** 一度タグを付けた本は保存し、同じ本が選ばれたらAIを呼びません。タグ付けの指示やタグの種類を変えたら、`src/lib/store.ts` の `TAG_CACHE_VERSION` を上げてください。
- **欠けた本だけやり直す：** タグが欠けた本があれば、その本だけもう一度頼みます。
- **送るデータを詰める：** AIに送るJSONは改行や字下げなしで送ります。
- **出力の上限：** 本の数に合わせて上限を設定しています（タグ付けは 150＋1冊120、分析は 2,000＋1冊60）。上限で切れるとターミナルに警告が出ます。
- **使用量の確認：** 呼び出しのたびに `[deepseek] 分析: 入力 …（キャッシュ … / 新規 …）、出力 …` とターミナルに出ます。

## シェア画像

結果ページ（`/r/<ID>`）をXなどに貼ると、1200×630の画像が出ます（`src/app/r/[id]/opengraph-image.tsx`）。
トップページ用の画像は `src/app/opengraph-image.tsx` です。

- **画像に載せるもの：** タイプ名、一言コピー、上位3つの面白さ、選んだ本の題名、AIの二つ名（検査に通ったもの）
- **フォント：** Google Fonts から、画像に出る文字だけを取ってきます
- **表紙：** 権利の確認ができるまで載せません

## 本番で必要な設定

- **SITE_URL：** 公開先のURLです。設定しないと、シェア画像のURLが localhost になります。

- **DEEPSEEK_API_KEY（必須）：** 未設定だと診断APIは「準備ができていません」を返します。
- **GOOGLE_BOOKS_API_KEY：** なくても動きますが、上限が低くなります。Google Cloud で、このキーを「Books API」だけに制限してください。
- **Cloudflare Workers：** `cloudflare.config.ts` の `YOMISUJI_DATA` KVに診断結果と本タグを保存します。
- **その他のサーバーレス環境：** `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` を設定します。未設定時のファイル保存はローカル開発専用です。
- **関数の制限時間：** 診断APIは DeepSeek を2回呼ぶので、20〜40秒かかります。制限時間は60秒に設定済みです（`maxDuration`）。

## 注意

- **個人情報保護：** DeepSeek に送るのは、本の書誌と選択内容だけです。個人情報保護委員会は、DeepSeek のデータは中国のサーバーに保存され、中国の法律が適用されると注意を促しています。結果画面にもAI事業者に送ることを書いていますが、公開前にプライバシーポリシーへの記載と法務の確認をしてください。
- **Google Books：** 「Powered by Google」の表記と、各書籍から Google Books へのリンクを付けています。公開前に公式のロゴ画像に差し替えてください。利用者から料金を取る場合は、Google との別契約が必要です。
- **回数制限：** IPごとに10分で10回までに制限していますが、サーバー1台の中でしか数えていません。本番では Upstash などで数えるか、DeepSeek の1日の費用上限を設定してください。

## ファイル構成

```
src/
  data/tags.ts             物語構造タグ（3層18種）、ジャンル、タイプ名、修飾語
  lib/googleBooks.ts       Google Books：検索・1冊の取得・書名と著者での特定
  lib/deepseek.ts          DeepSeek API の呼び出し（JSONモード、1回やり直し、模擬モード）
  lib/prompts.ts           AIへの指示文と返り値の検査、定型文
  lib/scoring.ts           得点とタイプの計算
  lib/analyze.ts           診断全体の流れ
  lib/store.ts             結果の保存（Upstash Redis またはファイル）
  lib/mock.ts              模擬AI
  app/api/books/search/    本の検索API
  app/api/diagnose/        診断API
  app/diagnose/            本選び・深掘りの画面
  app/r/[id]/              結果画面
scripts/mock-google-books.mjs  開発用の模擬 Google Books
```
