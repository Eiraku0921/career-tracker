<?php
declare(strict_types=1);

/**
 * すべてのページの最初に読み込む共通処理。
 * 設定の読み込み・タイムゾーン・データベース接続などをまとめています。
 */

define('BASE_DIR', dirname(__DIR__));

date_default_timezone_set('Asia/Tokyo');
if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}

// Composer で入れたライブラリ（まだ無くても動くようにしておく）
if (is_file(BASE_DIR . '/vendor/autoload.php')) {
    require BASE_DIR . '/vendor/autoload.php';
}

/**
 * 設定ファイルを自動で選ぶ。
 * - 本番（haruharu.tech で開いたとき、または cron で HARUHARU_ENV=production のとき）
 *     → config/config.production.php（ロリポップのデータベース）
 * - それ以外（パソコンでの開発中）
 *     → config/config.php（XAMPP のデータベース）
 * どちらのファイルもパスワードが入るので、共有・コミットしない。
 */
function config_file(): string
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $host = preg_replace('/:\d+$/', '', $host);
    $isProduction = $host === 'haruharu.tech' || $host === 'www.haruharu.tech'
        || (PHP_SAPI === 'cli' && getenv('HARUHARU_ENV') === 'production')
        // ロリポップの cron（環境変数を渡せない）: config.php を置いていなければ本番の設定を使う
        || (PHP_SAPI === 'cli' && getenv('HARUHARU_ENV') === false
            && !is_file(BASE_DIR . '/config/config.php') && is_file(BASE_DIR . '/config/config.production.php'));
    return BASE_DIR . ($isProduction ? '/config/config.production.php' : '/config/config.php');
}

$GLOBALS['__config'] = is_file(config_file()) ? require config_file() : null;

// 鍵ファイル（プッシュ通知の VAPID 鍵・暗号化キー・Google の鍵）。php bin/setup-keys.php で作る。
// config/keys.php は開発・本番で共通。共有・コミットしない。config 側に同じ項目があれば config を優先する。
if (is_array($GLOBALS['__config']) && is_file(BASE_DIR . '/config/keys.php')) {
    $GLOBALS['__config'] = array_replace_recursive(require BASE_DIR . '/config/keys.php', $GLOBALS['__config']);
}

/** 設定値を取り出す。config('db.name') のようにドットでたどれる */
function config(?string $key = null, mixed $default = null): mixed
{
    $value = $GLOBALS['__config'];
    if ($key === null) {
        return $value;
    }
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

$debug = (bool) config('debug', false);
ini_set('display_errors', $debug ? '1' : '0');
error_reporting(E_ALL);

/** データベース接続（初めて使うときに1回だけ接続する） */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = config('db');
    if (!is_array($c)) {
        throw new RuntimeException('config/config.php がありません。config.sample.php をコピーして作ってください。');
    }
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int) $c['port'], $c['name']);
    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+09:00'");
    return $pdo;
}

/** HTML に出す文字を安全にする（必ず通してから表示する） */
function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

/** 開発用のアクセスかどうか（自分のパソコンから開いているか） */
function is_local_request(): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return in_array($ip, ['127.0.0.1', '::1'], true);
}

// エラーは画面ではなく storage/logs/app.log に残す（本番）
if (!is_dir(BASE_DIR . '/storage/logs')) {
    @mkdir(BASE_DIR . '/storage/logs', 0700, true);
}
ini_set('log_errors', '1');
ini_set('error_log', BASE_DIR . '/storage/logs/app.log');

/** アプリの URL（最後の / なし） */
function app_url(): string
{
    return rtrim((string) config('app_url', 'http://localhost:8000'), '/');
}

/** いまの日時（DB と同じ Asia/Tokyo） */
function now(): string
{
    return date('Y-m-d H:i:s');
}

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/crypto.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/data.php';
require __DIR__ . '/lib/reminders.php';
require __DIR__ . '/lib/push.php';
require __DIR__ . '/lib/notify.php';
require __DIR__ . '/lib/google.php';
require __DIR__ . '/lib/access.php';
