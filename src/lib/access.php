<?php
declare(strict_types=1);

/**
 * アクセス数（管理画面用）。1日・1訪問者ごとに1行（access_daily）で、ページを開くたびに views を +1。
 * 訪問者は、ログイン中は会員 ID、未ログインは Cookie のランダム ID から作ったハッシュで区別する。IP アドレスは保存しない。
 */
function count_access(?array $user): void
{
    if (config() === null) {
        return;
    }
    // ボットは数えない
    if (preg_match('/bot|crawl|spider|slurp|facebookexternalhit|preview/i', (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''))) {
        return;
    }
    try {
        if ($user) {
            $key = hash('sha256', 'u:' . $user['id']);
            $uid = (int) $user['id'];
        } else {
            $vid = $_COOKIE['hh_v'] ?? '';
            if (!is_string($vid) || !preg_match('/^[a-f0-9]{32}$/', $vid)) {
                $vid = bin2hex(random_bytes(16));
                setcookie('hh_v', $vid, ['expires' => time() + 365 * 86400, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
            }
            $key = hash('sha256', 'v:' . $vid);
            $uid = null;
        }
        db()->prepare('INSERT INTO access_daily (day, visitor_key, user_id, views) VALUES (CURDATE(), ?, ?, 1)
                       ON DUPLICATE KEY UPDATE views = views + 1, user_id = COALESCE(VALUES(user_id), user_id)')
            ->execute([$key, $uid]);
    } catch (Throwable $e) {
        error_log('access count: ' . $e->getMessage());
    }
}

/** 管理画面の数字 */
function admin_stats(): array
{
    $pdo = db();
    $members = $pdo->query('SELECT id, name, email, role, status, created_at, last_login_at FROM users ORDER BY created_at DESC')->fetchAll();
    $rows = $pdo->query('SELECT day, SUM(views) AS pv, COUNT(*) AS uv FROM access_daily WHERE day > CURDATE() - INTERVAL 14 DAY GROUP BY day')->fetchAll();
    $byDay = [];
    foreach ($rows as $r) {
        $byDay[$r['day']] = $r;
    }
    $days = [];
    $pv = [];
    $uv = [];
    for ($i = 13; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-{$i} days"));
        $days[] = $d;
        $pv[] = (int) ($byDay[$d]['pv'] ?? 0);
        $uv[] = (int) ($byDay[$d]['uv'] ?? 0);
    }
    $prev = (int) $pdo->query('SELECT COALESCE(SUM(views), 0) FROM access_daily WHERE day <= CURDATE() - INTERVAL 7 DAY AND day > CURDATE() - INTERVAL 14 DAY')->fetchColumn();
    $active7 = (int) $pdo->query('SELECT COUNT(DISTINCT user_id) FROM access_daily WHERE user_id IS NOT NULL AND day > CURDATE() - INTERVAL 7 DAY')->fetchColumn();
    $newMonth = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')")->fetchColumn();
    return [
        'members' => array_map(fn ($m) => [
            'id' => (string) $m['id'],
            'name' => $m['name'],
            'mail' => $m['email'],
            'reg' => substr($m['created_at'], 0, 10),
            'last' => $m['last_login_at'] ? substr($m['last_login_at'], 0, 10) : null,
            'role' => $m['role'],
            'stop' => $m['status'] === 'stopped',
        ], $members),
        'days' => $days,
        'pv' => $pv,
        'uv' => $uv,
        'prevWeekPv' => $prev,
        'active7' => $active7,
        'newMonth' => $newMonth,
    ];
}
