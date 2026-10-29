# 編集画面のアイコン

ユーザー提供のSVG21用途を使用する。原稿は`svg/`、用途IDと原稿の対応は`icon-map.json`、呼び出し口は`index.tsx`とする。S01・S02は含めず、結合と解除はT04を共用する。R02は末尾の行追加、C02は末尾の列追加にも使う。

SVGは完成済みの方向を持つため、対応表のtransformを重ねて適用しない。原稿を修正する場合はSVGを編集し、WordPress Scripts既存のSVGRでビルドする。生成JSへ図形を直接書き足さない。

登録アイコンは`src/index.ts`から公開のregisterBlockType設定へ渡す。block.jsonのDashicon名はメタデータのフォールバックとして維持する。

すべて単色currentColorの線画。最適化で固定寸法のviewBoxが省略されても20pxへ縮小できるよう、共通関数で`viewBox="0 0 24 24"`を渡す。WordPressのボタンCSSによる塗りつぶしを防ぐため、`style.fill = none`も維持する。押下・無効・テーマの配色は標準UIへ委ねる。SVGは装飾として読み上げ・フォーカスから外し、操作名はボタンの翻訳ラベルで提供する。公開HTMLへは出力しない。

原稿・対応表は提供元の指定によりGPL-2.0-or-later。[同梱ライセンス](LICENSE)を維持する。
