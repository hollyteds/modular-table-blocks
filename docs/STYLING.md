# 公開CSS・テーマ連携仕様

テーマから利用するCSSの適用先・カスタムプロパティ・既定値・入力可能な値の正本。内部の保存・継承処理と編集UIは[現行仕様](ARCHITECTURE.md)、ビルドは[開発手順](DEVELOPMENT.md)、画面上の操作は[利用ガイド](../README.md)を参照する。

## 適用先

| 要素・スコープ | 担当する値 |
| --- | --- |
| figure.modular-table-blocks-figure | 表幅、外側余白、幅広／全幅 |
| table.wp-block-modular-table-blocks-table | 背景、文字、最小高さ、セル共通値。追加CSSクラスもこの要素に付く |
| .wp-block-modular-table-blocks-cell（th/td） | セルの背景、罫線、内側余白、文字、位置揃え |
| col | 列幅 |
| caption | 表題。table内に置く |
| div.modular-table-blocks-scroll | 横スクロール有効時だけ追加する領域 |

表幅を公開CSSから上書きする--mtb-wはfigureまたはその祖先へ指定する。tableの追加クラスへ指定した値は祖先のfigureへは継承されない。表幅未指定時のfigureはautoで左右余白を除いた領域に収まり、明示した幅と余白は通常のCSSボックスモデルに従う。

## カスタムプロパティと既定値

値の名前と保存値の展開規則は[includes/style-tokens.json](../includes/style-tokens.json)で共有する。既定値はvar()のフォールバックであり、未設定ブロックのローカル変数として一律に宣言しない。

| トークン | フォールバック | 参照する要素 |
| --- | --- | --- |
| `--mtb-text-color` | `inherit` | テーブル・セル |
| `--mtb-background-color` | `transparent` | テーブル（標準背景色の未指定時） |
| `--mtb-cell-bg` | `transparent` | セル共通色／セル個別色 |
| `--mtb-cell-header-bg` | セル共通色、なければ透明 | 親からTHへ適用 |
| `--mtb-cell-stripe-bg` | セル共通色、なければ透明 | 親からストライプ対象のTDへ適用 |
| `--mtb-cell-vertical-align` | `top` | セルの縦位置（テーブルから継承） |
| `--mtb-border-spacing-x` | `0` | 分離したセルの横方向の間隔（テーブル） |
| `--mtb-border-spacing-y` | `0` | 分離したセルの縦方向の間隔（テーブル） |
| `--mtb-cell-border-t-color` / `--mtb-cell-border-r-color` / `--mtb-cell-border-b-color` / `--mtb-cell-border-l-color` | `currentColor` | セルの各辺の罫線色 |
| `--mtb-cell-border-t-width` / `--mtb-cell-border-r-width` / `--mtb-cell-border-b-width` / `--mtb-cell-border-l-width` | `1px` | セルの各辺の罫線幅 |
| `--mtb-cell-border-t-style` / `--mtb-cell-border-r-style` / `--mtb-cell-border-b-style` / `--mtb-cell-border-l-style` | `solid` | セルの各辺の罫線種類 |
| `--mtb-cell-pt` / `--mtb-cell-pb` | `0.75em` | セルの上／下余白 |
| `--mtb-cell-pr` / `--mtb-cell-pl` | `1em` | セルの右／左余白 |
| `--mtb-font-size` | `inherit` | テーブル・セル |
| `--mtb-line-height` | `inherit` | テーブル・セル |
| `--mtb-w` | 外側は`auto`、内側の表は`100%` | 公開時はfigure、編集時はテーブルのラッパー |
| `--mtb-column-width` | `auto` | 各 `col`（列幅設定から出力） |
| `--mtb-scroll-min-width` | `40rem` | 横スクロール有効時のテーブル（テーマCSSで変更） |

文字色・文字サイズ・行間はWordPress標準の設定を優先する。対応する--mtb-*は標準値がないスコープでの互換フォールバックも担当する。標準設定を明示したスコープでは対応するフォールバックをinitialで遮断し、子は計算済みの文字を継承する。セル装飾は辺別の変数へ1回ずつ出力し、一括・軸別の別名変数や未リリースの旧CSS名は出力しない。

## 継承とテーマとの関係

設計上の優先順位はフォールバック→サイト共通→テーブル→セル。実際には通常のCSSカスケード・詳細度・宣言順と継承が適用される。背景の見出し／ストライプの位置判定や、一括設定の共通化は現行仕様に従い、CSSの見た目だけで保存値を変更しない。

