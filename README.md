# Modular Table Blocks

WordPressのブロックエディターで「テーブル → 行 → セル → 段落」を編集するプラグインです。現在は **M0技術検証版** です。行・列操作を含む実用MVP（M1）は未実装です。

変更履歴とバージョン管理の運用は [CHANGELOG.md](CHANGELOG.md) に記載しています。現在の `0.1.0` を基準とし、今後の変更は `Unreleased` に記録します。

## セットアップ

対象はWordPress 6.6以上、PHP 7.4以上。開発にはNode.jsとnpm、ブラウザーテストにはDockerとPlaywright Chromiumを使用します。依存ツールの推奨環境はNode.js 24.18以上・npm 11.16以上です。

```sh
npm install
npm run build
```

このディレクトリを `wp-content/plugins/modular-table-blocks` に配置し、WordPressのプラグイン画面で有効化します。配布に必要なのは `modular-table-blocks.php`、`includes/`、`build/`、`languages/` です。生成物は編集せず、`src/` を変更してビルドします。

専用のローカル検証環境：

```sh
npm run env:start
npx playwright install chromium
npm run test:e2e
npm run test:php
```

WordPress 6.6／PHP 7.4を http://localhost:8890 、PHPテスト環境をポート8891で起動します。ログインは `admin` / `password`。テストは専用環境に投稿を作成・公開します。本番サイトには向けないでください。

WordPress 7.1.3／PHP 8.3の互換性確認は別環境です。

```sh
npm run env:start:latest
npm run test:e2e:latest
npm run test:php:latest
```

こちらは http://localhost:8892 。テスト用認証情報は `WP_USERNAME`、`WP_PASSWORD` で変更できます。

## 使い方

1. 投稿に「Modular Table」を挿入します。
2. 行数と列数を1〜20で指定して「Create table」を押します。既定は3×3です。
3. セル内の段落を編集します。行・セルの選択にはリストビューも利用できます。
4. テーブルの設定でキャプション、セルの設定で `td` / `th` と見出しの関連付けを指定します。
5. テーブル・行・セルの「Table styles」で必要なスタイルだけ指定します。空欄にすると上位の設定へ戻ります。不正値は保存せず入力欄に表示します。

編集画面はdiv/CSS Grid、公開画面はPHPで `table > tbody > tr > td/th` を生成します。ブロックの入れ子構造と本文は標準のブロックコメントとして保存し、公開時にセル内の子ブロックをWordPressの描画APIで処理します。公開用JavaScriptはありません。

## 日本語と翻訳ファイル

日本語（WordPressのロケール `ja`）を同梱しています。WordPressの「設定 → 一般 → サイトの言語」、またはユーザーのプロフィールの言語を「日本語」にすると、ブロック名・説明・設定項目・案内・エラー表示が日本語になります。それ以外の言語で翻訳がなければ英語を表示します。

- `languages/modular-table-blocks.pot`：他の言語にも使える翻訳テンプレート。
- `languages/modular-table-blocks-ja.po`：日本語訳の編集元（38件）。Poeditなどで編集できます。
- `languages/modular-table-blocks-ja.mo`：PHP・ブロックメタデータ用の翻訳。
- `languages/modular-table-blocks-ja-*.json`：編集画面のJavaScript用翻訳。
- `languages/map.json`：ブロックメタデータの翻訳を共有スクリプトへまとめる対応表。

POを変更した後は、専用のwp-envを起動して再生成します。

```sh
npm run env:start
npm run i18n:build
```

UIの英語文言を変更した場合は、先に `npm run build` と `npm run i18n:pot` を実行し、POをPOTに同期して翻訳を追加してから `npm run i18n:build` を実行してください。POTは実際の配布用JS・メタデータから抽出し、JSON生成では `--no-purge` によりPO内のJavaScript翻訳を保持します。MO・JSONは生成物なので直接編集しません。

JavaScript翻訳JSONのファイル名末尾は `build/index.js` の相対パスのハッシュです。入口の出力パスを変更した場合は、翻訳JSONも再生成してください。

## CSSカスタムプロパティ

既定値は `var()` のフォールバックです。ブロックに既定トークンを宣言せず、未設定なら上位スコープから継承します。編集・公開で同じSass mixinを使用します。

| トークン | フォールバック | 参照する要素 |
| --- | --- | --- |
| `--mtb-text-color` | `inherit` | テーブル・行・セル |
| `--mtb-background-color` | `transparent` | テーブル |
| `--mtb-cell-background-color` | `transparent` | セル |
| `--mtb-border-color` | `currentColor` | セル |
| `--mtb-border-width` | `1px` | セル |
| `--mtb-border-style` | `solid` | セル |
| `--mtb-cell-padding-block` | `0.75em` | セルの上下余白 |
| `--mtb-cell-padding-inline` | `1em` | セルの左右余白 |
| `--mtb-font-size` | `inherit` | テーブル・行・セル |
| `--mtb-line-height` | `inherit` | テーブル・行・セル |
| `--mtb-table-width` | `100%` | テーブル |

