# Modular Table Blocks

WordPressのブロックエディターで「テーブル → 行 → セル → コンテンツ」を編集するプラグインです。行・列操作、見出し行、列幅、基本装飾、横スクロールに加え、M2としてセルの結合・分割と、結合を考慮した行・列の追加・削除を実装しています。

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

WordPress 6.6／PHP 7.4を http://localhost:8890 、PHPテスト環境をポート8891で起動します。ログインは `admin` / `password`。テストは専用環境に投稿を作成・公開し、権限別の検証用に投稿者ユーザー `mtb-reload-author` を作成します。本番サイトには向けないでください。

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
3. セル内の段落・リスト・見出し・画像・ボタンを編集します。行・セルの選択にはリストビューも利用できます。
4. テーブルの設定でキャプション・見出し行・列幅・横スクロール、セルの設定で `td` / `th`、見出しの関連付け、水平・垂直揃えを指定します。
5. テーブル・行・セルの「Table styles」で必要なスタイルだけ指定します。空欄にすると上位の設定へ戻ります。不正値は保存せず入力欄に表示します。
6. 行またはセルを選択し、ブロックツールバーの「テーブルの構造」から行・列を操作します。挿入・複製・移動・削除の操作はツールバーに集約しています。テーブル選択時は末尾への行・列の追加ができます。設定サイドバーでは、必要な場合に操作できない理由やエラーを表示します。
7. 結合範囲の左上セルを選択し、同じツールバーの「セルを結合」から行数・列数を選びます。既存の結合セルは全体を範囲に含め、見出し行と本文の境界をまたがない長方形にします。「セルを分割」で1×1のセルへ戻せます。

結合時は範囲内のすべての内容を読み順で左上セルへ移し、左上セルの種類・見出しの関連付け・スタイルを使用します。他のセルの個別設定は引き継ぎません。分割時も内容は左上セルに残り、追加したセルは空になります。元の内容配置やセル設定へ戻すにはUndoを使用してください。

結合の内側に行・列を挿入すると結合幅を広げ、結合に重なる行・列を削除すると幅を縮めます。結合元の行を削除しても、結合が残る場合は内容を次の行へ移して保持します。縦結合に影響する行の移動・複製は拒否し、理由を表示します。

内容のある行・列の削除では確認画面を表示します。キャンセルで取り消せます。適用した構造操作は1回のUndoで元に戻り、Redoも可能です。確認中に表が変わった場合は削除を拒否します。初期作成は1〜20行・列、構造操作での上限は100行・50列です。

見出し行は位置に基づく設定で、先頭行を `thead` と `th scope="col"` で出力します。各セルに保存した `td` / `th` と `scope` は上書きしません。見出し行の解除で元の設定へ戻ります。行を移動した場合も、その時点の先頭行が見出しになります。

列幅は空欄で自動調整、指定時は0より大きい100%以下・4000px以下・250rem/em以下です。編集画面では入力用に各列の最小幅を8remとし、幅が足りなければテーブル内を横スクロールできます。セルと段落等の本文領域は列の幅を満たし、入力文字数によって縮まないようにしています。公開側の自動テーブルレイアウトと編集画面のCSS Gridでは、内容に応じた最終的な列幅に差が出る場合があります。

投稿者などの権限で保存された幅未指定の列も読み込めます。以前の版で再読み込み後に不整合と誤判定された表は、修正後のプラグインで編集画面を再読み込みすると操作できるようになります。行・列数の不一致や不正な結合幅がある表については、引き続き構造操作を拒否します。

横スクロールを有効にした表は、説明付きのフォーカス可能な領域で囲みます。狭い画面では表の構造を保ったまま左右キーでスクロールできます。スクロール設定は明示的に選択し、既定ではフォーカス用のラッパーを追加しません。有効時は広い画面で実際にはあふれていない場合もフォーカス可能です。

編集画面はdiv/CSS Grid、公開画面はPHPで `table > thead/tbody/tfoot > tr > td/th` を生成します。ブロックの入れ子構造と本文は標準のブロックコメントとして保存し、公開時にセル内の子ブロックをWordPressの描画APIで処理します。公開用JavaScriptはありません。

## 日本語と翻訳ファイル

日本語（WordPressのロケール `ja`）を同梱しています。WordPressの「設定 → 一般 → サイトの言語」、またはユーザーのプロフィールの言語を「日本語」にすると、ブロック名・説明・設定項目・案内・エラー表示が日本語になります。それ以外の言語で翻訳がなければ英語を表示します。

- `languages/modular-table-blocks.pot`：他の言語にも使える翻訳テンプレート。
- `languages/modular-table-blocks-ja.po`：日本語訳の編集元（89件）。Poeditなどで編集できます。
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
| `--mtb-column-width` | `auto` | 各 `col`（列幅設定から出力） |
| `--mtb-scroll-min-width` | `40rem` | 横スクロール有効時のテーブル（テーマCSSで変更） |

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

- セル内の許可ブロックは段落・リスト・見出し・画像・ボタンです。入れ子テーブルは対象外です。
- 行・セル単位の自由な挿入・削除・並べ替えは構造を壊すためロックし、専用操作からテーブル全体を更新します。結合範囲は左上セルから指定し、Excel型のドラッグ範囲選択はありません。
- 行の `section` を個別に指定したデータは、先頭の連続した見出し行と末尾の連続したフッター行を `thead` / `tfoot` へ、それ以外を `tbody` へ正規化して順序を保ちます。その表の構造操作は拒否します。通常はテーブルの見出し行設定を使用します。
- 縦結合に影響する行の移動・複製や、見出し境界をまたぐ結合は拒否します。先頭行をまたぐ結合がある場合は、分割してから見出し行を有効にしてください。
- 縦結合の編集レイアウトはCSS Gridのsubgridを使用します。実ブラウザーの検証はPlaywright Chromiumで行い、他ブラウザーと支援技術による確認はM3に残しています。
- 編集用CSS Gridと公開テーブルはレイアウトアルゴリズムが異なり、列幅や罫線の重なりは完全一致しません。テーブルのARIAロールは編集画面に重複付与していません。
- E2Eは結合・分割、構造操作・Undo/Redo・削除確認・確認中の変更拒否、リストビューの行選択、クリップボード貼り付け、管理者・投稿者によるリッチコンテンツの保存復元、表示設定・キーボード横スクロールを検証します。ドラッグ操作や支援技術による網羅的検証は後続課題です。
- 継承スタイル設定のGutenberg UIコンポーネント化はM3で実装します。M2でも既存のスタイル入力と保存形式を維持しています。
- WordPress 6.6の `SCRIPT_DEBUG` 有効時、コアの `createRoot` 読み込みに関するReact警告が発生します。E2Eはこの完全一致の警告を注記し、それ以外のコンソールエラーとブロック検証エラーを検出します。
- インストール時に開発依存のengine・audit警告が出る場合があります。今回の検証環境はNode.js 24.14.1／npm 11.12.1です。Playgroundランタイムは未使用で、wp-envはDocker方式を使用します。

設計判断と実行した検証は `docs/decisions/` に記録します。
