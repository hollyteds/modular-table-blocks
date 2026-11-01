# 開発・検証・リリース手順

文書の入口は[README.md](README.md)、機能と実装の契約は[ARCHITECTURE.md](ARCHITECTURE.md)、公開CSSは[STYLING.md](STYLING.md)、作業規約は[AGENTS.md](../AGENTS.md)を参照する。この文書には操作手順を記載し、機能仕様や過去の成功件数を複写しない。

## 1. 環境構築

Node.jsとnpm、Docker、Playwrightのブラウザーを使用する。Node/npmはpackage.jsonと依存パッケージのengine要件を確認する。既存の開発環境の推奨値はNode.js 24.18以上・npm 11.16以上。実行結果には実際に使ったバージョンを記録し、推奨値と混同しない。

```sh
npm install
npm run build
npm run env:start
npx playwright install chromium firefox webkit
```

ソースはsrc/・includes/、生成物はbuild/。生成物を直接編集しない。手動のWordPress環境ではプラグイン一式をwp-content/plugins/modular-table-blocksへ置いて有効化する。ローカル検証環境は次の設定を使う。

| 設定 | WordPress / PHP | URL・用途 |
| --- | --- | --- |
| [.wp-env.json](../.wp-env.json) | 6.6 / 7.4 | localhost:8890、PHPテスト用は8891 |
| [.wp-env.latest.json](../.wp-env.latest.json) | 7.1.3 / 8.3 | localhost:8892、新しい版での互換確認 |

「latest」は設定ファイル名であり、常に最新安定版を自動取得する意味ではない。対応環境を更新する場合は設定と文書を揃える。初期ログインはadmin / passwordで、E2Eの認証情報はWP_USERNAME・WP_PASSWORDで変更できる。テストは投稿の作成・公開や検証用投稿者mtb-reload-authorの作成を行うため、専用環境を使う。

## 2. 開発コマンド

コマンドの定義は[package.json](../package.json)を参照する。

| コマンド | 用途 |
| --- | --- |
| `npm run start` | 監視ビルド |
| `npm run build` | JS・CSS・block.json・asset情報・manifest・翻訳マップを生成し、整合を検証 |
| `npm run check:artifacts` | 再ビルドせず、出力ファイルの存在・ハッシュ、配布指定と翻訳マップを検証 |
| `npm run test:tooling` | 生成物・配布指定・翻訳対応の欠落検出を検証 |
| `npm run check` | lint・型検査・単体テスト・ツール検証・ビルドを一括実行 |
| `npm run check-types` | TypeScript型検査 |
| `npm run lint` | TypeScript/TSXのESLintとSassのStylelint |
| `npm run test:unit` | 純粋関数の単体テスト |
| `npm run env:start` / `npm run env:start:latest` | それぞれのWordPress環境を起動 |
| `npm run test:php` / `npm run test:php:latest` | PHP登録・公開描画・値・HTMLの検証 |
| `npm run test:e2e` / `npm run test:e2e:latest` | それぞれの環境でChromiumのE2E |
| `npm run test:e2e:compat` | 設定済みの対象をFirefox・WebKit、両環境で検証 |
| `npm run i18n:pot` | 配布用生成物から翻訳テンプレートを抽出 |
| `npm run i18n:build` | POからMOとJavaScript翻訳JSONを生成 |
| `npm run package` | 再ビルドし、バージョン付きZIPと更新用JSONをdist/へ生成。リリース・配布を行う作業で使う |
| `npm run test:package` / `npm run test:package:latest` | ZIP展開物の登録・描画を検証 |
| `npm run env:stop` | 6.6の環境を停止 |

新しい環境の停止は`npx wp-env stop --config=.wp-env.latest.json`。PHP等のCLI操作は`npm run env:cli`を使う。

## 3. 変更時の検証

