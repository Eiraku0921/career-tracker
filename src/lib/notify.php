<?php
declare(strict_types=1);

/**
 * 通知の送信（cron から1分ごとに呼ぶ）と、通知ベルへの記録。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 通知ベルに入れて、プッシュでも送る */
function notify_user(int $uid, string $kind, string $title, string $body, string $link, array $push = []): void
{
    db()->prepare('INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)')
        ->execute([$uid, $kind, mb_substr($title, 0, 100), mb_substr($body, 0, 255), mb_substr($link, 0, 255)]);
    push_to_user($uid, array_merge([
        'title' => $title,
        'body' => $body,
        'url' => $link,
        'tag' => $kind . ':' . $link,
    ], $push));
}

/** 「M/D」 */
function md(string $date): string
{
    $t = strtotime($date);
    return date('n', $t) . '/' . date('j', $t);
}

/** 今日から何日後か */
function days_from_today(string $date): int
{
    return (int) round((strtotime($date) - strtotime(date('Y-m-d'))) / 86400);
}

/** タスクの期限の言い方（今日まで・明日まで・10/12まで・期限切れ） */
function due_label(?string $due): string
{
    if (!$due) {
        return '期限なし';
    }
    $n = days_from_today($due);
    return $n < 0 ? '期限切れ' : ($n === 0 ? '今日まで' : ($n === 1 ? '明日まで' : md($due) . 'まで'));
}

/** 「完了にする」ボタン用の署名つきトークン */
function task_done_token(int $uid, int $taskId): string
{
    return $uid . '.' . $taskId . '.' . sign("done:{$uid}:{$taskId}");
}

/** 送る時刻になった通知を1件送る（送る内容がなければ false） */
function send_reminder(array $r): bool
{
    $uid = (int) $r['user_id'];
    $id = (int) $r['target_id'];
    if ($r['target_type'] === 'task') {
        $stmt = db()->prepare('SELECT t.*, c.name AS company FROM tasks t LEFT JOIN companies c ON c.id = t.company_id AND c.user_id = t.user_id WHERE t.id = ? AND t.user_id = ?');
        $stmt->execute([$id, $uid]);
        $t = $stmt->fetch();
        if (!$t || $t['done_at']) {
            return false;
        }
        $body = ($t['company'] ? $t['company'] . '｜' : '') . $t['title'] . '（' . due_label($t['due_date']) . '）';
        notify_user($uid, 'task', 'タスクの期限が近づいています', $body, '/tasks?task=' . $id, [
            'actions' => [['action' => 'done', 'title' => '完了にする']],
            'doneToken' => task_done_token($uid, $id),
        ]);
        return true;
    }

    $stmt = db()->prepare('SELECT e.*, c.name AS company FROM events e LEFT JOIN companies c ON c.id = e.company_id AND c.user_id = e.user_id WHERE e.id = ? AND e.user_id = ?');
    $stmt->execute([$id, $uid]);
    $e = $stmt->fetch();
    if (!$e) {
        return false;
    }
    $time = $e['event_time'] ? substr($e['event_time'], 0, 5) : '';
    $n = days_from_today($e['event_date']);
    $title = match (true) {
        $n === 0 && $time !== '' && strtotime($e['event_date'] . ' ' . $time) - time() <= 3 * 3600 => 'まもなく予定の時間です',
        $n === 0 => '今日の予定',
        $n === 1 => '明日の予定',
        $n === 2 => 'あさっての予定',
        default => md($e['event_date']) . '（' . WEEKDAYS[(int) date('w', strtotime($e['event_date']))] . '）の予定',
    };
    $body = ($e['company'] ? $e['company'] . '｜' : '') . $e['title'] . ($time !== '' ? ' ' . $time : '');
    if ($e['type'] === 'interview') {
        // 面接は面接前カードを開く
        notify_user($uid, 'prep', $title, $body . '。面接前カードで準備しましょう', '/?prep=' . $id);
    } else {
        notify_user($uid, 'event', $title, $body, '/schedule?event=' . $id);
    }
    return true;
}

/** 終わった面接などで、ふりかえっていないものに声をかける（当日 20時以降、昼間だけ・1回だけ） */
function send_review_nudges(): void
{
    $hour = (int) date('G');
    if ($hour < 8 || $hour >= 22) {
        return;
    }
    $types = implode(',', array_map(fn ($t) => db()->quote($t), REVIEWABLE_TYPES));
    $sql = "SELECT e.id, e.user_id, e.title, e.event_date, c.name AS company
            FROM events e
            JOIN users u ON u.id = e.user_id AND u.status = 'active'
            LEFT JOIN companies c ON c.id = e.company_id AND c.user_id = e.user_id
            LEFT JOIN reviews r ON r.event_id = e.id AND r.user_id = e.user_id
            LEFT JOIN notifications n ON n.user_id = e.user_id AND n.kind = 'review' AND n.link = CONCAT('/?review=', e.id)
            WHERE e.type IN ($types) AND r.id IS NULL AND n.id IS NULL
              AND e.event_date >= CURDATE() - INTERVAL 3 DAY
              AND (e.event_date < CURDATE() OR (e.event_date = CURDATE() AND ? >= 20))
            LIMIT 200";
    $stmt = db()->prepare($sql);
    $stmt->execute([$hour]);
    foreach ($stmt->fetchAll() as $e) {
        $body = ($e['company'] ? $e['company'] . '｜' : '') . $e['title'] . 'はどうでしたか？';
        notify_user((int) $e['user_id'], 'review', 'ふりかえりを書きましょう', $body, '/?review=' . $e['id']);
    }
}

/** cron（1分ごと）の本体 */
function run_notify_cron(): array
{
    $sent = 0;
    $skipped = 0;
    $stmt = db()->query("SELECT r.* FROM reminders r JOIN users u ON u.id = r.user_id AND u.status = 'active'
                         WHERE r.sent_at IS NULL AND r.remind_at <= NOW() ORDER BY r.remind_at LIMIT 500");
    foreach ($stmt->fetchAll() as $r) {
        // 先に sent_at を入れて、二重送信を防ぐ（同時に2つ動いても片方だけが送る）
        $claim = db()->prepare('UPDATE reminders SET sent_at = NOW() WHERE id = ? AND sent_at IS NULL');
        $claim->execute([$r['id']]);
        if ($claim->rowCount() === 0) {
            continue;
        }
        // 半日以上前の通知（サーバーが止まっていたなど）は、いまさら送らない
        if (strtotime($r['remind_at']) < time() - 12 * 3600) {
            $skipped++;
            continue;
        }
        try {
            send_reminder($r) ? $sent++ : $skipped++;
        } catch (Throwable $e) {
            error_log('reminder ' . $r['id'] . ': ' . $e->getMessage());
        }
    }
    send_review_nudges();

    // 後片付け：90日を過ぎた通知、期限切れのログイン、古い送信済みの通知予定
    db()->exec('DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 90 DAY');
    db()->exec('DELETE FROM auth_tokens WHERE expires_at < NOW()');
    db()->exec('DELETE FROM reminders WHERE sent_at IS NOT NULL AND sent_at < NOW() - INTERVAL 30 DAY');
    return ['sent' => $sent, 'skipped' => $skipped];
}
