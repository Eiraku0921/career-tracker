<?php
declare(strict_types=1);

/**
 * 画面（app.js）から呼ぶ API。/api/... はすべてここに来る。
 * - 保存系はログインしていないと 401（デモ画面は何も保存しない）
 * - POST は CSRF トークンを確かめる
 * - 保存したら、最新のデータ一式（build_state）を返す
 */

$route = substr($path, 5); // '/api/' を除いた部分
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// 通知の「完了にする」ボタン（Service Worker から。セッションではなく署名で確かめる）
if ($route === 'push/done' && $method === 'POST') {
    $token = (string) (json_in()['token'] ?? '');
    $parts = explode('.', $token);
    if (count($parts) !== 3 || !hash_equals(sign("done:{$parts[0]}:{$parts[1]}"), $parts[2])) {
        fail('不正なリクエストです', 403);
    }
    [$uid, $tid] = [(int) $parts[0], (int) $parts[1]];
    db()->prepare('UPDATE tasks SET done_at = COALESCE(done_at, NOW()) WHERE id = ? AND user_id = ?')->execute([$tid, $uid]);
    clear_reminders($uid, 'task', $tid);
    json_out(['ok' => true]);
}

// デモ画面のサンプルデータ（固定の JSON。保存はしない）
if ($route === 'demo' && $method === 'GET') {
    require BASE_DIR . '/src/demo.php';
    json_out(demo_state());
}

if ($method !== 'GET') {
    csrf_check();
}

/* ---- ログイン・新規登録（ログインしていなくても使う） ---- */

/** 画面から送られた端末の種類と「ログインしたままにする」から、ログインの保持期間を決める */
function login_mode(array $in): string
{
    if (($in['device'] ?? '') !== 'pc') {
        return 'sp';
    }
    return array_key_exists('remember', $in) && !$in['remember'] ? 'pc-temp' : 'pc';
}
if ($route === 'auth/login' && $method === 'POST') {
    $in = json_in();
    $email = strtolower(str_in($in, 'email', 255));
    $pass = (string) ($in['password'] ?? '');
    if ($email === '' || $pass === '') {
        fail('メールアドレスとパスワードを入力してください');
    }
    $wait = throttle_wait($email);
    if ($wait > 0) {
        fail("ログインの失敗が続いたため、{$wait}秒ほど待ってからもう一度お試しください", 429);
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $u = $stmt->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        throttle_fail($email);
        fail('メールアドレスかパスワードが違います', 401);
    }
    if ($u['status'] !== 'active') {
        fail('このアカウントは停止中のため、ログインできません', 403);
    }
    throttle_clear($email);
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
    }
    login_user($u, login_mode($in));
    json_out(['ok' => true]);
}

if ($route === 'auth/signup' && $method === 'POST') {
    $in = json_in();
    $name = str_in($in, 'name', 100);
    $email = strtolower(str_in($in, 'email', 255));
    $pass = (string) ($in['password'] ?? '');
    if ($name === '') {
        fail('名前を入力してください');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('メールアドレスの形が正しくありません');
    }
    if (mb_strlen($pass) < 8) {
        fail('パスワードは8文字以上にしてください');
    }
    if (strlen($pass) > 200) {
        fail('パスワードが長すぎます');
    }
    $stmt = db()->prepare('SELECT 1 FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetchColumn()) {
        fail('このメールアドレスはすでに登録されています。ログインしてください');
    }
    $uid = create_user($name, $email, $pass);
    login_user(find_user($uid), login_mode($in));
    json_out(['ok' => true]);
}

/* ---- ここから先はログインが必要 ---- */
$user = current_user();
if (!$user) {
    json_out(['error' => 'ログインしてください（デモ画面では保存されません）', 'code' => 'login'], 401);
}
$uid = (int) $user['id'];
$in = json_in();
$state = fn () => json_out(build_state($user));

