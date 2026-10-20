<?php
declare(strict_types=1);

/**
 * リクエスト・レスポンスまわりの共通処理（セッション、CSRF、JSON）。
 */

/** https で開いているか（ロリポップのプロキシ経由も含む） */
function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

/** セッションを始める（Cookie は HttpOnly・SameSite=Lax、https なら Secure） */
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('hh_sess');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

/** CSRF トークン（セッションごとに1つ） */
function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

/** POST などで送られてきた CSRF トークンを確かめる（ヘッダー X-CSRF-Token か、フォームの _csrf） */
function csrf_check(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');
    if (!is_string($sent) || $sent === '' || !hash_equals(csrf_token(), $sent)) {
        json_out(['error' => '画面の有効期限が切れました。ページを読み込み直してください。', 'code' => 'csrf'], 403);
    }
}

/** JSON を返して終わる */
function json_out(mixed $data, int $status = 200): never
{
    // うまくいかなかった API はログに残す（原因を調べるため。入力内容は残さない）
    if ($status >= 400) {
        error_log(sprintf('api %s %s -> %d %s', $_SERVER['REQUEST_METHOD'] ?? '', parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), $status, is_array($data) ? ($data['error'] ?? '') : ''));
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** 送られてきた JSON を配列で受け取る */
function json_in(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = [];
        }
    }
    return $data;
}

/** 入力エラー（422）を返す */
function fail(string $message, int $status = 422): never
{
    json_out(['error' => $message], $status);
}

/** セキュリティ用のヘッダー */
function send_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com");
    if (is_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

/** エラーページ（403・404 など）を出して終わる */
function error_page(int $status, string $title, string $message): never
{
    http_response_code($status);
    send_security_headers();
    header('Content-Type: text/html; charset=utf-8');
    require BASE_DIR . '/src/pages/error.php';
    exit;
}

/** リダイレクトして終わる */
function redirect(string $to): never
{
    header('Location: ' . $to, true, 302);
    exit;
}

/** 文字列を受け取る（前後の空白を除き、長さを確かめる） */
function str_in(array $in, string $key, int $max, bool $trim = true): string
{
    $v = $in[$key] ?? '';
    if (!is_string($v) && !is_int($v) && !is_float($v)) {
        return '';
    }
    $v = (string) $v;
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    if ($trim) {
        $v = trim($v);
    }
    if (mb_strlen($v) > $max) {
        $v = mb_substr($v, 0, $max);
    }
    return $v;
}

/** Y-m-d の形の正しい日付か */
function valid_date(string $s): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return false;
    }
    [$y, $m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y);
}

/** H:i の形の正しい時刻か */
function valid_time(string $s): bool
{
    return (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $s);
}
