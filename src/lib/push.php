<?php
declare(strict_types=1);

use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Web Push（VAPID）でプッシュ通知を送る。minishlink/web-push を使う。
 * 鍵は config/keys.php の vapid（php bin/setup-keys.php で作る）。
 */

function vapid_public_key(): string
{
    return (string) config('vapid.public', '');
}

function push_ready(): bool
{
    return class_exists(WebPush::class) && config('vapid.public') && config('vapid.private');
}

/**
 * 会員の全端末に送る。送信先が 404 / 410 を返したら、その端末の登録を消す。
 * 戻り値は届いた端末の数。
 */
function push_to_user(int $uid, array $payload): int
{
    if (!push_ready()) {
        return 0;
    }
    $stmt = db()->prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$uid]);
    $subs = $stmt->fetchAll();
    if (!$subs) {
        return 0;
    }
    $webPush = new WebPush([
        'VAPID' => [
            'subject' => (string) config('vapid.subject', 'mailto:admin@haruharu.tech'),
            'publicKey' => (string) config('vapid.public'),
            'privateKey' => (string) config('vapid.private'),
        ],
    ], ['TTL' => 86400, 'urgency' => 'high'], 10);

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    foreach ($subs as $s) {
        $webPush->queueNotification(Subscription::create([
            'endpoint' => $s['endpoint'],
            'publicKey' => $s['p256dh'],
            'authToken' => $s['auth'],
            'contentEncoding' => 'aes128gcm',
        ]), $json);
    }
    $ok = 0;
    try {
        foreach ($webPush->flush() as $report) {
            $endpoint = $report->getEndpoint();
            if ($report->isSuccess()) {
                $ok++;
                db()->prepare('UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = ? AND user_id = ?')->execute([$endpoint, $uid]);
                continue;
            }
            $status = $report->getResponse()?->getStatusCode();
            if (in_array($status, [404, 410], true) || $report->isSubscriptionExpired()) {
                db()->prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')->execute([$endpoint, $uid]);
            } else {
                error_log('push failed: ' . $status . ' ' . $report->getReason());
            }
        }
    } catch (Throwable $e) {
        error_log('push error: ' . $e->getMessage());
    }
    return $ok;
}
