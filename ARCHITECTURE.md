# ARCHITECTURE.md — Modular Table Blocks 設計書

## 1. 目的と基本原則
Gutenbergでテーブルの中に行を配置し、各行のセルを独立して編集できるプラグインを構築する。公開側には仕様に沿った意味的なHTMLを出力する。Gutenbergの編集用ラッパーがテーブルDOMを壊す場合、**編集画面の表現と公開HTMLを分離**する。保守性と非技術者による編集のしやすさを重視する。

### v1の対象外
- 表計算式、並べ替え・絞り込み、Excel型の範囲選択、入れ子テーブル。
- 列を独立した子ブロックとして保持する構造。
- `core/table`のあらゆる形式からの自動移行。
- モバイル時に表の意味を失わせるカード表示への自動変換。

## 2. ブロック階層
```text
modular-table-blocks/table
├── modular-table-blocks/row
│   ├── modular-table-blocks/cell
│   │   └── core/paragraph（その他の許可ブロックも可）
│   └── modular-table-blocks/cell
└── modular-table-blocks/row
    ├── modular-table-blocks/cell
    └── modular-table-blocks/cell
```

- `modular-table-blocks/table`：`allowedBlocks: ["modular-table-blocks/row"]`。
- `modular-table-blocks/row`：`parent: ["modular-table-blocks/table"]`、`allowedBlocks: ["modular-table-blocks/cell"]`。
- `modular-table-blocks/cell`：`parent: ["modular-table-blocks/row"]`。セル内の許可ブロックを`allowedBlocks`で制限する。
- 各ブロックに`InnerBlocks`領域を1つだけ設ける。
- 列はブロックではなく、各行のセルと結合幅から求める論理座標とする。

## 3. データの管理主体
| 管理主体 | 保存する属性 | 備考 |
| --- | --- | --- |
| テーブル | `columns`（列幅設定配列）、`caption`、`headerRows`、`borderStyle`、`responsiveMode` | 列数は`columns.length`。変更時はスキーマのバージョン管理を考慮する。 |
| 行 | `section`（`head`/`body`/`foot`）、必要な行スタイル | セクション順序の連続性を保証するか、描画時に正規化する。 |
| セル | `tag`（`td`/`th`）、`colSpan`、`rowSpan`、`scope`、揃え、色 | 結合数は正の整数。値は許可されたものに限定する。 |
| セル内の子ブロック | 本文・画像などのコンテンツ | Gutenberg標準のシリアライズを正本とする。 |

TypeScript型と属性スキーマで検証する。保存用の二次元配列を別途持たない。`clientId`は編集時だけのIDで、再読み込み後に変わり得る。

## 4. 描画方式：最重要の設計判断
### エディター側
最初に次の2方式を比較する。
1. `table`/`tbody`/`tr`/`td`を実際のブロックラッパーとし、`useBlockProps`と`useInnerBlocksProps`を適用する。
2. 編集時のみ`div`とCSS Gridを使い、行・セルのラベルや適切なアクセシビリティを備える。

**方式1が動くと決めつけない。** Gutenbergのブロックリスト用ラッパーや追加ボタン、ブラウザーによる不正なテーブル子要素の移動が起こり得る。Playwrightで挿入・編集・再読み込み・ドラッグ操作後の実DOMを検証する。方式1が不安定なら方式2を選び、アクセシビリティ上の差異を記録する。検証せずにARIAのtable関連ロールを重複適用しない。

### 公開側
第一候補は、テーブルのルートブロックに対する**PHPの動的レンダラー**とする。適切な場合は`save: () => null`を使う。レンダラーはパース済みの行・セルブロックを走査し、セル内ブロックはWordPressの描画APIで処理し、属性を検証・エスケープする。採用前に、動的ブロックと入れ子ブロックの保存・復元方式を実証する。行・セルが二重に描画されないよう`save`とレンダラーの責務を明確にし、テストする。

