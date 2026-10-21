# AGENTS.md — Modular Table Blocks

## 目的
WordPress Gutenberg向けプラグイン **Modular Table Blocks**（`modular-table-blocks`）を実装する。テーブル・行・セルをそれぞれ独立した編集可能ブロックとする。`ARCHITECTURE.md`を技術仕様として扱い、段階的に実装・検証する。エディターDOMの未解決の制約を隠さず報告すること。

## 対象環境
- WordPress 6.6以上、PHP 7.4以上。最低対応バージョンで使えない構文・APIを避ける。
- JavaScript/JSXではなくTypeScript（`.ts` / `.tsx`）を使用し、スタイルはSass（`.scss`）を使用する。WordPress提供のReact関連パッケージと`@wordpress/scripts`を使用する。利用可能な範囲でBlock API v3。
- jQuery禁止。必要性が立証されない限りフロントエンドJavaScriptを追加しない。外部CDNや実行時外部依存を使わない。
- WordPress提供パッケージを外部化して利用し、翻訳関数とテキストドメイン`modular-table-blocks`を使う。
- CSSや識別子をプラグイン固有の名前空間に限定する。

## リポジトリ規約
- `npm install --save-dev @wordpress/scripts typescript sass`を実行し、必要な型定義・テスト依存も`package.json`に宣言する。依存をインストールせずにビルド済みとみなさない。
- `package.json`には少なくとも`start: wp-scripts start`、`build: wp-scripts build`、`check-types: tsc --noEmit`を用意する。`npm run build`を実行し、生成物と終了コードを確認する。
- エントリーポイント：`modular-table-blocks.php`。
- ソース：`src/`、生成物：`build/`。生成物を直接編集しない。
- 必要なPHP：`includes/`、テスト：`tests/`と`tests/e2e/`。
- ブロック登録情報の正本は各`block.json`。`@wordpress/scripts`で各ブロックのエントリーと`.scss`をビルドし、生成された`*.asset.php`とCSSをWordPress側で正しく読み込む。
- CSSを直接記述する場合もソースは`.scss`とし、生成CSSを手作業で編集しない。ブラウザー向けコードを素の`.js`/`.jsx`で追加しない。
- グリッド計算や構造変換は副作用のないTypeScript関数に分離し、単体テストを用意する。
- 操作方法と制約を`README.md`に記載する。

## 変更履歴とバージョン管理
- 今後の実装・修正・翻訳・開発環境・ドキュメントの変更は、同じ作業内で`CHANGELOG.md`の`Unreleased`に日本語で追記する。
- 「追加」「変更」「修正」「削除」「セキュリティ」から必要な区分を使い、変更の結果と利用者への影響を簡潔に記載する。未実装の機能や未実行の検証を完了として記載しない。
- 開発中の変更ごとにバージョンを上げず、リリース単位で更新する。番号の付け方と記録形式は`CHANGELOG.md`の運用に従う。
- リリース時は`modular-table-blocks.php`、`package.json`、`package-lock.json`、各`src/blocks/*/block.json`のバージョンを揃え、翻訳カタログとビルド生成物を再生成する。生成物を直接編集しない。
- リリース日やGitタグは実際のリリース操作に合わせて記録する。変更履歴の更新だけでコミット・タグ作成・pushを実行しない。

## 必須ブロック
1. `modular-table-blocks/table`：ルート。行ブロックを保持し、列情報とテーブル全体の設定を管理する。
2. `modular-table-blocks/row`：テーブル直下のみ。セルブロックを保持する。
3. `modular-table-blocks/cell`：行直下のみ。許可されたコンテンツブロックを保持する。

列は入れ子のブロックにしない。列は複数の行にまたがるため、列操作はテーブル単位の一貫した更新とする。公開HTMLは`table`、`thead`/`tbody`/`tfoot`、`tr`、`th`/`td`、必要に応じて`caption`と`colgroup`を用いる。

