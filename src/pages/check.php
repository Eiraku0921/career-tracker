<?php
declare(strict_types=1);

/**
 * 環境チェック画面。
 * パソコンでもロリポップでも、この画面がすべて「OK」になれば準備完了です。
 * （config.php の debug が false の本番では、外からは開けません）
 */

$expectedTables = [
    'users', 'auth_tokens', 'user_settings', 'companies', 'axes', 'company_ratings', 'events', 'reviews', 'lessons',
    'lesson_evals', 'tasks', 'reminders', 'push_subscriptions', 'notifications', 'calendar_accounts', 'access_daily',
];

$checks = [];
$add = function (string $group, string $label, string $status, string $detail = '') use (&$checks) {
    $checks[$group][] = compact('label', 'status', 'detail');
};

// --- PHP ---
$ok = version_compare(PHP_VERSION, '8.2.0', '>=');
$add('PHP', 'PHPのバージョン（8.2以上）', $ok ? 'ok' : 'ng', PHP_VERSION);

foreach ([
    'pdo_mysql' => 'データベースにつなぐ',
    'mbstring'  => '日本語の文字数を数える',
    'openssl'   => '暗号化・プッシュ通知',
    'curl'      => 'Google連携・プッシュ通知の送信',
    'json'      => 'データのやりとり',
] as $ext => $why) {
    $add('PHP', "拡張機能 {$ext}（{$why}）", extension_loaded($ext) ? 'ok' : 'ng');
}
$hasGmp = extension_loaded('gmp');
$hasBc  = extension_loaded('bcmath');
$add('PHP', '拡張機能 gmp または bcmath（プッシュ通知の暗号計算）', ($hasGmp || $hasBc) ? 'ok' : 'warn',
    $hasGmp ? 'gmp あり' : ($hasBc ? 'bcmath あり（gmp があると速い）' : 'php.ini で extension=gmp を有効にしてください'));
$add('PHP', 'タイムゾーン', date_default_timezone_get() === 'Asia/Tokyo' ? 'ok' : 'warn', date_default_timezone_get() . '　' . date('Y-m-d H:i'));

// --- ファイル ---
$add('ファイル', '設定ファイル config/' . basename(config_file()), config() !== null ? 'ok' : 'ng', config() !== null ? '' : (basename(config_file()) === 'config.php' ? 'config.sample.php をコピーして config.php を作ってください' : 'config.production.php をサーバーに置いてください'));
$add('ファイル', 'Composer（vendor/autoload.php）', is_file(BASE_DIR . '/vendor/autoload.php') ? 'ok' : 'warn', is_file(BASE_DIR . '/vendor/autoload.php') ? '' : 'プロジェクトのフォルダで composer install を実行してください');
foreach (['manifest.json', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'assets/app.css', 'assets/app.js'] as $f) {
    $add('ファイル', "public/{$f}（PWA）", is_file(BASE_DIR . '/public/' . $f) ? 'ok' : 'ng');
}
$add('ファイル', '鍵ファイル config/keys.php（通知・暗号化）', config('app_key') && config('vapid.public') ? 'ok' : 'ng', config('app_key') ? '' : 'php bin/setup-keys.php を実行してください');
$add('ファイル', 'Googleカレンダーの鍵', google_configured() ? 'ok' : 'warn', google_configured() ? '' : 'config/keys.php の google に client_id と client_secret を書くと使えます（なくても他の機能は動きます）');
$add('ファイル', 'storage フォルダに書き込めるか', is_writable(BASE_DIR . '/storage') ? 'ok' : 'ng', 'ログとログイン失敗の記録に使います');

