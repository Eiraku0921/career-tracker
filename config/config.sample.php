<?php
/**
 * 設定ファイルのひな形。
 * このファイルを「config.php」という名前でコピーして、中身を書き換えてください。
 * config.php にはパスワードが入るので、GitHub などには上げないでください。
 */
return [
    // サイトのURL（最後の / は付けない）
    // パソコンで開発中: http://localhost:8000
    // 本番: https://haruharu.tech
    'app_url' => 'http://localhost:8000',

    // true にするとエラー内容を画面に表示し、環境チェック画面（/check）も開けます。
    // 本番では必ず false にしてください。
    'debug' => true,

    'db' => [
        // XAMPP の初期設定: host=127.0.0.1, user=root, pass=空
        // ロリポップ: 管理画面「サーバーの管理・設定 → データベース」に出ている値
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'haruharu',
        'user' => 'root',
        'pass' => '',
    ],
];
