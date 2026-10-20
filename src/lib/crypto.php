<?php
declare(strict_types=1);

/**
 * 暗号化（Google のトークンの保存用）と署名。
 * 鍵は config/keys.php の app_key（32バイトを base64 にしたもの）。
 * libsodium があればそれを使い、なければ OpenSSL（AES-256-GCM）を使う。
 */

function app_key(): string
{
    $key = base64_decode((string) config('app_key', ''), true);
    if ($key === false || strlen($key) !== 32) {
        throw new RuntimeException('暗号化キー（app_key）がありません。php bin/setup-keys.php を実行してください。');
    }
    return $key;
}

function encrypt_text(string $plain): string
{
    $key = app_key();
    if (function_exists('sodium_crypto_secretbox')) {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return 's1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $key));
    }
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return 'o1:' . base64_encode($iv . $tag . $cipher);
}

function decrypt_text(string $stored): ?string
{
    $key = app_key();
    $raw = base64_decode(substr($stored, 3), true);
    if ($raw === false) {
        return null;
    }
    if (str_starts_with($stored, 's1:') && function_exists('sodium_crypto_secretbox_open')) {
        $n = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
        $plain = sodium_crypto_secretbox_open(substr($raw, $n), substr($raw, 0, $n), $key);
        return $plain === false ? null : $plain;
    }
    if (str_starts_with($stored, 'o1:')) {
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? null : $plain;
    }
    return null;
}

/** 改ざん防止の署名（通知の「完了にする」ボタンなどで使う） */
function sign(string $data): string
{
    return rtrim(strtr(base64_encode(hash_hmac('sha256', $data, app_key(), true)), '+/', '-_'), '=');
}
