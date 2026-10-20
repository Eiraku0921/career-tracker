<?php
declare(strict_types=1);

/**
 * Googleカレンダー連携。
 * - 権限は calendar.app.created だけ（就活日和が作ったカレンダー「就活日和」だけを読み書きする）
 * - トークンは暗号化して calendar_accounts.credentials に保存。パスワードは預からない
 * - 就活日和 → Google：保存時に送る（失敗したら cron が google_etag の空いた予定を送り直す）
 * - Google → 就活日和：変更通知（events.watch）＋差分取得（syncToken）、5分ごとの cron でも確認
 * - google_etag が同じ変更は自分が書いたものなので取り込まない（同期のループを防ぐ）
 */

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const GOOGLE_CAL_NAME = '就活日和';

function google_configured(): bool
{
    return (string) config('google.client_id', '') !== '' && (string) config('google.client_secret', '') !== '';
}

function google_redirect_uri(): string
{
    return app_url() . '/google/callback';
}

function google_auth_url(string $state): string
{
    return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => config('google.client_id'),
        'redirect_uri' => google_redirect_uri(),
        'response_type' => 'code',
        'scope' => GOOGLE_SCOPE,
        'access_type' => 'offline',
        'prompt' => 'consent',
        'include_granted_scopes' => 'false',
        'state' => $state,
    ]);
}

