#!/usr/local/php/8.2/bin/php
<?php
declare(strict_types=1);

/**
 * 鍵ファイル config/keys.php を作る（すでにあれば何もしない）。
 *   php bin/setup-keys.php
 * - VAPID 鍵（プッシュ通知の送り主の証明）
 * - app_key（Google のトークンの暗号化・通知ボタンの署名）
 * - Google の client_id / client_secret は、Google Cloud で作ったあとに自分で書き込む
 * 鍵の中身は画面に表示しない。config/keys.php は共有・コミットしない（.gitignore 済み）。
 * 本番にも同じ config/keys.php をアップロードする（鍵を変えると、登録済みの通知が届かなくなる）。
 */

if (PHP_SAPI !== 'cli') {
    exit("コマンドで実行してください\n");
}
require __DIR__ . '/../vendor/autoload.php';

$file = __DIR__ . '/../config/keys.php';
if (is_file($file)) {
    echo "config/keys.php はすでにあります（作り直す場合は、ファイルを消してから実行してください）\n";
    exit(0);
}

try {
    try {
        $vapid = Minishlink\WebPush\VAPID::createVapidKeys();
    } catch (Throwable $first) {
        // Windows の PHP は openssl.cnf が無いと鍵を作れないので、最小の設定ファイルを用意してやり直す
        $cnf = sys_get_temp_dir() . '/haruharu-openssl.cnf';
        file_put_contents($cnf, "[req]\ndistinguished_name = dn\n[dn]\n");
        putenv('OPENSSL_CONF=' . $cnf);
        try {
            $vapid = Minishlink\WebPush\VAPID::createVapidKeys();
        } catch (Throwable $second) {
            // それでも作れないとき（PHP の OpenSSL が不完全）は Node.js で作る
            $js = "const c=require('crypto').createECDH('prime256v1');c.generateKeys();"
                . "const b=x=>x.toString('base64').replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');"
                . "console.log(JSON.stringify({publicKey:b(c.getPublicKey()),privateKey:b(c.getPrivateKey())}))";
            $out = shell_exec('node -e ' . escapeshellarg($js));
            $vapid = json_decode((string) $out, true);
            if (!is_array($vapid) || empty($vapid['publicKey'])) {
                throw $second;
            }
        }
        @unlink($cnf);
    }
} catch (Throwable $e) {
    fwrite(STDERR, "VAPID 鍵を作れませんでした（OpenSSL の設定を確認してください）: {$e->getMessage()}\n");
    exit(1);
}
$appKey = base64_encode(random_bytes(32));

$php = <<<PHP
<?php
/**
 * 鍵ファイル（bin/setup-keys.php が作成）。共有・コミットしない。
 * 本番（ロリポップ）にも同じファイルをアップロードする。
 */
return [
    // 暗号化・署名用のキー（変えると Google 連携をやり直す必要がある）
    'app_key' => '{$appKey}',

    // プッシュ通知（Web Push / VAPID）。変えると、登録済みの端末に通知が届かなくなる
    'vapid' => [
        'subject' => 'https://haruharu.tech',
        'public' => '{$vapid['publicKey']}',
        'private' => '{$vapid['privateKey']}',
    ],

    // Googleカレンダー連携。Google Cloud Console で「OAuth クライアント ID（ウェブアプリケーション）」を作って書き込む
    // 承認済みのリダイレクト URI： https://haruharu.tech/google/callback と http://localhost:8000/google/callback
    'google' => [
        'client_id' => '',
        'client_secret' => '',
    ],
];

PHP;
file_put_contents($file, $php);
@chmod($file, 0600);
echo "config/keys.php を作りました（VAPID 鍵・暗号化キー）\n";
