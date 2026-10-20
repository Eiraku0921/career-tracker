<?php
declare(strict_types=1);

/** エラーページ（403・404 など）。受け取る変数：$status, $title, $message */
?>
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= h($title) ?>｜就活日和</title>
<meta name="theme-color" content="#3a7bd5">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="stylesheet" href="/assets/app.css">
</head>
<body>
<div class="g-wrap">
  <div class="g-top"><a class="logo" href="/" style="color:var(--fg);text-decoration:none"><svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22.4" fill="#3a7bd5"/><path d="M30 62A20 20 0 0 1 70 62Z" fill="#ffd66b"/><rect x="22" y="68" width="56" height="8" rx="4" fill="#fff" fill-opacity=".6"/></svg>就活日和</a></div>
  <div class="login" style="text-align:center">
    <p class="label mono" style="margin:0"><?= (int) $status ?></p>
    <h1><?= h($title) ?></h1>
    <p class="hint" style="margin:0"><?= h($message) ?></p>
    <a class="btn primary" href="/" style="text-decoration:none;display:grid;place-items:center">ホームに戻る</a>
  </div>
</div>
</body>
</html>
