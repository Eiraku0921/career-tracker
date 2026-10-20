<?php
declare(strict_types=1);

/**
 * すべてのアクセスの入り口（フロントコントローラー）。
 * URL を見て、どのページを表示するかを決めます。
 */

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// PHP の簡易サーバーで動かしているときは、画像やCSSなどのファイルをそのまま返す
if (PHP_SAPI === 'cli-server' && $path !== '/' && is_file(__DIR__ . $path)) {
    return false;
}

require __DIR__ . '/../src/bootstrap.php';

// 画面（同じ HTML を返し、中身は app.js が描く）
const APP_VIEWS = [
    '/' => 'dash', '/growth' => 'growth', '/tasks' => 'tasks', '/companies' => 'companies', '/schedule' => 'schedule',
    '/settings' => 'settings', '/install' => 'install', '/admin' => 'admin',
];
const GUEST_PAGES = ['/login' => 'login', '/signup' => 'signup', '/about' => 'about', '/terms' => 'terms'];
const PAGE_TITLES = [
    'dash' => '就活日和', 'growth' => '成長記録', 'tasks' => 'タスク', 'companies' => '企業一覧', 'schedule' => '予定',
    'settings' => '設定', 'install' => 'ホーム画面に追加するやり方', 'admin' => '管理画面',
    'login' => 'ログイン', 'signup' => '新規登録', 'about' => '就活日和について', 'terms' => '利用規約・プライバシーポリシー',
];

try {
    if ($path === '/check') {
        // 環境チェック画面（開発中か、debug = true のときだけ）
        if (!config('debug', false) && !is_local_request()) {
            error_page(404, 'ページが見つかりません', 'URLをお確かめください。');
        }
        require BASE_DIR . '/src/pages/check.php';
        exit;
    }

    if (config() === null) {
        // 設定ファイルがまだないときは、環境チェック画面に案内する
        error_page(503, '準備中です', is_local_request() ? 'config/config.php がありません。/check を開いて環境を確認してください。' : 'しばらくしてからもう一度お試しください。');
    }

    if (str_starts_with($path, '/api/')) {
        require BASE_DIR . '/src/api.php';
        exit;
    }

    if (str_starts_with($path, '/google/')) {
        require BASE_DIR . '/src/pages/google.php';
        exit;
    }

    if (isset(APP_VIEWS[$path]) || isset(GUEST_PAGES[$path])) {
        send_security_headers();
        header('Cache-Control: no-store');
        $user = current_user();

        if ($user && in_array($path, ['/login', '/signup'], true)) {
            redirect('/');
        }
        // 管理画面は管理者だけ（会員が URL を直接開いても 403）
        if ($path === '/admin' && !is_admin($user)) {
            error_page(403, 'このページは見られません', '管理画面は管理者だけが開けます。');
        }

        if ($user) {
            $state = build_state($user);
        } else {
            require BASE_DIR . '/src/demo.php';
            $state = demo_state();
        }
        count_access($user);

        $view = APP_VIEWS[$path] ?? 'dash';
        $boot = [
            'loggedIn' => $user !== null,
            'csrf' => csrf_token(),
            'view' => $view,
            'guestPage' => !$user ? (GUEST_PAGES[$path] ?? ($path === '/install' ? 'install' : null)) : (in_array($path, ['/about', '/terms'], true) ? GUEST_PAGES[$path] : null),
            'vapid' => vapid_public_key(),
            'state' => $state,
        ];
        $pageTitle = ($t = PAGE_TITLES[GUEST_PAGES[$path] ?? $view] ?? '就活日和') === '就活日和' ? '就活日和' : $t . '｜就活日和';
        header('Content-Type: text/html; charset=utf-8');
        require BASE_DIR . '/src/pages/app.php';
        exit;
    }

    error_page(404, 'ページが見つかりません', 'URLをお確かめください。');
} catch (Throwable $e) {
    error_log((string) $e);
    // データベースの準備ができていないときは、原因がわかる言葉で知らせる（パスワードなどは出さない）
    if ($e instanceof PDOException && !config('debug')) {
        $state = (string) $e->getCode();
        $hint = match (true) {
            $state === '42S02' => 'データベースにテーブルがありません。phpMyAdmin でテーブルが16個あるか確認してください。',
            $state === '42S22' => 'データベースの列が足りません。phpMyAdmin でテーブルの構造を確認してください。',
            in_array($state, ['1045', '2002', '2005', '1044', '1049'], true) => 'データベースにつながりません。config/config.production.php の接続先を確認してください。',
            default => null,
        };
        if ($hint) {
            if (str_starts_with($path, '/api/')) {
                json_out(['error' => '準備中のため保存できません（' . $hint . '）'], 503);
            }
            error_page(503, '準備中です', $hint);
        }
    }
    if (str_starts_with($path, '/api/')) {
        json_out(['error' => config('debug') ? $e->getMessage() : 'エラーが起きました。時間をおいてもう一度お試しください。'], 500);
    }
    error_page(500, 'エラーが起きました', config('debug') ? $e->getMessage() : '時間をおいてもう一度お試しください。');
}
