# 標準サポートと方向別スタイル

## 目的と範囲

文字色・文字サイズ・行間・水平揃えを `block.json` の `supports.color.text`、`supports.typography.fontSize/lineHeight/textAlign` へ移す。標準UI・属性・プリセットを利用し、未設定の子はCSSで親の計算済みの値を受け継ぐ。背景色・セル共通の罫線や余白は自然継承しないため、今回は既存トークンを保持する。垂直揃え・表幅・列幅・スクロールの管理も維持する。

ユーザーの指定により、配布ZIPの生成・再検証は後回しにし、実装とテストまでを行う。既存のZIPはこの変更を含まない。

## 保存済みデータと描画

公開フィルター `blocks.getBlockAttributes` で、旧 `styleTokens` の文字色・文字サイズ・行間と、旧 `horizontalAlign` を標準属性へ移す。既存の標準属性を優先し、該当する旧キーだけ除去する。元データと本文を変更せず、冪等な純粋関数で実行する。次回の通常保存で新形式を保存する。読み込み時の `useEffect` による属性更新やUndo履歴の追加は行わない。

PHPは新旧両形式を処理する。親レンダラーが `tr`・`td/th` を組み立てる方式を維持し、子の標準スタイルは公開API `wp_style_engine_get_styles` で出力する。親の描画中に子のための `get_block_wrapper_attributes` を呼ばず、非公開のブロックサポート処理にも依存しない。WordPress 6.6のStyle Engineでは水平揃えがCSSへ出力されないため、許可値を検証して `text-align` を補う。セル内ブロックは引き続きWordPressで1回だけ描画する。

標準タイポグラフィーを明示したスコープでは、対応する旧 `--mtb-*` を `initial` にする。祖先の旧トークンが子で再評価されるのを防ぎ、通常の継承へ戻すためであり、未設定の要素へ無条件の初期値を出す方式ではない。本文の見出し・段落等が持つ個別設定は維持する。編集時は標準の `useBlockProps` が生成するタイポグラフィーを上書きしない。旧形式をAPIから直接作成した場合の互換値だけ補い、可変タイポグラフィーを同じ設定のコア段落と比較する。iframeと公開ページではビューポート幅が異なる場合がある。

## 罫線・余白のUI

罫線とセル余白は、スタイルタブの `border`・`dimensions` スロットへ別々に配置する。標準グループと同じToolsPanelへToolsPanelItemを登録し、罫線にはBorderBoxControl、余白にはSpacingSizesControlを使用する。標準の連動・個別指定、色・線種のポップオーバー、テーマの余白プリセット、数値欄内の単位切り替えを使い、影の設定は追加しない。

WordPress 6.6の余白は方向のオプションメニュー、新しい環境では連動ボタンを使う。方向や連動表示の切り替えだけでは属性を更新しない。独自の方向別フォームや罫線幅プリセットを追加せず、WordPressが提供するUIに従う。背景色はColorPaletteControlを使用する。

余白は上下左右、罫線は各辺の幅・種類・色を保存する。旧一括・軸別値のうち、実際に変更されたグループだけをそのブロック自身の四辺へ展開する。指定した一辺の変更・解除でほかの辺や兄弟セルの設定を失わないようにする。プリセット表記は標準UIと既存トークン間で変換し、未編集値を移し替えない。罫線の幅を変更しただけで既存カスタム色をプリセットへ置き換えない。一括値は出力時にもローカルな辺変数へ展開し、親の辺指定より子の一括指定を優先する。

パネルメニューからのリセットは、そのパネルに属するトークンだけを除去する。6.6のToolsPanelが初回コールバックを保持する場合もあるため、実行時に公開データストアから現在のブロック属性を読み、後から編集した無関係な設定を保持する。

四辺の値は `cellPaddingTop/Right/Bottom/Left`、`borderTop/Right/Bottom/Left` + `Width/Style/Color` として `styleTokens` に保存する。TSとPHPで同じ許可範囲を検証する。公開側のテーマの重要指定対策は四辺の余白宣言に維持する。

