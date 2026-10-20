# 就活日和（haruharu.tech）開発環境の作り方 — Windows

所要時間の目安：30〜60分。最後に「環境チェック画面」がすべてOKになれば完了です。

## 使うもの（すべて無料）
| ソフト | 役割 | 入手先 |
| --- | --- | --- |
| VS Code | コードを書くエディタ | https://code.visualstudio.com/ |
| XAMPP | PHP・MySQL（MariaDB）・phpMyAdmin をまとめて入れる | https://www.apachefriends.org/ |
| Composer | PHPのライブラリを入れる道具 | https://getcomposer.org/download/ |

---

## 1. VS Code を入れる
入手先からダウンロードしてインストールします（設定はすべて初期のままでOK）。
起動したら、左の「拡張機能」から **Japanese Language Pack** を入れると日本語になります。

## 2. XAMPP を入れる
1. 入手先から **Windows版** をダウンロードします。**PHP 8.2 以上**の版を選んでください（ロリポップと合わせるため）。
2. インストール先は `C:\xampp` のままにします。
3. 部品の選択では、最低限 **Apache・MySQL・PHP・phpMyAdmin** にチェックが入っていればOKです。
4. 途中で「ユーザーアカウント制御（UAC）」の注意が出たら、そのまま「OK」で進みます。

## 3. XAMPP を起動する
1. スタートメニューから **XAMPP Control Panel** を開きます。
2. **Apache** と **MySQL** の「Start」を押し、名前が緑色になればOKです。
   - Apache が起動しない場合は、ほかのソフトが80番ポートを使っています。Apache 行の「Config → httpd.conf」で `Listen 80` を `Listen 8080` に変えて再起動し、以後 `http://localhost:8080/phpmyadmin` で開きます。
   - Windows のファイアウォールの確認が出たら「アクセスを許可」を押します。

## 4. コマンドで PHP を使えるようにする（Path の設定）
1. Windows の検索で「**環境変数**」と入力し、「システム環境変数の編集」→「環境変数」を開きます。
2. 上の「ユーザー環境変数」の **Path** を選び「編集」→「新規」→ `C:\xampp\php` を入力して「OK」を3回押します。
3. **PowerShell を新しく開いて** `php -v` と入力し、`PHP 8.2.x` のように表示されればOKです。

## 5. PHP の設定（php.ini）を直す
1. XAMPP Control Panel の Apache 行の「Config」→「PHP (php.ini)」を開きます。
2. 次の行を探し、先頭の `;` を消して保存します（`;` があると無効になっています）。
   ```
   extension=gmp
   extension=curl
   extension=mbstring
   extension=openssl
   extension=pdo_mysql
   ```
3. `date.timezone` の行を `date.timezone=Asia/Tokyo` にします。
4. 保存したら、XAMPP の Apache を「Stop」→「Start」で再起動します。

## 6. Composer を入れる
1. 入手先の **Composer-Setup.exe** をダウンロードして実行します。
2. 途中で PHP の場所を聞かれたら `C:\xampp\php\php.exe` を選びます。
3. PowerShell を新しく開いて `composer -V` と入力し、バージョンが出ればOKです。

## 7. プロジェクトを置く
1. この zip を展開し、`haruharu` フォルダを **`C:\dev\haruharu`** に置きます。
   - 日本語や空白を含む場所（デスクトップ、OneDrive の中など）は避けてください。
2. VS Code の「ファイル → フォルダーを開く」で `C:\dev\haruharu` を開きます。

## 8. データベース
パソコンの `haruharu`、ロリポップの `LAA1717101-haruharu` とも、16個のテーブルは作成済みです（2026-10-12）。
テーブルの定義（どの表にどの列があるか）は、phpMyAdmin で各テーブルの「構造」を開くと確認できます。

## 9. 設定ファイルを作る
`config\config.php`（パソコン用）と `config\config.production.php`（ロリポップ用）は作成済みです。XAMPP の初期設定（ユーザー `root`、パスワードなし）なら、何もしなくて大丈夫です。どちらを使うかは自動で切り替わります。

プッシュ通知の鍵と暗号化キーは `config\keys.php` に入ります（作成済み）。なくした場合は `php bin/setup-keys.php` で作り直せます（作り直すと、登録済みの端末に通知が届かなくなります）。

## 10. 起動して確認する
VS Code の「ターミナル → 新しいターミナル」を開き、次の2つを順に入力します。
```
composer install
php -S localhost:8000 -t public public/index.php
```
ブラウザで **http://localhost:8000/check** を開き、「環境チェック」がすべて **OK** なら準備完了です（Googleカレンダーの鍵だけは「注意」のままで大丈夫です）。
**http://localhost:8000** を開くとアプリ（未ログインならデモ画面）が表示されます。

