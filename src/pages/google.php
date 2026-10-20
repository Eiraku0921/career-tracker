<?php
declare(strict_types=1);

/**
 * Googleカレンダー連携の入口。
 * - /google/connect  … Google の許可画面へ
 * - /google/callback … 許可のあと戻ってくる
 * - /google/webhook  … Google からの変更通知（events.watch）
 */

if ($path === '/google/webhook') {
    // Google から届く。すぐに 200 を返す
    try {
        google_handle_webhook(
            (string) ($_SERVER['HTTP_X_GOOG_CHANNEL_ID'] ?? ''),
            (string) ($_SERVER['HTTP_X_GOOG_CHANNEL_TOKEN'] ?? ''),
            (string) ($_SERVER['HTTP_X_GOOG_RESOURCE_STATE'] ?? '')
        );
    } catch (Throwable $e) {
        error_log('google webhook: ' . $e->getMessage());
    }
    http_response_code(200);
    exit;
}

$user = current_user();
if (!$user) {
    redirect('/login');
}
if (!google_configured()) {
    error_page(503, 'Google連携は準備中です', '管理者が Google の鍵を設定すると使えるようになります。');
}

if ($path === '/google/connect') {
    $_SESSION['google_state'] = bin2hex(random_bytes(16));
    redirect(google_auth_url($_SESSION['google_state']));
}

if ($path === '/google/callback') {
    $state = (string) ($_GET['state'] ?? '');
    $expected = (string) ($_SESSION['google_state'] ?? '');
    unset($_SESSION['google_state']);
    if ($expected === '' || !hash_equals($expected, $state)) {
        redirect('/settings?google=error');
    }
    if (isset($_GET['error']) || empty($_GET['code'])) {
        redirect('/settings?google=cancel');
    }
    $ok = google_connect_finish((int) $user['id'], (string) $_GET['code']);
    redirect('/settings?google=' . ($ok ? 'ok' : 'error'));
}

error_page(404, 'ページが見つかりません', 'URLをお確かめください。');