/** HTTP で送る（戻り値は [ステータス, JSON]） */
function google_http(string $method, string $url, ?array $json = null, array $form = [], ?string $token = null): array
{
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 5];
    if ($json !== null) {
        $headers[] = 'Content-Type: application/json';
        $opts[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } elseif ($form) {
        $opts[CURLOPT_POSTFIELDS] = http_build_query($form);
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($body === false) {
        error_log('google http: ' . curl_error($ch));
    }
    curl_close($ch);
    return [$status, is_string($body) ? (json_decode($body, true) ?: []) : []];
}

/** 会員の連携情報（なければ null） */
function google_account(int $uid): ?array
{
    $stmt = db()->prepare("SELECT * FROM calendar_accounts WHERE user_id = ? AND provider = 'google'");
    $stmt->execute([$uid]);
    $a = $stmt->fetch();
    if (!$a) {
        return null;
    }
    $a['creds'] = json_decode((string) decrypt_text($a['credentials']), true) ?: [];
    return $a;
}

function google_save_creds(array $acct, array $creds): void
{
    db()->prepare('UPDATE calendar_accounts SET credentials = ? WHERE id = ? AND user_id = ?')
        ->execute([encrypt_text(json_encode($creds)), $acct['id'], $acct['user_id']]);
}

/** 使えるアクセストークン（期限が近ければ更新する） */
function google_token(array &$acct): ?string
{
    $c = $acct['creds'];
    if (!empty($c['access_token']) && ($c['expires_at'] ?? 0) > time() + 60) {
        return $c['access_token'];
    }
    if (empty($c['refresh_token'])) {
        return null;
    }
    [$st, $res] = google_http('POST', 'https://oauth2.googleapis.com/token', null, [
        'client_id' => config('google.client_id'),
        'client_secret' => config('google.client_secret'),
        'refresh_token' => $c['refresh_token'],
        'grant_type' => 'refresh_token',
    ]);
    if ($st !== 200 || empty($res['access_token'])) {
        error_log('google refresh failed for user ' . $acct['user_id'] . ': ' . ($res['error'] ?? $st));
        return null;
    }
    $c['access_token'] = $res['access_token'];
    $c['expires_at'] = time() + (int) ($res['expires_in'] ?? 3600);
    $acct['creds'] = $c;
    google_save_creds($acct, $c);
    return $c['access_token'];
}

/** カレンダーAPIを呼ぶ */
function google_api(array &$acct, string $method, string $path, array $query = [], ?array $body = null): array
{
    $token = google_token($acct);
    if (!$token) {
        return [401, []];
    }
    $url = 'https://www.googleapis.com/calendar/v3' . $path . ($query ? '?' . http_build_query($query) : '');
    return google_http($method, $url, $body, [], $token);
}

/** 接続の仕上げ：トークンを保存し、「就活日和」カレンダーを作って予定を送る */
function google_connect_finish(int $uid, string $code): bool
{
    [$st, $tok] = google_http('POST', 'https://oauth2.googleapis.com/token', null, [
        'code' => $code,
        'client_id' => config('google.client_id'),
        'client_secret' => config('google.client_secret'),
        'redirect_uri' => google_redirect_uri(),
        'grant_type' => 'authorization_code',
    ]);
    if ($st !== 200 || empty($tok['access_token'])) {
        error_log('google token exchange failed: ' . ($tok['error'] ?? $st));
        return false;
    }
    $creds = [
        'access_token' => $tok['access_token'],
        'refresh_token' => $tok['refresh_token'] ?? null,
        'expires_at' => time() + (int) ($tok['expires_in'] ?? 3600),
    ];
    $old = google_account($uid);
    if ($old) {
        google_stop_watch($old);
        if (empty($creds['refresh_token'])) {
            $creds['refresh_token'] = $old['creds']['refresh_token'] ?? null;
        }
    }
    db()->prepare("INSERT INTO calendar_accounts (user_id, provider, credentials) VALUES (?, 'google', ?)
                   ON DUPLICATE KEY UPDATE credentials = VALUES(credentials)")
        ->execute([$uid, encrypt_text(json_encode($creds))]);
    $acct = google_account($uid);

    // 前に作ったカレンダーがまだあれば使う。なければ作る
    $calId = $acct['calendar_id'];
    if ($calId !== '') {
        [$st] = google_api($acct, 'GET', '/calendars/' . rawurlencode($calId));
        if ($st !== 200) {
            $calId = '';
        }
    }
    if ($calId === '') {
        [$st, $cal] = google_api($acct, 'POST', '/calendars', [], ['summary' => GOOGLE_CAL_NAME, 'timeZone' => 'Asia/Tokyo', 'description' => '就活日和（haruharu.tech）の予定']);
        if ($st !== 200 || empty($cal['id'])) {
            error_log('google calendar create failed: ' . $st);
            return false;
        }
        $calId = $cal['id'];
        // 新しいカレンダーなので、前の連携の記録は使えない
        db()->prepare('UPDATE events SET google_event_id = NULL, google_etag = NULL, updated_at = updated_at WHERE user_id = ?')->execute([$uid]);
    }
    db()->prepare('UPDATE calendar_accounts SET calendar_id = ?, sync_token = NULL WHERE id = ?')->execute([$calId, $acct['id']]);
    $acct['calendar_id'] = $calId;
    $acct['sync_token'] = null;

    google_push_pending($acct);
    google_pull($acct);
    google_watch($acct);
    return true;
}

/** 書き出す形：「企業名｜内容」、説明欄に種類・場所・URL・就活日和へのリンク */
function google_event_body(array $e): array
{
    $summary = ($e['company'] ? $e['company'] . '｜' : '') . $e['title'];
    $desc = '種類：' . (EVENT_TYPES[$e['type']] ?? 'その他');
    if ($e['place'] !== '') {
        $desc .= "\n場所：" . $e['place'];
    }
    if ($e['online_url'] !== '') {
        $desc .= "\nオンライン：" . $e['online_url'];
    }
    if ($e['items'] !== '') {
        $desc .= "\n持ち物・メモ：" . $e['items'];
    }
    $desc .= "\n\n就活日和で開く：" . app_url() . '/schedule?event=' . $e['id'];
    if ($e['event_time']) {
        $start = $e['event_date'] . 'T' . substr($e['event_time'], 0, 5) . ':00';
        $end = date('Y-m-d\TH:i:s', strtotime($e['event_date'] . ' ' . $e['event_time']) + 3600);
        $when = ['start' => ['dateTime' => $start, 'timeZone' => 'Asia/Tokyo'], 'end' => ['dateTime' => $end, 'timeZone' => 'Asia/Tokyo']];
    } else {
        $when = ['start' => ['date' => $e['event_date']], 'end' => ['date' => date('Y-m-d', strtotime($e['event_date'] . ' +1 day'))]];
    }
    return $when + [
        'summary' => $summary,
        'location' => $e['place'],
        'description' => $desc,
        'extendedProperties' => ['private' => ['haruharuId' => (string) $e['id']]],
    ];
}

/** 1件の予定を Google に送る（新規は作成、既存は更新） */
function google_push_event(array &$acct, int $eventId): bool
{
    $uid = (int) $acct['user_id'];
    $stmt = db()->prepare('SELECT e.*, c.name AS company FROM events e LEFT JOIN companies c ON c.id = e.company_id AND c.user_id = e.user_id WHERE e.id = ? AND e.user_id = ?');
    $stmt->execute([$eventId, $uid]);
    $e = $stmt->fetch();
    if (!$e) {
        return false;
    }
    $cal = '/calendars/' . rawurlencode($acct['calendar_id']) . '/events';
    $body = google_event_body($e);
    if ($e['google_event_id']) {
        [$st, $res] = google_api($acct, 'PUT', $cal . '/' . rawurlencode($e['google_event_id']), [], $body);
        if ($st === 404 || $st === 410) {
            [$st, $res] = google_api($acct, 'POST', $cal, [], $body);
        }
    } else {
        [$st, $res] = google_api($acct, 'POST', $cal, [], $body);
    }
    if ($st !== 200 || empty($res['id'])) {
        error_log('google push failed: ' . $st);
        return false;
    }
    db()->prepare('UPDATE events SET google_event_id = ?, google_etag = ?, updated_at = updated_at WHERE id = ? AND user_id = ?')
        ->execute([$res['id'], $res['etag'] ?? '', $eventId, $uid]);
    return true;
}

/** まだ送っていない（google_etag が空の）予定を送る。範囲は過去30日〜1年先 */
function google_push_pending(array &$acct): void
{
    $stmt = db()->prepare('SELECT id FROM events WHERE user_id = ? AND google_etag IS NULL
                           AND event_date BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 1 YEAR LIMIT 200');
    $stmt->execute([$acct['user_id']]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        if (!google_push_event($acct, (int) $id)) {
            break;
        }
    }
}

/** 予定を保存したとき（連携していなければ何もしない） */
function google_after_save(int $uid, int $eventId): void
{
    if (!google_configured()) {
        return;
    }
    $acct = google_account($uid);
    if ($acct && $acct['calendar_id'] !== '') {
        try {
            google_push_event($acct, $eventId);
        } catch (Throwable $e) {
            error_log('google after save: ' . $e->getMessage());
        }
    }
}

/** 予定を消したとき（Google の予定も消す） */
function google_after_delete(int $uid, ?string $googleEventId): void
{
    if (!$googleEventId || !google_configured()) {
        return;
    }
    $acct = google_account($uid);
    if ($acct && $acct['calendar_id'] !== '') {
        try {
            google_api($acct, 'DELETE', '/calendars/' . rawurlencode($acct['calendar_id']) . '/events/' . rawurlencode($googleEventId));
        } catch (Throwable $e) {
            error_log('google after delete: ' . $e->getMessage());
        }
    }
}

/** タイトルの言葉から種類を推定（なければ「その他」） */
function guess_event_type(string $title): string
{
    $rules = [
        'interview' => ['面接', '面談'],
        'webtest' => ['Webテスト', 'WEBテスト', 'webテスト', 'SPI', '適性検査', '玉手箱', 'テスト'],
        'es' => ['ES', 'エントリーシート', '締切', '締め切り'],
        'briefing' => ['説明会', 'セミナー'],
        'internship' => ['インターン'],
    ];
    foreach ($rules as $type => $words) {
        foreach ($words as $w) {
            if (mb_stripos($title, $w) !== false) {
                return $type;
            }
        }
    }
    return 'other';
}

/** Google → 就活日和：差分を取り込む */
function google_pull(array &$acct): bool
{
    $uid = (int) $acct['user_id'];
    $path = '/calendars/' . rawurlencode($acct['calendar_id']) . '/events';
    $pageToken = null;
    $syncToken = $acct['sync_token'];
    $items = [];
    do {
        $query = ['maxResults' => 250, 'showDeleted' => 'true', 'singleEvents' => 'true'];
        if ($syncToken) {
            $query['syncToken'] = $syncToken;
        } else {
            $query['timeMin'] = date('c', strtotime('-30 days'));
        }
        if ($pageToken) {
            $query['pageToken'] = $pageToken;
        }
        [$st, $res] = google_api($acct, 'GET', $path, $query);
        if ($st === 410 && $syncToken) {
            // syncToken が古くなった：最初から取り直す
            $syncToken = null;
            $pageToken = null;
            $items = [];
            continue;
        }
        if ($st !== 200) {
            error_log('google pull failed for user ' . $uid . ': ' . $st);
            return false;
        }
        array_push($items, ...($res['items'] ?? []));
        $pageToken = $res['nextPageToken'] ?? null;
        $next = $res['nextSyncToken'] ?? null;
    } while ($pageToken);

    $companies = db()->prepare('SELECT id, name FROM companies WHERE user_id = ? ORDER BY CHAR_LENGTH(name) DESC');
    $companies->execute([$uid]);
    $companies = $companies->fetchAll();

    foreach ($items as $it) {
        google_apply_item($uid, $it, $companies);
    }
    db()->prepare('UPDATE calendar_accounts SET sync_token = ?, last_synced_at = NOW() WHERE id = ?')->execute([$next ?? null, $acct['id']]);
    $acct['sync_token'] = $next ?? null;
    return true;
}

/** Google の予定1件を取り込む */
function google_apply_item(int $uid, array $it, array $companies): void
{
    $gid = (string) ($it['id'] ?? '');
    if ($gid === '') {
        return;
    }
    $stmt = db()->prepare('SELECT * FROM events WHERE user_id = ? AND google_event_id = ?');
    $stmt->execute([$uid, $gid]);
    $local = $stmt->fetch() ?: null;

    if (($it['status'] ?? '') === 'cancelled') {
        if ($local) {
            clear_reminders($uid, 'event', (int) $local['id']);
            db()->prepare('DELETE FROM events WHERE id = ? AND user_id = ?')->execute([$local['id'], $uid]);
        }
        return;
    }
    // 自分が書いた変更（etag が同じ）は取り込まない
    if ($local && $local['google_etag'] === ($it['etag'] ?? null)) {
        return;
    }
    // 両方で変更されたら、更新時刻が新しいほうを採用
    if ($local && $local['google_etag'] === null && strtotime($local['updated_at']) >= strtotime((string) ($it['updated'] ?? '1970-01-01'))) {
        return;
    }

    if (isset($it['start']['dateTime'])) {
        $t = new DateTime($it['start']['dateTime']);
        $t->setTimezone(new DateTimeZone('Asia/Tokyo'));
        $date = $t->format('Y-m-d');
        $time = $t->format('H:i:s');
    } elseif (isset($it['start']['date'])) {
        $date = $it['start']['date'];
        $time = null;
    } else {
        return;
    }
    if (!$local && ($date < date('Y-m-d', strtotime('-30 days')) || $date > date('Y-m-d', strtotime('+1 year')))) {
        return;
    }

    // タイトルから企業と内容を読み取る（「企業名｜内容」か、企業名を含む）
    $summary = trim((string) ($it['summary'] ?? ''));
    $companyId = null;
    $title = $summary;
    if (str_contains($summary, '｜')) {
        [$co, $rest] = explode('｜', $summary, 2);
        foreach ($companies as $c) {
            if ($c['name'] === trim($co)) {
                $companyId = (int) $c['id'];
                $title = trim($rest);
                break;
            }
        }
    }
    if ($companyId === null) {
        foreach ($companies as $c) {
            if ($c['name'] !== '' && mb_strpos($summary, $c['name']) !== false) {
                $companyId = (int) $c['id'];
                $title = trim(str_replace($c['name'], '', $summary), " 　｜|:：-") ?: $summary;
                break;
            }
        }
    }
    $title = mb_substr($title !== '' ? $title : '（タイトルなし）', 0, 100);
    $place = mb_substr((string) ($it['location'] ?? ''), 0, 255);
    $url = '';
    if (preg_match('/オンライン：(https:\/\/\S+)/u', (string) ($it['description'] ?? ''), $m)) {
        $url = mb_substr($m[1], 0, 500);
    } elseif (preg_match('/https:\/\/(?:[\w-]+\.)?(?:zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|[\w-]+\.webex\.com)\/\S+/u', ($it['hangoutLink'] ?? '') . ' ' . ($it['description'] ?? ''), $m)) {
        $url = mb_substr($m[0], 0, 500);
    }

    if ($local) {
        db()->prepare('UPDATE events SET company_id = ?, title = ?, event_date = ?, event_time = ?, place = ?, online_url = IF(? = \'\', online_url, ?), google_etag = ? WHERE id = ? AND user_id = ?')
            ->execute([$companyId ?? $local['company_id'], $title, $date, $time, $place, $url, $url, $it['etag'] ?? '', $local['id'], $uid]);
        $id = (int) $local['id'];
    } else {
        db()->prepare('INSERT INTO events (user_id, company_id, type, title, event_date, event_time, place, online_url, google_event_id, google_etag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$uid, $companyId, guess_event_type($summary), $title, $date, $time, $place, $url, $gid, $it['etag'] ?? '']);
        $id = (int) db()->lastInsertId();
    }
    rebuild_auto_reminders($uid, 'event', $id);
}

/** 変更通知（events.watch）を申し込む。https の本番だけ */
function google_watch(array &$acct): void
{
    if (!str_starts_with(app_url(), 'https://')) {
        return;
    }
    $channelId = bin2hex(random_bytes(16));
    [$st, $res] = google_api($acct, 'POST', '/calendars/' . rawurlencode($acct['calendar_id']) . '/events/watch', [], [
        'id' => $channelId,
        'type' => 'web_hook',
        'address' => app_url() . '/google/webhook',
        'token' => sign('watch:' . $channelId),
        'params' => ['ttl' => '604800'],
    ]);
    if ($st !== 200) {
        error_log('google watch failed: ' . $st);
        return;
    }
    $exp = isset($res['expiration']) ? date('Y-m-d H:i:s', (int) ($res['expiration'] / 1000)) : date('Y-m-d H:i:s', time() + 7 * 86400);
    $creds = $acct['creds'];
    $creds['resource_id'] = $res['resourceId'] ?? null;
    $acct['creds'] = $creds;
    google_save_creds($acct, $creds);
    db()->prepare('UPDATE calendar_accounts SET channel_id = ?, channel_expires_at = ? WHERE id = ?')->execute([$channelId, $exp, $acct['id']]);
    $acct['channel_id'] = $channelId;
    $acct['channel_expires_at'] = $exp;
}

function google_stop_watch(array &$acct): void
{
    if (!$acct['channel_id'] || empty($acct['creds']['resource_id'])) {
        return;
    }
    google_api($acct, 'POST', '/channels/stop', [], ['id' => $acct['channel_id'], 'resourceId' => $acct['creds']['resource_id']]);
    db()->prepare('UPDATE calendar_accounts SET channel_id = NULL, channel_expires_at = NULL WHERE id = ?')->execute([$acct['id']]);
}

/** 変更通知を受け取ったとき */
function google_handle_webhook(string $channelId, string $token, string $state): void
{
    if ($channelId === '' || !hash_equals(sign('watch:' . $channelId), $token)) {
        return;
    }
    $stmt = db()->prepare("SELECT user_id FROM calendar_accounts WHERE channel_id = ? AND provider = 'google'");
    $stmt->execute([$channelId]);
    $uid = $stmt->fetchColumn();
    if ($uid === false || $state === 'sync') {
        return;
    }
    $acct = google_account((int) $uid);
    if ($acct) {
        google_pull($acct);
    }
}

/** 連携を解除（トークンを削除。カレンダー上の予定は消さない） */
function google_disconnect(int $uid): void
{
    $acct = google_account($uid);
    if (!$acct) {
        return;
    }
    try {
        google_stop_watch($acct);
        $token = $acct['creds']['refresh_token'] ?? $acct['creds']['access_token'] ?? null;
        if ($token) {
            google_http('POST', 'https://oauth2.googleapis.com/revoke', null, ['token' => $token]);
        }
    } catch (Throwable $e) {
        error_log('google disconnect: ' . $e->getMessage());
    }
    db()->prepare("DELETE FROM calendar_accounts WHERE user_id = ? AND provider = 'google'")->execute([$uid]);
    db()->prepare('UPDATE events SET google_event_id = NULL, google_etag = NULL, updated_at = updated_at WHERE user_id = ?')->execute([$uid]);
}

/** 1人分の同期（送り残しを送る → 差分を取り込む → 変更通知の更新） */
function google_sync_user(int $uid): bool
{
    $acct = google_account($uid);
    if (!$acct || $acct['calendar_id'] === '') {
        return false;
    }
    google_push_pending($acct);
    $ok = google_pull($acct);
    if (!$acct['channel_expires_at'] || strtotime((string) $acct['channel_expires_at']) < time() + 86400) {
        google_stop_watch($acct);
        google_watch($acct);
    }
    return $ok;
}

/** cron（5分ごと）の本体 */
function run_calendar_cron(): int
{
    if (!google_configured()) {
        return 0;
    }
    $n = 0;
    $ids = db()->query("SELECT a.user_id FROM calendar_accounts a JOIN users u ON u.id = a.user_id AND u.status = 'active' WHERE a.provider = 'google'")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $uid) {
        try {
            google_sync_user((int) $uid) && $n++;
        } catch (Throwable $e) {
            error_log('calendar cron user ' . $uid . ': ' . $e->getMessage());
        }
    }
    return $n;
}
