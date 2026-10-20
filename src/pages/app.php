<?php
declare(strict_types=1);

/**
 * 画面の土台（すべての画面で共通の HTML）。PC とスマホは同じ HTML で、CSS の @media (max-width:860px) で切り替える。
 * 中身は public/assets/app.js が描く（プロトタイプ docs/prototype.html から移植）。
 *
 * 受け取る変数：$boot（画面に渡すデータ）
 */

$assetVer = static fn (string $f): string => '/assets/' . $f . '?v=' . (is_file(BASE_DIR . '/public/assets/' . $f) ? filemtime(BASE_DIR . '/public/assets/' . $f) : '0');
$logo = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22.4" fill="#3a7bd5"/><g stroke="#ffd66b" stroke-width="5" stroke-linecap="round"><path d="M50 36V30M62.5 40.3L65.5 35.2M37.5 40.3L34.5 35.2M71.7 49.5L76.8 46.5M28.3 49.5L23.2 46.5"/></g><path d="M30 62A20 20 0 0 1 70 62Z" fill="#ffd66b"/><rect x="22" y="68" width="18" height="8" rx="4" fill="#fff" fill-opacity=".3"/><rect x="42" y="68" width="14" height="8" rx="4" fill="#fff" fill-opacity=".55"/><rect x="58" y="68" width="10" height="8" rx="4" fill="#fff" fill-opacity=".85"/><rect x="70" y="68" width="8" height="8" rx="4" fill="#ffd66b"/></svg>';
$bell = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>';
$ico = [
    'dash' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    'growth' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h16M6 16l4-5 3 3 5-7"/><path d="M15 7h3v3"/></svg>',
    'tasks' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 10l2 2 4-4M8 16h8"/></svg>',
    'companies' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/></svg>',
    'schedule' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    'admin' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    'settings' => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/><circle cx="12" cy="12" r="3.3"/></svg>',
];
$bootJson = json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$htmlClass = $boot['loggedIn'] ? '' : 'demo';
?>
<!doctype html>
<html lang="ja" class="<?= h($htmlClass) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= h($pageTitle ?? '就活日和') ?></title>
<meta name="description" content="就活の予定・タスク・ふりかえりを、ひとつに。選考の進み具合、面接の日程、やること、面接で見つけた課題をスマホひとつで管理できます。">
<meta name="theme-color" content="#3a7bd5">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="就活日和">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="<?= h($assetVer('app.css')) ?>">
</head>
<body>
<div id="guest"></div>
<aside class="side">
  <div class="side-top"><div class="logo"><?= $logo ?>就活日和</div><button class="bell" id="bellS" aria-label="通知"><?= $bell ?><span class="dot" hidden></span></button></div>
  <nav class="snav" aria-label="メニュー">
    <button data-view="dash"><?= $ico['dash'] ?>ホーム</button>
    <button data-view="growth"><?= $ico['growth'] ?>成長記録</button>
    <button data-view="tasks"><?= $ico['tasks'] ?>タスク<span class="cnt" id="tCnt" title="今日までのタスク" hidden></span></button>
    <button data-view="companies"><?= $ico['companies'] ?>企業一覧</button>
    <button data-view="schedule"><?= $ico['schedule'] ?>予定<span class="cnt" id="urCnt" title="未ふりかえり" hidden></span></button>
    <button data-view="admin" id="navAdmin" hidden><?= $ico['admin'] ?>管理</button>
    <button data-view="settings"><?= $ico['settings'] ?>設定</button>
  </nav>
  <div class="sact">
    <span class="label">追加する</span>
    <button class="btn" id="reviewTop">＋ ふりかえりを書く</button>
    <button class="btn primary" id="addCompanyTop">＋ 企業</button>
    <button class="btn" id="addTaskTop">＋ タスク</button>
    <button class="btn" id="addEventTop">＋ 予定</button>
  </div>
  <div class="demo-only side-login"><button class="btn primary" data-gp="login">ログイン</button><button class="btn" data-gp="signup">無料で登録</button><button class="btn side-about" data-gp="about">就活日和ってなに？ ›</button></div>
  <button class="slv lvlink" id="sidelv" data-view="growth" aria-label="成長記録を開く"></button>
</aside>

<div class="shell">
  <header class="mtop">
    <div class="logo"><?= $logo ?>就活日和</div>
    <div class="mright"><button class="bell" data-view="settings" aria-label="設定"><?= $ico['settings'] ?></button><button class="bell" id="bellM" aria-label="通知"><?= $bell ?><span class="dot" hidden></span></button></div>
  </header>
  <div class="demobar" id="demobar" <?= $boot['loggedIn'] ? 'hidden' : '' ?>><p><b>デモ画面</b><span class="t2">です。サンプルのデータで自由に試せます</span>（変更は保存されません）</p><div class="acts"><button class="btn" data-gp="login">ログイン</button><button class="btn primary" data-gp="signup">無料で登録</button></div></div>
  <div class="focusbar" id="focusbar" hidden><button id="focusbtn"></button></div>
  <main id="app"><noscript><p>就活日和を使うには JavaScript を有効にしてください。</p></noscript></main>
</div>

<nav class="bnav" aria-label="メニュー">
  <button data-view="dash"><?= $ico['dash'] ?>ホーム</button>
  <button data-view="growth"><?= $ico['growth'] ?>成長</button>
  <button data-view="tasks"><?= $ico['tasks'] ?>タスク</button>
  <button data-view="companies"><?= $ico['companies'] ?>企業</button>
  <button data-view="schedule"><?= $ico['schedule'] ?>予定</button>
</nav>
<button class="fab" id="fab"><span class="fab-i" aria-hidden="true">＋</span><span class="fab-t" id="fabT">追加</span></button>
<div id="layer"></div>
<div id="layer2"></div>
<script id="boot" type="application/json"><?= $bootJson ?></script>
<script src="<?= h($assetVer('ill.js')) ?>"></script>
<script src="<?= h($assetVer('app.js')) ?>"></script>
</body>
</html>