switch ($route) {
    case 'state':
        $state();

    case 'pv':
        count_access($user);
        json_out(['ok' => true]);

    /* ---- 企業 ---- */
    case 'company/save':
        $id = isset($in['id']) && $in['id'] !== '' && $in['id'] !== null ? owned_id('companies', $in['id'], $uid) : null;
        if (isset($in['id']) && $in['id'] && $id === null && is_numeric($in['id'])) {
            fail('企業が見つかりません', 404);
        }
        $name = str_in($in, 'name', 100);
        if ($name === '') {
            fail('企業名を入力してください');
        }
        $stage = in_array($in['stage'] ?? '', STAGES, true) ? $in['stage'] : 'interest';
        $pref = max(1, min(5, (int) ($in['pref'] ?? 3)));
        ensure_schema();
        $url = clean_web_url(str_in($in, 'url', 500)) ?? fail('採用ページのURLは https:// から始まる形で入力してください');
        $site = clean_web_url(str_in($in, 'site', 500)) ?? fail('企業のHPのURLは https:// から始まる形で入力してください');
        $vals = [$name, str_in($in, 'industry', 100), $stage, $pref, $url, $site, str_in($in, 'mypage', 255), str_in($in, 'memo', 5000, false)];
        if ($id) {
            db()->prepare('UPDATE companies SET name = ?, industry = ?, stage = ?, pref = ?, url = ?, site_url = ?, mypage = ?, memo = ? WHERE id = ? AND user_id = ?')
                ->execute([...$vals, $id, $uid]);
        } else {
            db()->prepare('INSERT INTO companies (name, industry, stage, pref, url, site_url, mypage, memo, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([...$vals, $uid]);
            $id = (int) db()->lastInsertId();
        }
        // わたしの軸の評価（志望度は企業の★を使うので保存しない）
        if (isset($in['ratings']) && is_array($in['ratings'])) {
            db()->prepare('DELETE r FROM company_ratings r JOIN companies c ON c.id = r.company_id WHERE r.company_id = ? AND c.user_id = ?')->execute([$id, $uid]);
            $ins = db()->prepare('INSERT INTO company_ratings (company_id, axis_id, score) VALUES (?, ?, ?)');
            foreach ($in['ratings'] as $axisId => $score) {
                $aid = owned_id('axes', $axisId, $uid);
                $score = (int) $score;
                if ($aid && $score >= 1 && $score <= 5) {
                    $ins->execute([$id, $aid, $score]);
                }
            }
        }
        $state();

    case 'company/stage':
        $id = owned_id('companies', $in['id'] ?? null, $uid) ?? fail('企業が見つかりません', 404);
        if (!in_array($in['stage'] ?? '', STAGES, true)) {
            fail('選考段階が正しくありません');
        }
        db()->prepare('UPDATE companies SET stage = ? WHERE id = ? AND user_id = ?')->execute([$in['stage'], $id, $uid]);
        $state();

    case 'company/delete':
        $id = owned_id('companies', $in['id'] ?? null, $uid) ?? fail('企業が見つかりません', 404);
        // 関連する予定も消す（プロトタイプと同じ）
        $stmt = db()->prepare('SELECT id, google_event_id FROM events WHERE company_id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        foreach ($stmt->fetchAll() as $e) {
            clear_reminders($uid, 'event', (int) $e['id']);
            google_after_delete($uid, $e['google_event_id']);
        }
        db()->prepare('DELETE FROM events WHERE company_id = ? AND user_id = ?')->execute([$id, $uid]);
        db()->prepare('DELETE FROM companies WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        $state();

    /* ---- 予定 ---- */
    case 'event/save':
        $id = !empty($in['id']) ? (owned_id('events', $in['id'], $uid) ?? fail('予定が見つかりません', 404)) : null;
        $date = str_in($in, 'date', 10);
        if (!valid_date($date)) {
            fail('日付を入力してください');
        }
        $time = str_in($in, 'time', 5);
        if ($time !== '' && !valid_time($time)) {
            fail('時刻が正しくありません');
        }
        $url = str_in($in, 'url', 500);
        if ($url !== '' && !preg_match('#^https://[^\s<>"]+$#i', $url)) {
            fail('URLは https:// から始まる形で貼ってください');
        }
        $type = event_type_code(str_in($in, 'type', 20));
        $title = str_in($in, 'title', 100) ?: EVENT_TYPES[$type];
        $cid = owned_id('companies', $in['cid'] ?? null, $uid);
        $vals = [$cid, $type, $title, $date, $time !== '' ? $time . ':00' : null, str_in($in, 'place', 255), $url, str_in($in, 'items', 255), empty($in['auto']) ? 0 : 1];
        if ($id) {
            db()->prepare('UPDATE events SET company_id = ?, type = ?, title = ?, event_date = ?, event_time = ?, place = ?, online_url = ?, items = ?, auto_remind = ?, google_etag = NULL WHERE id = ? AND user_id = ?')
                ->execute([...$vals, $id, $uid]);
        } else {
            db()->prepare('INSERT INTO events (company_id, type, title, event_date, event_time, place, online_url, items, auto_remind, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([...$vals, $uid]);
            $id = (int) db()->lastInsertId();
        }
        rebuild_auto_reminders($uid, 'event', $id);
        set_manual_reminders($uid, 'event', $id, $in['reminders'] ?? []);
        google_after_save($uid, $id);
        $state();

    case 'event/delete':
        $id = owned_id('events', $in['id'] ?? null, $uid) ?? fail('予定が見つかりません', 404);
        $stmt = db()->prepare('SELECT google_event_id FROM events WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        $gid = $stmt->fetchColumn() ?: null;
        clear_reminders($uid, 'event', $id);
        db()->prepare('DELETE FROM events WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        google_after_delete($uid, $gid);
        $state();

    /* ---- タスク ---- */
    case 'task/save':
        $id = !empty($in['id']) ? (owned_id('tasks', $in['id'], $uid) ?? fail('タスクが見つかりません', 404)) : null;
        $title = str_in($in, 'title', 60);
        if ($title === '') {
            fail('やることを入力してください');
        }
        $due = str_in($in, 'due', 10);
        if ($due !== '' && !valid_date($due)) {
            fail('期限の日付が正しくありません');
        }
        $cid = owned_id('companies', $in['cid'] ?? null, $uid);
        $auto = array_key_exists('auto', $in) ? (empty($in['auto']) ? 0 : 1) : 1;
        if ($id) {
            db()->prepare('UPDATE tasks SET title = ?, company_id = ?, due_date = ?, auto_remind = ? WHERE id = ? AND user_id = ?')
                ->execute([$title, $cid, $due ?: null, $auto, $id, $uid]);
        } else {
            db()->prepare('INSERT INTO tasks (title, company_id, due_date, auto_remind, user_id) VALUES (?, ?, ?, ?, ?)')
                ->execute([$title, $cid, $due ?: null, $auto, $uid]);
            $id = (int) db()->lastInsertId();
        }
        rebuild_auto_reminders($uid, 'task', $id);
        if (array_key_exists('reminders', $in)) {
            set_manual_reminders($uid, 'task', $id, $in['reminders']);
        }
        $state();

    case 'task/toggle':
        $id = owned_id('tasks', $in['id'] ?? null, $uid) ?? fail('タスクが見つかりません', 404);
        db()->prepare('UPDATE tasks SET done_at = IF(done_at IS NULL, NOW(), NULL) WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        $stmt = db()->prepare('SELECT done_at FROM tasks WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $uid]);
        if ($stmt->fetchColumn()) {
            clear_reminders($uid, 'task', $id);
        } else {
            rebuild_auto_reminders($uid, 'task', $id);
        }
        $state();

    case 'task/delete':
        $id = owned_id('tasks', $in['id'] ?? null, $uid) ?? fail('タスクが見つかりません', 404);
        clear_reminders($uid, 'task', $id);
        db()->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        $state();

    /* ---- ふりかえり ---- */
    case 'review/save':
        $rid = !empty($in['id']) ? (owned_id('reviews', $in['id'], $uid) ?? fail('ふりかえりが見つかりません', 404)) : null;
        $texts = [];
        foreach ((array) ($in['lessons'] ?? []) as $l) {
            $texts[] = ['id' => is_array($l) ? ($l['id'] ?? null) : null, 'text' => is_array($l) ? str_in($l, 'text', 40) : ''];
        }
        if (!array_filter($texts, fn ($l) => $l['text'] !== '')) {
            fail('次に活かしたいことを1つ以上書いてください');
        }
        $cid = owned_id('companies', $in['cid'] ?? null, $uid);
        $evid = owned_id('events', $in['evid'] ?? null, $uid);
        $date = date('Y-m-d');
        if ($evid) {
            $stmt = db()->prepare('SELECT event_date FROM events WHERE id = ? AND user_id = ?');
            $stmt->execute([$evid, $uid]);
            $date = $stmt->fetchColumn();
        } elseif ($rid) {
            $stmt = db()->prepare('SELECT review_date FROM reviews WHERE id = ? AND user_id = ?');
            $stmt->execute([$rid, $uid]);
            $date = $stmt->fetchColumn();
        }
        $feel = max(1, min(5, (int) ($in['feel'] ?? 3)));
        $asked = str_in($in, 'asked', 2000);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            if ($rid) {
                $pdo->prepare('UPDATE reviews SET company_id = ?, event_id = ?, review_date = ?, feel = ?, asked = ? WHERE id = ? AND user_id = ?')
                    ->execute([$cid, $evid, $date, $feel, $asked, $rid, $uid]);
            } else {
                $pdo->prepare('INSERT INTO reviews (company_id, event_id, review_date, feel, asked, user_id) VALUES (?, ?, ?, ?, ?, ?)')
                    ->execute([$cid, $evid, $date, $feel, $asked, $uid]);
                $rid = (int) $pdo->lastInsertId();
            }
            // 次に活かしたいこと（課題）：既存は書き換え・空なら削除、新しいものは追加
            $own = $pdo->prepare('SELECT id FROM lessons WHERE review_id = ? AND user_id = ?');
            $own->execute([$rid, $uid]);
            $ownIds = array_map('intval', $own->fetchAll(PDO::FETCH_COLUMN));
            foreach ($texts as $l) {
                $lid = is_numeric($l['id']) && in_array((int) $l['id'], $ownIds, true) ? (int) $l['id'] : null;
                if ($lid && $l['text'] !== '') {
                    $pdo->prepare('UPDATE lessons SET text = ? WHERE id = ? AND user_id = ?')->execute([$l['text'], $lid, $uid]);
                } elseif ($lid) {
                    $pdo->prepare('DELETE FROM lessons WHERE id = ? AND user_id = ?')->execute([$lid, $uid]);
                } elseif ($l['text'] !== '') {
                    $pdo->prepare('INSERT INTO lessons (user_id, review_id, text) VALUES (?, ?, ?)')->execute([$uid, $rid, $l['text']]);
                }
            }
            // 前回の課題の評価（このふりかえりの分を入れ替える）
            $pdo->prepare('DELETE FROM lesson_evals WHERE review_id = ? AND user_id = ?')->execute([$rid, $uid]);
            $ins = $pdo->prepare('INSERT INTO lesson_evals (user_id, review_id, lesson_id, score) VALUES (?, ?, ?, ?)');
            $seen = [];
            foreach ((array) ($in['evals'] ?? []) as $v) {
                $lid = is_array($v) ? owned_id('lessons', $v['lid'] ?? null, $uid) : null;
                $score = is_array($v) ? (int) ($v['score'] ?? -1) : -1;
                if ($lid && !in_array($lid, $ownIds, true) && !isset($seen[$lid]) && $score >= 0 && $score <= 3) {
                    $ins->execute([$uid, $rid, $lid, $score]);
                    $seen[$lid] = true;
                }
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        // 声かけの通知は既読にする
        if ($evid) {
            db()->prepare("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND kind = 'review' AND link = ? AND read_at IS NULL")->execute([$uid, '/?review=' . $evid]);
        }
        $state();

    case 'review/delete':
        $rid = owned_id('reviews', $in['id'] ?? null, $uid) ?? fail('ふりかえりが見つかりません', 404);
        db()->prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?')->execute([$rid, $uid]);
        $state();

    /* ---- わたしの軸 ---- */
    case 'axes/save':
        $list = array_slice((array) ($in['axes'] ?? []), 0, 8);
        $stmt = db()->prepare('SELECT id, is_pref FROM axes WHERE user_id = ?');
        $stmt->execute([$uid]);
        $existing = [];
        $prefId = null;
        foreach ($stmt->fetchAll() as $a) {
            $existing[(int) $a['id']] = true;
            if ($a['is_pref']) {
                $prefId = (int) $a['id'];
            }
        }
        $keep = [];
        $sort = 0;
        foreach ($list as $a) {
            if (!is_array($a)) {
                continue;
            }
            $w = max(0, min(5, (int) ($a['w'] ?? 3)));
            if (($a['id'] ?? '') === 'pref') {
                if ($prefId) {
                    db()->prepare('UPDATE axes SET weight = ?, sort = ? WHERE id = ? AND user_id = ?')->execute([$w, $sort++, $prefId, $uid]);
                    $keep[$prefId] = true;
                }
                continue;
            }
            $name = str_in($a, 'name', 12);
            if ($name === '') {
                continue;
            }
            $aid = is_numeric($a['id'] ?? null) && isset($existing[(int) $a['id']]) ? (int) $a['id'] : null;
            if ($aid) {
                db()->prepare('UPDATE axes SET name = ?, weight = ?, sort = ? WHERE id = ? AND user_id = ?')->execute([$name, $w, $sort++, $aid, $uid]);
            } else {
                db()->prepare('INSERT INTO axes (user_id, name, weight, sort) VALUES (?, ?, ?, ?)')->execute([$uid, $name, $w, $sort++]);
                $aid = (int) db()->lastInsertId();
            }
            $keep[$aid] = true;
        }
        foreach (array_keys($existing) as $aid) {
            if (!isset($keep[$aid]) && $aid !== $prefId) {
                db()->prepare('DELETE FROM axes WHERE id = ? AND user_id = ?')->execute([$aid, $uid]);
            }
        }
        $state();

    /* ---- 設定 ---- */
    case 'settings/reminders':
        user_settings($uid);
        db()->prepare('UPDATE user_settings SET task_reminders = ?, event_reminders = ? WHERE user_id = ?')
            ->execute([json_encode(clean_rules($in['taskRem'] ?? [], false)), json_encode(clean_rules($in['eventRem'] ?? [], true)), $uid]);
        rebuild_all_reminders($uid);
        $state();

    case 'settings/view':
        user_settings($uid);
        if (in_array($in['companyView'] ?? '', ['board', 'table', 'axis'], true)) {
            db()->prepare('UPDATE user_settings SET company_view = ? WHERE user_id = ?')->execute([$in['companyView'], $uid]);
        }
        if (in_array($in['scheduleView'] ?? '', ['list', 'cal'], true)) {
            db()->prepare('UPDATE user_settings SET schedule_view = ? WHERE user_id = ?')->execute([$in['scheduleView'], $uid]);
        }
        json_out(['ok' => true]);

    case 'settings/install':
        user_settings($uid);
        $col = ($in['action'] ?? '') === 'done' ? 'install_done' : 'install_dismissed';
        db()->prepare("UPDATE user_settings SET {$col} = 1 WHERE user_id = ?")->execute([$uid]);
        $state();

    /* ---- 通知ベル ---- */
    case 'notif/read':
        if (!empty($in['all'])) {
            db()->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$uid]);
        } else {
            $nid = owned_id('notifications', $in['id'] ?? null, $uid) ?? fail('通知が見つかりません', 404);
            db()->prepare('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?')->execute([$nid, $uid]);
        }
        $state();

    /* ---- プッシュ通知 ---- */
    case 'push/subscribe':
        $endpoint = str_in($in, 'endpoint', 500);
        $p256dh = str_in((array) ($in['keys'] ?? []), 'p256dh', 255);
        $auth = str_in((array) ($in['keys'] ?? []), 'auth', 255);
        if (!preg_match('#^https://#', $endpoint) || $p256dh === '' || $auth === '') {
            fail('通知の登録に失敗しました');
        }
        db()->prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
                       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)')
            ->execute([$uid, $endpoint, $p256dh, $auth, mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
        json_out(['ok' => true]);

    case 'push/unsubscribe':
        db()->prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')->execute([str_in($in, 'endpoint', 500), $uid]);
        json_out(['ok' => true]);

    case 'push/test':
        if (!push_ready()) {
            fail('プッシュ通知の鍵が設定されていません（管理者に連絡してください）');
        }
        notify_user($uid, 'test', 'テスト通知', 'この端末に通知が届いています。就活日和の準備は完了です', '/settings');
        $state();

    /* ---- アカウント ---- */
    case 'account/logout':
        logout_current();
        json_out(['ok' => true]);

    case 'account/logout-all':
        logout_everywhere($uid);
        logout_current();
        json_out(['ok' => true]);

    case 'account/password':
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$uid]);
        if (!password_verify((string) ($in['current'] ?? ''), (string) $stmt->fetchColumn())) {
            fail('いまのパスワードが違います');
        }
        $new = (string) ($in['new'] ?? '');
        if (mb_strlen($new) < 8 || strlen($new) > 200) {
            fail('新しいパスワードは8文字以上にしてください');
        }
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $uid]);
        // パスワードを変えたら全端末のログインを消し、この端末だけログインし直す
        logout_everywhere($uid);
        login_user($user, (string) ($_SESSION['login_mode'] ?? 'sp'));
        json_out(['ok' => true, 'csrf' => csrf_token()]);

    /* ---- Googleカレンダー ---- */
    case 'google/sync':
        if (!google_sync_user($uid)) {
            fail('Googleカレンダーと同期できませんでした。もう一度接続してください');
        }
        $state();

    case 'google/disconnect':
        google_disconnect($uid);
        $state();

    /* ---- 管理画面（管理者だけ） ---- */
    case 'admin':
        is_admin($user) || fail('管理者だけが使えます', 403);
        json_out(admin_stats());
}

fail('見つかりません', 404);