目標HTML例：
```html
<div class="wp-block-modular-table-blocks-table__scroll" tabindex="0" aria-label="横スクロール可能な表">
  <table class="wp-block-modular-table-blocks-table">
    <caption>項目一覧</caption>
    <colgroup><col style="width: 40%"><col style="width: 60%"></colgroup>
    <thead><tr><th scope="col">項目</th><th scope="col">値</th></tr></thead>
    <tbody><tr><td>サンプル</td><td>10</td></tr></tbody>
  </table>
</div>
```

`tabindex`やスクロール説明は、横方向のキーボードスクロールが必要な場合にのみ付け、無条件には付けない。外側のラッパーを使う場合も、WordPressのブロックサポートやCSSクラスの挙動を維持する。

静的`save`方式でも、保存HTMLの妥当性、Gutenbergのブロック検証、入れ子構造が実証できるなら採用可能。その場合は設計判断記録に理由を残す。

## 5. グリッドエンジン
セルの論理的な占有状態を**計算によって得られる行列**として扱う。
```ts
type CellRef = { rowIndex: number; cellIndex: number; clientId: string };
type Slot = { origin: CellRef; isOrigin: boolean };
type Grid = { width: number; height: number; slots: (Slot | null)[][] };
```

計算手順：
1. 行を順に走査する。
2. 各セルを、まだ占有されていない次の論理列へ配置する。
3. `colSpan`と`rowSpan`が正の整数で、表の範囲内であることを検証する。
4. 結合範囲の長方形を占有済みにし、重複や範囲外を拒否する。
5. 空白や列数不一致を検出する。修復方法は提示しても、内容を黙って削除しない。

実装・単体テスト対象の純粋関数：
- `buildGrid(rows, columnCount)`
- `validateGrid(grid)`
- `insertRow`、`deleteRow`、`moveRow`
- `insertColumn`、`deleteColumn`
- `mergeCells(selection)`、`splitCell(cell)`（M2）
- `normalizeGrid`（明示的かつ非破壊的な修復のみ）

変換関数は変更前に計画（`changes`、`warnings`、`errors`）を返す。可能な限り一貫したブロックエディター操作として反映し、Undo/Redoを予測可能にする。適用直前に最新のブロック状態を読み直し、古い選択状態による誤更新を防ぐ。

### 列操作
- 追加：影響を受けない行にセルを追加する。挿入位置が既存の`colSpan`を横断する場合は、文書化した規則に従って結合幅を拡張する。
- 削除：重なる結合幅を縮める。あるセルが占有する最後の列を削除するときは、内容がある場合に明示的な確認を求める。
- `rowSpan`がある場合、元セルを保持する行を正本とし、内容を複製しない。
- 意味を安全に維持できない操作は無効化し、理由を表示する。

### 結合・分割（M2）
- ツールバーから結合範囲の左上セルを選び、Modal内の行数・列数で長方形を指定する。内容は読み順で左上セルへ移し、左上セルの種類・scope・スタイルを使用する。
- 編集側は行リストの共有Gridと行ラッパーのsubgridで縦横結合を配置する。セルの編集・リストビュー選択・フォーカスと公開HTMLを実DOMで検証する。
- 部分的に交差する結合範囲を含まず、連続した長方形だけを結合可能とする。
- 選択した全セルの内容を保持する。基準セルへ子ブロックを移すか、事前確認を求めるかを仕様化し、黙って破棄しない。
- 分割時は内容の配分を定義する。復元情報がなければ基準セルが内容を保持し、新しいセルは空にする。
- 結合した見出しセルと、行列の追加・削除との組み合わせをテストする。