1. git statusで既存の変更を確認し、仕様の該当節・コード・既存テストを読む。
2. 必要な依存を導入し、コードを変更したらbuild・lint・check-types・test:unitを実行する。
3. PHP描画の変更は両PHP環境で検証し、編集・構造・スタイル・取り込みは該当するE2Eを実行する。必要に応じて設定済み全体の回帰検証へ広げる。
4. WordPress 6.6と新しい環境での実DOM・保存HTMLを確認する。変更に応じてFirefox・WebKit、狭い画面、操作UIのアクセシビリティも検証する。
5. 実行したコマンド・環境・対象と結果、スキップ・失敗・未確認の項目を作業報告へ残す。成功件数を現行仕様の代わりにしない。

```sh
npm run build
npm run lint
npm run check-types
npm run test:unit
npm run env:start
npm run env:start:latest
npm run test:php
npm run test:php:latest
npm run test:e2e
npm run test:e2e:latest
npm run test:e2e:compat
```

これは実装変更時の一連の検証例であり、文書の整理や環境を起動していない作業で全件実行済みと扱わない。文書のみなら相対リンク・アンカー・コマンド・正本との整合性を確認する。

### 対象を絞る例と実行時の注意

```sh
npm run test:unit -- --testPathPatterns=import
npm run test:e2e -- tests/e2e/import.spec.ts
npm run test:e2e:latest -- tests/e2e/import.spec.ts
npm run test:e2e:compat -- tests/e2e/import.spec.ts
```

- 同じWordPress環境へ複数のPlaywrightプロセスを同時接続すると、ログインやユーザーの設定が干渉する。環境ごとに直列で実行する。
- [playwright.compat.config.ts](../playwright.compat.config.ts)は対象ファイルを列挙する。新しいE2Eを追加した場合は必要な互換対象も更新する。
- テスト結果・スクリーンショット・トレースはtest-results/等のローカル生成物。次の実行で上書きされるため、必要な結果を先に確認する。Gitへ追加しない。
- 取り込みの大規模描画計測とネイティブクリップボード権限の検証はChromiumに限定する。Firefox/WebKitのMIME入力は合成pasteイベントを使い、Firefoxで渡したデータを失わないよう読み取り用clipboardDataをテスト側で設定する。実アプリのコピー動作の検証とは区別する。
- WordPress 6.6のSCRIPT_DEBUGでは本体のcreateRootに関する既知のReact警告をテストが識別する。それ以外のコンソール・ブロック検証エラーを除外して成功扱いしない。
- 依存のengine・audit警告を確認し、実際に使ったNode/npmと環境を報告する。この文書への移設だけで依存の問題が解消したとは扱わない。

### 機能追加前後の確認

- 保存する属性・既定値・公開HTMLへの反映先を決め、block.jsonと現行仕様へ反映する。
- 継承と解除・結合セル・ロックと明示承認・古い確認・対象外の内容・1回のUndo/Redo・保存再読み込みを該当機能で確認する。
- 新しい遅延ロードや同梱依存を追加したら、生成manifest・翻訳・ライセンス表記・配布検証を確認する。
- 既存の共通JSON事例を使うTypeScript／PHP検証を維持し、両方に実装する規則では同一事例を追加する。
- 大きな表へ影響する場合は取り込みE2Eの100行×50列とimport-timing.jsonを使い、プレビュー・適用時間を同じ環境で比較する。測定していない性能改善を報告しない。

GitHub Actionsのchecks.ymlは`npm ci`と`npm run check`、生成物の差分・未追跡ファイルを検査する。PHP・WordPress・ブラウザー検証は別途上記コマンドで実行する。CIで翻訳の変更漏れを直すために既存の訳を自動上書きしない。

## 4. ビルドと翻訳

[webpack.config.cjs](../webpack.config.cjs)とsrc/index.tsからビルドする。`start`と`build`はWordPress Scriptsへ`--config=webpack.config.cjs`を明示し、単体テストも`--config=jest.config.cjs`を指定する（使用中のScriptsは.cjsを自動検出しない）。WordPress提供パッケージは外部化し、生成されたasset情報の依存・バージョンをPHP登録へ使う。取り込みは遅延ロードするため、配置・配布には分割JSを含むbuild/全体が必要。ファイル名の数値IDを固定した公開APIと考えない。

