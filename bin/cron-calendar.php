#!/usr/local/php/8.2/bin/php
<?php
declare(strict_types=1);

/**
 * Googleカレンダーの同期（cron で5分ごとに実行）。
 *   開発：php bin/cron-calendar.php
 *   ロリポップ：cron 設定で「実行するファイル」にこのファイルを指定（間隔：5分）
 * 送り残した予定を送り、Google 側の変更を取り込み、変更通知（events.watch）の期限を延ばす。
 */

if (PHP_SAPI !== 'cli') {
    exit;
}
require __DIR__ . '/../src/bootstrap.php';

$lock = fopen(BASE_DIR . '/storage/cron-calendar.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}
try {
    $n = run_calendar_cron();
    if (in_array('-v', $argv, true)) {
        echo date('Y-m-d H:i') . " synced={$n}\n";
    }
} catch (Throwable $e) {
    error_log('cron-calendar: ' . $e);
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