## 6. エディターUI
- 行・列の挿入・複製・移動・削除はブロックツールバーからのみ操作する。設定サイドバーに構造操作のボタンを配置しない。
- 初期値は3行×3列。可能なら挿入前に行数・列数を指定できるようにする。
- テーブルのツールバー：行・列の追加、先頭行の見出し化、キャプション、レスポンシブ設定。
- 行のツールバー：上・下への挿入、複製、削除、並べ替え。
- セルのツールバー・設定パネル：`td`/`th`、水平・垂直揃え、背景色・文字色、結合幅（実装済みの場合）。
- 選択中の行とセルを強調するが、公開HTMLには編集用状態を保存しない。
- フォーカスと挿入位置を明示し、リストビューとGutenberg標準のキーボード操作に対応する。
- セル内は安全な少数のコアブロックから許可し、HTML妥当性を検証してから拡張する。

## 7. アクセシビリティとレスポンシブ
- 意味的HTMLを使い、必要に応じて`caption`、`th`、`scope`、`thead`/`tbody`を出力する。
- 先頭列を自動的にすべて見出し扱いしない。明示的に設定できるようにする。
- 横幅があふれる表は、必要に応じてフォーカスが視認できるスクロールコンテナーで囲む。
- モバイル時の標準挙動として`tr`や`td`を`display: block`にして表構造を壊さない。
- 編集UIの操作名、キーボードフォーカス、破壊的操作の通知を用意する。

## 8. ビルド・言語・スタイル方針
- ビルドツールは`@wordpress/scripts`（`wp-scripts`）を必須とし、開発依存に`typescript`と`sass`を追加する。
- エディター処理・グリッド計算は`.ts`、Reactコンポーネントは`.tsx`、スタイルは`.scss`で実装する。
- `package.json`の必須スクリプトは`start: wp-scripts start`、`build: wp-scripts build`、`check-types: tsc --noEmit`。必要に応じてlint・テスト用スクリプトを追加する。
- `src/index.ts`をビルド入口とし、ブロックごとの`block.json`とスタイルの出力・登録方法を検証する。複数エントリー構成が必要なら`wp-scripts`の設定を明示する。
- PHPで登録するスクリプト・スタイルの依存関係とバージョンには生成された`*.asset.php`を利用する。公開用と編集用のSassを分け、不要なエディターCSSを公開側に読み込まない。
- 初期セットアップは`npm install`、開発時は`npm run start`、配布前は`npm run build`を実行する。`build/`は生成物として扱う。

## 9. 推奨ディレクトリ構成
```text
modular-table-blocks/
├── AGENTS.md
├── ARCHITECTURE.md
├── README.md
├── modular-table-blocks.php
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── blocks/
│   │   ├── table/{block.json,edit.tsx,save.tsx,style.scss,editor.scss}
│   │   ├── row/{block.json,edit.tsx,save.tsx}
│   │   └── cell/{block.json,edit.tsx,save.tsx}
│   ├── grid/{types.ts,build-grid.ts,operations.ts,validation.ts}
│   └── components/
├── includes/{register.php,render-table.php}
├── tests/unit/
├── tests/e2e/
└── build/（自動生成）
```

`@wordpress/scripts`の複数ブロックビルドに合わせた調整は可能。ただし、ビルド後のブロックメタデータと登録パスを検証する。

## 10. マイルストーンと通過条件
**M0 — 技術検証：** 2×2の入れ子テーブルで編集、保存・再読み込み、公開HTMLを確認する。通過条件：実DOMを検証し、ブロック検証警告がゼロ。

**M1 — 実用MVP：** 初期行列数、行操作、基本的な列操作、内容編集、キャプション・見出し設定、基本装飾、横スクロール。通過条件：E2Eと単体テストに合格。

**M2 — 高度なグリッド：** 結合・解除、結合を考慮した構造操作、内容保全。通過条件：占有状態の網羅的テストとUndo/Redoに合格。

**M3 — 品質向上：** アクセシビリティ、WordPressバージョン互換性、翻訳、ドキュメント、配布用パッケージ。通過条件：ビルドと有効化に問題がない。

