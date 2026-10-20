<?php
declare(strict_types=1);

/**
 * 通知の予定（reminders）を作る。
 * - 自動の通知（is_auto = 1）：設定の初期値から作る。期限・日時を変えたら作り直す
 * - 手動の通知（is_auto = 0）：1件につき最大3件、5分単位
 * - 送信済み（sent_at あり）は残して二重送信を防ぐ
 */

/** 自動の通知を作り直す（未送信の自動通知を消して、いまの設定から作る） */
function rebuild_auto_reminders(int $uid, string $type, int $id): void
{
    db()->prepare('DELETE FROM reminders WHERE user_id = ? AND target_type = ? AND target_id = ? AND is_auto = 1 AND sent_at IS NULL')
        ->execute([$uid, $type, $id]);

    $times = [];
    $settings = user_settings($uid);
    if ($type === 'task') {
        $stmt = db()->prepare('SELECT due_date, done_at, auto_remind FROM tasks WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        $t = $stmt->fetch();
        if (!$t || $t['done_at'] || !$t['due_date'] || !$t['auto_remind']) {
            return;
        }
        foreach (reminder_rules($settings, 'task') as $r) {
            if (isset($r['d'], $r['t'])) {
                $times[] = date('Y-m-d', strtotime($t['due_date'] . ' ' . (int) $r['d'] . ' day')) . ' ' . $r['t'] . ':00';
            }
        }
    } else {
        $stmt = db()->prepare('SELECT event_date, event_time, auto_remind FROM events WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        $e = $stmt->fetch();
        if (!$e || !$e['auto_remind']) {
            return;
        }
        foreach (reminder_rules($settings, 'event') as $r) {
            if (isset($r['m'])) {
                if ($e['event_time']) {
                    $times[] = date('Y-m-d H:i:s', strtotime($e['event_date'] . ' ' . $e['event_time']) - (int) $r['m'] * 60);
                }
            } elseif (isset($r['d'], $r['t'])) {
                $times[] = date('Y-m-d', strtotime($e['event_date'] . ' ' . (int) $r['d'] . ' day')) . ' ' . $r['t'] . ':00';
            }
        }
    }
    insert_reminders($uid, $type, $id, $times, true);
}

/** 手動の通知を入れ替える（未送信のものを消して、送られてきた日時で作る） */
function set_manual_reminders(int $uid, string $type, int $id, mixed $list): void
{
    db()->prepare('DELETE FROM reminders WHERE user_id = ? AND target_type = ? AND target_id = ? AND is_auto = 0 AND sent_at IS NULL')
        ->execute([$uid, $type, $id]);
    if (!is_array($list)) {
        return;
    }
    $times = [];
    foreach (array_slice($list, 0, 3) as $s) {
        if (!is_string($s) || !preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/', $s, $m) || !valid_date($m[1])) {
            continue;
        }
        $min = (int) (floor((int) $m[3] / 5) * 5); // 5分単位
        if ((int) $m[2] > 23) {
            continue;
        }
        $times[] = sprintf('%s %02d:%02d:00', $m[1], (int) $m[2], $min);
    }
    insert_reminders($uid, $type, $id, $times, false);
}

function insert_reminders(int $uid, string $type, int $id, array $times, bool $auto): void
{
    $now = now();
    $ins = db()->prepare('INSERT INTO reminders (user_id, target_type, target_id, remind_at, is_auto) VALUES (?, ?, ?, ?, ?)');
    foreach (array_unique($times) as $at) {
        if ($at > $now) {
            $ins->execute([$uid, $type, $id, $at, $auto ? 1 : 0]);
        }
    }
}

/** 未送信の通知をすべて消す（完了・削除したとき） */
function clear_reminders(int $uid, string $type, int $id): void
{
    db()->prepare('DELETE FROM reminders WHERE user_id = ? AND target_type = ? AND target_id = ? AND sent_at IS NULL')
        ->execute([$uid, $type, $id]);
}

/** 設定の初期値を変えたとき：これからのタスク・予定の自動通知を全部作り直す */
function rebuild_all_reminders(int $uid): void
{
    $stmt = db()->prepare('SELECT id FROM tasks WHERE user_id = ? AND done_at IS NULL AND due_date >= CURDATE() - INTERVAL 1 DAY');
    $stmt->execute([$uid]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        rebuild_auto_reminders($uid, 'task', (int) $id);
    }
    $stmt = db()->prepare('SELECT id FROM events WHERE user_id = ? AND event_date >= CURDATE() - INTERVAL 1 DAY');
    $stmt->execute([$uid]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        rebuild_auto_reminders($uid, 'event', (int) $id);
    }
}

/** 設定画面から送られてきた通知の初期値を確かめる（最大5件） */
function clean_rules(mixed $rules, bool $allowMinutes): array
{
    $out = [];
    if (!is_array($rules)) {
        return $out;
    }
    foreach ($rules as $r) {
        if (!is_array($r)) {
            continue;
        }
        if ($allowMinutes && isset($r['m']) && in_array((int) $r['m'], [15, 30, 60, 120, 180], true)) {
            $out[] = ['m' => (int) $r['m']];
        } elseif (isset($r['d'], $r['t']) && in_array((int) $r['d'], [-3, -2, -1, 0], true) && is_string($r['t']) && valid_time($r['t'])) {
            $out[] = ['d' => (int) $r['d'], 't' => $r['t']];
        }
    }
    return array_slice(array_values(array_unique($out, SORT_REGULAR)), 0, 5);
}
