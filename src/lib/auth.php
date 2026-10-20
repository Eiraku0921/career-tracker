<?php
declare(strict_types=1);

/**
 * 会員のログイン。
 * - ログインするとトークンを Cookie（HttpOnly・Secure・SameSite=Lax）に保存する
 *   スマホ版は 90 日間。PC版は「ログインしたままにする」にチェックで 7 日間、外すとブラウザを閉じるまで
 * - DB の auth_tokens には selector とトークンのハッシュ（SHA-256）だけを保存する
 * - 期限はログインした日から 90 日（使っても延びない）
 */

const AUTH_COOKIE = 'hh_auth';
const AUTH_DAYS = 90;      // スマホ版
const AUTH_DAYS_PC = 7;    // PC版（「ログインしたままにする」にチェックしたとき）
const AUTH_HOURS_TEMP = 12; // PC版でチェックを外したとき（ブラウザを閉じるとログアウト。念のためDB側も12時間で切れる）

/** ログイン中の会員（いなければ null）。停止中の会員はログアウト扱い */
function current_user(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $cache = null;
    if (config() === null) {
        return null;
    }
    start_session();

    $uid = (int) ($_SESSION['uid'] ?? 0);
    if ($uid > 0) {
        $user = find_user($uid);
        // 停止された・すべての端末からログアウトされた（トークンが消えた）ときはログアウト
        if ($user && $user['status'] === 'active' && token_still_valid($uid)) {
            return $cache = $user;
        }
        logout_current();
        return null;
    }

    // セッションがなければ、90日保持の Cookie から復元する
    $cookie = $_COOKIE[AUTH_COOKIE] ?? '';
    if (!is_string($cookie) || !preg_match('/^([a-f0-9]{24}):([a-f0-9]{64})$/', $cookie, $m)) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM auth_tokens WHERE selector = ? AND expires_at > NOW()');
    $stmt->execute([$m[1]]);
    $tok = $stmt->fetch();
    if (!$tok || !hash_equals($tok['token_hash'], hash('sha256', $m[2]))) {
        clear_auth_cookie();
        return null;
    }
    $user = find_user((int) $tok['user_id']);
    if (!$user || $user['status'] !== 'active') {
        db()->prepare('DELETE FROM auth_tokens WHERE id = ?')->execute([$tok['id']]);
        clear_auth_cookie();
        return null;
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $user['id'];
    $_SESSION['selector'] = $tok['selector'];
    // 発行したときの長さから、どの保持期間でログインしたかを思い出す（パスワード変更のとき同じ長さで出し直すため）
    $len = strtotime($tok['expires_at']) - strtotime($tok['created_at']);
    $_SESSION['login_mode'] = $len > 30 * 86400 ? 'sp' : ($len > 86400 ? 'pc' : 'pc-temp');
    db()->prepare('UPDATE auth_tokens SET last_used_at = NOW() WHERE id = ?')->execute([$tok['id']]);
    db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
    return $cache = $user;
}

function find_user(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, email, name, role, status, last_login_at, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

/** このセッションのトークンがまだ有効か（ほかの端末から「すべてログアウト」されたら無効） */
function token_still_valid(int $uid): bool
{
    $selector = $_SESSION['selector'] ?? '';
    if ($selector === '') {
        return false;
    }
    $stmt = db()->prepare('SELECT 1 FROM auth_tokens WHERE selector = ? AND user_id = ? AND expires_at > NOW()');
    $stmt->execute([$selector, $uid]);
    return (bool) $stmt->fetchColumn();
}

/**
 * ログインさせる（セッション ID を作り直し、トークンを発行）
 * $mode: 'sp' = スマホ版（90日）／ 'pc' = PC版で保持する（7日）／ 'pc-temp' = PC版で保持しない（ブラウザを閉じるまで）
 */
function login_user(array $user, string $mode = 'sp'): void
{
    start_session();
    session_regenerate_id(true);
    $selector = bin2hex(random_bytes(12));
    $validator = bin2hex(random_bytes(32));
    $expires = match ($mode) {
        'pc' => time() + AUTH_DAYS_PC * 86400,
        'pc-temp' => time() + AUTH_HOURS_TEMP * 3600,
        default => time() + AUTH_DAYS * 86400,
    };
    db()->prepare('INSERT INTO auth_tokens (user_id, selector, token_hash, expires_at, user_agent, last_used_at) VALUES (?, ?, ?, ?, ?, NOW())')
        ->execute([$user['id'], $selector, hash('sha256', $validator), date('Y-m-d H:i:s', $expires), mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
    setcookie(AUTH_COOKIE, $selector . ':' . $validator, [
        'expires' => $mode === 'pc-temp' ? 0 : $expires, // 0 = ブラウザを閉じると消える
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_SESSION['uid'] = (int) $user['id'];
    $_SESSION['selector'] = $selector;
    $_SESSION['login_mode'] = $mode;
    unset($_SESSION['csrf']);
    db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
}

/** この端末をログアウト（トークンはすぐ削除） */
function logout_current(): void
{
    start_session();
    $selector = $_SESSION['selector'] ?? '';
    $cookie = $_COOKIE[AUTH_COOKIE] ?? '';
    if ($selector === '' && is_string($cookie) && str_contains($cookie, ':')) {
        $selector = explode(':', $cookie)[0];
    }
    if ($selector !== '') {
        db()->prepare('DELETE FROM auth_tokens WHERE selector = ?')->execute([$selector]);
    }
    clear_auth_cookie();
    $_SESSION = [];
    session_regenerate_id(true);
}

/** すべての端末からログアウト（パスワード変更・停止のときも使う） */
function logout_everywhere(int $uid): void
{
    db()->prepare('DELETE FROM auth_tokens WHERE user_id = ?')->execute([$uid]);
}

function clear_auth_cookie(): void
{
    setcookie(AUTH_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    unset($_COOKIE[AUTH_COOKIE]);
}

function is_admin(?array $user): bool
{
    return $user !== null && $user['role'] === 'admin';
}

/* ---- ログイン失敗が続いたら一時的に待たせる（メールアドレスごと。IP は使わない） ---- */

function throttle_file(string $email): string
{
    $dir = BASE_DIR . '/storage/throttle';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir . '/' . hash('sha256', strtolower($email)) . '.json';
}

/** あと何秒待つ必要があるか（0 なら試してよい） */
function throttle_wait(string $email): int
{
    $f = throttle_file($email);
    if (!is_file($f)) {
        return 0;
    }
    $d = json_decode((string) file_get_contents($f), true) ?: [];
    return max(0, (int) ($d['until'] ?? 0) - time());
}

/** 失敗を記録。5回目から 30秒・60秒・120秒…（最大15分）待たせる */
function throttle_fail(string $email): void
{
    $f = throttle_file($email);
    $d = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    if (($d['at'] ?? 0) < time() - 3600) {
        $d = ['fails' => 0];
    }
    $d['fails'] = ($d['fails'] ?? 0) + 1;
    $d['at'] = time();
    if ($d['fails'] >= 5) {
        $d['until'] = time() + min(900, 30 * (2 ** ($d['fails'] - 5)));
    }
    file_put_contents($f, json_encode($d), LOCK_EX);
}

function throttle_clear(string $email): void
{
    @unlink(throttle_file($email));
}