通知を試すときは、もう1つターミナルを開いて `php bin/cron-notify.php -v` を実行すると、時刻になった通知が送られます。
（止めるときはターミナルで `Ctrl + C`。次回からは XAMPP で MySQL を Start してから、2行目だけ実行します）

---

## うまくいかないとき
| 症状 | 対処 |
| --- | --- |
| `php` が見つからない | 4 の Path 設定のあと、PowerShell や VS Code を開き直す |
| データベースに接続できない | XAMPP で MySQL が緑色か確認。config.php の name が `haruharu` か確認 |
| テーブルが足りない | phpMyAdmin でテーブルが16個あるか確認する |
| 鍵ファイルが NG | `php bin/setup-keys.php` を実行 |
| gmp が「注意」 | 5 の `extension=gmp` の `;` を消して Apache を再起動 |
| 文字化けする | ファイルを UTF-8 で保存する（VS Code の右下で確認できます） |

## フォルダ構成
```
haruharu/
├─ public/          … 公開するフォルダ（ロリポップでもここを公開フォルダにする）
│   ├─ index.php    … すべてのアクセスの入り口
│   ├─ .htaccess    … ロリポップ用の設定（https への転送など）
│   ├─ assets/      … 画面の CSS（app.css）と JavaScript（app.js・ill.js）。プロトタイプから移植
│   ├─ manifest.json, sw.js, icons/ … PWA（ホーム画面に追加・プッシュ通知）用
├─ src/             … PHPのプログラム本体（外からは見えない）
│   ├─ bootstrap.php … 設定読み込み・DB接続などの共通処理
│   ├─ api.php      … 画面から呼ぶ API（/api/...）
│   ├─ demo.php     … デモ画面のサンプルデータ
│   ├─ lib/         … ログイン・データ・通知・プッシュ・Google連携・アクセス数
│   └─ pages/       … 画面の土台（app.php）、エラー、Google連携の入口、環境チェック
├─ bin/             … コマンド（setup-keys・cron-notify・cron-calendar）
├─ config/          … 設定ファイル（config.php・keys.php はパスワードや鍵が入るので共有しない）
├─ storage/         … ログ（logs/app.log）とログイン失敗の記録（共有しない）
├─ docs/SPEC.md    … 仕様書（確定版）
├─ docs/prototype.html … 画面デザインの基準（ブラウザで開くと動く）
├─ CLAUDE.md       … VS Code の Claude Code が最初に読むメモ
└─ composer.json    … 使うライブラリの一覧
```

## 本番（ロリポップ）に置くとき
1. ロリポップのデータベース（`LAA1717101-haruharu`）は、16個のテーブルまで作成済み
2. プロジェクトを `vendor/` ごとアップロードし、haruharu.tech の **公開（専用）フォルダ** を `haruharu/public` に設定
3. `config/config.production.php`（ロリポップのデータベース情報を記入済み）と `config/keys.php`（通知の鍵）も一緒にアップロードします。haruharu.tech で開くと自動でこちらが使われます。**`config/config.php`（パソコン用）はアップロードしません**（cron が本番の設定を選ぶ目印になります）
4. `config/config.production.php` の `debug` が `false`、`app_url` が `https://haruharu.tech` になっているか確認
5. haruharu.tech の無料SSLを有効にし、PHPのバージョンを8.2以上に設定
6. `storage/` フォルダに書き込めるようにする（パーミッション 700 など）
7. ロリポップの「cron設定」で2つ登録します（ファイルの1行目 `#!/usr/local/php/8.2/bin/php` が PHP の場所。PHP のバージョンを変えたら書き換える。ファイルのパーミッションは 700）
   | 実行するファイル | 間隔 |
   | --- | --- |
   | `haruharu/bin/cron-notify.php` | 毎分（通知の送信） |
   | `haruharu/bin/cron-calendar.php` | 5分ごと（Googleカレンダーの同期） |
8. 自分で会員登録したあと、phpMyAdmin で `UPDATE users SET role='admin' WHERE email='自分のメール';` を実行すると管理者になります

## Googleカレンダー連携を使えるようにする
1. https://console.cloud.google.com/ でプロジェクトを作り、「Google Calendar API」を有効にする
2. 「OAuth 同意画面」：外部、アプリ名「就活日和」、スコープに `.../auth/calendar.app.created` を追加し、公開ステータスを **「本番環境」** にする（「テスト中」だとトークンが7日で切れます。審査は受けません）
3. 「認証情報」→「OAuth クライアント ID」（ウェブアプリケーション）を作り、承認済みのリダイレクト URI に `https://haruharu.tech/google/callback`（開発用に `http://localhost:8000/google/callback` も）を登録
4. 表示された client_id と client_secret を `config/keys.php` の `google` に書き込み、本番にもアップロード
5. 設定画面の「Googleと接続」から接続します。変更通知（数秒で反映）は https の本番だけで動き、開発中は5分ごとの cron で同期します
