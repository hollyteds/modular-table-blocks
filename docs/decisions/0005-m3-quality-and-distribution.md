# M3：継承スタイルのUI・品質検証・配布

## 設定UIと保存データ

自由なCSSテキスト入力を、WordPressのColorPalette・SelectControl・RangeControl・Buttonへ置き換える。WordPress 6.6でUnitControlは公開されていないため、寸法をスライダーと単位の組み合わせで扱う。色・文字サイズ・余白では、公開のエディター設定と `useSettings` から取得したテーマのプリセットも使う。数値と単位の許可範囲は従来のTypeScript/PHPの検証に合わせる。

パネルを開く・単位を選ぶだけでは未設定値を保存しない。既存の透明色、`currentColor`、0、相対単位、プリセット参照、`normal` などを維持する。数値への変換や既定値の書き込みは行わない。操作で変更した項目だけを更新し、解除時はそのキーを除去する。列幅も同じ寸法UIを使い、自動幅へ戻せるようにする。保存スキーマの移行は不要。

単位を変更した場合は数値を新しい単位で解釈し、許可範囲へ収める。実寸の換算は行わない。プリセットをカスタム寸法へ変更する場合はスライダーで明示的に値を選ぶ。テーマにない保存済みのプリセット参照も解除・変更されるまで保持する。

公式の[RangeControl](https://developer.wordpress.org/block-editor/reference-guides/components/range-control/)と[ColorPalette](https://developer.wordpress.org/block-editor/reference-guides/components/color-palette/)を基に、最低対応版の実画面で操作と保存復元を検証する。非公開APIの互換レイヤーは追加しない。

## 編集DOMとアクセシビリティ

Gutenberg 6.6は `useBlockProps` のブロック名を管理し、渡した `aria-label` を採用しないことを実DOMで確認した。上書きや内部APIへの依存を避け、行・セルに編集専用の位置説明を置き、`aria-describedby` で関連付ける。説明要素は絶対配置してGridの占有範囲へ含めず、公開・保存HTMLへは出力しない。ブロック名・リストビュー・既存のフォーカス操作を維持する。

継承解除、Undo/Redo、再読み込み、構造メニュー・確認画面のキーボード操作とフォーカス復帰、セル編集中のフォーカス枠を検証する。axeによるWCAG 2 A/AA・2.1 AAの該当ルールを、設定UIと公開表に限定して確認する。公開表はキャプション・見出し・スクロール領域を含め、狭い画面の左右キー操作も確認する。

自動検査は読みやすい配色の検証データに対する確認であり、任意の配色、サイト全体の適合、スクリーンリーダー実機での読み上げを保証するものではない。編集DOMは引き続きdiv/Gridとし、公開HTMLは意味的なtableを維持する。

## 互換性と配布物

WordPress 6.6/PHP 7.4と7.1.3/PHP 8.3を使い、Chromiumの全E2Eと、Firefox・WebKitの結合・M3検証を実行する。現行の安定版は[WordPress公式API](https://api.wordpress.org/core/version-check/1.7/)でも7.1.3と確認した。編集レイアウトにはCSS subgridが必要。Playwright WebKitはSafari製品そのものの実機確認とは区別する。

`wp-scripts plugin-zip` と `package.json` の許可リストからZIPを作る。実行ファイル・翻訳・GPL-2.0-or-laterのLICENSEに加え、再ビルド用のTS/SCSS、webpack・TypeScript設定、npmの依存情報を同梱する。node_modules、Git・IDE・wp-env設定、テストは除外する。バージョンは未リリースの0.1.0を維持する。

PHPの配布物検証では、ZIPの必要ファイルと除外対象を確認して一時ディレクトリへ展開する。`WP_PLUGIN_DIR` を展開先へ変更してWordPressを読み込み、登録関数がZIP内から読み込まれたことと、パッケージの依存情報を使った登録を確認する。同じPHP描画テストも実行し、マウントした開発版だけの成功と区別する。

開発依存のインストールでは既存のpeer・engine・audit警告が残る。破壊的な依存更新は行わない。公開側のJavaScriptや実行時の外部依存は追加しない。

検証中、最新WordPressのRangeControlでは最小値0.01・刻み1の組み合わせで900pxが900.01pxに丸められたため、幅の刻みを0.01へ揃えた。単体テストでも整数幅が刻みに一致することを確認する。WebKitのネイティブスクロールはキーの押下中の描画フレームで始まるため、テストの左右キーは押下から解放まで100msを設ける。フォーカス検証前にはブラウザーのタブを前面にする。製品コードにフォーカスやスクロールの回避処理は追加しない。

WordPress 7.1.3/Firefoxでは、リストビューを閉じた後、ストア上のセル選択だけから段落へ直行すると親セルがフォーカスを受けるケースを確認した。新規挿入した表や通常グループでは段落へ直接フォーカスできた。E2Eではセル枠をクリックして編集キャンバスへ戻り、セルのフォーカスを確認してから、結合セル下側の段落をクリックし、段落のフォーカスと実際のカーソル位置を検証する。この操作上の制約はREADMEにも記録し、内部APIやDOM操作で強制しない。保存復元の検証はエディターのブロックツリーが読み込まれるまで待つ。

## 主な変更ファイル

- `src/components/style-panel.tsx`、`length-control.tsx`、`column-width-control.tsx`、`src/styles/controls.ts`：選択式の設定と継承解除、数値の解析・許可範囲。
- `src/blocks/row/edit.tsx`、`cell/edit.tsx`、`table/editor.scss`：位置の補足説明と編集画面の表示。
- `tests/e2e/m3.spec.ts`、既存E2E、`playwright.compat.config.ts`、`tests/unit/controls.test.ts`：新UI、継承、キーボード、アクセシビリティ、複数ブラウザーの検証。
- `package.json`、`package-lock.json`、`.gitignore`、`LICENSE`、エントリーPHP、`tests/php/package.php`：配布・ライセンス・ZIP検証。
- `languages/` と `build/`：翻訳・ビルドの生成物。README、設計書、変更履歴を更新。

## 実行結果（2026-10-22）

| 検証 | 結果 |
| --- | --- |
| 依存導入・ビルド・型検査・TS/Sass lint | 実行済み、終了コード0 |
| 単体テスト | 5スイート・95件成功 |
| WordPress 6.6 / Chromium | 全28件成功 |
| WordPress 7.1.3 / Chromium | 全28件成功。操作手順調整後の結合ケースも再確認 |
| Firefox・WebKit / 両WordPress | 合計44件成功。ブラウザー別の復帰操作調整後、結合ケース4構成も再実行して成功 |
| 配布ZIP | 49ファイル。ライセンス・必要ソース・実行ファイル・バージョンを検証 |
| ZIP展開物の登録・描画 | WordPress 6.6 / PHP 7.4.33、WordPress 7.1.3 / PHP 8.3.35で成功 |
| 日本語 | 105件翻訳済み。POT・MO・JSON生成、`msgfmt --check`成功 |

設定UIと375px幅の公開画面の画像、結合セルの実寸、補足説明・フォーカス・実際のカーソル位置も確認した。Firefoxのキャンバス復帰時の操作差、subgridの必要性、編集DOMと公開HTMLの差、支援技術実機・実Safari・任意のテーマ全体を未確認とする範囲は維持する。