見出しの既定の太さは700。親の妥当な標準fontWeightがあれば継承し、セル自身の指定を優先する。表・セルのタグ由来の装飾差を抑えるが、通常のコアテーブルやセル内のコアブロックの装飾は一括リセットしない。

公開table本体は既定でborder:none。表・セルのプラグイン固有クラスで一般的なtd/thのテーマ装飾を上書きする。公開セルのpadding宣言だけはテーマの!importantへ対応するため!importantを使う。カスタムプロパティの指定に!importantは不要。任意の強いテーマCSSから完全には隔離しない。

テーブル本体の外枠を明示的に追加する例は`:root table.wp-block-modular-table-blocks-table.my-table { border: 2px solid #333; }`。水平揃えの未指定時はinherit、折り返しはword-break:normal / overflow-wrap:anywhereとする。

## テーマからの設定例

```css
:root {
  --mtb-text-color: var(--wp--preset--color--contrast, #222);
  --mtb-cell-border-t-color: #d4d4d4;
  --mtb-cell-border-r-color: #d4d4d4;
  --mtb-cell-border-b-color: #d4d4d4;
  --mtb-cell-border-l-color: #d4d4d4;
  --mtb-cell-pr: 1.25rem;
  --mtb-cell-pl: 1.25rem;
}

/* テーブルの「追加CSSクラス」に my-table を設定 */
.my-table {
  --mtb-cell-border-t-color: #2563eb;
  --mtb-cell-border-r-color: #2563eb;
  --mtb-cell-border-b-color: #2563eb;
  --mtb-cell-border-l-color: #2563eb;
  --mtb-cell-pr: 2rem;
  --mtb-cell-pl: 2rem;
}

.my-table > tbody > tr:first-child {
  --mtb-cell-bg: #eef2ff;
}

.my-table > tbody > tr:first-child > :first-child {
  --mtb-text-color: #1e3a8a;
}
```

表の追加CSSクラスがmy-tableの場合の例。サイト共通CSSを編集キャンバスにも反映する場合は、テーマから同じCSSを読み込む。公開ページと編集iframeの:rootは別の文書である。子の段落・見出し等で明示した装飾はその子の設定を優先する。

## 設定値の許可範囲

以下はブロック属性のトークンから受け付ける値。テーマのCSSへ直接書く値の範囲を限定するものではない。

| 設定値 | 許可範囲 |
| --- | --- |
| 色 | 3/4/6/8桁の16進色、`transparent`、`currentColor`、`inherit` |
| 罫線幅 | `0`、0〜20px、0〜1rem/em |
| 罫線種類 | `none`、`solid`、`dashed`、`dotted`、`double` |
| セル余白 | `0`、0〜200px、0〜10rem/em |
| 文字サイズ（旧トークン） | 8〜160px、0.5〜10rem/em、50〜500% |
| 行間（旧トークン） | `normal`、0.5〜4の単位なし数値 |
| テーブル幅 | 0より大きい100%以下、4000px以下、250rem/em以下 |

標準タイポグラフィーの候補と入力範囲はWordPressとテーマに従う。一括設定の文字サイズは正の有限数と標準単位（px・em・rem・％・vw・vh）、行間は0以上の有限数で検証し、互換トークンの範囲へ制限しない。変更していない保存済み標準値は保持する。

色はvar(--wp--preset--color--contrast)、文字サイズはvar(--wp--preset--font-size--large)、セル余白はvar(--wp--preset--spacing--40)のようなWordPressプリセット参照も使える。プリセット名は英小文字・数字・単語間ハイフンのみ。任意のvar()・calc()・URL・複数宣言は属性の入力値として受け付けない。

## パレットとセル間隔

パレットはtheme.json・従来のeditor-color-palette・サイト設定・ブロック別の登録色と、既定色／カスタム色の許可を尊重する。RGBやCSS変数を使うテーマ色も候補へ反映し、選択したテーマ色はプリセット参照で保存する。テーマCSSにしかない色は候補へ自動追加しない。

border-collapse:collapseでは共有辺が隣接セルとの罫線競合規則に従う。一方を幅0にしても隣の罫線が残る場合がある。separateでは各セルが辺を持ち、間隔部分にはtableの背景色が見える。編集Gridのgap・行高・幅計算や可変文字サイズまで公開tableと完全には一致しない。