// --- データベース ---
if (config() === null) {
    $add('データベース', '接続', 'ng', '先に config.php を作ってください');
} else {
    try {
        $pdo = db();
        $ver = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
        $add('データベース', '接続', 'ok', config('db.name') . ' ／ ' . $ver);
        $stmt = $pdo->prepare('SELECT table_name FROM information_schema.tables WHERE table_schema = ?');
        $stmt->execute([config('db.name')]);
        $have = array_map('strtolower', $stmt->fetchAll(PDO::FETCH_COLUMN));
        $missing = array_diff($expectedTables, $have);
        $add('データベース', 'テーブル（' . count($expectedTables) . '個）', $missing ? 'ng' : 'ok',
            $missing ? '足りない: ' . implode(', ', $missing) . '　→ phpMyAdmin でテーブルを確認してください' : 'すべてあります');
        if (!$missing) {
            $col = $pdo->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name = 'auto_remind'")->fetchColumn();
            $add('データベース', '追加の列（events.auto_remind）', $col ? 'ok' : 'ng', $col ? '' : 'phpMyAdmin の SQL で ALTER TABLE events ADD COLUMN auto_remind TINYINT(1) NOT NULL DEFAULT 1 AFTER items; を実行してください');
        }
        $mb = $pdo->query("SELECT @@character_set_database")->fetchColumn();
        $add('データベース', '文字コード（utf8mb4）', $mb === 'utf8mb4' ? 'ok' : 'warn', (string) $mb);
    } catch (Throwable $e) {
        $add('データベース', '接続', 'ng', $e->getMessage());
    }
}

// --- 本番用 ---
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$add('本番用', 'HTTPS（PWA・通知に必須）', $https ? 'ok' : (is_local_request() ? 'info' : 'ng'), $https ? '' : (is_local_request() ? 'パソコンでの開発中（localhost）は不要です' : '無料SSLを設定してください'));
$add('本番用', 'debug 設定', config('debug') ? (is_local_request() ? 'info' : 'warn') : 'ok', config('debug') ? '開発中は true、本番では false に' : 'false');

$count = ['ok' => 0, 'ng' => 0, 'warn' => 0, 'info' => 0];
foreach ($checks as $items) {
    foreach ($items as $it) {
        $count[$it['status']]++;
    }
}
$labels = ['ok' => 'OK', 'ng' => '要対応', 'warn' => '注意', 'info' => '情報'];
?><!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>環境チェック｜就活日和</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#3a7bd5">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<style>
:root{--bg:#f2f6fb;--surface:#fff;--line:#dbe3ee;--fg:#1a2433;--muted:#627089;--accent:#2f6fc9;--ok:#1f8a5b;--ok-soft:#e1f3ea;--ng:#c23b3b;--ng-soft:#f9e3e3;--warn:#b86e00;--warn-soft:#fbf0dc;--info-soft:#e4eefb}
@media (prefers-color-scheme:dark){:root{--bg:#10151d;--surface:#19212c;--line:#2a3443;--fg:#e7ecf3;--muted:#98a4b6;--accent:#7fb0f5;--ok:#4cc38a;--ok-soft:#173327;--ng:#f07171;--ng-soft:#3d1d1f;--warn:#e8a33d;--warn-soft:#3a2c14;--info-soft:#1d2d44;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif;font-size:14px;line-height:1.6}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
header img{width:40px;height:40px}
h1{font-size:22px;margin:0}
.sum{color:var(--muted);margin:0 0 24px}
.sum b{color:var(--fg)}
section{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:16px}
h2{font-size:14px;margin:0 0 8px;color:var(--muted);letter-spacing:.05em}
.row{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}
.st{flex:none;min-width:56px;text-align:center;font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px}
.ok{background:var(--ok-soft);color:var(--ok)}.ng{background:var(--ng-soft);color:var(--ng)}.warn{background:var(--warn-soft);color:var(--warn)}.info{background:var(--info-soft);color:var(--accent)}
.lb{flex:1;min-width:0}
.dt{display:block;color:var(--muted);font-size:12px;word-break:break-all}
</style>
</head>
<body>
<main>
  <header><img src="/icons/icon.svg" alt=""><h1>就活日和　環境チェック</h1></header>
  <p class="sum"><b><?= $count['ok'] ?></b> 件OK・<b><?= $count['ng'] ?></b> 件要対応・<b><?= $count['warn'] ?></b> 件注意。「要対応」がなくなれば準備完了です。</p>
  <?php foreach ($checks as $group => $items): ?>
  <section>
    <h2><?= h($group) ?></h2>
    <?php foreach ($items as $it): ?>
    <div class="row">
      <span class="st <?= h($it['status']) ?>"><?= h($labels[$it['status']]) ?></span>
      <span class="lb"><?= h($it['label']) ?><?php if ($it['detail'] !== ''): ?><span class="dt"><?= h($it['detail']) ?></span><?php endif; ?></span>
    </div>
    <?php endforeach; ?>
  </section>
  <?php endforeach; ?>
</main>
<script>
// PWA の準備（Service Worker の登録）。localhost か https のときだけ動きます。
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => {}); }
</script>
</body>
</html>