## 実装の優先順位
1. まず技術検証版を作り、入れ子ブロックの選択・挿入・キーボード編集・保存・再読み込み・公開表示が、不正なテーブルDOMを発生させずに動くことを確認する。実際のエディターDOMと保存HTMLを検査し、`InnerBlocks`の出力を推測で決めつけない。
2. エディター内の意味的HTMLがGutenbergのラッパーと衝突する場合、編集画面は`div`/CSS Gridで表現し、公開側は別途正しいテーブルHTMLを描画する。アクセシビリティとフォーカス操作を維持し、選択理由を記録する。
3. 行・セルの基本編集を先に完成させ、その後に列操作とセル結合を実装する。
4. 列の追加・削除、結合・分割は純粋関数で計画を生成し、ブロックエディターへ一貫して反映する。安全に変換できない場合は操作を拒否し、理由を表示する。
5. 意味的HTMLを壊さず、装飾設定とレスポンシブ表示を追加する。

## コーディング規則
- `useBlockProps`、`useInnerBlocksProps`、`InnerBlocks`、`block.json`の`parent`/`allowedBlocks`を適切に使い、WordPress 6.6での利用可否を検証する。
- 非公開のGutenberg内部APIに依存しない。やむを得ない場合は互換レイヤーと回帰テストを設ける。
- 保存データの正本は行・セルのブロックツリーと属性、列設定はテーブル属性とする。重複した二次元配列を永続化しない。
- `clientId`は編集時だけの識別子であり、永続IDとして扱わない。
- 直接DOMを書き換えない。ユーザー入力から`innerHTML`を組み立てない。投稿本文を正規表現で書き換えない。
- PHP出力は適切に検証・エスケープする。セル結合数、幅、色、URL、スタイル値を検証し、WordPressのブロック描画APIを優先する。
- 不要な設定画面、DBテーブル、外部サービスを追加しない。
- 複雑な独自ドラッグ＆ドロップより、アクセシビリティと安定したキーボード操作を優先する。
- 行・列の移動、複製、追加、削除では影響を受けないセル内容と入れ子ブロックを保持する。

## MVPの範囲
- 初期行数・列数を指定してテーブルを挿入する。既定は3行×3列。
- 行の追加・削除・複製・並べ替え。
- グリッドの整合性が維持できる場合に限る列の追加・削除。
- セル内は`InnerBlocks`で編集する。初期許可ブロックは段落・リスト・見出し・画像・ボタン等からHTML妥当性を検証したものに限定する。
- セルごとの`th`/`td`、水平・垂直揃え、背景色、文字色。テーブル全体の罫線、幅、横スクロール設定。
- 見出し行とキャプション。可能な範囲で適切な見出しとの関連付け。
- `colSpan`/`rowSpan`による結合はM2でよいが、M1からグリッド設計とテストで考慮する。未完成の機能を使用可能として表示しない。

## テスト要件
- 単体テスト：セル占有状態、結合領域の重複、行列の追加・削除、結合・解除、正規化、不正入力、元データを破壊しない変換。
- E2E：挿入、入れ子編集、リストビュー、ツールバー、キーボード操作、Undo/Redo、保存・再読み込み、コピー＆ペースト、同一記事内の複数テーブル。
- HTML検証：公開HTMLの`table`/`tbody`/`tr`/`td`の間にエディター専用ラッパーが混入しない。
- アクセシビリティ：キーボード操作、操作名、見出しセル、フォーカス可視性、操作UIのコントラスト。
- 互換性：WordPress 6.6と対応する最新安定版でスモークテスト。狭い画面での表示も確認。
- `npm install`で依存を導入した後、`npm run build`、lint、型検査、単体テスト、設定済みE2Eを実行する。未実行のテストを成功と報告しない。

## 完了条件
- PHP警告なしで有効化でき、3ブロックが登録される。
- HTMLを書かずにテーブルの挿入と行・セル編集ができる。
- 保存後の再読み込みでブロック検証警告が出ない。
- 公開HTMLが意味的に正しく、1ページに複数配置できる。
- 列操作で無関係な内容が消えず、曖昧な結合セル操作は安全に拒否される。
- jQuery、実行時外部CDN、対応ブラウザーのコンソールエラーがない。
- READMEにセットアップ、使い方、対応機能、既知の制約、開発コマンドを記載する。

