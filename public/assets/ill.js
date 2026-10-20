/* 説明ページ・アイコン化ページの絵（docs/prototype.html の SVG をそのまま移植）。色はテーマの CSS 変数を使う */
'use strict';
const IL={
 hero:`<svg class="ill" viewBox="0 0 320 300" role="img" aria-label="スマホの画面に、選考の進み具合と今日のタスクが表示されている絵">
  <rect x="90" y="10" width="140" height="280" rx="24" fill="var(--surface)" stroke="var(--fg)" stroke-width="3"/>
  <rect x="140" y="20" width="40" height="6" rx="3" fill="var(--line)"/>
  <text x="104" y="52" font-size="11" font-weight="700" fill="var(--fg)">選考の進捗</text>
  <rect x="104" y="60" width="44" height="8" rx="4" fill="var(--accent)" fill-opacity=".3"/><rect x="150" y="60" width="28" height="8" rx="4" fill="var(--accent)" fill-opacity=".55"/><rect x="180" y="60" width="20" height="8" rx="4" fill="var(--accent)"/><rect x="202" y="60" width="14" height="8" rx="4" fill="var(--gold)"/>
  <rect x="104" y="84" width="112" height="70" rx="10" fill="var(--accent-soft)"/>
  <text x="114" y="102" font-size="9" font-weight="700" fill="var(--accent)">いま意識すること</text>
  <rect x="114" y="110" width="82" height="7" rx="3.5" fill="var(--accent)" fill-opacity=".8"/>
  <rect x="114" y="124" width="92" height="5" rx="2.5" fill="var(--line)"/><rect x="114" y="124" width="50" height="5" rx="2.5" fill="var(--accent)"/>
  <rect x="114" y="138" width="70" height="7" rx="3.5" fill="var(--accent)" fill-opacity=".5"/>
  <text x="104" y="176" font-size="10" font-weight="700" fill="var(--fg)">今日までのやること</text>
  <rect x="104" y="186" width="12" height="12" rx="3" fill="var(--ok)"/><path d="M107 192l2.5 2.5 4-5" stroke="var(--surface)" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="122" y="188" width="70" height="7" rx="3.5" fill="var(--line)"/>
  <rect x="104" y="206" width="12" height="12" rx="3" fill="none" stroke="var(--line)" stroke-width="2"/><rect x="122" y="208" width="84" height="7" rx="3.5" fill="var(--muted)" fill-opacity=".5"/>
  <rect x="104" y="226" width="12" height="12" rx="3" fill="none" stroke="var(--line)" stroke-width="2"/><rect x="122" y="228" width="60" height="7" rx="3.5" fill="var(--muted)" fill-opacity=".5"/>
  <rect x="100" y="256" width="120" height="22" rx="8" fill="var(--bg)"/>
  <circle cx="120" cy="267" r="4" fill="var(--accent)"/><circle cx="145" cy="267" r="4" fill="var(--line)"/><circle cx="170" cy="267" r="4" fill="var(--line)"/><circle cx="195" cy="267" r="4" fill="var(--line)"/>
  <g transform="translate(222 70)"><rect width="88" height="46" rx="12" fill="var(--surface)" stroke="var(--line)"/><rect x="10" y="10" width="26" height="26" rx="7" fill="var(--sky,#3a7bd5)"/><path d="M15 28h16M18 28a5 5 0 0 1 10 0" stroke="var(--sun,#ffd66b)" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="42" y="14" width="38" height="6" rx="3" fill="var(--fg)" fill-opacity=".7"/><rect x="42" y="26" width="30" height="5" rx="2.5" fill="var(--muted)" fill-opacity=".6"/></g>
  <g transform="translate(10 180)"><rect width="74" height="60" rx="12" fill="var(--surface)" stroke="var(--line)"/><text x="12" y="22" font-size="9" fill="var(--muted)">課題</text><rect x="12" y="30" width="50" height="6" rx="3" fill="var(--line)"/><rect x="12" y="30" width="38" height="6" rx="3" fill="var(--accent)"/><text x="12" y="50" font-size="10" font-weight="700" fill="var(--accent)">75%</text></g>
 </svg>`,
 progress:`<svg class="ill" viewBox="0 0 320 200" role="img" aria-label="企業のカードが、気になるから内定へと右に進んでいく絵">
  <g font-size="10" fill="var(--muted)"><text x="14" y="24">気になる</text><text x="84" y="24">書類</text><text x="150" y="24">面接</text><text x="226" y="24" fill="var(--gold)" font-weight="700">内定</text></g>
  <rect x="10" y="32" width="66" height="10" rx="5" fill="var(--accent)" fill-opacity=".2"/><rect x="80" y="32" width="62" height="10" rx="5" fill="var(--accent)" fill-opacity=".5"/><rect x="146" y="32" width="74" height="10" rx="5" fill="var(--accent)"/><rect x="224" y="32" width="86" height="10" rx="5" fill="var(--gold)"/>
  <g><rect x="14" y="64" width="58" height="34" rx="8" fill="var(--surface)" stroke="var(--line)"/><rect x="22" y="73" width="36" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><rect x="22" y="85" width="26" height="5" rx="2.5" fill="var(--line)"/></g>
  <g><rect x="14" y="108" width="58" height="34" rx="8" fill="var(--surface)" stroke="var(--line)"/><rect x="22" y="117" width="30" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><rect x="22" y="129" width="34" height="5" rx="2.5" fill="var(--line)"/></g>
  <g><rect x="82" y="64" width="58" height="34" rx="8" fill="var(--surface)" stroke="var(--line)"/><rect x="90" y="73" width="40" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><rect x="90" y="85" width="22" height="5" rx="2.5" fill="var(--line)"/></g>
  <g><rect x="152" y="64" width="62" height="34" rx="8" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/><rect x="160" y="73" width="38" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><rect x="160" y="85" width="28" height="5" rx="2.5" fill="var(--accent)" fill-opacity=".5"/></g>
  <g><rect x="236" y="64" width="62" height="34" rx="8" fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="2"/><rect x="244" y="73" width="36" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><path d="M276 87l4 4 8-8" stroke="var(--gold)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  <path d="M112 128 C150 160 200 160 250 112" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-dasharray="5 5"/><path d="M244 112l8-2-2 8" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="112" y="186" font-size="11" fill="var(--muted)">ドラッグで次の段階へ</text>
 </svg>`,
 schedule:`<svg class="ill" viewBox="0 0 320 200" role="img" aria-label="カレンダーの面接の日に、スマホへ通知のバナーが届いている絵">
  <rect x="10" y="14" width="200" height="170" rx="14" fill="var(--surface)" stroke="var(--line)"/>
  <text x="24" y="38" font-size="12" font-weight="700" fill="var(--fg)">10月</text>
  <g fill="var(--bg)">${Array.from({length:20},(_,i)=>`<rect x="${24+(i%5)*36}" y="${52+Math.floor(i/5)*30}" width="30" height="24" rx="6"/>`).join('')}</g>
  <rect x="96" y="82" width="30" height="24" rx="6" fill="var(--accent)"/><text x="111" y="98" font-size="10" font-weight="700" fill="var(--accent-ink)" text-anchor="middle">面接</text>
  <rect x="168" y="112" width="30" height="24" rx="6" fill="var(--warn-soft)"/><rect x="174" y="122" width="18" height="4" rx="2" fill="var(--warn)"/>
  <rect x="60" y="142" width="30" height="24" rx="6" fill="var(--ok-soft)"/><rect x="66" y="152" width="18" height="4" rx="2" fill="var(--ok)"/>
  <g transform="translate(176 54)"><rect width="134" height="112" rx="18" fill="var(--surface)" stroke="var(--fg)" stroke-width="2.5"/>
   <rect x="10" y="16" width="114" height="44" rx="10" fill="var(--bg)"/><rect x="18" y="24" width="22" height="22" rx="6" fill="var(--sky,#3a7bd5)"/><path d="M22 41h14M25 41a4 4 0 0 1 8 0" stroke="var(--sun,#ffd66b)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
   <text x="46" y="34" font-size="9" font-weight="700" fill="var(--fg)">明日 14:00 面接</text><text x="46" y="48" font-size="8" fill="var(--muted)">はれまシステムズ</text>
   <rect x="10" y="70" width="114" height="10" rx="5" fill="var(--line)"/><rect x="10" y="88" width="80" height="10" rx="5" fill="var(--line)"/></g>
  <path d="M168 50 l8 -8 M174 60 l10 -4" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round"/>
 </svg>`,
 review:`<svg class="ill" viewBox="0 0 320 210" role="img" aria-label="前回の課題をできたと評価すると、メーターが上がり身についたへ移る絵">
  <rect x="10" y="14" width="190" height="112" rx="14" fill="var(--surface)" stroke="var(--line)"/>
  <text x="24" y="38" font-size="10" fill="var(--muted)">前回の課題</text>
  <text x="24" y="58" font-size="13" font-weight="700" fill="var(--fg)">結論から先に話す</text>
  <g font-size="9" text-anchor="middle">
   <rect x="24" y="74" width="38" height="34" rx="7" fill="var(--bg)"/><text x="43" y="95" fill="var(--muted)">できず</text>
   <rect x="66" y="74" width="38" height="34" rx="7" fill="var(--bg)"/><text x="85" y="95" fill="var(--muted)">少し</text>
   <rect x="108" y="74" width="38" height="34" rx="7" fill="var(--bg)"/><text x="127" y="95" fill="var(--muted)">だいたい</text>
   <rect x="150" y="74" width="38" height="34" rx="7" fill="var(--accent)"/><text x="169" y="95" fill="var(--accent-ink)" font-weight="700">できた</text>
  </g>
  <path d="M206 70 h22" stroke="var(--accent)" stroke-width="2.5"/><path d="M222 64l7 6-7 6" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="236" y="14" width="74" height="112" rx="14" fill="var(--surface)" stroke="var(--line)"/>
  <rect x="262" y="30" width="22" height="80" rx="11" fill="var(--line)"/><rect x="262" y="50" width="22" height="60" rx="11" fill="var(--accent)"/>
  <text x="273" y="44" font-size="10" font-weight="700" fill="var(--accent)" text-anchor="middle">+50%</text>
  <rect x="10" y="146" width="300" height="52" rx="14" fill="var(--ok-soft)"/>
  <circle cx="38" cy="172" r="14" fill="var(--ok)"/><path d="M31 172l5 5 9-10" stroke="var(--surface)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="62" y="168" font-size="12" font-weight="700" fill="var(--ok)">100%で「身についたこと」へ</text>
  <text x="62" y="184" font-size="10" fill="var(--muted)">「できた」2回で1つ身につきます</text>
 </svg>`,
 sync:`<svg class="ill" viewBox="0 0 320 170" role="img" aria-label="就活日和とGoogleカレンダーとiPhoneのカレンダーが、矢印でつながって同期している絵">
  <g><rect x="10" y="50" width="86" height="70" rx="14" fill="var(--surface)" stroke="var(--line)"/><rect x="34" y="62" width="38" height="34" rx="6" fill="var(--bg)" stroke="var(--line)"/><rect x="34" y="62" width="38" height="9" rx="4" fill="var(--bad)" fill-opacity=".7"/><text x="53" y="90" font-size="12" font-weight="700" fill="var(--fg)" text-anchor="middle">12</text><text x="53" y="112" font-size="9" fill="var(--muted)" text-anchor="middle">Google</text></g>
  <g><rect x="117" y="34" width="86" height="102" rx="16" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><rect x="141" y="50" width="38" height="38" rx="10" fill="var(--sky,#3a7bd5)"/><path d="M148 78h24M152 78a8 8 0 0 1 16 0" stroke="var(--sun,#ffd66b)" stroke-width="4" fill="none" stroke-linecap="round"/><text x="160" y="110" font-size="10" font-weight="700" fill="var(--accent)" text-anchor="middle">就活日和</text></g>
  <g><rect x="224" y="50" width="86" height="70" rx="14" fill="var(--surface)" stroke="var(--line)"/><rect x="254" y="58" width="26" height="44" rx="6" fill="none" stroke="var(--fg)" stroke-width="2"/><rect x="259" y="66" width="16" height="4" rx="2" fill="var(--bad)" fill-opacity=".7"/><rect x="259" y="74" width="16" height="10" rx="2" fill="var(--line)"/><text x="267" y="112" font-size="9" fill="var(--muted)" text-anchor="middle">iPhone</text></g>
  <g stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M100 78h12M107 73l5 5-5 5"/><path d="M114 94h-12M107 89l-5 5 5 5"/><path d="M207 78h12M214 73l5 5-5 5"/><path d="M221 94h-12M214 89l-5 5 5 5"/></g>
  <text x="160" y="160" font-size="11" fill="var(--muted)" text-anchor="middle">どこで予定を入れても、3か所にそろう</text>
 </svg>`
};