- 継承スタイルの設定UIを改善する。テキスト入力を可能な限り避け、色・寸法・文字サイズ・罫線などにGutenberg提供のUIコンポーネントを可能な限り使用する。
- 明示設定と継承状態を区別し、「継承に戻す」操作で該当する個別設定を解除できるようにする。保存済みの属性値とスタイルの継承順序を維持する。
- 文字色・文字サイズ・行間・水平揃えは標準のブロックサポートを使用する。罫線と余白はスタイルタブの別パネルに置き、標準グループと同じBorderBoxControl・SpacingSizesControl・ToolsPanelItemを使用する。影は追加しない。6.6の実験的なエクスポートと新しいAPIの差は互換層で吸収する。方向の表示切り替えだけでは値を書き換えない。旧タイポグラフィー・水平揃えは読み込み時に標準属性へ移行する。
- Gutenbergのブロック名は上書きせず、行・セルの位置を `aria-describedby` で補足する。説明要素は編集時のみとし、Gridのレイアウトへ影響させず、公開HTMLへ保存しない。
- Chromium・Firefox・WebKitで結合表示とM3操作を検証し、設定UI・公開表のアクセシビリティ検査とキーボード操作、保存復元、個別設定の解除を確認する。
- 配布ZIPはWordPress Scriptsで生成し、実行ファイル・翻訳・GPL-2.0-or-laterのライセンスと再ビルド用ソースを同梱する。ZIP展開物を独立したプラグインディレクトリにして、両WordPress環境で登録と描画を検証する。詳細と結果は [M3の設計判断](docs/decisions/0005-m3-quality-and-distribution.md) に記録する。

## 11. リスクと記録すべき設計判断
- エディターDOMの制約とブラウザーによるテーブルHTMLの補正。
- 動的レンダリングと静的保存における入れ子ブロックのシリアライズ。
- ブロックサポートと意味的ラッパーの相互作用。
- 内容のあるセルを削除・結合するときのデータ消失。
- WordPress 6.6内蔵Gutenbergと新しいバージョンのAPI差異。
- 複雑な入れ子ブロックのキーボード操作のアクセシビリティ。

設計判断は`docs/decisions/`に、採用しなかった代替案と検証結果を含めて記録する。

## 12. 公式資料
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


## 12. CSSカスタムプロパティによるスタイル設計
スタイルはSass（`.scss`）で管理する。文字色・文字サイズ・行間・水平揃えは標準のブロックサポートとCSSの継承を使用し、ほかの可変値はCSSカスタムプロパティ（`--mtb-*`）として公開する。テーマ全体・テーブル単位・行単位・セル単位で設定可能とする。CSSの継承を利用し、未設定のブロックは上位の設定を受け継ぐ。

### 優先順位
1. プラグインのフォールバック値（`var()` の第2引数）
2. テーマ・サイト全体で定義された `--mtb-*`
3. 個別テーブルの `--mtb-*`
4. 個別行の `--mtb-*`
5. 個別セルの `--mtb-*`

上記は設計上の意図であり、実際のCSSの優先順位はオリジン、レイヤー、詳細度、宣言順、継承に従う。テーマからの上書きを阻害しないよう、プラグイン既定値を各ブロックのラッパーに無条件で宣言しない。利用者がブロック設定で明示的に指定した値だけを当該要素のカスタムプロパティとして出力する。

公開側の `table` 本体には `:root table.wp-block-modular-table-blocks-table { border: none; }` を適用し、テーマの外枠とセルの罫線の重複を防ぐ。重要指定は使わず、個別クラス付きのCSSによる明示的な外枠の追加は可能とする。罫線トークンはセルへ引き継ぐ。

公開セルの実プロパティには、テーブル・行・セルのプラグイン固有クラスを組み合わせたセレクターを使用し、テーマの一般的な `td` / `th` 装飾を上書きする。テーマの `padding: … !important` と競合する余白宣言に限り、公開側で `!important` を許容する。値の取得元は引き続き `--mtb-*` とし、トークンの継承順位を維持する。水平揃えの既定値は `inherit`、文字分割は `normal` とし、長い文字列は `overflow-wrap: anywhere` で折り返す。他のテーブルやセル内コンテンツへの一括リセットは行わない。

