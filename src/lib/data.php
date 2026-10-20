<?php
declare(strict_types=1);

/**
 * データの読み書きの共通処理。
 * 画面（app.js）とは、プロトタイプと同じ形の JSON でやりとりする。
 * SQL はすべて user_id で絞り、ほかの人のデータには触れない。
 */

const STAGES = ['interest', 'entry', 'es', 'int1', 'int2', 'final', 'offer', 'out'];
const STAGE_NAMES = ['interest' => '気になる', 'entry' => 'エントリー', 'es' => '書類選考', 'int1' => '一次面接', 'int2' => '二次面接', 'final' => '最終面接', 'offer' => '内定', 'out' => '見送り'];
const EVENT_TYPES = ['briefing' => '説明会', 'es' => 'ES締切', 'webtest' => 'Webテスト', 'interview' => '面接', 'internship' => 'インターン', 'other' => 'その他'];
const REVIEWABLE_TYPES = ['interview', 'briefing', 'internship', 'webtest'];
const DEFAULT_TASK_REMINDERS = [['d' => -1, 't' => '20:00'], ['d' => 0, 't' => '21:00']];
const DEFAULT_EVENT_REMINDERS = [['d' => -1, 't' => '20:00'], ['m' => 60]];
const DEFAULT_AXES = [['志望度', 5, 1], ['やりたいこと', 5, 0], ['給与', 3, 0], ['勤務地', 3, 0], ['働き方', 2, 0]];

/** 種類の名前（面接 など）→ コード（interview など） */
function event_type_code(string $name): string
{
    $code = array_search($name, EVENT_TYPES, true);
    if ($code !== false) {
        return $code;
    }
    return isset(EVENT_TYPES[$name]) ? $name : 'other';
}

/** 新しい会員の初期データ（設定と「わたしの軸」） */
function create_user(string $name, string $email, string $password): int
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
            ->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name]);
        $uid = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO user_settings (user_id, task_reminders, event_reminders) VALUES (?, ?, ?)')
            ->execute([$uid, json_encode(DEFAULT_TASK_REMINDERS), json_encode(DEFAULT_EVENT_REMINDERS)]);
        $ins = $pdo->prepare('INSERT INTO axes (user_id, name, weight, is_pref, sort) VALUES (?, ?, ?, ?, ?)');
        foreach (DEFAULT_AXES as $i => [$axName, $w, $isPref]) {
            $ins->execute([$uid, $axName, $w, $isPref, $i]);
        }
        $pdo->commit();
        return $uid;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/** 会員の設定（行がなければ作る） */
function user_settings(int $uid): array
{
    $stmt = db()->prepare('SELECT * FROM user_settings WHERE user_id = ?');
    $stmt->execute([$uid]);
    $row = $stmt->fetch();
    if (!$row) {
        db()->prepare('INSERT IGNORE INTO user_settings (user_id, task_reminders, event_reminders) VALUES (?, ?, ?)')
            ->execute([$uid, json_encode(DEFAULT_TASK_REMINDERS), json_encode(DEFAULT_EVENT_REMINDERS)]);
        $stmt->execute([$uid]);
        $row = $stmt->fetch();
    }
    return $row;
}

/** 通知の初期値（設定の JSON を読む。壊れていたら初期値） */
function reminder_rules(array $settings, string $kind): array
{
    $json = $kind === 'task' ? $settings['task_reminders'] : $settings['event_reminders'];
    if ($json === null) {
        return $kind === 'task' ? DEFAULT_TASK_REMINDERS : DEFAULT_EVENT_REMINDERS;
    }
    $rules = json_decode((string) $json, true);
    return is_array($rules) ? $rules : [];
}

/**
 * あとから足した列を、なければ自動で追加する（phpMyAdmin での作業をいらなくするため）。
 * 一度確かめたら storage/schema-*.done を置いて、次からは確かめない。
 */