## Codexの作業手順
1. 本書と`ARCHITECTURE.md`を全文読む。
2. 変更前にリポジトリと既存スクリプトを確認する。
3. 簡潔な実装計画を示し、まず最小の動作単位を実装する。
4. マイルストーンごとにテストを実行し、実際のDOMを確認する。
5. 変更ファイル、実行したテスト、制約、次の作業を報告する。勝手にスコープを拡大しない。

## 公式資料
- https://developer.wordpress.org/block-editor/how-to-guides/block-tutorial/nested-blocks-inner-blocks/
- https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/
- https://developer.wordpress.org/block-editor/getting-started/fundamentals/block-wrapper/
- https://developer.wordpress.org/block-editor/reference-guides/block-api/block-edit-save/


## PHP名前空間と識別子の規約
- プラグイン専用のPHP名前空間は `ModularTableBlocks` とする。すべてのプラグイン固有のPHP関数・クラス・インターフェース・トレイトをこの名前空間またはそのサブ名前空間に配置し、グローバル名前空間への定義を禁止する。
- 役割別に `ModularTableBlocks\Blocks`、`ModularTableBlocks\Render` などのサブ名前空間を使用する。クラスはPascalCase、関数はsnake_caseとする。
- WordPress本体の関数・クラスは必要に応じて `\add_action()`、`\register_block_type()`、`\WP_Block` のように完全修飾名で参照する。
- WordPressのフック、オプション、CSSクラス等の公開識別子は `mtb_` または `modular-table-blocks` で衝突を避ける。PHP名前空間だけではWordPressのフック名は分離されない。
- エントリーファイル `modular-table-blocks.php` も名前空間宣言を行う。プラグインヘッダーは宣言より前のコメントに記述できる。PHP 7.4互換を維持する。
- `require_once` 等の読み込みパスを明示し、必要ならオートロードを採用する。無名関数・フックコールバックも名前空間を意識して実装する。

```php
<?php
/**
 * Plugin Name: Modular Table Blocks
 * Text Domain: modular-table-blocks
 */
namespace ModularTableBlocks;

function register_blocks(): void {
    \add_action('init', __NAMESPACE__ . '\\register_blocks_on_init');
}

function register_blocks_on_init(): void {
    // build/ 内の block.json を元に登録する。
}

register_blocks();
```


## CSSカスタムプロパティとスタイルの拡張性
- 継承スタイルの設定UIはM3でGutenberg提供コンポーネントを可能な限り使用する構成へ改善し、テキスト入力を可能な限り避ける。個別設定の解除で継承へ戻せるようにし、保存済みの値を保持する。このUI改善をM1・M2の実装範囲へ前倒ししない。
- スタイルの主要な可変値（文字色、背景色、罫線色・太さ・種類、セル余白、行間、文字サイズ、列幅など）は `--mtb-*` 形式のCSSカスタムプロパティで管理する。Sass変数はビルド時の固定値や設計上の定数に限定する。
- 共通の初期値、サイト全体の上書き、テーブル単位、行単位、セル単位の上書きを可能にする。CSSの継承とカスケードを活用し、詳細度の過度な上昇や `!important` を避ける。
- 各プロパティのフォールバック値は `var(--mtb-..., 初期値)` とし、テーマや利用者が任意のスコープで設定できるようにする。ブロックの標準CSSが常にローカル変数を定義して上位の設定を遮断する構成を避ける。
- 編集画面のスタイルと公開側のスタイルで同じトークン名と優先順位を使う。エディター固有のUI装飾だけを分離する。
- インスペクターで設定した値は、ブロック属性として保存し、該当ブロックのラッパーに必要なカスタムプロパティのみ出力する。未指定の値は出力せず、上位の設定を継承する。`style` 属性への反映は安全な型・単位・許可値の検証を必須とする。
- WordPressの `theme.json` とブロックサポート（色・タイポグラフィ・余白等）を可能な範囲で尊重し、WordPress標準のCSS変数を参照可能にする。既存のWordPressスタイルとの衝突や二重適用を避ける。
- `README.md` に公開カスタムプロパティ一覧、既定値、適用スコープ、テーマからの上書き例を記載する。グローバル・個別テーブル・個別セルの変更をテストする。