function phoneIll(kind){
  // 説明用のスマホの一部分の絵。hl = 強調する場所
  const hl='var(--accent)';
  const appIcon=(x,y,s)=>`<g transform="translate(${x} ${y}) scale(${s/100})"><rect width="100" height="100" rx="22.4" fill="#3a7bd5"/><g transform="translate(50 52.5) scale(1.4) translate(-50 -52.5)"><path d="M30 62A20 20 0 0 1 70 62Z" fill="#ffd66b"/><g stroke="#ffd66b" stroke-width="5" stroke-linecap="round"><path d="M50 36V30M62.5 40.3L65.5 35.2M37.5 40.3L34.5 35.2"/></g><rect x="22" y="68" width="56" height="8" rx="4" fill="#fff" fill-opacity=".6"/></g></g>`;
  const frame=inner=>`<svg class="ill" viewBox="0 0 220 150" role="img" aria-hidden="true"><rect x="0.5" y="0.5" width="219" height="149" rx="16" fill="var(--bg)" stroke="var(--line)"/>${inner}</svg>`;
  const I={
   'ios-open':frame(`<rect x="20" y="18" width="180" height="26" rx="13" fill="var(--surface)" stroke="var(--line)"/><text x="110" y="35" font-size="11" fill="var(--fg)" text-anchor="middle">haruharu.tech</text><rect x="20" y="58" width="180" height="74" rx="10" fill="var(--surface)"/>${appIcon(34,72,30)}<rect x="74" y="78" width="80" height="8" rx="4" fill="var(--fg)" fill-opacity=".6"/><rect x="74" y="92" width="100" height="6" rx="3" fill="var(--line)"/><text x="110" y="124" font-size="9" fill="var(--muted)" text-anchor="middle">Safariで開く</text>`),
   'ios-share':frame(`<rect x="0" y="96" width="220" height="54" rx="0" fill="var(--surface)"/><path d="M0 96H220" stroke="var(--line)"/><g fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"><path d="M26 124l-6-6 6-6"/><path d="M58 112l6 6-6 6"/></g><circle cx="110" cy="122" r="20" fill="none" stroke="${hl}" stroke-width="3"/><g fill="none" stroke="${hl}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M103 118v12h14v-12"/><path d="M110 126v-16M105 114l5-5 5 5"/></g><g fill="none" stroke="var(--muted)" stroke-width="2"><path d="M150 114h12v14h-12z"/><rect x="186" y="114" width="12" height="12" rx="2"/></g><text x="110" y="40" font-size="12" font-weight="700" fill="var(--fg)" text-anchor="middle">共有ボタンをタップ</text><text x="110" y="60" font-size="9.5" fill="var(--muted)" text-anchor="middle">見つからないときは「…」→「共有」</text>`),
   'ios-add':frame(`<rect x="16" y="14" width="188" height="122" rx="12" fill="var(--surface)"/><g font-size="11" fill="var(--fg)"><text x="32" y="38">コピー</text><text x="32" y="62">ブックマークを追加</text><text x="32" y="114">ページを検索</text></g><path d="M24 46H196M24 70H196M24 98H196" stroke="var(--line)"/><rect x="22" y="73" width="176" height="24" rx="6" fill="var(--accent-soft)" stroke="${hl}" stroke-width="2"/><text x="32" y="89" font-size="11" font-weight="700" fill="${hl}">ホーム画面に追加</text><g transform="translate(176 78)" fill="none" stroke="${hl}" stroke-width="1.8"><rect width="14" height="14" rx="3"/><path d="M7 4v6M4 7h6"/></g>`),
   'ios-confirm':frame(`<rect x="16" y="14" width="188" height="122" rx="12" fill="var(--surface)"/><text x="30" y="36" font-size="11" fill="var(--muted)">キャンセル</text><rect x="164" y="22" width="34" height="20" rx="6" fill="var(--accent-soft)" stroke="${hl}" stroke-width="2"/><text x="181" y="36" font-size="11" font-weight="700" fill="${hl}" text-anchor="middle">追加</text><path d="M24 50H196" stroke="var(--line)"/>${appIcon(32,62,40)}<text x="82" y="80" font-size="12" font-weight="700" fill="var(--fg)">就活日和</text><text x="82" y="96" font-size="9" fill="var(--muted)">haruharu.tech</text>`),
   'and-menu':frame(`<rect x="0" y="0" width="220" height="44" rx="16" fill="var(--surface)"/><rect x="14" y="10" width="150" height="24" rx="12" fill="var(--bg)"/><text x="89" y="26" font-size="10.5" fill="var(--fg)" text-anchor="middle">haruharu.tech</text><circle cx="196" cy="22" r="15" fill="none" stroke="${hl}" stroke-width="3"/><g fill="${hl}"><circle cx="196" cy="15" r="2.2"/><circle cx="196" cy="22" r="2.2"/><circle cx="196" cy="29" r="2.2"/></g><text x="110" y="86" font-size="12" font-weight="700" fill="var(--fg)" text-anchor="middle">右上の︙をタップ</text><text x="110" y="106" font-size="9.5" fill="var(--muted)" text-anchor="middle">Chromeで開いてください</text>`),
   'and-add':frame(`<rect x="70" y="10" width="140" height="130" rx="10" fill="var(--surface)" stroke="var(--line)"/><g font-size="10.5" fill="var(--fg)"><text x="84" y="34">新しいタブ</text><text x="84" y="58">履歴</text><text x="84" y="106">共有…</text><text x="84" y="128">設定</text></g><rect x="76" y="68" width="128" height="26" rx="6" fill="var(--accent-soft)" stroke="${hl}" stroke-width="2"/><text x="84" y="85" font-size="10.5" font-weight="700" fill="${hl}">ホーム画面に追加</text><text x="40" y="84" font-size="9" fill="var(--muted)" text-anchor="middle">または</text><text x="40" y="98" font-size="9" fill="var(--muted)" text-anchor="middle">「アプリを</text><text x="40" y="110" font-size="9" fill="var(--muted)" text-anchor="middle">インストール」</text>`),
   'and-confirm':frame(`<rect x="20" y="20" width="180" height="110" rx="14" fill="var(--surface)"/><text x="36" y="44" font-size="12" font-weight="700" fill="var(--fg)">アプリをインストール</text>${appIcon(36,56,32)}<text x="78" y="72" font-size="11" font-weight="700" fill="var(--fg)">就活日和</text><text x="78" y="86" font-size="9" fill="var(--muted)">haruharu.tech</text><text x="80" y="118" font-size="10" fill="var(--muted)" text-anchor="middle">キャンセル</text><rect x="114" y="102" width="78" height="24" rx="12" fill="${hl}"/><text x="153" y="118" font-size="10" font-weight="700" fill="var(--accent-ink)" text-anchor="middle">インストール</text>`),
   'home':frame(`${[0,1,2,3].map(i=>`<rect x="${26+i*46}" y="22" width="30" height="30" rx="8" fill="var(--line)"/>`).join('')}${[0,1,3].map(i=>`<rect x="${26+i*46}" y="70" width="30" height="30" rx="8" fill="var(--line)"/>`).join('')}<circle cx="133" cy="85" r="23" fill="none" stroke="${hl}" stroke-width="2.5" stroke-dasharray="4 3"/>${appIcon(118,70,30)}<text x="133" y="116" font-size="9" fill="var(--fg)" text-anchor="middle">就活日和</text><text x="110" y="138" font-size="9.5" fill="var(--muted)" text-anchor="middle">アイコンから開く</text>`)
  };
  I['and-open']=I['ios-open'].replace('Safariで開く','Chromeで開く');
  return I[kind];
}