日本語の編集元はlanguages/modular-table-blocks-ja.po、テンプレートはmodular-table-blocks.pot、PHP・メタデータ用はMO、JS用はJSON。MO・JSONは手作業で編集しない。

1. UIの英語文言を変更したらbuildを実行する。
2. i18n:potでテンプレートを抽出する。
3. POをPOTへ同期し、新規・変更文言の訳を追加する。
4. i18n:buildでMO・JSONを生成する。
5. 日本語の登録名・設定・通知と、遅延ロード後の画面を確認する。

```sh
npm run build
npm run env:start
npm run i18n:pot
# POを同期して翻訳を編集
npm run i18n:build
```

POTの抽出対象とJSON生成の--no-purge・対応表はpackage.jsonに定義する。[languages/map.json](../languages/map.json)はblock.jsonとbuild/table-import.jsの文言をbuild/index.js用翻訳へ集約する。対応表はbuild時に出力manifestから全JS・ブロックメタデータを列挙して生成し、数値チャンク名を固定しない。手作業で編集しない。入口を改名する場合は集約先と翻訳JSONのパスハッシュを確認する。監視ビルド後に翻訳を生成する際も、先に`npm run build`で対応表を更新する。

## 5. Gitと配布物

ソース、必要なbuild/・翻訳、依存固定用package-lock.jsonと共通設定はGitで管理する。個人のIDE設定・ローカル環境設定・node_modules・キャッシュ・テスト結果・ログ・配布物のdist/は[.gitignore](../.gitignore)で除外する。

