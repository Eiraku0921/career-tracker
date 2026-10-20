<?php
declare(strict_types=1);

/**
 * デモ画面（未ログイン）のサンプルデータ。プロトタイプの SAMPLE と同じ内容。
 * 日付は「今日」からの相対で作る。デモ中の変更はブラウザのメモリ上だけで、サーバーには保存しない。
 */
function demo_state(): array
{
    $d = fn (int $n): string => date('Y-m-d', strtotime(($n >= 0 ? '+' : '') . $n . ' days'));
    $ratings = [
        'c1' => ['work' => 5, 'pay' => 4, 'place' => 3, 'style' => 4], 'c2' => ['work' => 3, 'pay' => 5, 'place' => 4, 'style' => 2],
        'c3' => ['work' => 4, 'pay' => 3, 'place' => 5, 'style' => 4], 'c4' => ['work' => 2, 'pay' => 4, 'place' => 5, 'style' => 3],
        'c5' => ['work' => 4, 'pay' => 4, 'place' => 2, 'style' => 3], 'c6' => ['work' => 5, 'pay' => 2, 'place' => 3],
        'c7' => ['work' => 3, 'pay' => 4, 'place' => 4, 'style' => 5], 'c8' => ['work' => 4, 'pay' => 3, 'place' => 3, 'style' => 3],
        'c9' => ['work' => 3, 'pay' => 3, 'place' => 5, 'style' => 3],
    ];
    $c = fn ($id, $name, $industry, $stage, $pref, $mypage, $memo) => [
        'id' => $id, 'name' => $name, 'industry' => $industry, 'stage' => $stage, 'pref' => $pref,
        'url' => '', 'mypage' => $mypage, 'memo' => $memo, 'ratings' => (object) ($ratings[$id] ?? []),
    ];
    $e = fn ($id, $cid, $type, $date, $time, $title, $place = '', $url = '', $items = '') => [
        'id' => $id, 'cid' => $cid, 'type' => $type, 'date' => $date, 'time' => $time, 'title' => $title,
        'place' => $place, 'url' => $url, 'items' => $items, 'auto' => true, 'reminders' => [],
    ];
    $t = fn ($id, $cid, $title, $due, $done, $rem = []) => [
        'id' => $id, 'cid' => $cid, 'title' => $title, 'due' => $due, 'done' => $done, 'auto' => true, 'reminders' => $rem,
    ];

    return [
        'demo' => true,
        'me' => null,
        'isAdmin' => false,
        'companies' => [
            $c('c1', 'あまぐも銀行', '金融', 'int2', 5, 'ID: shukatsu2028', '逆質問：配属の決まり方を聞く'),
            $c('c2', 'にじいろ商事', '商社', 'es', 4, '', 'ガクチカは留学の話で'),
            $c('c3', 'ひだまりフーズ', '食品メーカー', 'int1', 3, '', ''),
            $c('c4', 'はれまシステムズ', 'IT・ソフトウェア', 'entry', 3, '', ''),
            $c('c5', 'そよかぜモビリティ', '自動車', 'final', 4, '', '最終は役員面接。志望動機を深掘りされる'),
            $c('c6', 'ほしぞら出版', '出版・メディア', 'interest', 2, '', ''),
            $c('c7', 'あさやけ電機', '電機メーカー', 'offer', 4, '', '承諾期限 ' . date('n/j', strtotime('+20 days'))),
            $c('c8', 'かみなり広告', '広告', 'out', 3, '', '二次で見送り'),
            $c('c9', 'こはるホールディングス', '不動産', 'es', 3, '', ''),
        ],
        'events' => [
            $e('e1', 'c2', 'ES締切', $d(1), '23:59', '本選考ES提出'),
            $e('e2', 'c1', '面接', $d(2), '14:00', '二次面接（オンライン）', 'オンライン（Zoom）', 'https://zoom.us/j/1234567890', 'ESの控え、メモ帳、充電器'),
            $e('e3', 'c3', '面接', $d(4), '10:30', '一次面接（本社）', 'ひだまりフーズ本社 3F 受付', '', '履歴書、筆記用具、学生証'),
            $e('e4', 'c9', 'Webテスト', $d(3), '', 'SPI受検期限'),
            $e('e5', 'c5', '面接', $d(8), '15:00', '最終面接'),
            $e('e6', 'c4', '説明会', $d(6), '13:00', 'オンライン会社説明会'),
            $e('e7', 'c7', 'その他', $d(20), '', '内定承諾の回答期限'),
            $e('e8', 'c6', 'インターン', $d(12), '10:00', '1dayインターン'),
            $e('e9', 'c1', '面接', $d(-5), '11:00', '一次面接（オンライン）'),
            $e('e10', 'c8', '面接', $d(-9), '16:00', '二次面接'),
            $e('e11', 'c3', '説明会', $d(-12), '13:00', '会社説明会'),
            $e('e12', 'c5', '面接', $d(-2), '10:00', '二次面接（本社）'),
        ],
        'reviews' => [
            ['id' => 'r1', 'cid' => 'c3', 'evid' => 'e11', 'date' => $d(-12), 'feel' => 4, 'asked' => '', 'evals' => []],
            ['id' => 'r2', 'cid' => 'c8', 'evid' => 'e10', 'date' => $d(-9), 'feel' => 2, 'asked' => '学生時代に一番苦労したこと／入社後にやりたい仕事', 'evals' => [['lid' => 'l1', 'score' => 3]]],
            ['id' => 'r3', 'cid' => 'c1', 'evid' => 'e9', 'date' => $d(-5), 'feel' => 3, 'asked' => '挫折経験／チームでの役割／逆質問', 'evals' => [['lid' => 'l1', 'score' => 3], ['lid' => 'l2', 'score' => 3], ['lid' => 'l3', 'score' => 1]]],
        ],
        'lessons' => [
            ['id' => 'l1', 'rid' => 'r1', 'text' => '説明会では質問を1つ以上する'],
            ['id' => 'l2', 'rid' => 'r2', 'text' => '結論から先に話す'],
            ['id' => 'l3', 'rid' => 'r2', 'text' => '志望動機に具体的な事業名を入れる'],
            ['id' => 'l4', 'rid' => 'r3', 'text' => '1つの回答は1分以内にまとめる'],
            ['id' => 'l5', 'rid' => 'r3', 'text' => '逆質問を3つ用意しておく'],
            ['id' => 'l6', 'rid' => 'r3', 'text' => '質問を最後まで聞いてから答える'],
        ],
        'tasks' => [
            $t('t1', 'c2', 'ESの下書きを仕上げる', $d(0), null),
            $t('t2', 'c1', '二次面接の逆質問を3つ考える', $d(1), null, [$d(1) . 'T12:00']),
            $t('t3', '', '証明写真を撮り直す', $d(-1), null),
            $t('t4', 'c9', 'SPIの非言語を復習する', $d(2), null),
            $t('t5', 'c5', '中期経営計画を読んでおく', $d(6), null),
            $t('t6', '', '成績証明書を発行する', '', null),
            $t('t7', 'c3', '店舗で商品を見ておく', $d(-2), $d(-2)),
            $t('t8', '', 'スーツをクリーニングに出す', $d(-3), $d(-3)),
        ],
        'notifs' => [
            ['id' => 'nw', 'kind' => 'welcome', 'link' => '/about', 'title' => '就活日和へようこそ', 'body' => 'できることと使い方を、絵つきで紹介しています。タップすると説明が見られます', 'at' => $d(0) . 'T07:00', 'read' => false],
            ['id' => 'n0', 'kind' => 'prep', 'link' => '/?prep=e2', 'title' => 'あさって 14:00 面接があります', 'body' => 'あまぐも銀行｜二次面接（オンライン）。面接前カードで準備しましょう', 'at' => $d(0) . 'T09:00', 'read' => false],
            ['id' => 'n1', 'kind' => 'task', 'link' => '/tasks?task=t1', 'title' => 'タスクの期限が近づいています', 'body' => 'にじいろ商事｜ESの下書きを仕上げる（今日まで）', 'at' => $d(0) . 'T08:00', 'read' => false],
            ['id' => 'n2', 'kind' => 'review', 'link' => '/?review=e12', 'title' => 'ふりかえりを書きましょう', 'body' => 'そよかぜモビリティ｜二次面接（本社）はどうでしたか？', 'at' => $d(-1) . 'T20:00', 'read' => false],
            ['id' => 'n3', 'kind' => 'task', 'link' => '/tasks?task=t3', 'title' => 'タスクの期限が近づいています', 'body' => '証明写真を撮り直す（明日まで）', 'at' => $d(-2) . 'T20:00', 'read' => true],
        ],
        'axes' => [
            ['id' => 'pref', 'name' => '志望度', 'w' => 5], ['id' => 'work', 'name' => 'やりたいこと', 'w' => 5],
            ['id' => 'pay', 'name' => '給与', 'w' => 3], ['id' => 'place', 'name' => '勤務地', 'w' => 3], ['id' => 'style', 'name' => '働き方', 'w' => 2],
        ],
        'settings' => ['taskRem' => DEFAULT_TASK_REMINDERS, 'eventRem' => DEFAULT_EVENT_REMINDERS],
        'companyView' => null,
        'scheduleView' => null,
        'installDone' => false,
        'installDismissed' => true,
        'google' => ['configured' => false, 'connected' => false, 'lastSynced' => null],
    ];
}
