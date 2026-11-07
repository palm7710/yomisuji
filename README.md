# 読み筋診断（仮）

好きな本を選ぶと、ジャンルではなく「物語のどんな構造に惹かれているか」を言葉にする読書タイプ診断です。
この版は **本選び → 深掘り（任意）→ 診断計算 → 結果画面** までを実装しています。

## 動かし方

```bash
npm install
cp .env.example .env.local   # 必要なら GOOGLE_BOOKS_API_KEY を入れる
npm run dev                  # http://localhost:3000
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm test` | 診断ロジックと Google Books 連携のテスト |
| `npm run typecheck` | 型チェック |
| `npm run build` / `npm start` | 本番ビルドと起動 |
| `npm run books:resolve` | 作品リストの各本を Google Books で検索し、volumeId を固定する |

## Google Books の使い方

- 書誌情報（表紙・出版社・Google Books へのリンク）だけを Google Books から取ります。診断に使うタグの重みは自前の作品リストにあります。
- 取得はサーバー側だけで行い（`src/lib/googleBooks.ts`）、結果は Next.js のキャッシュに1日保存します。
- 取れなかった本は、書名だけの表紙で表示を続けます。診断はGoogle Booksにつながらなくても動きます。
- **APIキー：** なくても動きますが、1日の上限が低くなります。Google Cloud コンソールで「Books API」を有効にしてキーを作り、`.env.local` の `GOOGLE_BOOKS_API_KEY` に入れてください。
- **volumeId の固定（推奨）：** `npm run books:resolve` を一度実行すると、`src/data/google-volume-ids.json` に各本の volumeId が書かれます。毎回の検索より速く、別の版を拾う取り違えも防げます。あわせて出る `scripts/resolve-report.md` で、書名・著者・出版社が正しい版かを確認してください。
- **表示のルール（[ブランドガイドライン](https://developers.google.com/books/branding)）：** Google Books のデータを出す画面には「Powered by Google」を添え、各書籍から Google Books のページへリンクしています。公開前に、公式のロゴ画像に差し替えてください。
- **利用規約（[Terms of Service](https://developers.google.com/books/terms)）：** アプリの利用者から料金を取る場合は Google との別契約が必要です。権利者からの削除依頼の連絡先を公開する必要もあります。

### つながらない環境での開発

模擬サーバーで、表紙つきの表示を確かめられます。

```bash
node scripts/mock-google-books.mjs &
GOOGLE_BOOKS_API_BASE=http://localhost:4010/books/v1/volumes npm run dev
```

## ファイル構成

```
src/
  data/tags.ts            物語構造タグ（3層18種）、タイプ名、修飾語、一言コピー
  data/books.ts           作品リスト（30冊）、タグの重み、「どこが好き？」の選択肢
  data/google-volume-ids.json  books:resolve で固定した volumeId
  lib/diagnose.ts         診断ロジック（同じ入力なら必ず同じ結果）
  lib/selection.ts        診断の入力と結果ページURLの変換
  lib/googleBooks.ts      Google Books からの取得
  app/page.tsx            トップ
  app/diagnose/           本選び・深掘り（クライアント側の画面）
  app/result/             結果画面、Xへの投稿・リンクのコピー
scripts/
  resolve-google-ids.mjs  volumeId の固定
  mock-google-books.mjs   開発用の模擬サーバー
```

## 結果ページのURL

`/result?v=1&b=hacker,jirai,rokunin,santai,sugaku&f=santai&l=santai:0,jirai:0&x=goal`

| 引数 | 意味 |
| --- | --- |
| `b` | 選んだ本（5〜15冊） |
| `f` | いちばん好きな1冊 |
| `l` | 「どこが好き？」で選んだもの（`本ID:選択肢の番号`） |
| `x` | 合わなかった本（3冊まで） |

データベースは使わず、URLから毎回計算し直します。

## まだやっていないこと

- **作品データ：** タグの重みと「どこが好き？」の選択肢は仮の値です。公開前に2人以上で確認してください。作品数も、要件どおり50〜60冊に増やす必要があります。
- **未実装の機能：** 次のものは後回しにしています。
  - DeepSeek による説明文。いまは定型文で、DeepSeek導入後も検査に落ちたときの代わりの文として残す想定です。
  - 結果の保存
  - シェア用のカード画像（OGP）
  - 友だちとの相性
  - 「当たってる？」の記録
- **アプリ名：** アプリ名とドメインは決まっていません。
# yomisuji
