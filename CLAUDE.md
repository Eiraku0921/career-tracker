# 就活日和（haruharu.tech）

- 仕様：`docs/SPEC.md`（必ず最初に読む）
- 画面デザインと動きの基準：`docs/prototype.html`（ブラウザで開くと操作できる試作。CSS・SVG・文言はここから移植する）
- 環境構築：`README.md`（Windows + XAMPP）
- PHP 8.2、フレームワークなし。入口は `public/index.php`、共通処理は `src/bootstrap.php`
- DB（16テーブル）はパソコン・本番とも作成済み。定義は `docs/SPEC.md` の「データ設計」と phpMyAdmin の「構造」で確認する。SQLは PDO のプリペアドステートメントで、必ず `user_id` で絞る
- 出力は `h()` でエスケープ、フォームは CSRF トークン必須
- **データベースの接続は Claude Code が自動でやる**：設定ファイルは `src/bootstrap.php` の `config_file()` が自動で選ぶ（localhost → `config/config.php`＝XAMPP、haruharu.tech → `config/config.production.php`＝ロリポップ MySQL 8.4）。接続先の情報は `docs/SPEC.md` の「データベースと接続」を参照。新しい処理も必ず `db()` を通して接続する
- `config/config.php` と `config/config.production.php` にはパスワードが入っている。中身を画面やチャットに表示しない、ほかのファイルに書き写さない、コミットしない
- `config/keys.php`（VAPID鍵・暗号化キー・Googleの鍵）も同じ扱い：中身を表示しない・書き写さない・コミットしない
- 画面は `src/pages/app.php`（共通HTML）＋ `public/assets/app.js`（プロトタイプから移植）。保存は `src/api.php` の API、共通処理は `src/lib/`
- 通知の送信：`php bin/cron-notify.php -v`。カレンダー同期：`php bin/cron-calendar.php -v`
- 開発サーバー：`php -S localhost:8000 -t public public/index.php`