function ensure_schema(): void
{
    static $done = false;
    $flag = BASE_DIR . '/storage/schema-2026-10-19.done';
    if ($done || is_file($flag)) {
        $done = true;
        return;
    }
    $columns = [
        'companies' => ['site_url' => "VARCHAR(500) NOT NULL DEFAULT '' AFTER url"],
        'events' => [
            'online_url' => "VARCHAR(500) NOT NULL DEFAULT '' AFTER place",
            'auto_remind' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER items',
        ],
        'tasks' => ['auto_remind' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER due_date'],
    ];
    $check = db()->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    foreach ($columns as $table => $definitions) {
        foreach ($definitions as $column => $definition) {
            $check->execute([$table, $column]);
            if (!$check->fetchColumn()) {
                db()->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
            }
        }
    }
    @file_put_contents($flag, date('c'));
    $done = true;
}

/** 企業のURL：http(s) だけ受け付ける。「example.com」のように書いたら https:// を補う */
function clean_web_url(string $u): ?string
{
    $u = trim($u);
    if ($u === '') {
        return '';
    }
    if (!preg_match('#^https?://#i', $u) && preg_match('#^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$#i', $u)) {
        $u = 'https://' . $u;
    }
    return preg_match('#^https?://[^\s<>"]+$#i', $u) ? $u : null;
}

/** その id がこの会員のものなら id を、違えば null を返す */
function owned_id(string $table, mixed $id, int $uid): ?int
{
    static $allowed = ['companies', 'events', 'tasks', 'reviews', 'lessons', 'axes', 'notifications', 'push_subscriptions'];
    if (!in_array($table, $allowed, true) || !is_numeric($id) || (int) $id <= 0) {
        return null;
    }
    $stmt = db()->prepare("SELECT id FROM {$table} WHERE id = ? AND user_id = ?");
    $stmt->execute([(int) $id, $uid]);
    $found = $stmt->fetchColumn();
    return $found === false ? null : (int) $found;
}

/** DB の日時 → 画面用（2026-10-11T20:00） */
function js_dt(?string $dt): ?string
{
    return $dt ? str_replace(' ', 'T', substr($dt, 0, 16)) : null;
}

/**
 * 通知ベルに「就活日和の使い方」を1回だけ入れる（押すと説明ページ /about が開く）。
 * 登録から90日以内の会員だけ（通知は90日で消えるので、それ以降は入れ直さない）。
 */
function ensure_welcome_notification(array $user): void
{
    if (strtotime((string) $user['created_at']) < time() - 90 * 86400) {
        return;
    }
    $stmt = db()->prepare("SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'welcome' LIMIT 1");
    $stmt->execute([$user['id']]);
    if (!$stmt->fetchColumn()) {
        db()->prepare("INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, 'welcome', ?, ?, '/about')")
            ->execute([$user['id'], '就活日和へようこそ', 'できることと使い方を、絵つきで紹介しています。タップすると説明が見られます']);
    }
}

/** ログイン中の会員のデータ一式（画面にそのまま渡す形） */
function build_state(array $user): array
{
    $uid = (int) $user['id'];
    $pdo = db();
    ensure_schema();
    ensure_welcome_notification($user);
    $q = function (string $sql) use ($pdo, $uid): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$uid]);
        return $stmt->fetchAll();
    };
    $settings = user_settings($uid);

    // わたしの軸（志望度は id = 'pref'）
    $axes = [];
    $axisJsId = [];
    foreach ($q('SELECT id, name, weight, is_pref FROM axes WHERE user_id = ? ORDER BY sort, id') as $a) {
        $jsId = $a['is_pref'] ? 'pref' : (string) $a['id'];
        $axisJsId[(int) $a['id']] = $jsId;
        $axes[] = ['id' => $jsId, 'name' => $a['name'], 'w' => (int) $a['weight']];
    }

    $ratings = [];
    foreach ($q('SELECT r.company_id, r.axis_id, r.score FROM company_ratings r JOIN companies c ON c.id = r.company_id WHERE c.user_id = ?') as $r) {
        if (isset($axisJsId[(int) $r['axis_id']])) {
            $ratings[(int) $r['company_id']][$axisJsId[(int) $r['axis_id']]] = (int) $r['score'];
        }
    }
    $companies = array_map(fn ($c) => [
        'id' => (string) $c['id'],
        'name' => $c['name'],
        'industry' => $c['industry'],
        'stage' => $c['stage'],
        'pref' => (int) $c['pref'],
        'url' => $c['url'],
        'site' => (string) ($c['site_url'] ?? ''),
        'mypage' => $c['mypage'],
        'memo' => (string) $c['memo'],
        'ratings' => (object) ($ratings[(int) $c['id']] ?? []),
    ], $q('SELECT * FROM companies WHERE user_id = ? ORDER BY id'));

    // 未送信の通知（手動の一覧と、次に届く日時）
    $manual = ['task' => [], 'event' => []];
    $next = ['task' => [], 'event' => []];
    foreach ($q('SELECT target_type, target_id, remind_at, is_auto FROM reminders WHERE user_id = ? AND sent_at IS NULL AND remind_at > NOW() ORDER BY remind_at') as $r) {
        $t = $r['target_type'];
        $id = (int) $r['target_id'];
        if (!isset($manual[$t])) {
            continue;
        }
        if (!$r['is_auto']) {
            $manual[$t][$id][] = js_dt($r['remind_at']);
        }
        $next[$t][$id] ??= js_dt($r['remind_at']);
    }

    $events = array_map(fn ($e) => [
        'id' => (string) $e['id'],
        'cid' => $e['company_id'] ? (string) $e['company_id'] : '',
        'type' => EVENT_TYPES[$e['type']] ?? 'その他',
        'date' => $e['event_date'],
        'time' => $e['event_time'] ? substr($e['event_time'], 0, 5) : '',
        'title' => $e['title'],
        'place' => $e['place'],
        'url' => $e['online_url'],
        'items' => $e['items'],
        'auto' => (bool) $e['auto_remind'],
        'reminders' => $manual['event'][(int) $e['id']] ?? [],
        'next' => $next['event'][(int) $e['id']] ?? null,
        'google' => $e['google_event_id'] !== null,
    ], $q('SELECT * FROM events WHERE user_id = ? ORDER BY event_date, event_time, id'));

    $evals = [];
    foreach ($q('SELECT review_id, lesson_id, score FROM lesson_evals WHERE user_id = ? ORDER BY id') as $v) {
        $evals[(int) $v['review_id']][] = ['lid' => (string) $v['lesson_id'], 'score' => (int) $v['score']];
    }
    $reviews = array_map(fn ($r) => [
        'id' => (string) $r['id'],
        'cid' => $r['company_id'] ? (string) $r['company_id'] : '',
        'evid' => $r['event_id'] ? (string) $r['event_id'] : '',
        'date' => $r['review_date'],
        'feel' => (int) $r['feel'],
        'asked' => (string) $r['asked'],
        'evals' => $evals[(int) $r['id']] ?? [],
    ], $q('SELECT * FROM reviews WHERE user_id = ? ORDER BY review_date, id'));

    $lessons = array_map(fn ($l) => [
        'id' => (string) $l['id'],
        'rid' => (string) $l['review_id'],
        'text' => $l['text'],
    ], $q('SELECT id, review_id, text FROM lessons WHERE user_id = ? ORDER BY id'));

    $tasks = array_map(fn ($t) => [
        'id' => (string) $t['id'],
        'cid' => $t['company_id'] ? (string) $t['company_id'] : '',
        'title' => $t['title'],
        'due' => (string) $t['due_date'],
        'done' => $t['done_at'] ? substr($t['done_at'], 0, 10) : null,
        'auto' => (bool) $t['auto_remind'],
        'reminders' => $manual['task'][(int) $t['id']] ?? [],
        'next' => $next['task'][(int) $t['id']] ?? null,
    ], $q('SELECT * FROM tasks WHERE user_id = ? ORDER BY id'));

    $notifs = array_map(fn ($n) => [
        'id' => (string) $n['id'],
        'kind' => $n['kind'],
        'title' => $n['title'],
        'body' => $n['body'],
        'link' => $n['link'],
        'at' => js_dt($n['created_at']),
        'read' => $n['read_at'] !== null,
    ], $q('SELECT * FROM notifications WHERE user_id = ? AND created_at > NOW() - INTERVAL 90 DAY ORDER BY created_at DESC, id DESC LIMIT 100'));

    $cal = $q("SELECT last_synced_at FROM calendar_accounts WHERE user_id = ? AND provider = 'google'");

    return [
        'me' => ['name' => $user['name'], 'email' => $user['email']],
        'isAdmin' => is_admin($user),
        'companies' => $companies,
        'events' => $events,
        'reviews' => $reviews,
        'lessons' => $lessons,
        'tasks' => $tasks,
        'notifs' => $notifs,
        'axes' => $axes,
        'settings' => [
            'taskRem' => reminder_rules($settings, 'task'),
            'eventRem' => reminder_rules($settings, 'event'),
        ],
        'companyView' => $settings['company_view'],
        'scheduleView' => $settings['schedule_view'],
        'installDone' => (bool) $settings['install_done'],
        'installDismissed' => (bool) $settings['install_dismissed'],
        'google' => [
            'configured' => google_configured(),
            'connected' => (bool) $cal,
            'lastSynced' => $cal ? js_dt($cal[0]['last_synced_at']) : null,
        ],
    ];
}