優先順位の意図は「フォールバック → サイト → テーブル → 行 → セル」です。通常のCSSカスケードが適用されます。同じ要素への詳細度や宣言順なども影響します。文字サイズに `em` / `%` を使うと各階層で相対計算されるため、階層を通じて一定にするには `px` / `rem` を使用してください。

テーマから設定する例：

```css
:root {
  --mtb-text-color: var(--wp--preset--color--contrast, #222);
  --mtb-border-color: #d4d4d4;
  --mtb-cell-padding-inline: 1.25rem;
}

/* テーブルの「追加CSSクラス」に my-table を設定 */
.my-table {
  --mtb-border-color: #2563eb;
  --mtb-cell-padding-inline: 2rem;
}

.my-table > tbody > tr:first-child {
  --mtb-cell-background-color: #eef2ff;
}

.my-table > tbody > tr:first-child > :first-child {
  --mtb-text-color: #1e3a8a;
}
```

サイト共通CSSを編集キャンバスにも反映する場合は、テーマ側で同じCSSをエディターへ読み込んでください。公開ページの `:root` とエディターiframeの `:root` は別の文書です。`theme.json` やコア段落の個別スタイルは通常どおり適用されるため、本文ブロックの明示設定がセルからの継承に優先する場合があります。

インスペクターの値は `styleTokens` 属性に保存されます。有効かつ明示された値だけをテーブルの `table`、行の `tr`、セルの `td/th` の `style` に出力します。

| 設定値 | 許可範囲 |
| --- | --- |
| 色 | 3/4/6/8桁の16進色、`transparent`、`currentColor`、`inherit` |
| 罫線幅 | `0`、0〜20px、0〜1rem/em |
| 罫線種類 | `none`、`solid`、`dashed`、`dotted`、`double` |
| セル余白 | `0`、0〜200px、0〜10rem/em |
| 文字サイズ | 8〜160px、0.5〜10rem/em、50〜500% |
| 行間 | `normal`、0.5〜4の単位なし数値 |
| テーブル幅 | 0より大きい100%以下、4000px以下、250rem/em以下 |

色は `var(--wp--preset--color--contrast)`、文字サイズは `var(--wp--preset--font-size--large)`、セル余白は `var(--wp--preset--spacing--40)` の形式も使用できます。プリセット名は英小文字・数字・単語間ハイフンのみです。任意の `var()`、`calc()`、URLや複数宣言の入力は受け付けません。テーマCSSでは通常のCSS値を使用できます。

## 開発コマンド

```sh
npm run start          # 監視ビルド
npm run build          # JS / CSS / block.json / index.asset.php を生成
npm run check-types    # TypeScript
npm run lint           # WordPress推奨ESLint + Sass対応Stylelint
npm run test:unit      # グリッドとスタイル値の検証
npm run test:php       # WP 6.6で登録・描画・保存ツリー・値検証
npm run test:e2e       # WP 6.6で実ブラウザー検証
npm run env:stop       # WP 6.6環境を停止
npx wp-env stop --config=.wp-env.latest.json
```

`build/index.asset.php` の依存とバージョンで共通ハンドル `mtb-editor` を登録し、3つの `block.json` から参照します。WordPress提供パッケージはバンドルせず、公開CSSと編集UI用CSSは別に読み込みます。

## 現在の制約と次の段階

- セル内の許可ブロックは段落のみ。リスト・見出し・画像・ボタンはHTMLと操作の検証後に拡張します。
- M0では行・セル構造をロックしています。行・列の追加・削除・移動・複製はM1、結合・分割はM2です。
- `thead` / `tfoot`、列幅設定、横スクロールUIは未実装です。`section` の属性スキーマはありますが、現段階の公開出力はすべて `tbody` です。
- 結合幅はグリッドの計算・検証とPHPの値検証で考慮しています。編集キャンバスの結合レイアウトは未対応です。
- 編集用CSS Gridと公開テーブルはレイアウトアルゴリズムが異なり、列幅や罫線の重なりは完全一致しません。テーブルのARIAロールは編集画面に重複付与していません。
- リストビュー・ツールバー・Undo/Redo・コピー＆ペースト・ドラッグ操作の網羅的なE2Eは後続課題です。現在のE2Eは挿入後の初期設定、段落・キーボード編集、保存復元、公開HTML、複数テーブル、スタイルUI、継承・テーマ変更、狭い画面の意味的表示、意味的ラッパーの試作比較を扱います。
- WordPress 6.6の `SCRIPT_DEBUG` 有効時、コアの `createRoot` 読み込みに関するReact警告が発生します。E2Eはこの完全一致の警告を注記し、それ以外のコンソールエラーとブロック検証エラーを検出します。
- インストール時に開発依存のengine・audit警告が出る場合があります。今回の検証環境はNode.js 24.14.1／npm 11.12.1です。Playgroundランタイムは未使用で、wp-envはDocker方式を使用します。

設計判断と実行した検証は `docs/decisions/` に記録します。
