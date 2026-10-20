#!/usr/local/php/8.2/bin/php
<?php
declare(strict_types=1);

/**
 * 通知の送信（cron で1分ごとに実行）。
 *   開発：php bin/cron-notify.php
 *   ロリポップ：cron 設定で「実行するファイル」にこのファイルを指定（間隔：1分）
 * 送る時刻になった通知を送り、通知ベルにも入れる。終わった面接などの「ふりかえり」の声かけもここで送る。
 */

if (PHP_SAPI !== 'cli') {
    exit;
}
require __DIR__ . '/../src/bootstrap.php';

// 同時に2つ動かないようにする
$lock = fopen(BASE_DIR . '/storage/cron-notify.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}
try {
    $r = run_notify_cron();
    if ($r['sent'] || in_array('-v', $argv, true)) {
        echo date('Y-m-d H:i') . " sent={$r['sent']} skipped={$r['skipped']}\n";
    }
} catch (Throwable $e) {
    error_log('cron-notify: ' . $e);
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