ライセンスは[GPL-2.0-or-later](../LICENSE)、同梱ライブラリの表記は[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。配布対象と許可範囲はpackage.jsonのfilesを正本とし、[tests/php/package.php](../tests/php/package.php)も同じ定義を使う。webpackが出力するbuild/manifest.jsonに全生成ファイルとSHA-256を記録し、通常のPHP検証とZIP展開物の検証で分割JSを含む欠落・改変を検出する。

THIRD_PARTY_NOTICES.mdとビルドmanifestは配布に必要。ZIPを生成せずに確認する場合は`npm run check:artifacts`を使う。ZIP自体の展開・登録・描画の検証はリリース作業で実施する。

## 6. リリース手順

1. 現行仕様・公開CSS・利用ガイドを更新し、未実装・未確認事項を整理する。暫定履歴だけに必要な情報を残さない。
2. Unreleasedの内容を確認し、エントリーPHP、package.json、package-lock.json、各src/blocks/*/block.jsonのバージョンを揃える。開発中の変更ごとには上げない。
3. 必要な検証と翻訳生成を行い、build/全体を生成する。ライセンス表記と配布・ZIP検証の定義を一致させる。
4. [暫定履歴資料の除外手順](#暫定履歴資料のgit管理からの除外)に従って暫定履歴がGit管理・配布対象外であることを確認し、恒久文書から履歴への必須参照がないことを再確認する。
5. 配布用ZIPを作り、両WordPress環境で展開物を検証する。WordPress ScriptsのZIPはnpmの梱包規則によりロックファイルを含まないため、再現用のpackage-lock.jsonは開発リポジトリで管理する。
6. 実際のリリース操作に合わせてCHANGELOGの日付・バージョンを確定し、コミット・タグ・push・公開は依頼された範囲で実施する。

```sh
npm run package
npm run test:package
npm run test:package:latest
```

### 独自配信サーバーでの更新配布

更新機能の契約は[現行仕様](ARCHITECTURE.md#11-配布元からのプラグイン更新)を参照する。エントリーPHPの`Update URI`は`https://ht-code.jp/updates/modular-table-blocks.json`。別の配信先へ変更する場合は、このヘッダーを変更して検証し、JSON内のURLと本節の配置例も揃える。ヘッダーを変えるだけでは、既存サイトの取得先は切り替わらないため、旧配信先から移行版を配布してから旧URLを廃止する。

1. 本節の前にあるリリース手順でバージョン・翻訳・ビルド・ZIP検証を完了する。生成前に[更新情報のひな形](update-manifest.example.json)の作者名・説明・必要環境・変更履歴を実際の配布版に合わせる。開発作業だけではバージョンを上げない。
2. `npm run package`は`dist/modular-table-blocks-<version>.zip`と`dist/modular-table-blocks.json`をまとめて生成する。版番号はpackage.jsonから取得し、エントリーPHPと不一致なら生成を拒否する。ひな形は編集せず、出力JSONの`version`と`package`のZIPファイル名だけを配布版へ揃える。配信ディレクトリはひな形の`package`のURLを使い、Update URIと同じHTTPSオリジンに限定する。再実行すると同じ版のZIPとJSONを上書きし、古い版のZIPは保持する。ZIPの最上位は`modular-table-blocks/`を維持し、JSONのひな形も再生成用に同梱する。出力されたZIPをその名前のままサーバーの`/updates/`へ置く。公開済みのZIPは上書きせず、新版を別名で置く。
3. `dist/modular-table-blocks.json`の内容とZIPの対応を確認する。`sections.changelog`は新しい版から順に、バージョン見出し（`h4`）と利用者向けの短い箇条書き（`ul`・`li`）で記載する。見出しの版番号はひな形で手動更新する。正式リリースまでは「開発版（正式リリース前）」の1項目に省略し、正式リリース後は機能改善・修正・対応環境の変更などを簡潔に記す。開発用の`CHANGELOG.md`全文や内部実装・検証の詳細は転記しない。`tested`を加える場合は実際に確認したWordPress版だけを書く。キーと値の制約は現行仕様を参照する。
4. ZIPのHTTPSダウンロードと展開内容を先に確認し、最後にJSONを`/updates/modular-table-blocks.json`へ公開する。JSONはHTTP 200・`Content-Type: application/json`で、リダイレクト・ログイン・Cookieなしに取得できるようにする。ZIPも同じホストから直接配信する。JSONのCDN／サーバーキャッシュが古い版を返さないことを確認する。
5. 更新機能のない導入済みサイトへは、更新機能を含むZIPを最初の1回だけ標準アップロードで上書きする。以後は、有効化中のプラグインが新しい版を検出すると、標準の管理画面で更新できる。
6. 検証用サイトで旧版から新版への更新・有効状態の維持・保存済みの表の再読み込みと公開表示を確認する。WordPressの「ダッシュボード → 更新 → 再確認」で更新情報を取り直せる。通常の取得間隔はWordPress本体に従い、JSON公開直後に全サイトが一斉に更新を認識するものではない。

認証を伴わない配布方式なので、ZIPのURLを知っている人はダウンロードできる。配信サーバーの保護は更新コードの配布権限に直結するため、HTTPSと公開権限を管理する。リリース前の検証では`pre_http_request`で通信を差し替え、実サーバーに問い合わせず、正常・通信失敗・不正応答・キャッシュ・再確認・WordPress本体の版比較をPHP検証で確認する。実サーバーでの配信と導入済みサイトの更新は、公開後に別途確認する。

### 暫定履歴資料のGit管理からの除外

`docs/decisions/`はGit管理対象外のローカルの暫定資料で、.gitignoreの`/docs/decisions/`で除外する。新規チェックアウトには含まれない。現行仕様・作業規約・手順・公開CSS・利用ガイド・CHANGELOG・ライセンスは引き続き管理し、次の条件を維持する。

- 現行文書だけで全機能の契約・制約・実装箇所・検証手順を理解できる。
- 現行文書とソース・テスト・配布設定に、履歴資料を必須とするリンクや読み込みがない。
- 残すべき未確認事項・リリース課題を現行文書と作業計画へ反映済みである。
- 配布対象に暫定履歴を含めていない。

追跡済みの履歴資料がある場合は、次のコマンドで追跡だけを解除し、ローカルの資料を残す。

```sh
git rm -r --cached -- docs/decisions/
```

.gitignoreの追加だけでは既存ファイルの追跡は外れない。現在のステージ内容を確認し、履歴や他の変更を巻き込むforce/reset等で処理しない。実行後はgit status・差分・git check-ignoreで対象を確認し、削除後の文書リンクも検証する。この手順の記載は、今この場で追跡解除・削除・コミットを行う指示ではない。