### 公開トークン例
| トークン | 用途 |
| --- | --- |
| `--mtb-text-color` | 文字色 |
| `--mtb-background-color` | テーブル背景色 |
| `--mtb-cell-background-color` | セル背景色 |
| `--mtb-border-color` | 罫線色 |
| `--mtb-border-width` | 罫線幅 |
| `--mtb-border-style` | 罫線種類 |
| `--mtb-cell-padding-block` | セルの上下余白 |
| `--mtb-cell-padding-inline` | セルの左右余白 |
| `--mtb-font-size` | 文字サイズ |
| `--mtb-line-height` | 行間 |

```scss
.wp-block-modular-table-blocks-table {
  color: var(--mtb-text-color, inherit);
  background-color: var(--mtb-background-color, transparent);
  font-size: var(--mtb-font-size, inherit);
  line-height: var(--mtb-line-height, inherit);

  > :where(thead, tbody, tfoot) > .wp-block-modular-table-blocks-row > .wp-block-modular-table-blocks-cell {
    padding-block: var(--mtb-cell-padding-block, 0.75em) !important;
    padding-inline: var(--mtb-cell-padding-inline, 1em) !important;
    border: var(--mtb-border-width, 1px)
      var(--mtb-border-style, solid)
      var(--mtb-border-color, currentColor);
    background-color: var(--mtb-cell-background-color, transparent);
    text-align: inherit;
    word-break: normal;
    overflow-wrap: anywhere;
  }
}
```

テーマ側でのグローバル変更例：
```css
:root {
  --mtb-border-color: #d4d4d4;
  --mtb-cell-padding-inline: 1.25rem;
}
```

個別テーブルの設定例：
```css
.my-table {
  --mtb-border-color: #2563eb;
  --mtb-cell-padding-inline: 2rem;
}
```

行・セルの個別設定は、対象のブロックラッパーで同じトークンを上書きする。実際の公開HTMLにおいて、行・セルのラッパーが `tr` / `td` / `th` と一致することを確認する。セルのプロパティはセル要素自身で参照し、親側のセレクターだけに依存しない。

### Gutenbergとの連携
- 継承スタイルの設定UIはM3でGutenberg提供コンポーネント中心へ置き換える。色・プリセット・寸法・罫線を選択式にし、自由なCSSテキスト入力を避ける。詳細はマイルストーンのM3を参照する。
- 色、余白、タイポグラフィは `theme.json` のプリセットやWordPress標準ブロックサポートと整合させる。
- 標準サポートの項目は標準属性に保存し、行・セルも公開Style Engineで描画する。背景色・罫線・余白・幅は明示設定のトークンのみ出力する。標準タイポグラフィーを明示した場合は対応する旧トークンを `initial` で遮断し、子が計算済みの値を継承できるようにする。
- 値の検証を行い、任意のCSS文字列の無検証出力を禁止する。色、長さ、キーワード、列幅の許可範囲を定義する。
- エディターと公開画面でトークン名と見た目を一致させる。エディター固有の操作UIは公開CSSと分離する。
- `README.md` に全トークンの一覧・初期値・スコープ・使用例を記載し、グローバル、テーブル、行、セルでの上書きおよびテーマ変更の回帰テストを実施する。

### 標準サポートと方向別UIへの移行

変更の範囲・互換対応・検証は [標準サポートと方向別スタイル](docs/decisions/0006-native-supports-and-directional-styles.md) を参照する。既存の背景色・セル共通罫線・余白は標準の自然継承とは異なるため、トークンを保持する。背景色・垂直揃え・列幅・横スクロールは今回の標準サポート移行の対象外とする。配布ZIPは今回生成せず、実装後の検証までとする。