## テーマのカラーパレット

背景色・罫線色は共通フック `useThemeColors` から取得する。公開API `useSettings` で `color.palette.theme/custom/default` と `color.defaultPalette`・`color.custom` を参照し、テーマ・サイト・ブロック別の現在の設定を反映する。構造化されたパレットがない場合のみ、従来の `getSettings().colors` へフォールバックする。明示的な空パレットは旧パレットで上書きしない。同じslugはサイト設定、テーマ、既定色の順で優先する。

テーマ色の表示値はRGBやCSS変数等も認めるが、保存する値は検証済みの `var(--wp--preset--color--slug)` とする。テーマの表示値をそのまま投稿のCSSへ保存しない。パレット取得時に属性を更新しないため、テーマ変更によって既存の保存値を書き換えることもない。

## 互換性と制約

BorderBoxControl・UnitControl・SpacingSizesControl・ToolsPanelItemの実験的エクスポートは `style-compat.tsx` へ限定する。安定版の名前が使える場合はそちらを優先する。パッケージ内部のインポートや `privateApis` / `unlock` は使用せず、6.6と新しい検証環境の実DOMで検証する。

保存値の許可範囲は従来どおり罫線0–20px/0–1em・rem、余白0–200px/0–10em・remとテーマの余白プリセットとする。標準UIに表示されてもこの範囲外の値・単位はエラーを表示し、保存しない。WordPress 6.6の未設定の余白スライダーが空のツールチップを露出するため、プラグイン内の空ツールチップだけSCSSで非表示にする。DOMの直接変更やアクセシビリティ検査の除外は行わない。

公開表は `border-collapse: collapse` を維持する。各辺を個別に設定しても、共有辺の表示は隣接セルとの罫線競合規則に従う。片側を幅0にしただけでは隣接セルの罫線を消せない場合がある。編集側は引き続きdiv/Gridのため、この競合表示は公開表と同一ではない。

## 検証

2026-10-22に以下を確認した。

- `npm run build`、`npm run check-types`、`npm run lint`：成功。
- `npm run test:unit`：6スイート・116件成功。移行・非破壊性・方向別設定・プリセット変換・リセット・不正値の拒否を含む。
- `npm run test:php`：WordPress 6.6／PHP 7.4.33で成功。
- `npm run test:php:latest`：WordPress 7.1.3／PHP 8.3.35で成功。新旧スタイル・数値/プリセット・不正値・意味的HTMLを検証。
- Chromium：両環境で32件を確認。全体実行では各31件成功し、日本語テストのコアタブ名をWordPress本体の言語パック有無に対応させて単独再実行で成功。プラグインの日本語訳は85件すべて翻訳済み。最終変更の範囲外入力・リセットも両環境で再検証した。
- `npm run test:e2e:compat`：Firefox・WebKit × WordPress 6.6・7.1.3の60件を確認。全体実行では59件成功し、Firefoxの1件は再読み込み直後のデータ待機不足で失敗した。復元完了の待機を追加し、`--last-failed` の再実行で成功。
- 標準パネルの方向切り替え・単位・色・標準タイポグラフィー・Undo/Redo・保存再読込・パネル間の値の保持・日本語表示・エディター／公開側のアクセシビリティを検証した。

テーマパレット取得の追加修正後は、ビルド・型検査・lintと単体118件が成功。ChromiumではWordPress 6.6・7.1.3それぞれでテーマ／ブロック別パレット2件と既存色操作・リセット・アクセシビリティ4件を検証した。Firefox・WebKitでは両WordPress環境のパレット取得・保存8件を確認した（6.6のFirefoxで検証用設定を初期化途中に適用していた2件は、初期化完了を待つ修正後の再実行で成功）。配布ZIPは生成していない。

参考： [Block Supports](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/)、[Style Engine](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-style-engine/)、[BorderBoxControl](https://developer.wordpress.org/block-editor/reference-guides/components/border-box-control/)、[BoxControl](https://developer.wordpress.org/block-editor/reference-guides/components/box-control/)。
