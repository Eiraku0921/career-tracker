/* 就活日和 画面の本体（docs/prototype.html から移植）
 * - ログイン中：サーバーの API に保存し、返ってきた最新データで描き直す
 * - 未ログイン：デモ画面。サンプルデータをブラウザのメモリ上だけで動かし、何も保存しない
 */
'use strict';

const STAGES=[
  {id:'interest',name:'気になる'},{id:'entry',name:'エントリー'},{id:'es',name:'書類選考'},
  {id:'int1',name:'一次面接'},{id:'int2',name:'二次面接'},{id:'final',name:'最終面接'},{id:'offer',name:'内定'}
];
const OUT={id:'out',name:'見送り'};
const ALLST=[...STAGES,OUT];
const EVTYPES=['説明会','ES締切','Webテスト','面接','インターン','その他'];
const REVIEWABLE=['面接','説明会','インターン','Webテスト'];
const FEELS=['散々','いまいち','ふつう','まずまず','手応えあり'];
const WD=['日','月','火','水','木','金','土'];
// 前回の課題の評価：選んだ分だけ課題のメーターが上がり、100%で「身についた」へ
const RATES=[{label:'できなかった',pt:0},{label:'少しできた',pt:15},{label:'だいたいできた',pt:30},{label:'できた',pt:50}];
const TASK_TPL=['企業研究','ESの下書き','証明写真を撮る','成績証明書を発行','OB・OG訪問の連絡','面接の練習','お礼メールを送る'];
const DEFAULT_SETTINGS={taskRem:[{d:-1,t:'20:00'},{d:0,t:'21:00'}],eventRem:[{d:-1,t:'20:00'},{m:60}]};
const DAYNAMES={'-3':'3日前','-2':'2日前','-1':'前日','0':'当日'};
const TYPECLS={'面接':'iv','ES締切':'dl','Webテスト':'dl','説明会':'se','インターン':'in','その他':'ot'};
const VIEW_PATH={dash:'/',growth:'/growth',tasks:'/tasks',companies:'/companies',schedule:'/schedule',settings:'/settings',install:'/install',admin:'/admin'};
const GUEST_PATH={login:'/login',signup:'/signup',about:'/about',terms:'/terms',install:'/install'};
const BELL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>';

/* ---- 起動時のデータ ---- */
const BOOT=JSON.parse(document.getElementById('boot').textContent);
let CSRF=BOOT.csrf;
let demo=!BOOT.loggedIn;
let S=BOOT.state;
let view=BOOT.view||'dash';
let guestPage=BOOT.guestPage||null; // null = アプリ画面、'login' / 'signup' / 'about' / 'terms' / 'install' = それぞれのページ

/* ---- 日付（毎回いまの日付で計算する） ---- */
let TODAY,NOW;
function tick(){NOW=new Date();TODAY=new Date(NOW.getFullYear(),NOW.getMonth(),NOW.getDate())}
tick();
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const diff=s=>Math.round((parse(s)-TODAY)/864e5);
const md=s=>{const d=parse(s);return`${d.getMonth()+1}/${d.getDate()}`};
const uid=()=>'x'+Math.random().toString(36).slice(2,9);
function addDays(s,n){const d=parse(s);d.setDate(d.getDate()+n);return iso(d)}
const fmtDT=s=>{if(!s)return'';const [d,t]=s.split('T');return`${md(d)} ${t}`};
const nowStr=()=>iso(NOW)+'T'+String(NOW.getHours()).padStart(2,'0')+':'+String(NOW.getMinutes()).padStart(2,'0');

/* ---- 通知の日時 ---- */
const ruleText=x=>x.m!=null?`開始の${x.m>=60?x.m/60+'時間':x.m+'分'}前`:`${DAYNAMES[x.d]} ${x.t}`;
const rulesText=k=>(S.settings?.[k]||[]).length?S.settings[k].map(ruleText).join('・')+' に自動で通知':'自動通知はオフ（設定で追加できます）';
const remindersOf=t=>{const r=[...(t.reminders||[])];if(t.due&&t.auto!==false){(S.settings?.taskRem||DEFAULT_SETTINGS.taskRem).forEach(x=>r.push(addDays(t.due,x.d)+'T'+x.t))}return [...new Set(r)].sort()};
// ログイン中はサーバーが計算した「次の通知」を使う。デモは画面で計算する
const nextReminder=t=>t.done?null:(t.next!==undefined?t.next:(remindersOf(t).find(r=>r>nowStr())||null));

/* ---- 表示の状態 ---- */
const store={get(k,d){try{return localStorage.getItem(k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
let mode=S.companyView||store.get('shukatsu-mode','board'), smode=S.scheduleView||store.get('shukatsu-smode','list'), q='';
let calMonth=new Date(TODAY.getFullYear(),TODAY.getMonth(),1), selDay=iso(TODAY);
let onboarding=false;
let ADMIN=null, adminQ='', adminLoading=false;
let pushStatus='unknown'; // unknown / on / off / unsupported

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const comp=id=>S.companies.find(c=>c.id===id);
const ev=id=>S.events.find(e=>e.id===id);
const rev=id=>S.reviews.find(r=>r.id===id);
const stName=id=>ALLST.find(s=>s.id===id)?.name||'';
const stars=n=>'<span class="stars">'+'★'.repeat(n)+'<span class="off">'+'★'.repeat(5-n)+'</span></span>';
const stChip=id=>`<span class="chip ${id==='offer'?'ok':id==='out'?'gray':''}">${stName(id)}</span>`;
const dueChip=d=>{const n=diff(d);if(n<0)return'<span class="chip gray">終了</span>';if(n===0)return'<span class="chip bad">今日</span>';if(n<=2)return`<span class="chip bad">あと${n}日</span>`;if(n<=7)return`<span class="chip warn">あと${n}日</span>`;return`<span class="chip gray">あと${n}日</span>`};
const dateBox=d=>{const x=parse(d);return`<div class="date"><div class="w">${x.getMonth()+1}月</div><div class="d">${x.getDate()}</div><div class="w">${WD[x.getDay()]}</div></div>`};
const nextEvent=cid=>S.events.filter(e=>e.cid===cid&&diff(e.date)>=0).sort((a,b)=>a.date.localeCompare(b.date))[0];
const feelDots=n=>`<span class="feel" title="手応え ${FEELS[n-1]}">${[1,2,3,4,5].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
// スマホ版（画面幅860px以下）か。管理画面はパソコン版だけで開く
const mqNarrow=window.matchMedia('(max-width:860px)');
const isNarrow=()=>mqNarrow.matches;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

/* ---- 課題のメーター ---- */
function lessonStat(l){
  const hist=[];let sum=0,doneDate=null;
  [...S.reviews].sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true})).forEach(r=>{(r.evals||[]).forEach(v=>{if(v.lid!==l.id)return;sum+=RATES[v.score].pt;hist.push({rid:r.id,date:r.date,score:v.score});if(sum>=100&&!doneDate)doneDate=r.date})});
  return{pct:Math.min(100,sum),done:sum>=100,doneDate,hist};
}
const isDone=l=>lessonStat(l).done;
const axisRating=(c,a)=>a.id==='pref'?(c.pref||0):((c.ratings||{})[a.id]||0);
function matchScore(c){let num=0,den=0,miss=0;(S.axes||[]).forEach(a=>{if(!a.w)return;const r=axisRating(c,a);if(r){num+=a.w*r;den+=a.w*5}else miss++});return{pct:den?Math.round(num/den*100):null,miss}}
const isPrepTarget=e=>e&&e.type==='面接'&&diff(e.date)>=0;
const nextPrep=()=>S.events.filter(e=>isPrepTarget(e)&&diff(e.date)<=2).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')))[0];
const active=()=>S.lessons.filter(l=>!isDone(l)).sort((a,b)=>(rev(b.rid)?.date||'').localeCompare(rev(a.rid)?.date||'')||String(b.id).localeCompare(String(a.id),undefined,{numeric:true}));
const meter=(pct,cls='')=>`<div class="lm ${cls}"><span class="bar"><i style="width:${pct}%"></i></span><span class="mono">${pct}%</span></div>`;
const lessonSrc=l=>{const r=rev(l.rid);if(!r)return'';const c=comp(r.cid),e=ev(r.evid);return`${md(r.date)} ${c?c.name:''}${e?' '+e.title:''}`};
const unreviewed=()=>S.events.filter(e=>REVIEWABLE.includes(e.type)&&diff(e.date)<=0&&diff(e.date)>=-14&&!S.reviews.some(r=>r.evid===e.id)).sort((a,b)=>b.date.localeCompare(a.date));

/* ---- サーバーとのやりとり ---- */
async function api(path,body,method='POST'){
  let res;
  try{
    res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:method==='GET'?undefined:JSON.stringify(body||{})});
  }catch(e){const err=new Error(navigator.onLine?'サーバーにつながりませんでした。開いているURLが正しいか（開発中は php -S が動いているか）確かめて、ページを読み込み直してください':'通信できませんでした。電波の良いところでもう一度お試しください');err.offline=true;throw err}
  let data={};try{data=await res.json()}catch(e){}
  if(!res.ok){const err=new Error(data.error||'うまく保存できませんでした');err.status=res.status;err.code=data.code;throw err}
  return data;
}
function handleErr(e){
  if(e.status===401&&!demo){toast('ログインの期限が切れました。もう一度ログインしてください');setTimeout(()=>location.href='/login',1500);return}
  toast(e.message||'うまく保存できませんでした');
}
function setState(st){if(st&&st.companies){S=st}}
/** 保存する。デモでは画面の中だけで変更し、ログイン中は API に送って最新のデータで描き直す */
async function mutate(path,payload,localFn,msg){
  if(demo){if(localFn)localFn();render();if(msg)toast(msg);return true}
  try{setState(await api(path,payload));render();if(msg)toast(msg);return true}
  catch(e){handleErr(e);if(!e.offline&&e.status!==401){api('state',null,'GET').then(st=>{setState(st);render()}).catch(()=>{})}return false}
}
/** 保存ボタンを押している間は押せないようにする */
async function busy(btn,fn){if(btn){if(btn.disabled)return;btn.disabled=true}try{return await fn()}finally{if(btn&&btn.isConnected)btn.disabled=false}}
function pv(){if(!demo)fetch('/api/pv',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':CSRF},body:'{}'}).catch(()=>{})}

function toast(msg){document.querySelectorAll('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}

/* ---- 画面の切り替え（URL も変える） ---- */
function go(v,opt={}){
  view=v;guestPage=null;
  if(!opt.noPush&&location.pathname+location.search!==VIEW_PATH[v])history.pushState({},'',VIEW_PATH[v]);
  closeLayer();render();window.scrollTo(0,0);pv();
}
function goGuest(p){
  if(!p){if(demo){go('dash');return}go('dash');return}
  if(!demo&&(p==='login'||p==='signup')){go('dash');return}
  guestPage=p;history.pushState({},'',GUEST_PATH[p]);closeLayer();render();window.scrollTo(0,0);
}
function fromLocation(){
  const p=location.pathname;
  const g=Object.entries(GUEST_PATH).find(([,path])=>path===p);
  const v=Object.entries(VIEW_PATH).find(([,path])=>path===p);
  if(g&&(demo||g[0]==='about'||g[0]==='terms')&&!(g[0]==='install'&&!demo)){guestPage=g[0];return}
  guestPage=null;view=v?v[0]:'dash';
}
window.addEventListener('popstate',()=>{fromLocation();closeLayer();render()});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>go(b.dataset.view));
document.querySelectorAll('[data-gp]').forEach(b=>b.onclick=()=>goGuest(b.dataset.gp));
$('#addCompanyTop').onclick=()=>openCompany();
$('#reviewTop').onclick=()=>openReview();
$('#addEventTop').onclick=()=>openEvent();
$('#addTaskTop').onclick=()=>openTask();
$('#bellS').onclick=openBell;$('#bellM').onclick=openBell;
$('#focusbtn').onclick=()=>go('growth');
// ＋ボタンの中身：ホームと企業一覧＝企業を追加、予定＝予定、タスク＝タスク、それ以外（成長記録など）＝ふりかえり
$('#fab').onclick=()=>view==='schedule'?openEvent():view==='companies'||view==='dash'?openCompany():view==='tasks'?openTask():openReview();

/** 通知などのリンク（/tasks?task=12 など）を開く */
function openLink(link){
  let u;try{u=new URL(link||'/',location.origin)}catch(e){return}
  if(u.pathname==='/about'||u.pathname==='/terms'){goGuest(u.pathname.slice(1));return}
  const v=Object.entries(VIEW_PATH).find(([,p])=>p===u.pathname);
  go(v?v[0]:'dash');
  const p=u.searchParams;
  if(p.get('prep')&&ev(p.get('prep')))openPrep(p.get('prep'));
  else if(p.get('review')&&ev(p.get('review'))){const r=S.reviews.find(x=>x.evid===p.get('review'));r?openReview(r.id):openReview(null,p.get('review'))}
  else if(p.get('task')&&S.tasks.some(t=>t.id===p.get('task')))openTask(p.get('task'));
  else if(p.get('event')&&ev(p.get('event')))openEvent(p.get('event'));
}

/* ---- 通知ベル ---- */
async function openNotif(n){
  closeLayer();
  if(!n.read)await mutate('notif/read',{id:n.id},()=>{n.read=true});
  openLink(n.link);
}
function openBell(){
  const list=[...S.notifs].sort((a,b)=>b.at.localeCompare(a.at));
  drawer('通知',`<button class="about-cta" id="n-about" type="button" style="margin:0;max-width:none">${LOGO()}<div><b>就活日和の使い方</b><span>できることを絵で紹介しています（1分で読めます）</span></div><span class="arrow">›</span></button>`+(list.length?`<div class="list">${list.map(n=>`<div class="nt ${n.read?'':'unread'}" data-nt="${esc(n.id)}" tabindex="0" role="button"><span class="ur"></span><div class="b"><b>${esc(n.title)}</b><span>${esc(n.body)}</span><small class="mono">${fmtDT(n.at)}</small></div></div>`).join('')}</div>`:'<div class="empty">通知はまだありません</div>')
    +'<p class="hint">タスクや予定の通知、ふりかえりの声かけがここに届きます。プッシュ通知をオンにしていない端末でも、ここで確認できます。</p>',
    `${demo?'<button class="btn" id="n-test">バナー通知を試す</button>':''}<span class="spacer"></span><button class="btn primary" id="n-all">すべて既読にする</button>`);
  document.querySelectorAll('[data-nt]').forEach(el=>{const f=()=>openNotif(S.notifs.find(n=>n.id===el.dataset.nt));el.onclick=f;el.onkeydown=e=>{if(e.key==='Enter')f()}});
  $('#n-all').onclick=e=>busy(e.currentTarget,async()=>{if(await mutate('notif/read',{all:true},()=>S.notifs.forEach(n=>n.read=true),'すべて既読にしました'))closeLayer()});
  if($('#n-test'))$('#n-test').onclick=()=>{closeLayer();testBanner()};
  $('#n-about').onclick=()=>{closeLayer();goGuest('about')};
}
function testBanner(){
  const t=S.tasks.filter(x=>!x.done&&x.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
  const c=t&&comp(t.cid);
  const n={id:uid(),kind:'task',link:t?'/tasks?task='+t.id:'/tasks',title:'タスクの期限が近づいています',body:t?`${c?c.name+'｜':''}${t.title}（${diff(t.due)<0?'期限切れ':diff(t.due)===0?'今日まで':md(t.due)+'まで'}）`:'期限のあるタスクはありません',at:nowStr(),read:false};
  S.notifs.unshift(n);renderChrome();
  document.querySelector('.banner')?.remove();
  const b=document.createElement('button');b.className='banner';
  b.innerHTML=`<span class="ic">${LOGO()}</span><span class="bd"><span class="app"><span>就活日和</span><span>今</span></span><b>${esc(n.title)}</b><span>${esc(n.body)}</span></span>`;
  b.onclick=()=>{b.remove();openNotif(n)};
  document.body.appendChild(b);setTimeout(()=>b.remove(),5000);
}

const FAB_LABEL={dash:'企業を追加',schedule:'予定を追加',companies:'企業を追加',tasks:'タスクを追加',other:'ふりかえりを書く'};
function renderChrome(){
  const nAct=active().length,nDone=S.lessons.length-nAct;
  $('#sidelv').innerHTML=`<span class="t">課題の記録</span><span class="s">意識中 ${nAct} ・ 身についた ${nDone}</span>`;
  const ur=unreviewed().length,uc=$('#urCnt');uc.hidden=!ur;uc.textContent=ur;
  const td=S.tasks.filter(t=>!t.done&&t.due&&diff(t.due)<=0).length,tc=$('#tCnt');tc.hidden=!td;tc.textContent=td;
  const un=S.notifs.filter(n=>!n.read).length;document.querySelectorAll('.bell .dot').forEach(d=>{d.hidden=!un;d.textContent=un>99?'99+':un});
  document.querySelectorAll('#bellS,#bellM').forEach(b=>b.setAttribute('aria-label',un?`通知（未読${un}件）`:'通知'));
  const a=active(),fb=$('#focusbar');
  fb.hidden=view==='dash'||!a.length;
  if(a.length)$('#focusbtn').innerHTML=`<span class="k">いま意識すること</span><span class="v">${esc(a[0].text)}</span>${a.length>1?`<span class="n">ほか${a.length-1}件</span>`:''}`;
  // ＋ボタンには「何を追加するか」を文字で出す（開いている画面で中身が変わる）
  $('#fabT').textContent=FAB_LABEL[view]||FAB_LABEL.other;
  if('setAppBadge' in navigator&&!demo){un?navigator.setAppBadge(un).catch(()=>{}):navigator.clearAppBadge().catch(()=>{})}
}

const TITLES={dash:'就活日和',growth:'成長記録',tasks:'タスク',companies:'企業一覧',schedule:'予定',settings:'設定',install:'ホーム画面に追加するやり方',admin:'管理画面',login:'ログイン',signup:'新規登録',about:'就活日和について',terms:'利用規約・プライバシーポリシー'};
function render(){
  tick();
  const guest=!!guestPage;
  document.documentElement.classList.toggle('guest',guest);
  document.documentElement.classList.toggle('demo',demo);
  $('#demobar').hidden=!demo;
  const t=TITLES[guest?guestPage:view]||'就活日和';document.title=t==='就活日和'?t:t+'｜就活日和';
  if(guest){renderGuest();return}
  $('#guest').innerHTML='';
  document.querySelectorAll('[data-view]').forEach(b=>{if(!b.classList.contains('lvlink')&&b.closest('.snav,.bnav')){if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}});
  renderChrome();
  const app=$('#app');
  // 入力中の欄（検索など）は、描き直しても入力が消えないようにする
  const fe=document.activeElement,keep=fe&&fe.id&&app.contains(fe)&&'value' in fe?{id:fe.id,v:fe.value,s:fe.selectionStart}:null;
  if(view==='dash')app.innerHTML=dashHTML();
  if(view==='growth')app.innerHTML=growthHTML();
  if(view==='companies')app.innerHTML=compHTML();
  if(view==='schedule')app.innerHTML=schedHTML();
  if(view==='tasks')app.innerHTML=tasksHTML();
  if(view==='settings')app.innerHTML=settingsHTML();
  if(view==='install')app.innerHTML=installHTML(false);
  if(view==='admin')app.innerHTML=!S.isAdmin?'<div class="panel empty">このページは管理者だけが見られます</div>':isNarrow()?'<h1>管理画面</h1><div class="panel empty">管理画面はパソコンで開いてください（スマホ版には表示していません）。</div>':adminHTML();
  $('#navAdmin').hidden=!S.isAdmin;
  addPwEyes(app);
  bind();
  if(keep){const n=document.getElementById(keep.id);if(n&&n!==document.activeElement){n.value=keep.v;n.focus();try{n.setSelectionRange(keep.s,keep.s)}catch(e){}}}
}

function heroHTML(){
  const a=active();
  const show=a.slice(0,3);
  return `<div class="hero">
    <section class="mind">
      <div class="mind-h"><span class="ttl">いま意識すること</span><span class="label">次の面接のふりかえりで、どのくらいできたかを評価します</span></div>
      ${show.length?`<div class="lessons">${show.map((l,i)=>{const st=lessonStat(l);return`<div class="lesson"><span class="no">${i+1}</span><div class="tx"><b>${esc(l.text)}</b>${meter(st.pct)}<span>${esc(lessonSrc(l))}${st.hist.length?` ・ 評価 ${st.hist.length}回`:' ・ まだ評価なし'}</span></div></div>`}).join('')}</div>${a.length>3?`<div class="more">ほかに ${a.length-3} 件あります → <a href="/growth" data-goto="growth" style="color:var(--accent)">成長記録で見る</a></div>`:''}`
      :`<div class="mind-empty"><b>意識することはまだありません</b>面接や説明会のあとに「ふりかえり」を書くと、次に活かしたいことがここに表示されます。</div><button class="btn primary" data-review="" style="margin-top:12px">＋ ふりかえりを書く</button>`}
    </section>
    <section class="level">
      <div class="title">課題の記録</div>
      <div class="stats">
        <div><span class="n">${S.reviews.length}</span><span class="l">ふりかえり</span></div>
        <div><span class="n">${a.length}</span><span class="l">意識中</span></div>
        <div><span class="n">${S.lessons.length-a.length}</span><span class="l">身についた</span></div>
      </div>
      <p class="next" style="margin:0;line-height:1.7">ふりかえりのたびに、前回の課題がどのくらいできたかを選ぶとメーターが上がります。100%になると「身についたこと」に移ります。</p>
      <div class="next" style="display:flex;flex-wrap:wrap;gap:6px">${RATES.map(r=>`<span class="chip gray">${r.label} +${r.pt}%</span>`).join('')}</div>
    </section>
  </div>`;
}

const needInstall=()=>!demo&&!S.installDone&&!S.installDismissed&&!isStandalone();
function instRemHTML(){
  if(!needInstall())return '';
  return `<div class="inst-rem">${ICON28().replace(/width="28" height="28"/,'width="36" height="36"')}<p><b>ホーム画面に追加しよう</b>アイコンからすぐ開けて、締切や面接の通知もバナーで届くようになります。</p><button class="btn primary sm" data-view-go="install">やり方を見る</button><button class="x" id="instX" aria-label="この案内を閉じる">×</button></div>`;
}
function dashHTML(){
  const upcoming=S.events.filter(e=>{const n=diff(e.date);return n>=0&&n<=14}).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const deadlines=S.events.filter(e=>['ES締切','Webテスト'].includes(e.type)&&diff(e.date)>=0).sort((a,b)=>a.date.localeCompare(b.date));
  const ur=unreviewed()[0];
  return `
  ${demo?`<button class="about-cta demo-about" data-gpage-app="about">${LOGO()}<div><b>就活日和ってなに？</b><span>できることを絵で紹介しています（1分で読めます）</span></div><span class="arrow">›</span></button>`:''}
  ${instRemHTML()}
  ${progHTML()}
  ${prepCardHTML()}
  <p class="today">${TODAY.getMonth()+1}月${TODAY.getDate()}日（${WD[TODAY.getDay()]}）・ 2週間以内の予定 ${upcoming.length} 件 ${demo?'<span class="chip gray">サンプルデータ</span>':''}</p>
  ${heroHTML()}
  ${ur?`<div class="nudge"><p><b>${md(ur.date)}</b> の ${esc(comp(ur.cid)?.name||'')}「${esc(ur.title)}」はどうでしたか？ 前回の課題がどのくらいできたかも記録しましょう。</p><button class="btn gold" data-review="${esc(ur.id)}">ふりかえる</button></div>`:''}
  <div class="grid2">
    <section class="panel">
      <h2>これからの予定 <button class="btn sm" data-goto="schedule">すべて見る</button></h2>
      <div class="list">${upcoming.length?upcoming.slice(0,6).map(evRow).join(''):'<div class="empty">2週間以内の予定はありません</div>'}</div>
    </section>
    <div class="stack">
    <section class="panel">
      <h2>今日までのやること <button class="btn sm" data-goto="tasks">すべて見る</button></h2>
      ${(()=>{const today=iso(TODAY);const open=S.tasks.filter(t=>!t.done&&t.due&&diff(t.due)<=1).sort((a,b)=>a.due.localeCompare(b.due));const done=S.tasks.filter(t=>t.done===today).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9'));const ts=[...open,...done];return ts.length?`<div class="list">${ts.map(taskRow).join('')}</div>${!open.length&&done.length?'<div class="empty" style="padding-bottom:0">今日までのタスクはすべて完了しました</div>':''}`:'<div class="empty">今日・明日が期限のタスクはありません</div>'})()}
    </section>
    <section class="panel">
      <h2>締切が近いもの</h2>
      <div class="list">${deadlines.length?deadlines.slice(0,5).map(e=>`<div class="row" data-ev="${esc(e.id)}"><div class="body"><div class="t">${esc(comp(e.cid)?.name||'')}　${esc(e.title)}</div><div class="m mono">${e.date.replace(/-/g,'/')} ${e.time}</div></div>${dueChip(e.date)}</div>`).join(''):'<div class="empty">締切はありません</div>'}</div>
    </section>
    </div>
  </div>`;
}

function progHTML(){
  const cnt=ids=>S.companies.filter(c=>ids.includes(c.stage)).length;
  const groups=[
    {name:'気になる',n:cnt(['interest']),c:'var(--p0)'},
    {name:'エントリー',n:cnt(['entry']),c:'var(--p1)'},
    {name:'書類選考',n:cnt(['es']),c:'var(--p2)'},
    {name:'面接',n:cnt(['int1','int2','final']),c:'var(--p3)'},
    {name:'内定',n:cnt(['offer']),c:'var(--p4)'}
  ];
  const total=groups.reduce((a,g)=>a+g.n,0);
  const inter=groups[3].n, offer=groups[4].n;
  const msg=offer?`内定 ${offer} 社。<b>おめでとう、その先へ。</b>`:inter?`面接中 ${inter} 社。<b>内定まで、着実に。</b>`:`<b>まずは一歩ずつ。</b>`;
  return `<section class="prog" aria-label="選考の進捗">
    <h2>選考の進捗</h2>
    <div class="meta"><span></span><span>${msg}</span></div>
    <div class="pbar">${total?groups.filter(g=>g.n).map(g=>`<button data-goto="companies" style="flex-grow:${g.n};background:${g.c}" title="${g.name} ${g.n}社" aria-label="${g.name} ${g.n}社"></button>`).join(''):''}</div>
    <div class="pleg">${groups.map(g=>`<button data-goto="companies"><span class="k"><i style="background:${g.c}"></i>${g.name}</span><span class="v">${g.n}<small>社</small></span></button>`).join('')}</div>
  </section>`;
}
function evRow(e){
  const c=comp(e.cid),done=S.reviews.some(r=>r.evid===e.id);
  const tag=diff(e.date)<=0&&REVIEWABLE.includes(e.type)?(done?'<span class="chip ok">ふりかえり済</span>':'<span class="chip gold">未ふりかえり</span>'):`<span class="chip ${e.type==='ES締切'||e.type==='Webテスト'?'warn':''}">${e.type}</span>`;
  return`<div class="row" data-ev="${esc(e.id)}">${dateBox(e.date)}<div class="body"><div class="t">${esc(c?.name||'（企業なし）')}</div><div class="m">${e.time?`<span class="mono">${e.time}</span> ・ `:''}${esc(e.title)}</div></div>${tag}</div>`}

function growthHTML(){
  const a=active(),m=S.lessons.filter(isDone).map(l=>({l,st:lessonStat(l)})).sort((x,y)=>y.st.doneDate.localeCompare(x.st.doneDate));
  const rs=[...S.reviews].sort((x,y)=>y.date.localeCompare(x.date));
  const histChips=st=>st.hist.length?`<div class="hist">${st.hist.map(h=>`<span class="chip ${h.score===3?'ok':h.score===0?'gray':''}">${md(h.date)} ${RATES[h.score].label}</span>`).join('')}</div>`:'<div class="hist"><span class="chip gray">まだ評価なし</span></div>';
  return `
  <h1>成長記録</h1>
  <p class="sub">課題ごとに、次の面接でどのくらいできたかを記録します。メーターが100%になると「身についたこと」に移ります。</p>
  <div class="grid2">
    <div class="stack">
      <section class="panel">
        <h2>意識中の課題 <span class="label">${a.length}件</span></h2>
        <div class="list">${a.length?a.map(l=>{const st=lessonStat(l);return`<div class="row" style="cursor:default;align-items:flex-start"><div class="body"><div class="t" style="white-space:normal">${esc(l.text)}</div>${meter(st.pct)}<div class="m">${esc(lessonSrc(l))}</div>${histChips(st)}</div></div>`}).join(''):'<div class="empty">意識中の課題はありません</div>'}</div>
      </section>
      <section class="panel">
        <h2>身についたこと <span class="label">${m.length}件</span></h2>
        <div class="list">${m.length?m.map(({l,st})=>`<div class="row" style="cursor:default;align-items:flex-start"><div class="body"><div class="t" style="white-space:normal">✓ ${esc(l.text)}</div><div class="m">${md(st.doneDate)} に身につきました</div>${histChips(st)}</div></div>`).join(''):'<div class="empty">メーターが100%になった課題がここに集まります</div>'}</div>
      </section>
    </div>
    <section class="panel">
      <h2>ふりかえり履歴 <button class="btn sm primary" data-review="">＋ 書く</button></h2>
      <div class="timeline">${rs.length?rs.map(r=>{const c=comp(r.cid),e=ev(r.evid),ls=S.lessons.filter(l=>l.rid===r.id),evs=(r.evals||[]).map(v=>({l:S.lessons.find(x=>x.id===v.lid),score:v.score})).filter(v=>v.l);return`<div class="rv">${dateBox(r.date)}<div style="min-width:0"><div class="head"><b>${esc(c?.name||'（企業なし）')}</b><span class="chip gray">${esc(e?e.title:'ふりかえり')}</span>${feelDots(r.feel)}</div>${r.asked?`<p class="asked">聞かれたこと：${esc(r.asked)}</p>`:''}${evs.length?`<div class="evlist">${evs.map(v=>`<div><span>${esc(v.l.text)}</span><span class="chip ${v.score===3?'ok':v.score===0?'gray':''}">${RATES[v.score].label}</span></div>`).join('')}</div>`:''}<ul>${ls.map(l=>`<li class="${isDone(l)?'done':''}">${esc(l.text)}</li>`).join('')}</ul><button class="btn sm" data-editrev="${esc(r.id)}" style="margin-top:8px">編集</button></div></div>`}).join(''):'<div class="empty">まだふりかえりはありません</div>'}</div>
    </section>
  </div>`;
}

function compHTML(){
  const list=S.companies.filter(c=>!q||(c.name+c.industry+(c.memo||'')).toLowerCase().includes(q.toLowerCase()));
  const card=c=>{const ne=nextEvent(c.id);return`<div class="card" draggable="true" data-comp="${esc(c.id)}" tabindex="0"><div class="name">${esc(c.name)}</div><div class="ind">${esc(c.industry)}</div><div class="foot">${stars(c.pref)}${ne?`<span class="chip ${diff(ne.date)<=2?'bad':'gray'}">${md(ne.date)} ${ne.type}</span>`:''}</div></div>`};
  const board=`<div class="board-top" id="bt" aria-hidden="true"><div id="btIn"></div></div><div class="board-wrap" id="bw"><div class="board">${STAGES.map(s=>{const cs=list.filter(c=>c.stage===s.id);return`<div class="col" data-col="${s.id}"><div class="col-h">${s.name}<span class="c">${cs.length}</span></div>${cs.map(card).join('')}</div>`}).join('')}</div></div>`;
  const outs=list.filter(c=>c.stage==='out');
  const table=`<div class="tbl-wrap"><table><thead><tr><th>企業名</th><th>業界</th><th>ステージ</th><th>志望度</th><th>次の予定</th></tr></thead><tbody>${[...list].sort((a,b)=>b.pref-a.pref).map(c=>{const ne=nextEvent(c.id);return`<tr data-comp="${esc(c.id)}"><td><b>${esc(c.name)}</b></td><td>${esc(c.industry)}</td><td>${stChip(c.stage)}</td><td>${stars(c.pref)}</td><td>${ne?`<span class="mono">${md(ne.date)}</span> ${esc(ne.title)} ${dueChip(ne.date)}`:'<span style="color:var(--muted)">—</span>'}</td></tr>`}).join('')}</tbody></table></div>`;
  return `
  <h1>企業一覧</h1>
  <p class="sub">${mode==='board'?'カードをドラッグしてステージを移動できます（スマホではカードを開いて変更）。':mode==='axis'?'自分で決めた軸と重みで、企業をマッチ度の高い順に並べます。':'志望度の高い順に並んでいます。'}</p>
  <div class="toolbar">
    <input class="search" id="q" type="search" placeholder="企業名・業界・メモで検索" value="${esc(q)}" aria-label="企業を検索">
    <div class="seg"><button data-mode="board" aria-pressed="${mode==='board'}">ボード</button><button data-mode="table" aria-pressed="${mode==='table'}">リスト</button><button data-mode="axis" aria-pressed="${mode==='axis'}">わたしの軸</button></div>
  </div>
  ${!S.companies.length?firstHTML('company','まだ企業がありません','気になる企業を登録すると、選考の段階や予定・タスクをまとめて管理できます。','＋ 最初の企業を登録する'):''}
  ${mode==='board'?board+(outs.length?`<p class="note">見送り：${outs.map(c=>`<a href="#" data-comp="${esc(c.id)}" style="color:inherit">${esc(c.name)}</a>`).join('、')}</p>`:''):mode==='axis'?axisHTML(list):table}`;
}

/** 一覧が空っぽのときの案内（大きな追加ボタンつき） */
function firstHTML(kind,title,text,btn,inner){
  return `<div class="first ${inner?'':'panel'}"><b>${title}</b><p>${text}</p><button class="btn primary" data-first="${kind}">${btn}</button></div>`;
}

/* ---- 企業一覧「わたしの軸」：重み付きで並べる・絞り込む・比べる ---- */
let axStage='active', axCond={axis:'',min:4};
const cmpSel=new Set();
const AX_GROUPS={active:{label:'選考中（見送り以外）',f:c=>c.stage!=='out'},interview:{label:'面接中',f:c=>['int1','int2','final'].includes(c.stage)},early:{label:'気になる〜書類選考',f:c=>['interest','entry','es'].includes(c.stage)},offer:{label:'内定',f:c=>c.stage==='offer'},all:{label:'すべて（見送りも含む）',f:()=>true}};
function axisHTML(list){
  let rows=list.filter(AX_GROUPS[axStage].f);
  const ca=S.axes.find(a=>a.id===axCond.axis);
  if(ca)rows=rows.filter(c=>axisRating(c,ca)>=axCond.min);
  rows=rows.map(c=>({c,s:matchScore(c)})).sort((x,y)=>(y.s.pct??-1)-(x.s.pct??-1)||y.c.pref-x.c.pref);
  const used=S.axes.filter(a=>a.w>0);
  const cs=[...cmpSel].map(comp).filter(Boolean);
  const cmp=cs.length>=2?`<section class="panel" style="margin-bottom:16px">
      <h2>比べる（${cs.length}社）<button class="btn sm" id="cmpClear">選択を解除</button></h2>
      <div class="tbl-wrap"><table class="cmp"><thead><tr><th>軸（重み）</th>${cs.map(c=>`<th><button class="lnk" data-comp="${esc(c.id)}">${esc(c.name)}</button><div style="margin-top:4px">${stChip(c.stage)}</div></th>`).join('')}</tr></thead>
      <tbody>${used.map(a=>{const vals=cs.map(c=>axisRating(c,a)),mx=Math.max(...vals);return`<tr><td>${esc(a.name)} <span class="mono" style="color:var(--muted)">×${a.w}</span></td>${vals.map(v=>`<td class="${v&&v===mx?'best':''}">${v?stars(v):'<span style="color:var(--muted)">未評価</span>'}</td>`).join('')}</tr>`}).join('')}
      <tr class="tot"><td>マッチ度</td>${cs.map(c=>{const p=matchScore(c).pct;return`<td><b class="mono">${p==null?'—':p+'%'}</b></td>`}).join('')}</tr></tbody></table></div>
      <p class="hint" style="margin:10px 0 0">各軸でいちばん評価が高い会社に色が付きます。評価は企業の詳細で変えられます。</p>
    </section>`:'';
  return `
  <section class="panel axpanel">
    <div class="axhead"><div><b>わたしの軸</b><span>重みが大きい軸ほど、順位に強く効きます</span></div><button class="btn sm" id="axEdit">軸と重みを編集</button></div>
    <div class="axchips">${S.axes.map(a=>`<span class="chip ${a.w?'':'gray'}">${esc(a.name)} <b class="mono">×${a.w}</b></span>`).join('')}</div>
  </section>
  <div class="toolbar axfilter">
    <label class="label" for="axStage">表示</label>
    <select id="axStage">${Object.entries(AX_GROUPS).map(([k,g])=>`<option value="${k}" ${k===axStage?'selected':''}>${g.label}</option>`).join('')}</select>
    <label class="label" for="axCondA">条件</label>
    <select id="axCondA"><option value="">しぼりこまない</option>${S.axes.map(a=>`<option value="${esc(a.id)}" ${a.id===axCond.axis?'selected':''}>${esc(a.name)}が</option>`).join('')}</select>
    ${ca?`<select id="axCondMin" aria-label="何以上">${[5,4,3,2].map(n=>`<option value="${n}" ${n===axCond.min?'selected':''}>★${n}以上</option>`).join('')}</select>`:''}
    <span class="spacer"></span>
    <button class="btn" id="cmpOffers">内定の会社を比べる</button>
  </div>
  ${cmp}
  <div class="rklist">${rows.length?rows.map(({c,s},i)=>`<div class="rk">
      <span class="rk-n mono">${i+1}</span>
      <div class="rk-b"><div class="rk-t"><button class="lnk" data-comp="${esc(c.id)}">${esc(c.name)}</button>${stChip(c.stage)}</div>
        <div class="rk-ax">${used.map(a=>{const r=axisRating(c,a);return`<span class="${r?'':'un'}">${esc(a.name)} ${r?'★'+r:'未評価'}</span>`}).join('')}</div></div>
      <div class="rk-s"><b class="mono">${s.pct==null?'—':s.pct+'%'}</b><span class="bar"><i style="width:${s.pct||0}%"></i></span>${s.miss?`<small>未評価 ${s.miss}</small>`:'<small>マッチ度</small>'}</div>
      <label class="rk-c"><input type="checkbox" data-cmp="${esc(c.id)}" ${cmpSel.has(c.id)?'checked':''}>比べる</label>
    </div>`).join(''):'<div class="panel empty">条件に合う企業がありません</div>'}</div>`;
}
function openAxes(){
  const ax=structuredClone(S.axes);
  const draw=()=>{
    $('#ax-rows').innerHTML=`<div class="axrow axhead-row" aria-hidden="true"><span class="label">軸の名前</span><span class="label">重み</span></div>`+ax.map((a,i)=>`<div class="axrow"><input id="ax-n${i}" value="${esc(a.name)}" maxlength="12" aria-label="軸の名前" ${a.id==='pref'?'readonly':''}><span class="label axwl" aria-hidden="true">重み</span><select id="ax-w${i}" class="axw" aria-label="${esc(a.name||'軸')}の重み">${[5,4,3,2,1,0].map(w=>`<option value="${w}" ${w===a.w?'selected':''}>${w}</option>`).join('')}</select><button class="mv" type="button" data-axup="${i}" aria-label="上へ" ${i===0?'disabled':''}>↑</button><button class="mv" type="button" data-axdown="${i}" aria-label="下へ" ${i===ax.length-1?'disabled':''}>↓</button>${a.id==='pref'?'<span class="hint axfix">固定</span>':`<button class="btn sm axdel" type="button" data-axdel="${i}">削除</button>`}</div>`).join('');
    ax.forEach((a,i)=>{$('#ax-n'+i).oninput=e=>a.name=e.target.value;$('#ax-w'+i).onchange=e=>a.w=+e.target.value});
    document.querySelectorAll('[data-axdel]').forEach(b=>b.onclick=()=>{ax.splice(+b.dataset.axdel,1);draw()});
    document.querySelectorAll('[data-axup]').forEach(b=>b.onclick=()=>{const i=+b.dataset.axup;[ax[i-1],ax[i]]=[ax[i],ax[i-1]];draw()});
    document.querySelectorAll('[data-axdown]').forEach(b=>b.onclick=()=>{const i=+b.dataset.axdown;[ax[i+1],ax[i]]=[ax[i],ax[i+1]];draw()});
    $('#ax-add').hidden=ax.length>=8;
  };
  drawer('わたしの軸',`
    <p class="hint">会社選びで大事にしたいことと、その重み（0〜5、0 は計算に使わない）を決めます。各企業の評価（★1〜5）に重みをかけて、マッチ度を出します。「志望度」は企業の★をそのまま使います。↑↓で並べ替えられます。</p>
    <div id="ax-rows" style="display:flex;flex-direction:column;gap:8px"></div>
    <button class="btn sm" id="ax-add" type="button" style="align-self:flex-start">＋ 軸を追加</button>
    <p class="hint">例：社風、福利厚生、成長できる環境、安定性、休日の多さ（名前は12文字まで）</p>`,
    `<span class="spacer"></span><button class="btn" id="ax-cancel">キャンセル</button><button class="btn primary" id="ax-save">保存</button>`);
  draw();
  $('#ax-add').onclick=()=>{ax.push({id:'a'+uid(),name:'',w:3});draw();$('#ax-n'+(ax.length-1)).focus()};
  $('#ax-cancel').onclick=closeLayer;
  $('#ax-save').onclick=e=>busy(e.currentTarget,async()=>{
    const next=ax.filter(a=>a.name.trim()).map(a=>({...a,name:a.name.trim().slice(0,12)}));
    if(await mutate('axes/save',{axes:next},()=>{S.axes=next},'軸を保存しました')){if(axCond.axis&&!S.axes.some(a=>a.id===axCond.axis)){axCond.axis='';render()}closeLayer()}
  });
}
function bindAxis(){
  if(view!=='companies'||mode!=='axis')return;
  $('#axEdit').onclick=openAxes;
  $('#axStage').onchange=e=>{axStage=e.target.value;render()};
  $('#axCondA').onchange=e=>{axCond.axis=e.target.value;render()};
  if($('#axCondMin'))$('#axCondMin').onchange=e=>{axCond.min=+e.target.value;render()};
  document.querySelectorAll('[data-cmp]').forEach(b=>b.onchange=()=>{const id=b.dataset.cmp;if(b.checked){if(cmpSel.size>=3){b.checked=false;toast('比べられるのは3社までです');return}cmpSel.add(id)}else cmpSel.delete(id);render()});
  if($('#cmpClear'))$('#cmpClear').onclick=()=>{cmpSel.clear();render()};
  $('#cmpOffers').onclick=()=>{const offers=S.companies.filter(c=>c.stage==='offer').slice(0,3);cmpSel.clear();offers.forEach(c=>cmpSel.add(c.id));
    if(offers.length<2)toast(offers.length?'内定は今1社です。ほかの会社にも「比べる」のチェックを入れると比べられます':'まだ内定の会社がありません');render()};
}

function schedHTML(){
  const evs=[...S.events].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const fut=evs.filter(e=>diff(e.date)>=0), past=evs.filter(e=>diff(e.date)<0).reverse();
  const groups={};fut.forEach(e=>{const n=diff(e.date);const k=n<=6?'今週（7日以内）':n<=13?'来週':'それ以降';(groups[k]=groups[k]||[]).push(e)});
  const head=`
  <h1>予定</h1>
  <p class="sub">説明会・締切・面接をまとめて管理します。終わった面接はタップしてふりかえれます。</p>
  <div class="toolbar" style="justify-content:space-between">
    <div class="seg"><button data-smode="list" aria-pressed="${smode==='list'}">リスト</button><button data-smode="cal" aria-pressed="${smode==='cal'}">カレンダー</button></div>
    <button class="btn primary" id="addEv">＋ 予定を追加</button>
  </div>`;
  if(smode==='cal')return head+calHTML();
  return head+`
  <div style="display:flex;flex-direction:column;gap:20px">
  ${Object.keys(groups).length?Object.entries(groups).map(([k,v])=>`<section class="panel"><h2>${k}<span class="label">${v.length}件</span></h2><div class="list">${v.map(evRow).join('')}</div></section>`).join(''):firstHTML('event','予定はまだありません','説明会・ES締切・面接などを入れると、前日や直前に通知が届きます。','＋ 最初の予定を追加する')}
  ${past.length?`<section class="panel"><h2>終わった予定</h2><div class="list">${past.slice(0,60).map(evRow).join('')}</div></section>`:''}
  </div>`;
}

/* ---- タスク ---- */
let tmode='open';
let qaddOpen=false; // タスクの追加欄（アコーディオン）。最初は閉じておく
const taskDue=d=>{if(!d)return'';const n=diff(d);if(n<0)return`<span class="chip bad">${-n}日超過</span>`;if(n===0)return'<span class="chip bad">今日まで</span>';if(n===1)return'<span class="chip warn">明日まで</span>';return`<span class="chip gray">${md(d)}まで</span>`};
function taskRow(t){const c=comp(t.cid),nr=nextReminder(t);return`<div class="task ${t.done?'done':''}"><button class="chk" data-toggle="${esc(t.id)}" aria-label="${t.done?'未完了に戻す':'完了にする'}">✓</button><div class="body" data-task="${esc(t.id)}" tabindex="0" role="button"><div class="t">${esc(t.title)}</div><div class="m">${c?esc(c.name):''}${t.done?`<span>${md(t.done)} 完了</span>`:taskDue(t.due)}${nr?`<span class="rmd" title="次の通知">${BELL}<span class="mono">${fmtDT(nr)}</span></span>`:''}</div></div></div>`}
function tasksHTML(){
  const open=S.tasks.filter(t=>!t.done),done=S.tasks.filter(t=>t.done).sort((a,b)=>b.done.localeCompare(a.done));
  const g={over:[],today:[],week:[],later:[],none:[]};
  open.forEach(t=>{if(!t.due)g.none.push(t);else{const n=diff(t.due);(n<0?g.over:n===0?g.today:n<=7?g.week:g.later).push(t)}});
  Object.values(g).forEach(a=>a.sort((x,y)=>(x.due||'').localeCompare(y.due||'')));
  const grp=(k,label,cls='')=>g[k].length?`<div class="tgroup"><h3 class="${cls}">${label}<span class="mono">${g[k].length}</span></h3><div class="list">${g[k].map(taskRow).join('')}</div></div>`:'';
  return `
  <h1>タスク</h1>
  <p class="sub">ES作成や企業研究など、自分でやることを管理します。</p>
  <details class="panel acc" id="qaddAcc" style="margin-bottom:20px" ${qaddOpen?'open':''}>
    <summary><span><b>＋ タスクを追加</b><small>やること・企業・期限を入れて追加</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
    <div class="acc-b">
    <form class="qadd" id="qadd">
      <input id="t-new" placeholder="やることを入力（例：ESの下書き）" maxlength="60" aria-label="タスク名">
      <select id="t-cid" aria-label="企業"><option value="">企業なし</option>${S.companies.filter(c=>c.stage!=='out').map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      <input type="date" id="t-due" aria-label="期限">
      <button class="btn primary" type="submit">追加</button>
    </form>
    <div class="tpl"><span class="label">よく使う：</span>${TASK_TPL.map(t=>`<button type="button" data-tpl="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>
  </details>
  <div class="toolbar"><div class="seg"><button data-tmode="open" aria-pressed="${tmode==='open'}">未完了 ${open.length}</button><button data-tmode="done" aria-pressed="${tmode==='done'}">完了 ${done.length}</button></div></div>
  <section class="panel">
  ${tmode==='open'?(open.length?grp('over','期限切れ','over')+grp('today','今日まで')+grp('week','7日以内')+grp('later','それ以降')+grp('none','期限なし'):(S.tasks.length?'<div class="empty">未完了のタスクはありません。おつかれさまです。</div>':firstHTML('task','タスクはまだありません','ESの下書きや企業研究など、やることを入れておくと期限の前に通知が届きます。','＋ 最初のタスクを追加する',true)))
    :(done.length?`<div class="list">${done.map(taskRow).join('')}</div>`:'<div class="empty">完了したタスクはまだありません</div>')}
  </section>`;
}
/** 通知日時の手動追加（タスク・予定で共通。1件につき最大3件、5分単位） */
function remEditor(prefix,initial,baseDate){
  const rems=[...(initial||[])];
  const draw=()=>{
    $(`#${prefix}-rems`).innerHTML=rems.map((r,i)=>`<div class="rem"><input type="datetime-local" step="300" id="${prefix}-rem${i}" value="${esc(r)}" aria-label="通知日時${i+1}"><button class="btn sm" type="button" data-rmrem="${i}">削除</button></div>`).join('');
    rems.forEach((r,i)=>$(`#${prefix}-rem${i}`).onchange=e=>rems[i]=e.target.value);
    document.querySelectorAll(`#${prefix}-rems [data-rmrem]`).forEach(b=>b.onclick=()=>{rems.splice(+b.dataset.rmrem,1);draw()});
    $(`#${prefix}-addrem`).hidden=rems.length>=3;
  };
  draw();
  $(`#${prefix}-addrem`).onclick=()=>{const base=baseDate()||iso(TODAY);rems.push((base>iso(TODAY)?addDays(base,-1):base)+'T12:00');draw();$(`#${prefix}-rem${rems.length-1}`).focus()};
  return()=>rems.filter(Boolean).map(r=>r.slice(0,16)).sort();
}
function openTask(id,presetCid){
  const t=id?S.tasks.find(x=>x.id===id):{id:null,cid:presetCid||'',title:'',due:'',done:null,auto:true,reminders:[]};
  if(!t)return;
  drawer(id?'タスクの編集':'タスクを追加',`
    <div class="field"><label class="label" for="k-title">やること</label><input id="k-title" maxlength="60" value="${esc(t.title)}" placeholder="例：ESの下書きを仕上げる"></div>
    <div class="field"><label class="label" for="k-cid">企業</label><select id="k-cid"><option value="">（企業なし）</option>${S.companies.map(c=>`<option value="${esc(c.id)}" ${c.id===t.cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label class="label" for="k-due">期限</label><input type="date" id="k-due" value="${esc(t.due)}"></div>
    <div class="field"><span class="label">通知</span>
      <label class="sw"><input type="checkbox" id="k-auto" ${t.auto!==false?'checked':''}>期限の${rulesText('taskRem')}</label>
      <p class="hint" style="margin-top:-2px">自動通知の時刻は「設定」でまとめて変えられます。期限なしのタスクも、下で通知日時を決められます。</p>
      <div id="k-rems" style="display:flex;flex-direction:column;gap:6px"></div>
      <button class="btn sm" id="k-addrem" type="button" style="align-self:flex-start">＋ 通知日時を追加</button>
      <p class="hint">スマホのホーム画面に追加して通知をオンにすると、バナーで届きます。届いた通知はベルからも確認できます。</p>
    </div>
    <div id="k-confirm"></div>`,
    `${id?'<button class="btn danger" id="k-del">削除</button>':''}<span class="spacer"></span><button class="btn" id="k-cancel">キャンセル</button><button class="btn primary" id="k-save">${id?'保存':'追加'}</button>`);
  setTimeout(()=>{if(!id)$('#k-title')?.focus()},50);
  const getRems=remEditor('k',t.reminders,()=>$('#k-due').value);
  $('#k-cancel').onclick=closeLayer;
  $('#k-save').onclick=e=>busy(e.currentTarget,async()=>{
    const title=$('#k-title').value.trim();
    if(!title){$('#k-confirm').innerHTML='<div class="confirm">やることを入力してください</div>';$('#k-title').focus();return}
    const data={title,cid:$('#k-cid').value,due:$('#k-due').value,auto:$('#k-auto').checked,reminders:getRems()};
    if(await mutate('task/save',{id,...data},()=>{if(id)Object.assign(t,data,{next:undefined});else S.tasks.push({id:uid(),done:null,...data})},id?'保存しました':'タスクを追加しました'))closeLayer();
  });
  if($('#k-del'))$('#k-del').onclick=()=>{
    $('#k-confirm').innerHTML='<div class="confirm">このタスクを削除します<button class="btn danger" id="k-del2">削除する</button></div>';
    $('#k-del2').onclick=e=>busy(e.currentTarget,async()=>{if(await mutate('task/delete',{id},()=>{S.tasks=S.tasks.filter(x=>x.id!==id)},'削除しました'))closeLayer()});
  };
}
function toggleTask(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return Promise.resolve(false);
  return mutate('task/toggle',{id},()=>{t.done=t.done?null:iso(TODAY)},t.done?'未完了に戻しました':null);
}

/* ---- 未ログイン：ログイン画面・登録画面・説明ページ ---- */
const LOGO=()=>document.querySelector('.side .logo svg').outerHTML;
const ICON28=()=>LOGO().replace('<svg','<svg width="28" height="28" x="0" y="0"');
function gTop(){
  const acts=!demo
    ?'<button class="btn primary" data-gpage="">ホームに戻る</button>'
    :guestPage==='about'||guestPage==='install'||guestPage==='terms'
    ?'<button class="btn" data-gpage="">デモを見る</button><button class="btn" data-gpage="login">ログイン</button><button class="btn primary" data-gpage="signup">無料で登録</button>'
    :'<button class="btn" data-gpage="">デモを見る</button><button class="btn" data-gpage="about">就活日和について</button>';
  return `<div class="g-top"><button class="logo" data-gpage="about" style="border:0;background:none;cursor:pointer;color:var(--fg);padding:0">${LOGO()}就活日和</button><div class="acts">${acts}</div></div>`;
}
const legalHTML=()=>`<p class="legal"><a href="/terms" data-gpage="terms">利用規約・プライバシーポリシー</a></p>`;
function signupHTML(){
  return `<div class="g-wrap">${gTop()}
    <form class="login" id="signupForm" novalidate>
      <h1>新規登録（無料）</h1>
      <p class="hint" style="margin:0">登録すると、自分の企業・予定・タスク・ふりかえりを保存できます。</p>
      <div class="field"><label class="label" for="sg-name">名前（ニックネーム可）</label><input id="sg-name" autocomplete="nickname" maxlength="100" placeholder="例：しゅうかつ太郎" required></div>
      <div class="field"><label class="label" for="sg-mail">メールアドレス</label><input id="sg-mail" type="email" autocomplete="email" maxlength="255" placeholder="you@example.com" required></div>
      <div class="field"><label class="label" for="sg-pass">パスワード（8文字以上）</label><input id="sg-pass" type="password" autocomplete="new-password" minlength="8" required></div>
      <div id="sg-err"></div>
      <button class="btn primary" type="submit">登録してはじめる</button>
      <p class="hint" style="margin:-4px 0 0;text-align:center">登録のあと、ホーム画面に追加（アイコン化）する方法をご案内します。<br>登録すると<a href="/terms" data-gpage="terms" style="color:inherit">利用規約・プライバシーポリシー</a>に同意したことになります。</p>
      <div class="or">登録済みの方</div>
      <button class="btn" type="button" data-gpage="login">ログイン</button>
    </form>
    ${legalHTML()}
  </div>`;
}
function loginHTML(){
  return `<div class="g-wrap">${gTop()}
    <form class="login" id="loginForm" novalidate>
      <h1>ログイン</h1>
      <p class="hint" style="margin:0">就活の予定・タスク・ふりかえりを、ひとつに。</p>
      <div class="field"><label class="label" for="lg-mail">メールアドレス</label><input id="lg-mail" type="email" autocomplete="email" placeholder="you@example.com" required></div>
      <div class="field"><label class="label" for="lg-pass">パスワード</label><input id="lg-pass" type="password" autocomplete="current-password" placeholder="8文字以上" required></div>
      <label class="sw pc-only"><input type="checkbox" id="lg-remember" checked>ログインしたままにする（7日間）</label>
      <div id="lg-err"></div>
      <button class="btn primary" type="submit">ログイン</button>
      <p class="hint sp-only" style="margin:-4px 0 0;text-align:center">一度ログインすると、90日間はログインしたままになります</p>
      <p class="hint pc-only" style="margin:-4px 0 0;text-align:center">チェックを外すと、ブラウザを閉じたときにログアウトします</p>
      <div class="or">はじめての方</div>
      <button class="btn" type="button" data-gpage="signup">新規登録（無料）</button>
    </form>
    <button class="about-cta" data-gpage="about">${LOGO()}<div><b>就活日和ってなに？</b><span>できることを絵で紹介しています（1分で読めます）</span></div><span class="arrow">›</span></button>
    ${legalHTML()}
  </div>`;
}
/* 使い方3ステップの小さな絵 */
const STEP_ILL=[
  `<svg viewBox="0 0 120 64" class="ill" aria-hidden="true" style="max-width:180px"><rect x="4" y="8" width="52" height="48" rx="8" fill="var(--bg)" stroke="var(--line)"/><rect x="12" y="18" width="30" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><rect x="12" y="30" width="22" height="5" rx="2.5" fill="var(--line)"/><text x="12" y="49" font-size="9" fill="var(--warn)">★★★★</text><path d="M62 32h14M71 27l5 5-5 5" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="82" y="8" width="34" height="48" rx="8" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><text x="99" y="36" font-size="10" font-weight="700" fill="var(--accent)" text-anchor="middle">面接</text></svg>`,
  `<svg viewBox="0 0 120 64" class="ill" aria-hidden="true" style="max-width:180px"><rect x="4" y="6" width="64" height="52" rx="8" fill="var(--bg)" stroke="var(--line)"/><path d="M4 20h64" stroke="var(--line)"/><rect x="12" y="26" width="12" height="10" rx="3" fill="var(--line)"/><rect x="30" y="26" width="12" height="10" rx="3" fill="var(--accent)"/><rect x="48" y="26" width="12" height="10" rx="3" fill="var(--line)"/><rect x="12" y="42" width="12" height="10" rx="3" fill="var(--warn-soft)"/><rect x="74" y="14" width="42" height="36" rx="10" fill="var(--surface)" stroke="var(--line)"/><rect x="80" y="21" width="12" height="12" rx="3" fill="var(--sky,#3a7bd5)"/><rect x="96" y="22" width="16" height="4" rx="2" fill="var(--fg)" fill-opacity=".6"/><rect x="96" y="30" width="12" height="4" rx="2" fill="var(--line)"/><rect x="80" y="39" width="30" height="5" rx="2.5" fill="var(--line)"/></svg>`,
  `<svg viewBox="0 0 120 64" class="ill" aria-hidden="true" style="max-width:180px"><rect x="4" y="8" width="70" height="48" rx="8" fill="var(--bg)" stroke="var(--line)"/><rect x="12" y="16" width="44" height="6" rx="3" fill="var(--fg)" fill-opacity=".6"/><g><rect x="12" y="30" width="12" height="18" rx="3" fill="var(--line)"/><rect x="27" y="30" width="12" height="18" rx="3" fill="var(--line)"/><rect x="42" y="30" width="12" height="18" rx="3" fill="var(--line)"/><rect x="57" y="30" width="12" height="18" rx="3" fill="var(--accent)"/></g><rect x="86" y="8" width="16" height="48" rx="8" fill="var(--line)"/><rect x="86" y="24" width="16" height="32" rx="8" fill="var(--accent)"/><text x="94" y="20" font-size="8" font-weight="700" fill="var(--accent)" text-anchor="middle">+50%</text></svg>`
];
function aboutHTML(){
  const feat=(k,title,text,ill,rev)=>`<section class="feat ${rev?'rev':''}"><div class="ill-box">${ill}</div><div><div class="k">${k}</div><h2>${title}</h2><p>${text}</p></div></section>`;
  const cta=demo?'<button class="btn primary" data-gpage="signup">無料で登録</button><button class="btn" data-gpage="login">ログイン</button><button class="btn" data-gpage="">デモを見る</button>':'<button class="btn primary" data-gpage="">ホームに戻る</button>';
  return `<div class="g-wrap">${gTop()}
    <section class="ab-hero">
      <div>
        <h1>就活の予定・タスク・<br>ふりかえりを、ひとつに。</h1>
        <p>選考の進み具合、面接の日程、やること、面接で見つけた課題。バラバラになりがちな就活の情報を、スマホひとつで管理できます。</p>
        <div class="acts">${demo?'<button class="btn primary" data-gpage="signup">無料で登録</button><button class="btn" data-gpage="">デモを見る</button>':'<button class="btn primary" data-gpage="">ホームに戻る</button>'}</div>
      </div>
      <div class="ill-box" style="background:var(--accent-soft);border:0">${IL.hero}</div>
    </section>
    <section class="ab-steps">
      <h2>使い方は3ステップ</h2>
      <div class="steps3">
        <div><span class="n">1</span>${STEP_ILL[0]}<b>企業を登録</b><span>気になる企業を入れて、選考の段階を記録します。</span></div>
        <div><span class="n">2</span>${STEP_ILL[1]}<b>予定とタスクを入れる</b><span>面接日やES締切を入れると、期限前に通知が届きます。</span></div>
        <div><span class="n">3</span>${STEP_ILL[2]}<b>面接のあとにふりかえる</b><span>次の課題を書き、前回の課題がどのくらいできたかを選びます。</span></div>
      </div>
    </section>
    ${feat('01','選考の進み具合が、ひと目でわかる','企業ごとに「気になる → 書類 → 面接 → 内定」の段階を記録。ホームのメーターで、全体の進み具合がすぐにわかります。',IL.progress,false)}
    ${feat('02','予定とタスクを忘れない','面接・説明会・ES締切をカレンダーで管理。期限の前にスマホへ通知が届くので、うっかりを防げます。面接の前には、準備に必要なことを1画面にまとめた「面接前カード」が開けます。',IL.schedule,true)}
    ${feat('03','面接のたびに、課題が身につく','面接のあとに「次に活かしたいこと」を短く記録。次の面接で「どのくらいできたか」を選ぶとメーターが上がり、100%で身についたことになります。',IL.review,false)}
    ${feat('04','Googleカレンダー・iPhoneと連携','Googleと一度つなぐだけで、就活日和・Googleカレンダー・iPhoneのカレンダーに同じ予定がそろいます。パスワードは保存しません。',IL.sync,true)}
    <section class="ab-end">
      <h2>さっそくはじめてみましょう</h2>
      <p>無料で使えます。スマホのホーム画面に追加すると、アプリのように使えます。</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${cta}</div>
      <p class="hint" style="margin-top:16px"><a href="/install" data-gpage="install" style="color:inherit">ホーム画面に追加（アイコン化）する方法</a></p>
    </section>
    ${legalHTML()}
  </div>`;
}
function termsHTML(){
  return `<div class="g-wrap">${gTop()}
    <article class="doc">
      <h1>利用規約・プライバシーポリシー</h1>
      <p class="sub">就活日和（haruharu.tech）をご利用いただく前にお読みください。</p>
      <h2>1. サービスについて</h2>
      <p>就活日和は、就職活動の企業・選考状況・予定・タスク・ふりかえりを記録するための無料のWebアプリです。個人の運営者が提供しており、予告なく内容の変更や提供の終了をすることがあります。</p>
      <h2>2. 保存する情報</h2>
      <ul>
        <li>会員登録で入力した名前・メールアドレス・パスワード（パスワードは復元できない形に変換して保存します）</li>
        <li>利用者が入力した企業・予定・タスク・ふりかえりなどの内容</li>
        <li>プッシュ通知を届けるための端末の登録情報、Googleカレンダー連携のためのトークン（暗号化して保存します）</li>
        <li>利用状況（日ごとのページを開いた回数）。<b>IPアドレスは保存しません</b></li>
      </ul>
      <h2>3. 運営者が確認できる情報</h2>
      <p><b>運営者は、会員の名前・メールアドレス・登録日・最終ログイン日・利用状況（アクセス数）を確認できます。</b>会員が入力した企業・予定・タスク・ふりかえりの中身と、パスワードは運営者にも見えない仕組みです。不正な利用があった場合、運営者はアカウントを停止することがあります。</p>
      <h2>4. 外部サービス</h2>
      <p>Googleカレンダー連携を使うと、Googleに「就活日和」カレンダーを作り、予定を同期します。就活日和が読み書きするのはこのカレンダーだけで、GoogleやiCloudのパスワードは預かりません。連携はいつでも設定から解除できます。プッシュ通知は、ブラウザ（Apple・Google・Mozilla など）の通知サービスを通して届けます。</p>
      <h2>5. 入力しないでほしい情報</h2>
      <p>企業のマイページのパスワードなど、他のサービスのパスワードは入力しないでください。</p>
      <h2>6. 免責</h2>
      <p>通知の遅れや届かないこと、データの消失などによって生じた損害について、運営者は責任を負いかねます。大切な締切は、企業からの案内でも必ず確認してください。</p>
      <h2>7. 退会・お問い合わせ</h2>
      <p>退会やデータの削除を希望する場合は、運営者にご連絡ください。登録したメールアドレスから連絡いただければ、アカウントとデータを削除します。</p>
      <p class="hint">2026年10月11日 制定</p>
    </article>
  </div>`;
}
/* パスワード欄の目のマーク（押すと入力した文字を表示・もう一度押すと隠す） */
const EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function addPwEyes(root){
  root.querySelectorAll('input[type="password"]:not([data-eye])').forEach(inp=>{
    inp.dataset.eye='1';
    const wrap=document.createElement('div');wrap.className='pw';
    inp.parentNode.insertBefore(wrap,inp);wrap.appendChild(inp);
    const b=document.createElement('button');b.type='button';b.className='pw-eye';
    const set=show=>{inp.type=show?'text':'password';b.innerHTML=show?EYE_OFF:EYE;b.setAttribute('aria-label',show?'パスワードを隠す':'パスワードを表示');b.setAttribute('aria-pressed',show)};
    set(false);
    b.onclick=()=>{const pos=inp.selectionStart;set(inp.type==='password');inp.focus();try{inp.setSelectionRange(pos,pos)}catch(e){}};
    wrap.appendChild(b);
    // 送るときは隠した状態に戻す（ブラウザのパスワード保存が正しく動くように）
    if(inp.form)inp.form.addEventListener('submit',()=>set(false));
  });
}
function renderGuest(){
  const g=$('#guest');
  g.innerHTML=guestPage==='about'?aboutHTML():guestPage==='terms'?termsHTML():guestPage==='install'?installHTML(true):guestPage==='signup'?signupHTML():loginHTML();
  addPwEyes(g);
  g.querySelectorAll('[data-itab]').forEach(b=>b.onclick=()=>{installTab=b.dataset.itab;renderGuest()});
  g.querySelectorAll('[data-gpage]').forEach(b=>b.onclick=e=>{e.preventDefault();goGuest(b.dataset.gpage||null)});
  const f=$('#loginForm');if(f)f.onsubmit=e=>{e.preventDefault();busy(f.querySelector('[type=submit]'),async()=>{
    const email=$('#lg-mail').value.trim(),password=$('#lg-pass').value;
    if(!email||!password){$('#lg-err').innerHTML='<div class="confirm">メールアドレスとパスワードを入力してください</div>';return}
    try{await api('auth/login',{email,password,device:isNarrow()?'sp':'pc',remember:!!$('#lg-remember')?.checked});location.href='/'}catch(err){$('#lg-err').innerHTML=`<div class="confirm" role="alert">${esc(err.message)}</div>`}
  })};
  const sf=$('#signupForm');if(sf)sf.onsubmit=e=>{e.preventDefault();busy(sf.querySelector('[type=submit]'),async()=>{
    const name=$('#sg-name').value.trim(),email=$('#sg-mail').value.trim(),password=$('#sg-pass').value;
    const err=!name?'名前を入力してください':!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'メールアドレスを正しく入力してください':password.length<8?'パスワードは8文字以上にしてください':'';
    if(err){$('#sg-err').innerHTML=`<div class="confirm" role="alert">${esc(err)}</div>`;return}
    try{await api('auth/signup',{name,email,password,device:isNarrow()?'sp':'pc',remember:true});location.href=isStandalone()?'/':'/install?welcome=1'}catch(er){$('#sg-err').innerHTML=`<div class="confirm" role="alert">${esc(er.message)}</div>`}
  })};
}

/* ---- 企業ボード：横スクロールバーを上に ---- */
function syncBoardScroll(){
  const bt=$('#bt'),bw=$('#bw');if(!bt||!bw){window.onresize=null;return}
  const size=()=>{const inner=$('#btIn');if(!inner)return;inner.style.width=bw.scrollWidth+'px';bt.hidden=bw.scrollWidth<=bw.clientWidth+1};
  size();
  bt.onscroll=()=>{if(bw.scrollLeft!==bt.scrollLeft)bw.scrollLeft=bt.scrollLeft};
  bw.onscroll=()=>{if(bt.scrollLeft!==bw.scrollLeft)bt.scrollLeft=bw.scrollLeft};
  window.onresize=size;
}

/* ---- 設定 ---- */
function ruleRow(kind,x,i){
  const canBefore=kind==='eventRem';
  const typ=x.m!=null?'before':'day';
  return `<div class="rule" data-kind="${kind}" data-i="${i}">
    <select class="r-type" aria-label="通知のタイミング">${Object.entries(DAYNAMES).map(([d,n])=>`<option value="d${d}" ${typ==='day'&&String(x.d)===d?'selected':''}>${kind==='taskRem'?'期限の':''}${n}</option>`).join('')}${canBefore?`<option value="before" ${typ==='before'?'selected':''}>開始の前</option>`:''}</select>
    ${typ==='day'?`<input type="time" class="r-time" step="300" value="${esc(x.t)}" aria-label="時刻">`:`<select class="r-min" aria-label="何分前">${[15,30,60,120,180].map(m=>`<option value="${m}" ${x.m===m?'selected':''}>${m>=60?m/60+'時間':m+'分'}前</option>`).join('')}</select>`}
    <button type="button" class="btn sm r-del">削除</button>
  </div>`;
}
const accOpen=new Set();
function pushBlockHTML(){
  if(demo)return `<button class="btn primary" id="pushOn">この端末で通知をオンにする</button>`;
  if(pushStatus==='on')return `<span class="chip ok">この端末は通知オン</span><button class="btn" id="pushTest">テスト通知を送る</button><button class="btn" id="pushOff">この端末の通知をオフにする</button>`;
  return `<button class="btn primary" id="pushOn">この端末で通知をオンにする</button>`;
}
function googleBlockHTML(){
  const g=S.google||{};
  if(demo)return '<button class="btn primary" id="gcal">Googleと接続</button>';
  if(!g.configured)return '<button class="btn primary" id="gcal" disabled>Googleと接続</button><p class="hint" style="margin-top:8px">Google連携は準備中です（運営者の設定待ち）。</p>';
  if(g.connected)return `<div class="gstat"><span class="chip ok">接続中</span><span class="hint">${g.lastSynced?'最後に同期：'+fmtDT(g.lastSynced):'同期の準備中'}</span></div><div class="row-acts"><button class="btn" id="gsync">今すぐ同期</button><button class="btn danger" id="gdis">連携を解除</button></div><p class="hint" style="margin-top:8px">解除しても、Googleカレンダー上の予定は消えません。</p>`;
  return `<button class="btn primary" id="gcal">Googleと接続</button><p class="hint" style="margin-top:8px">接続の途中で「Googleはこのアプリを確認していません」と表示されたら、「詳細」→「就活日和（安全ではないページ）に移動」を押して進んでください。就活日和が作るカレンダー以外の予定は読みません。</p>`;
}
function settingsHTML(){
  const st=S.settings;
  const block=(kind,title,desc)=>`<details class="panel acc" data-acc="${kind}" ${accOpen.has(kind)?'open':''}>
    <summary><span><b>${title}</b><small>${st[kind].length?st[kind].map(ruleText).join('・'):'自動通知はオフ'}</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
    <div class="acc-b">
      <p class="hint" style="margin:0 0 12px">${desc}</p>
      <div class="rules">${st[kind].length?st[kind].map((x,i)=>ruleRow(kind,x,i)).join(''):'<div class="empty">自動通知はオフです</div>'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${st[kind].length<5?`<button class="btn sm" data-addrule="${kind}">＋ 通知を追加</button>`:''}<button class="btn sm" data-reset="${kind}">初期値に戻す</button></div>
    </div>
  </details>`;
  return `
  <h1>設定</h1>
  <p class="sub">通知の時刻やカレンダー連携を、自分に合わせて変えられます。</p>
  <div class="stack" style="max-width:760px">
    <section class="panel">
      <h2>プッシュ通知</h2>
      <p class="hint" style="margin:0 0 12px">スマホでは、ホーム画面に追加したアプリにバナーで届きます。先にホーム画面に追加してから、ここで通知をオンにしてください。${isIOS()&&!isStandalone()?'<br><b>iPhoneは、ホーム画面に追加したアイコンから開いたときだけ通知をオンにできます（iOS 16.4以降）。</b>':''}</p>
      <div class="row-acts">
        ${pushBlockHTML()}
        <button class="btn" data-view-go="install">ホーム画面に追加（アイコン化）のやり方</button>
      </div>
    </section>
    ${block('taskRem','タスクの自動通知','期限のあるタスクに、自動でこの時刻の通知が付きます。タスクごとにオフにしたり、別の日時を足したりもできます。初期値は前日 20:00 と当日 21:00 です。')}
    ${block('eventRem','予定の自動通知','面接や説明会などの予定に、自動でこの時刻の通知が付きます。初期値は前日 20:00 と開始の1時間前です。面接の通知からは面接前カードが開きます。')}
    <section class="panel">
      <h2>Googleカレンダー連携</h2>
      <p class="hint" style="margin:0 0 12px">Googleで許可すると、Googleに「就活日和」カレンダーができ、予定が自動で同期されます。パスワードはこのサイトに保存されません。タスクは同期しません。</p>
      ${googleBlockHTML()}
      <div class="steps">
        <b>iPhoneのカレンダーアプリでも見るには</b>
        <ol>
          <li>「設定」→「カレンダー」→「アカウント」→「アカウントを追加」→「Google」でログイン</li>
          <li>「設定」→「カレンダー」→「デフォルトのカレンダー」を「就活日和」にする</li>
        </ol>
        <span>iCloudのカレンダー（「ホーム」など）に入れた予定は、就活日和には届きません。アップルカレンダーで追加するときは「就活日和」カレンダーを選んでください。</span>
      </div>
    </section>
    <section class="panel">
      <h2>アカウント</h2>
      ${demo?`<p class="hint" style="margin:0 0 12px">いまはデモ画面です。ログインすると、自分のデータを保存できます。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-gp2="login">ログイン</button><button class="btn primary" data-gp2="signup">無料で登録</button></div>`
      :`<p style="margin:0 0 4px"><b>${esc(S.me?.name)}</b> <span class="hint">${esc(S.me?.email)}</span></p>
      <p class="hint" style="margin:0 0 12px">ログインしたままになる期間は、スマホでは90日間、パソコンでは7日間です（パソコンで「ログインしたままにする」を外したときは、ブラウザを閉じるまで）。ログアウトすると、この端末ではもう一度ログインが必要になります。</p>
      <div class="row-acts"><button class="btn danger" id="logout">ログアウト</button><button class="btn" id="logoutAll">すべての端末からログアウト</button></div>
      <details class="acc" style="margin-top:12px"><summary><span><b style="font-size:14px">パスワードを変更</b><small>変更すると、ほかの端末はすべてログアウトします</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
        <form class="pwform" id="pwForm"><div class="field"><label class="label" for="pw-cur">いまのパスワード</label><input id="pw-cur" type="password" autocomplete="current-password"></div><div class="field"><label class="label" for="pw-new">新しいパスワード（8文字以上）</label><input id="pw-new" type="password" autocomplete="new-password" minlength="8"></div><div id="pw-err"></div><button class="btn primary" type="submit" style="align-self:flex-start">変更する</button></form>
      </details>`}
      <p class="hint" style="margin:16px 0 0"><a href="/terms" data-gp2="terms" style="color:inherit">利用規約・プライバシーポリシー</a> ・ <a href="/about" data-gp2="about" style="color:inherit">就活日和について</a></p>
    </section>
  </div>`;
}

/* ---- ホーム画面に追加（アイコン化）のやり方 ---- */
let installTab=/android/i.test(navigator.userAgent)?'android':'iphone';
function installHTML(guest){
  const steps=installTab==='iphone'?[
    ['ios-open','Safariで haruharu.tech を開く','iPhoneでは必ずSafariを使ってください（ChromeなどではOSの都合で通知が届きません）。'],
    ['ios-share','共有ボタンをタップ','画面の下（またはアドレスバーの横）にある、四角から矢印が出たボタンです。見つからないときは「…」を押してから「共有」を選びます。'],
    ['ios-add','「ホーム画面に追加」を選ぶ','一覧に見当たらないときは、下にスクロールすると出てきます。'],
    ['ios-confirm','右上の「追加」をタップ','名前は「就活日和」のままで大丈夫です。'],
    ['home','ホーム画面のアイコンから開く','開いたらもう一度ログインし、設定の「この端末で通知をオンにする」を押すと、通知がバナーで届くようになります。']
  ]:[
    ['and-open','Chromeで haruharu.tech を開く','画面の下に「ホーム画面に追加」のお知らせが出たら、そこから追加してもかまいません。'],
    ['and-menu','右上の︙（メニュー）をタップ','アドレスバーの右にある、点が縦に3つ並んだボタンです。'],
    ['and-add','「ホーム画面に追加」を選ぶ','機種によっては「アプリをインストール」と表示されます。'],
    ['and-confirm','「インストール」をタップ','少し待つと、ホーム画面にアイコンが追加されます。'],
    ['home','ホーム画面のアイコンから開く','開いたら設定の「この端末で通知をオンにする」を押し、通知を「許可」してください。']
  ];
  const onb=!guest&&onboarding;
  return `<div class="${guest?'g-wrap':''}">${guest?gTop():''}
    ${onb?`<div class="onb"><b>登録ありがとうございます！ まずはホーム画面に追加しましょう</b><p>就活日和は、スマホのホーム画面に追加して使うのがおすすめです。締切や面接の通知が届くのは、ホーム画面に追加したときだけです。${matchMedia('(pointer:fine)').matches?'<br>いまパソコンで見ている場合は、スマホで <b style="display:inline;font-size:inherit">haruharu.tech</b> を開いて、同じ手順で追加してください。':''}</p></div>`
    :`<button class="btn sm" ${guest?'data-gpage="about"':'data-view-go="settings"'} style="margin-bottom:16px">‹ ${guest?'就活日和について':'設定'}に戻る</button>`}
    <h1>ホーム画面に追加する（アイコン化）</h1>
    <p class="sub">就活日和をホーム画面に追加すると、アプリのようにアイコンから開けて、通知もバナーで届くようになります。1分ほどでできます。</p>
    <div class="seg" style="margin-bottom:20px"><button data-itab="iphone" aria-pressed="${installTab==='iphone'}">iPhone</button><button data-itab="android" aria-pressed="${installTab==='android'}">Android</button></div>
    <ol class="istep">${steps.map(([ill,t,d],i)=>`<li><div class="istep-t"><span class="n">${i+1}</span><div><b>${t}</b><p>${d}</p></div></div><div class="istep-i">${phoneIll(ill)}</div></li>`).join('')}</ol>
    ${installTab==='iphone'?'<p class="hint" style="margin-top:16px">通知が届くのは iOS 16.4 以降です。ホーム画面に追加した就活日和と、Safariで開いた就活日和はログイン状態が別なので、追加したあとに一度ログインしてください。</p>':'<p class="hint" style="margin-top:16px">表示される言葉は、Androidの機種やChromeのバージョンで少し違うことがあります。</p>'}
    ${!guest?`<div class="onb-foot"><button class="btn primary" id="instDone">ホーム画面に追加しました</button><button class="btn" id="instLater">${onb?'あとで追加する':'まだ追加しない'}</button></div>`:''}
  </div>`;
}

/* ---- プッシュ通知 ---- */
const b64ToBytes=s=>{const p='='.repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function checkPush(){
  if(demo)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){pushStatus='unsupported';return}
  try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();pushStatus=sub&&Notification.permission==='granted'?'on':'off';
    if(sub&&pushStatus==='on')api('push/subscribe',sub.toJSON()).catch(()=>{}); // 端末の登録を最新に
  }catch(e){pushStatus='off'}
  if(view==='settings'&&!guestPage)render();
}
async function enablePush(){
  if(demo){toast('ログインすると、この端末で通知をオンにできます');return}
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
    if(isIOS()&&!isStandalone()){toast('iPhoneは、ホーム画面に追加したアイコンから開くと通知をオンにできます');go('install')}
    else toast('このブラウザは通知に対応していません');
    return;
  }
  if(!BOOT.vapid){toast('通知の準備ができていません（運営者の設定待ち）');return}
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){toast('通知が許可されませんでした。端末の設定から就活日和の通知を許可してください');return}
  try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(BOOT.vapid)});
    await api('push/subscribe',sub.toJSON());
    pushStatus='on';render();toast('この端末で通知をオンにしました');
  }catch(e){handleErr(e.status?e:new Error('通知をオンにできませんでした。もう一度お試しください'))}
}
async function disablePush(){
  try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
    if(sub){await api('push/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe()}
    pushStatus='off';render();toast('この端末の通知をオフにしました');
  }catch(e){handleErr(e)}
}

function bindSettings(){
  if(view!=='settings')return;
  const commitRules=(next,msg)=>mutate('settings/reminders',next,()=>{S.settings=next},msg);
  document.querySelectorAll('details[data-acc]').forEach(d=>d.ontoggle=()=>{d.open?accOpen.add(d.dataset.acc):accOpen.delete(d.dataset.acc)});
  document.querySelectorAll('.rule').forEach(row=>{
    const kind=row.dataset.kind,i=+row.dataset.i;
    const edit=(fn,msg)=>{const next=structuredClone(S.settings);fn(next[kind]);commitRules(next,msg)};
    row.querySelector('.r-type').onchange=e=>{const v=e.target.value;edit(a=>{a[i]=v==='before'?{m:60}:{d:+v.slice(1),t:a[i].t||'20:00'}},'保存しました')};
    const tm=row.querySelector('.r-time');if(tm)tm.onchange=e=>edit(a=>{a[i].t=e.target.value||'20:00'},'保存しました');
    const mn=row.querySelector('.r-min');if(mn)mn.onchange=e=>edit(a=>{a[i].m=+e.target.value},'保存しました');
    row.querySelector('.r-del').onclick=()=>edit(a=>{a.splice(i,1)},'通知を削除しました');
  });
  document.querySelectorAll('[data-addrule]').forEach(b=>b.onclick=()=>{const next=structuredClone(S.settings);next[b.dataset.addrule].push({d:0,t:'08:00'});commitRules(next,'通知を追加しました')});
  document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{const next=structuredClone(S.settings);next[b.dataset.reset]=structuredClone(DEFAULT_SETTINGS[b.dataset.reset]);commitRules(next,'初期値に戻しました')});
  if($('#pushOn'))$('#pushOn').onclick=e=>busy(e.currentTarget,enablePush);
  if($('#pushOff'))$('#pushOff').onclick=e=>busy(e.currentTarget,disablePush);
  if($('#pushTest'))$('#pushTest').onclick=e=>busy(e.currentTarget,()=>mutate('push/test',{},null,'テスト通知を送りました。届かないときは、端末の通知設定を確認してください'));
  if($('#gcal'))$('#gcal').onclick=()=>{if(demo){toast('ログインすると、Googleカレンダーと連携できます');return}location.href='/google/connect'};
  if($('#gsync'))$('#gsync').onclick=e=>busy(e.currentTarget,()=>mutate('google/sync',{},null,'Googleカレンダーと同期しました'));
  if($('#gdis'))$('#gdis').onclick=e=>{if(confirm('Googleカレンダーとの連携を解除しますか？（カレンダー上の予定は消えません）'))busy(e.currentTarget,()=>mutate('google/disconnect',{},null,'連携を解除しました'))};
  document.querySelectorAll('[data-gp2]').forEach(b=>b.onclick=e=>{e.preventDefault();goGuest(b.dataset.gp2)});
  if($('#logout'))$('#logout').onclick=e=>{if(confirm('この端末からログアウトしますか？\n\nもう一度使うときは、メールアドレスとパスワードでログインが必要です。'))busy(e.currentTarget,async()=>{try{await api('account/logout',{})}catch(er){}location.href='/'})};
  if($('#logoutAll'))$('#logoutAll').onclick=e=>{if(confirm('すべての端末からログアウトしますか？\n\nこの端末も含めて、ログインしているスマホ・パソコンすべてで、もう一度ログインが必要になります。'))busy(e.currentTarget,async()=>{try{await api('account/logout-all',{})}catch(er){}location.href='/login'})};
  const pf=$('#pwForm');if(pf)pf.onsubmit=e=>{e.preventDefault();busy(pf.querySelector('[type=submit]'),async()=>{
    try{const r=await api('account/password',{current:$('#pw-cur').value,new:$('#pw-new').value});if(r.csrf)CSRF=r.csrf;pf.reset();$('#pw-err').innerHTML='';toast('パスワードを変更しました')}
    catch(er){$('#pw-err').innerHTML=`<div class="confirm" role="alert">${esc(er.message)}</div>`}
  })};
}

function calHTML(){
  const y=calMonth.getFullYear(),m=calMonth.getMonth();
  const start=new Date(y,m,1);start.setDate(1-start.getDay());
  const last=new Date(y,m+1,0);const end=new Date(last);end.setDate(last.getDate()+(6-last.getDay()));
  const byDay={};S.events.forEach(e=>(byDay[e.date]=byDay[e.date]||[]).push(e));
  Object.values(byDay).forEach(a=>a.sort((p,q)=>(p.time||'99').localeCompare(q.time||'99')));
  let cells='';
  for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    const k=iso(d),es=byDay[k]||[],w=d.getDay();
    const cls=['cal-d',d.getMonth()!==m?'other':'',k===iso(TODAY)?'today':'',k===selDay?'sel':'',w===0?'sun':w===6?'sat':''].join(' ');
    cells+=`<div class="${cls}" data-day="${k}" tabindex="0" role="button" aria-label="${d.getMonth()+1}月${d.getDate()}日 予定${es.length}件"><span class="n">${d.getDate()}</span>
      ${es.slice(0,3).map(e=>`<button class="ce ${TYPECLS[e.type]||'ot'}" data-ev="${esc(e.id)}" title="${esc((comp(e.cid)?.name||'')+' '+e.title)}">${e.time?`<span class="mono">${e.time}</span> `:''}${esc(comp(e.cid)?.name||e.title)}</button>`).join('')}
      ${es.length>3?`<span class="cal-more">ほか${es.length-3}件</span>`:''}
      ${es.length?`<span class="dots">${es.slice(0,4).map(e=>`<i class="${TYPECLS[e.type]||'ot'}"></i>`).join('')}</span>`:''}
    </div>`;
  }
  const sel=(byDay[selDay]||[]);const sd=parse(selDay);
  return `
  <section class="cal">
    <div class="cal-h"><span class="ttl">${y}年 ${m+1}月</span><button class="btn sm" data-cal="-1" aria-label="前の月">‹ 前月</button><button class="btn sm" data-cal="0">今日</button><button class="btn sm" data-cal="1" aria-label="次の月">翌月 ›</button></div>
    <div class="cal-g">${WD.map((w,i)=>`<div class="cal-w ${i===0?'sun':i===6?'sat':''}">${w}</div>`).join('')}${cells}</div>
    <div class="legend"><span><i class="iv"></i>面接</span><span><i class="dl"></i>ES締切・Webテスト</span><span><i class="se"></i>説明会</span><span><i class="in"></i>インターン</span><span><i></i>その他</span></div>
  </section>
  <section class="panel" style="margin-top:20px">
    <h2>${sd.getMonth()+1}月${sd.getDate()}日（${WD[sd.getDay()]}）の予定 <button class="btn sm" data-addday="${selDay}">＋ この日に追加</button></h2>
    <div class="list">${sel.length?sel.map(evRow).join(''):'<div class="empty">予定はありません</div>'}</div>
  </section>`;
}

function saveView(key,val){
  if(demo){store.set(key==='companyView'?'shukatsu-mode':'shukatsu-smode',val);return}
  S[key]=val;
  api('settings/view',{[key]:val}).catch(()=>{});
}
function bind(){
  document.querySelectorAll('#app [data-goto]').forEach(b=>b.onclick=e=>{e.preventDefault();go(b.dataset.goto)});
  document.querySelectorAll('#app [data-comp]').forEach(b=>{b.onclick=e=>{e.preventDefault();openCompany(b.dataset.comp)};if(b.classList.contains('card'))b.onkeydown=e=>{if(e.key==='Enter')openCompany(b.dataset.comp)}});
  document.querySelectorAll('#app [data-ev]').forEach(b=>b.onclick=e=>{e.stopPropagation();openEvent(b.dataset.ev)});
  document.querySelectorAll('[data-smode]').forEach(b=>b.onclick=()=>{smode=b.dataset.smode;saveView('scheduleView',smode);render()});
  document.querySelectorAll('[data-cal]').forEach(b=>b.onclick=()=>{const n=+b.dataset.cal;if(n===0){calMonth=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);selDay=iso(TODAY)}else calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+n,1);render()});
  document.querySelectorAll('[data-day]').forEach(c=>{const pick=()=>{selDay=c.dataset.day;const d=parse(selDay);if(d.getMonth()!==calMonth.getMonth())calMonth=new Date(d.getFullYear(),d.getMonth(),1);render()};c.onclick=pick;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}}});
  document.querySelectorAll('[data-addday]').forEach(b=>b.onclick=()=>openEvent(null,'',b.dataset.addday));
  document.querySelectorAll('#app [data-toggle]').forEach(b=>b.onclick=e=>busy(e.currentTarget,()=>toggleTask(b.dataset.toggle)));
  document.querySelectorAll('#app [data-task]').forEach(b=>{b.onclick=()=>openTask(b.dataset.task);b.onkeydown=e=>{if(e.key==='Enter')openTask(b.dataset.task)}});
  document.querySelectorAll('[data-tmode]').forEach(b=>b.onclick=()=>{tmode=b.dataset.tmode;render()});
  bindSettings();
  syncBoardScroll();
  bindAxis();
  bindAdmin();
  bindCopy($('#app'));
  document.querySelectorAll('#app [data-prep]').forEach(b=>b.onclick=e=>{e.stopPropagation();openPrep(b.dataset.prep)});
  document.querySelectorAll('#app [data-gpage-app]').forEach(b=>b.onclick=()=>goGuest(b.dataset.gpageApp));
  document.querySelectorAll('#app [data-view-go]').forEach(b=>b.onclick=()=>go(b.dataset.viewGo));
  document.querySelectorAll('#app [data-itab]').forEach(b=>b.onclick=()=>{installTab=b.dataset.itab;render()});
  const ix=$('#instX');if(ix)ix.onclick=()=>mutate('settings/install',{action:'dismiss'},()=>{S.installDismissed=true},'案内を閉じました。設定からいつでも見られます');
  const idn=$('#instDone');if(idn)idn.onclick=e=>busy(e.currentTarget,async()=>{const o=onboarding;if(await mutate('settings/install',{action:'done'},()=>{S.installDone=true})){onboarding=false;go('dash');toast(o?'準備完了です。追加したアイコンから開いてログインしてください':'ありがとうございます')}});
  const il=$('#instLater');if(il)il.onclick=()=>{const o=onboarding;onboarding=false;go('dash');if(o)toast('ホーム画面の上に案内を出しておきます')};
  const qac=$('#qaddAcc');if(qac)qac.ontoggle=()=>{qaddOpen=qac.open;if(qac.open)setTimeout(()=>$('#t-new')?.focus(),50)};
  document.querySelectorAll('[data-tpl]').forEach(b=>b.onclick=()=>{const i=$('#t-new');i.value=b.dataset.tpl;i.focus()});
  const qa=$('#qadd');if(qa)qa.onsubmit=e=>{e.preventDefault();const title=$('#t-new').value.trim();if(!title){$('#t-new').focus();return}
    const data={title,cid:$('#t-cid').value,due:$('#t-due').value,auto:true,reminders:[]};
    busy(qa.querySelector('[type=submit]'),async()=>{if(await mutate('task/save',data,()=>{S.tasks.push({id:uid(),done:null,...data})},'タスクを追加しました')){tmode='open';render();$('#t-new').value='';$('#t-new').focus()}})};
  document.querySelectorAll('#app [data-review]').forEach(b=>b.onclick=()=>openReview(null,b.dataset.review||null));
  document.querySelectorAll('#app [data-editrev]').forEach(b=>b.onclick=()=>openReview(b.dataset.editrev));
  if($('#addEv'))$('#addEv').onclick=()=>openEvent();
  document.querySelectorAll('#app [data-first]').forEach(b=>b.onclick=()=>({company:openCompany,event:openEvent,task:openTask})[b.dataset.first]());
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;saveView('companyView',mode);render()});
  const qi=$('#q');if(qi)qi.oninput=()=>{q=qi.value.trim();render()};
  document.querySelectorAll('.card').forEach(c=>c.ondragstart=e=>e.dataTransfer.setData('text/plain',c.dataset.comp));
  document.querySelectorAll('.col').forEach(col=>{
    col.ondragover=e=>{e.preventDefault();col.classList.add('drop')};
    col.ondragleave=()=>col.classList.remove('drop');
    col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');const c=comp(e.dataTransfer.getData('text/plain'));const st=col.dataset.col;
      if(c&&c.stage!==st)mutate('company/stage',{id:c.id,stage:st},()=>{c.stage=st},`${c.name} を「${stName(st)}」に移動しました`)};
  });
}

let lastFocus=null;
function closeLayer(){$('#layer').innerHTML='';document.body.style.overflow='';if(lastFocus&&lastFocus.isConnected)lastFocus.focus();lastFocus=null}
function drawer(title,body,foot,cls=''){
  if(!$('#layer').innerHTML)lastFocus=document.activeElement;
  $('#layer').innerHTML=`<div class="scrim" id="scrim"></div><aside class="drawer ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="drawer-h"><h3>${esc(title)}</h3><button class="btn" id="x">閉じる</button></div><div class="drawer-b">${body}</div><div class="drawer-f">${foot}</div></aside>`;
  $('#scrim').onclick=closeLayer;$('#x').onclick=closeLayer;
  document.body.style.overflow='hidden';
  $('#layer .drawer').scrollTop=0;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('#layer2').innerHTML)$('#layer2').innerHTML='';else if($('#layer').innerHTML)closeLayer()}});

/* ---- ふりかえり ---- */
function openReview(rid,evid){
  const r=rid?rev(rid):null;
  const e0=r?ev(r.evid):evid?ev(evid):null;
  let cid=r?r.cid:e0?e0.cid:'', eid=r?r.evid:e0?e0.id:'', feel=r?r.feel:3;
  const existing=r?S.lessons.filter(l=>l.rid===r.id):[];
  const texts=[0,1,2].map(i=>existing[i]?.text||'');
  // 評価する「前回の課題」：新規なら意識中の課題、編集ならこのふりかえりで評価した課題＋それ以前からの意識中の課題
  const sel={};(r?.evals||[]).forEach(v=>sel[v.lid]=v.score);
  const targets=S.lessons.filter(l=>{if(r&&l.rid===r.id)return false;if(sel[l.id]!=null)return true;if(isDone(l))return false;if(!r)return true;const lr=rev(l.rid);return lr&&lr.date<=r.date});
  const evalHTML=targets.length?`<div class="field"><span class="label">前回の課題、どのくらいできた？</span><p class="hint">選んだ分だけ課題のメーターが上がります（できた +50%、だいたい +30%、少し +15%）。100%で「身についたこと」に移ります。評価しない課題は空けたままで大丈夫です。</p>
      <div style="display:flex;flex-direction:column;gap:10px">${targets.map(l=>{const st=lessonStat(l);return`<div class="evitem"><b>${esc(l.text)}</b>${meter(st.pct)}<div class="rate" data-lid="${esc(l.id)}">${RATES.map((x,i)=>`<button type="button" data-score="${i}" aria-pressed="${sel[l.id]===i}">${x.label}<small>+${x.pt}%</small></button>`).join('')}</div></div>`}).join('')}</div></div>`:'';
  const evOpts=()=>`<option value="">（予定を選ばない）</option>`+S.events.filter(e=>(!cid||e.cid===cid)&&diff(e.date)<=0).sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<option value="${esc(e.id)}" ${e.id===eid?'selected':''}>${md(e.date)} ${esc(e.title)}</option>`).join('');
  drawer(r?'ふりかえりを編集':'ふりかえり',`
    <p class="hint">短くて大丈夫です。前回の課題を評価して、「次はこうする」を1〜3個書くと、ホームの一番上に表示されます。</p>
    <div class="field"><label class="label" for="r-cid">企業</label><select id="r-cid"><option value="">（企業なし）</option>${S.companies.map(c=>`<option value="${esc(c.id)}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label class="label" for="r-ev">どの予定のふりかえり？</label><select id="r-ev">${evOpts()}</select></div>
    <div class="field"><span class="label">手応え</span><div class="feel-pick" id="r-feel">${FEELS.map((f,i)=>`<button type="button" data-f="${i+1}" aria-pressed="${i+1===feel}"><span class="mono">${i+1}</span>${f}</button>`).join('')}</div></div>
    ${evalHTML}
    <div class="field"><label class="label" for="r-asked">聞かれたこと（任意）</label><textarea id="r-asked" maxlength="2000" placeholder="例：挫折経験／チームでの役割">${esc(r?.asked||'')}</textarea></div>
    <div class="field"><span class="label">次の課題（次に活かしたいこと・1つ以上・40字まで）</span>
      ${texts.map((t,i)=>`<div class="lesson-in"><input id="r-l${i}" maxlength="40" value="${esc(t)}" aria-label="次に活かしたいこと${i+1}" placeholder="${['例：結論から先に話す','例：逆質問を3つ用意する','例：質問を最後まで聞いてから答える'][i]}"><span class="cnt" id="r-c${i}">${t.length}/40</span></div>`).join('')}
    </div>
    <div id="r-confirm"></div>`,
    `${r?'<button class="btn danger" id="r-del">削除</button>':''}<span class="spacer"></span><button class="btn" id="r-cancel">キャンセル</button><button class="btn primary" id="r-save">保存</button>`);
  document.querySelectorAll('.rate').forEach(g=>g.querySelectorAll('button').forEach(b=>b.onclick=()=>{const lid=g.dataset.lid,s=+b.dataset.score;if(sel[lid]===s)delete sel[lid];else sel[lid]=s;g.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',sel[lid]===+x.dataset.score))}));
  $('#r-cid').onchange=()=>{cid=$('#r-cid').value;eid='';$('#r-ev').innerHTML=evOpts()};
  $('#r-ev').onchange=()=>{eid=$('#r-ev').value;const e=ev(eid);if(e&&!cid){cid=e.cid;$('#r-cid').value=cid}};
  document.querySelectorAll('#r-feel button').forEach(b=>b.onclick=()=>{feel=+b.dataset.f;document.querySelectorAll('#r-feel button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  [0,1,2].forEach(i=>$('#r-l'+i).oninput=()=>$('#r-c'+i).textContent=$('#r-l'+i).value.length+'/40');
  $('#r-cancel').onclick=closeLayer;
  $('#r-save').onclick=ev0=>busy(ev0.currentTarget,async()=>{
    const ls=[0,1,2].map(i=>$('#r-l'+i).value.trim());
    if(!ls.some(Boolean)){$('#r-confirm').innerHTML='<div class="confirm">次に活かしたいことを1つ以上書いてください</div>';$('#r-l0').focus();return}
    const e=ev(eid);
    const data={cid,evid:eid,date:e?e.date:(r?r.date:iso(TODAY)),feel,asked:$('#r-asked').value.trim()};
    data.evals=Object.entries(sel).map(([lid,score])=>({lid,score}));
    const doneBefore=new Set(S.lessons.filter(isDone).map(l=>l.id));
    const ok=await mutate('review/save',{id:rid,...data,lessons:ls.map((t,i)=>({id:existing[i]?.id||null,text:t}))},()=>{
      let id=rid;
      if(r)Object.assign(r,data);else{id=uid();S.reviews.push({id,...data})}
      ls.forEach((t,i)=>{
        const old=existing[i];
        if(old){if(t)old.text=t;else S.lessons=S.lessons.filter(l=>l!==old)}
        else if(t)S.lessons.push({id:uid(),rid:id,text:t});
      });
    });
    if(!ok)return;
    closeLayer();
    const newly=S.lessons.filter(l=>isDone(l)&&!doneBefore.has(l.id));
    toast(newly.length?`「${newly[0].text}」が身につきました${newly.length>1?` ほか${newly.length-1}件`:''}`:'ふりかえりを保存しました');
  });
  if($('#r-del'))$('#r-del').onclick=()=>{
    $('#r-confirm').innerHTML='<div class="confirm">このふりかえりと、そこから生まれた「意識すること」を削除します<button class="btn danger" id="r-del2">削除する</button></div>';
    $('#r-del2').onclick=e=>busy(e.currentTarget,async()=>{if(await mutate('review/delete',{id:rid},()=>{S.reviews=S.reviews.filter(x=>x.id!==rid);S.lessons=S.lessons.filter(l=>l.rid!==rid)},'削除しました'))closeLayer()});
  };
}

function openCompany(id){
  const c=id?comp(id):{id:null,name:'',industry:'',stage:'interest',pref:3,url:'',site:'',mypage:'',memo:''};
  if(!c)return;
  let st=c.stage,pf=c.pref;
  const rt={...(c.ratings||{})};
  const otherAxes=S.axes.filter(a=>a.id!=='pref');
  const evs=id?S.events.filter(e=>e.cid===id).sort((a,b)=>a.date.localeCompare(b.date)):[];
  const ls=id?S.lessons.filter(l=>rev(l.rid)?.cid===id):[];
  const ts=id?S.tasks.filter(t=>t.cid===id):[];
  drawer(id?'企業の詳細':'企業を追加',`
    ${id?siteLinksHTML(c):''}
    <div class="field"><label class="label" for="f-name">企業名</label><input id="f-name" maxlength="100" value="${esc(c.name)}" placeholder="例：株式会社〇〇"></div>
    <div class="field"><label class="label" for="f-ind">業界</label><input id="f-ind" maxlength="100" value="${esc(c.industry)}" placeholder="例：IT・ソフトウェア"></div>
    <div class="field"><span class="label">選考ステージ</span><div class="stage-pick" id="f-stage">${ALLST.map(s=>`<button type="button" data-s="${s.id}" aria-pressed="${s.id===st}">${s.name}</button>`).join('')}</div></div>
    <div class="field"><span class="label">志望度</span><div class="star-pick" id="f-pref">${[1,2,3,4,5].map(n=>`<button type="button" data-p="${n}" class="${n<=pf?'on':''}" aria-label="志望度 ${n}">★</button>`).join('')}</div></div>
    ${otherAxes.length?`<div class="field"><span class="label">わたしの軸での評価</span><p class="hint" style="margin:0 0 4px">企業一覧の「わたしの軸」で、この評価と重みからマッチ度を出します。同じ★をもう一度押すと未評価に戻ります。</p>
      <div class="axrate">${otherAxes.map(a=>`<div><span>${esc(a.name)}</span><div class="star-pick" data-axr="${esc(a.id)}">${[1,2,3,4,5].map(n=>`<button type="button" data-n="${n}" class="${n<=(rt[a.id]||0)?'on':''}" aria-label="${esc(a.name)} ${n}">★</button>`).join('')}</div></div>`).join('')}</div></div>`:''}
    <div class="field"><label class="label" for="f-site">企業のHP（ホームページ）</label><input id="f-site" type="url" inputmode="url" maxlength="500" value="${esc(c.site||'')}" placeholder="https://www.example.co.jp"></div>
    <div class="field"><label class="label" for="f-url">採用ページURL</label><input id="f-url" type="url" inputmode="url" maxlength="500" value="${esc(c.url)}" placeholder="https://"></div>
    <div class="field"><label class="label" for="f-my">マイページ情報</label><input id="f-my" maxlength="255" value="${esc(c.mypage)}" placeholder="ログインIDなど"><p class="hint" style="margin:2px 0 0;color:var(--warn)">ログインIDなどのメモ用です。パスワードは書かないでください。</p></div>
    <div class="field"><label class="label" for="f-memo">メモ</label><textarea id="f-memo" maxlength="5000" placeholder="志望動機、面接で聞かれたこと など">${esc(c.memo)}</textarea></div>
    ${id?`<div class="field"><span class="label">この企業の予定</span><div class="list">${evs.length?evs.map(e=>`<div class="row" data-ev2="${esc(e.id)}">${dateBox(e.date)}<div class="body"><div class="t">${esc(e.title)}</div><div class="m">${e.type}${e.time?' ・ '+e.time:''}</div></div>${dueChip(e.date)}</div>`).join(''):'<div class="empty">予定はありません</div>'}</div><button class="btn" id="f-addev" type="button">＋ この企業の予定を追加</button></div>
    <div class="field"><span class="label">この企業のタスク</span><div class="list">${ts.length?ts.map(t=>`<div class="row" data-task2="${esc(t.id)}"><div class="body"><div class="t" style="${t.done?'text-decoration:line-through;color:var(--muted)':''}">${esc(t.title)}</div></div>${t.done?'<span class="chip ok">完了</span>':taskDue(t.due)}</div>`).join(''):'<div class="empty">タスクはありません</div>'}</div><button class="btn" id="f-addtask" type="button">＋ この企業のタスクを追加</button></div>
    ${ls.length?`<div class="field"><span class="label">この企業で学んだこと</span><div class="list">${ls.map(l=>`<div class="row" style="cursor:default"><div class="body"><div class="t" style="white-space:normal">${isDone(l)?'✓ ':'→ '}${esc(l.text)}${isDone(l)?'':` <span class="mono" style="color:var(--muted);font-size:12px">${lessonStat(l).pct}%</span>`}</div></div></div>`).join('')}</div></div>`:''}`:''}
    <div id="f-confirm"></div>`,
    `${id?'<button class="btn danger" id="f-del">削除</button>':''}<span class="spacer"></span><button class="btn" id="f-cancel">キャンセル</button><button class="btn primary" id="f-save">${id?'保存':'追加'}</button>`);
  document.querySelectorAll('#f-stage button').forEach(b=>b.onclick=()=>{st=b.dataset.s;document.querySelectorAll('#f-stage button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  document.querySelectorAll('#f-pref button').forEach(b=>b.onclick=()=>{pf=+b.dataset.p;document.querySelectorAll('#f-pref button').forEach(x=>x.classList.toggle('on',+x.dataset.p<=pf))});
  document.querySelectorAll('[data-axr]').forEach(g=>g.querySelectorAll('button').forEach(b=>b.onclick=()=>{const k=g.dataset.axr,n=+b.dataset.n;rt[k]=rt[k]===n?0:n;g.querySelectorAll('button').forEach(x=>x.classList.toggle('on',+x.dataset.n<=rt[k]))}));
  document.querySelectorAll('[data-ev2]').forEach(r=>r.onclick=()=>openEvent(r.dataset.ev2));
  if($('#f-addev'))$('#f-addev').onclick=()=>openEvent(null,id);
  if($('#f-addtask'))$('#f-addtask').onclick=()=>openTask(null,id);
  document.querySelectorAll('[data-task2]').forEach(r=>r.onclick=()=>openTask(r.dataset.task2));
  $('#f-cancel').onclick=closeLayer;
  $('#f-save').onclick=e=>busy(e.currentTarget,async()=>{
    const name=$('#f-name').value.trim();
    if(!name){$('#f-name').focus();$('#f-confirm').innerHTML='<div class="confirm">企業名を入力してください</div>';return}
    for(const [sel,label] of [['#f-site','企業のHP'],['#f-url','採用ページ']]){const v=fixUrl($(sel).value);if(v&&!isAnyWebUrl(v)){$('#f-confirm').innerHTML=`<div class="confirm">${label}のURLは https:// から始まる形で入力してください</div>`;$(sel).focus();return}}
    Object.keys(rt).forEach(k=>{if(!rt[k])delete rt[k]});
    const data={name,industry:$('#f-ind').value.trim(),stage:st,pref:pf,url:fixUrl($('#f-url').value),site:fixUrl($('#f-site').value),mypage:$('#f-my').value.trim(),memo:$('#f-memo').value,ratings:rt};
    if(await mutate('company/save',{id,...data},()=>{if(id)Object.assign(c,data);else S.companies.push({id:uid(),...data})},id?'保存しました':`${name} を追加しました`))closeLayer();
  });
  if($('#f-del'))$('#f-del').onclick=()=>{
    $('#f-confirm').innerHTML=`<div class="confirm">「${esc(c.name)}」と関連する予定を削除します<button class="btn danger" id="f-del2">削除する</button></div>`;
    $('#f-del2').onclick=e=>busy(e.currentTarget,async()=>{if(await mutate('company/delete',{id},()=>{S.companies=S.companies.filter(x=>x.id!==id);S.events=S.events.filter(e=>e.cid!==id)},'削除しました'))closeLayer()});
  };
}

function openEvent(id,presetCid,presetDate){
  const e=id?ev(id):{id:null,cid:presetCid||'',type:'面接',date:presetDate||iso(TODAY),time:'',title:'',place:'',url:'',items:'',auto:true,reminders:[]};
  if(!e)return;
  const canReview=id&&diff(e.date)<=0&&REVIEWABLE.includes(e.type);
  const rv=id?S.reviews.find(r=>r.evid===id):null;
  drawer(id?'予定の編集':'予定を追加',`
    ${canReview?`<div class="nudge" style="margin:0"><p>${rv?'ふりかえり済みです。':'この予定はもう終わりました。<b>ふりかえり</b>を書いて次に活かしましょう。'}</p><button class="btn ${rv?'':'gold'}" id="e-rev" type="button">${rv?'ふりかえりを見る':'ふりかえる'}</button></div>`:''}
    ${id&&isPrepTarget(e)?`<div class="prepbar" style="margin:0"><p>面接の前に、企業メモや意識することを1画面で見返せます。</p><button class="btn primary" id="e-prep" type="button">面接前カードを見る</button></div>`:''}
    <div class="field"><label class="label" for="e-cid">企業</label><select id="e-cid"><option value="">（企業なし）</option>${S.companies.map(c=>`<option value="${esc(c.id)}" ${c.id===e.cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label class="label" for="e-type">種類</label><select id="e-type">${EVTYPES.map(t=>`<option ${t===e.type?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label class="label" for="e-title">内容</label><input id="e-title" maxlength="100" value="${esc(e.title)}" placeholder="例：一次面接（オンライン）"></div>
    <div class="two"><div class="field"><label class="label" for="e-date">日付</label><input type="date" id="e-date" value="${esc(e.date)}"></div><div class="field"><label class="label" for="e-time">時刻</label><input type="time" id="e-time" value="${esc(e.time)}"></div></div>
    <div class="field"><label class="label" for="e-place">場所</label><input id="e-place" maxlength="255" value="${esc(e.place||'')}" placeholder="例：本社3F受付／オンライン"></div>
    <div class="field"><label class="label" for="e-url">オンライン面接のURL（Zoom・Teams・Google Meet など）</label><input id="e-url" type="url" inputmode="url" maxlength="500" value="${esc(e.url||'')}" placeholder="https://zoom.us/j/…"><p class="hint" style="margin:2px 0 0">貼っておくと、面接前カードやホームから「Zoomに参加」ですぐ開けます。https:// から始まるURLだけ保存できます。</p></div>
    <div class="field"><label class="label" for="e-items">持ち物・メモ</label><input id="e-items" maxlength="255" value="${esc(e.items||'')}" placeholder="例：履歴書、筆記用具、学生証"></div>
    <div class="field"><span class="label">通知</span>
      <label class="sw"><input type="checkbox" id="e-auto" ${e.auto!==false?'checked':''}>${rulesText('eventRem')}</label>
      <div id="e-rems" style="display:flex;flex-direction:column;gap:6px"></div>
      <button class="btn sm" id="e-addrem" type="button" style="align-self:flex-start">＋ 通知日時を追加</button>
    </div>
    ${e.google?'<p class="hint">Googleカレンダーの「就活日和」カレンダーと同期しています。</p>':''}
    <div id="e-confirm"></div>`,
    `${id?'<button class="btn danger" id="e-del">削除</button>':''}<span class="spacer"></span><button class="btn" id="e-cancel">キャンセル</button><button class="btn primary" id="e-save">${id?'保存':'追加'}</button>`);
  const getRems=remEditor('e',e.reminders,()=>$('#e-date').value);
  if($('#e-rev'))$('#e-rev').onclick=()=>rv?openReview(rv.id):openReview(null,id);
  if($('#e-prep'))$('#e-prep').onclick=()=>openPrep(id);
  $('#e-cancel').onclick=closeLayer;
  $('#e-save').onclick=ev0=>busy(ev0.currentTarget,async()=>{
    const date=$('#e-date').value;
    if(!date){$('#e-confirm').innerHTML='<div class="confirm">日付を入力してください</div>';return}
    const url=$('#e-url').value.trim();
    if(url&&!isWebUrl(url)){$('#e-confirm').innerHTML='<div class="confirm">URLは https:// から始まる形で貼ってください</div>';$('#e-url').focus();return}
    const data={cid:$('#e-cid').value,type:$('#e-type').value,title:$('#e-title').value.trim()||$('#e-type').value,date,time:$('#e-time').value,place:$('#e-place').value.trim(),url,items:$('#e-items').value.trim(),auto:$('#e-auto').checked,reminders:getRems()};
    if(await mutate('event/save',{id,...data},()=>{if(id)Object.assign(e,data);else S.events.push({id:uid(),...data})},id?'保存しました':'予定を追加しました'))closeLayer();
  });
  if($('#e-del'))$('#e-del').onclick=()=>{
    $('#e-confirm').innerHTML='<div class="confirm">この予定を削除します<button class="btn danger" id="e-del2">削除する</button></div>';
    $('#e-del2').onclick=x=>busy(x.currentTarget,async()=>{if(await mutate('event/delete',{id},()=>{S.events=S.events.filter(x=>x.id!==id);S.reviews.forEach(r=>{if(r.evid===id)r.evid=''})},'削除しました'))closeLayer()});
  };
}

/* ---- 管理画面（管理者だけ） ---- */
// 見せるのは最低限の情報だけ（名前・メール・登録日・最終ログイン・状態）。企業やふりかえりの中身は見せない
function loadAdmin(){
  if(adminLoading)return;adminLoading=true;
  api('admin',null,'GET').then(d=>{ADMIN=d}).catch(handleErr).finally(()=>{adminLoading=false;if(view==='admin')render()});
}
function adminHTML(){
  if(!ADMIN){loadAdmin();return '<h1>管理画面</h1><div class="panel empty">読み込んでいます…</div>'}
  const A=ADMIN,days=A.days;
  const todayPv=A.pv.at(-1),todayUv=A.uv.at(-1),weekPv=A.pv.slice(-7).reduce((a,b)=>a+b,0),prevWeekPv=A.prevWeekPv;
  const step=Math.max(10,Math.ceil(Math.max(...A.pv,1)/2/10)*10),mx=step*2,W=960,H=240,pl=40,pb=28,bw=(W-pl-8)/A.pv.length;
  const y=v=>H-pb-(v/mx)*(H-pb-18);
  const ticks=[0,step,mx];
  const chart=`<svg viewBox="0 0 ${W} ${H}" class="ill" role="img" aria-label="直近14日のページビュー。今日は${todayPv}">
    ${ticks.map(t=>`<line x1="${pl}" x2="${W-4}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${pl-6}" y="${y(t)+4}" font-size="11" fill="var(--muted)" text-anchor="end">${t}</text>`).join('')}
    ${A.pv.map((v,i)=>`<rect x="${pl+i*bw+bw*0.18}" y="${y(v)}" width="${bw*0.64}" height="${H-pb-y(v)}" rx="3" fill="var(--accent)" fill-opacity="${i===A.pv.length-1?1:.45}"><title>${md(days[i])} ${v}PV・${A.uv[i]}人</title></rect>`).join('')}
    ${days.map((d,i)=>i%2===1||i===days.length-1?`<text x="${pl+i*bw+bw/2}" y="${H-8}" font-size="11" fill="var(--muted)" text-anchor="middle">${md(d)}</text>`:'').join('')}
    <text x="${pl+(A.pv.length-1)*bw+bw/2}" y="${y(todayPv)-6}" font-size="12" font-weight="700" fill="var(--accent)" text-anchor="middle">${todayPv}</text>
  </svg>`;
  const ms=A.members.filter(m=>!adminQ||(m.name+m.mail).toLowerCase().includes(adminQ.toLowerCase()));
  const tile=(l,v,s)=>`<div class="ad-tile"><span class="label">${l}</span><b class="mono">${v}</b><small>${s}</small></div>`;
  const pct=prevWeekPv?Math.round((weekPv-prevWeekPv)/prevWeekPv*100):0;
  const lastText=m=>!m.last?'—':diff(m.last)===0?'今日':(-diff(m.last))+'日前';
  return `
  <h1>管理画面 <span class="chip">管理者だけに表示</span></h1>
  <p class="sub">会員の最低限の情報とアクセス数を確認できます。会員の企業・予定・ふりかえりの中身は見られない仕組みです。</p>
  <div class="ad-tiles">
    ${tile('会員数',A.members.length+'人',`今月の新規 ${A.newMonth}人`)}
    ${tile('直近7日に使った人',A.active7+'人',`会員の${A.members.length?Math.round(A.active7/A.members.length*100):0}%`)}
    ${tile('今日のアクセス',todayPv+'PV',`${todayUv}人が利用`)}
    ${tile('直近7日のアクセス',weekPv+'PV',prevWeekPv?`前の7日より ${pct>=0?'+':''}${pct}%`:'前の7日のデータなし')}
  </div>
  <section class="panel" style="margin-bottom:20px">
    <h2>アクセス数（直近14日）</h2>
    ${chart}
  </section>
  <section class="panel">
    <h2>会員一覧 <span class="label">${A.members.length}人</span></h2>
    <div class="toolbar"><input class="search" id="adQ" type="search" placeholder="名前・メールで検索" value="${esc(adminQ)}" aria-label="会員を検索"></div>
    <div class="tbl-wrap"><table><thead><tr><th>名前</th><th>メールアドレス</th><th>登録日</th><th>最終ログイン</th><th>状態</th></tr></thead>
    <tbody>${ms.map(m=>`<tr style="cursor:default"><td><b>${esc(m.name)}</b>${m.role==='admin'?' <span class="chip">管理者</span>':''}</td><td class="mono" style="font-size:12px">${esc(m.mail)}</td><td class="mono">${m.reg.replace(/-/g,'/')}</td><td>${lastText(m)}</td><td>${m.stop?'<span class="chip bad">停止中</span>':'<span class="chip ok">利用中</span>'}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">該当する会員はいません</td></tr>'}</tbody></table></div>
    <p class="hint" style="margin:10px 0 0">パスワードと、会員の企業・予定・ふりかえりの中身は管理者にも見えません。</p>
  </section>`;
}
function bindAdmin(){
  if(view!=='admin'||!S.isAdmin||!ADMIN)return;
  const qi=$('#adQ');if(qi)qi.oninput=()=>{adminQ=qi.value.trim();render()};
}

/* ---- 企業のHP・採用ページ ---- */
const isAnyWebUrl=u=>/^https?:\/\/[^\s<>"]+$/i.test(u||'');
// 「example.co.jp」のように書いたら https:// を補う
const fixUrl=u=>{u=(u||'').trim();if(u&&!/^https?:\/\//i.test(u)&&/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u))u='https://'+u;return u};
const GLOBE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
function siteLinksHTML(c){
  const links=[[c.site,'企業のHP'],[c.url,'採用ページ']].filter(([u])=>isAnyWebUrl(u));
  if(!links.length)return'';
  return `<div class="site-links">${links.map(([u,l])=>`<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${GLOBE}${l}を開く ↗</a>`).join('')}</div>`;
}

/* ---- オンライン面接のURL ---- */
const isWebUrl=u=>/^https:\/\/[^\s<>"]+$/i.test(u||'');
function meetName(u){
  if(/zoom\.(us|com)/i.test(u))return'Zoom';
  if(/teams\.(microsoft|live)\.com/i.test(u))return'Microsoft Teams';
  if(/meet\.google\.com/i.test(u))return'Google Meet';
  if(/webex\.com/i.test(u))return'Webex';
  return'オンライン面接';
}
function meetLinkHTML(e,big){
  if(!isWebUrl(e.url))return'';
  return `<div class="meet ${big?'big':''}"><a class="btn primary" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${ICO.video}${meetName(e.url)}に参加</a><button class="btn" type="button" data-copy="${esc(e.url)}">URLをコピー</button></div>`;
}
function bindCopy(root){
  (root||document).querySelectorAll('[data-copy]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();const t=b.dataset.copy;
    const fail=()=>toast('コピーできませんでした。予定の編集画面のURL欄からコピーしてください');
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(t).then(()=>toast('URLをコピーしました')).catch(fail);else fail()});
}

/* ---- 面接前カード ---- */
const ICO={
  video:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="width:18px;height:18px"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  flag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>'
};
function prepCardHTML(){
  const p=nextPrep();if(!p)return'';
  const c=comp(p.cid),n=diff(p.date),d=parse(p.date),acts=active();
  const when=n===0?'今日':n===1?'明日':'あさって';
  return `<section class="prepcard" aria-label="次の面接">
    <div class="pc-date"><span class="pc-when">${when}</span><b class="mono">${d.getMonth()+1}/${d.getDate()}</b><span>${WD[d.getDay()]}曜${p.time?' '+p.time:''}</span></div>
    <div class="pc-body">
      <span class="label">次の面接</span>
      <div class="pc-co">${esc(c?.name||'（企業なし）')}</div>
      <div class="pc-ti">${esc(p.title)}</div>
      <div class="pc-meta">
        <span>${ICO.pin}<span>${p.place?esc(p.place):'<em>場所・URLは未入力</em>'}</span></span>
        <span>${ICO.bag}<span>${p.items?esc(p.items):'<em>持ち物は未入力</em>'}</span></span>
        ${acts.length?`<span class="pc-focus">${ICO.flag}<span>意識すること：<b>${esc(acts[0].text)}</b>${acts.length>1?` ほか${acts.length-1}件`:''}</span></span>`:''}
      </div>
      ${meetLinkHTML(p)}
    </div>
    <button class="btn primary pc-btn" data-prep="${esc(p.id)}">面接前カードを開く</button>
  </section>`;
}
function askedTop(n=6){
  const cnt={};
  S.reviews.forEach(r=>(r.asked||'').split(/[／\/、,\n]/).map(s=>s.trim()).filter(Boolean).forEach(s=>cnt[s]=(cnt[s]||0)+1));
  return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,n);
}
function openPrep(evid){
  const e=ev(evid);if(!e)return;
  const c=comp(e.cid)||{name:'（企業なし）',memo:'',id:''};
  const d=parse(e.date),n=diff(e.date);
  const when=n<0?`${-n}日前`:n===0?'今日':n===1?'明日':n===2?'あさって':`${n}日後`;
  const prev=S.reviews.filter(r=>c.id&&r.cid===c.id&&r.asked).sort((a,b)=>b.date.localeCompare(a.date));
  const top=askedTop();
  const acts=active();
  const tasks=S.tasks.filter(t=>c.id&&t.cid===c.id&&!t.done);
  const ms=c.id?matchScore(c):{pct:null};
  const sec=(t,body)=>`<section class="prep-s"><h4>${t}</h4>${body}</section>`;
  drawer('面接前カード',`
    <div class="prep-h">
      <div class="prep-d"><span>${when}</span><b class="mono">${d.getMonth()+1}/${d.getDate()}</b><span>${WD[d.getDay()]}曜 ${e.time||''}</span></div>
      <div style="min-width:0"><div class="label">${esc(e.type)}</div><h2>${esc(c.name)}</h2><p>${esc(e.title)}</p></div>
    </div>
    ${meetLinkHTML(e,true)}
    <div class="prep-info">
      <div><span class="label">場所</span><b>${e.place?esc(e.place):'<span class="muted">未入力</span>'}</b></div>
      <div><span class="label">持ち物・メモ</span><b>${e.items?esc(e.items):'<span class="muted">未入力</span>'}</b></div>
    </div>
    ${sec('この面接で意識すること',acts.length?`<div class="list">${acts.slice(0,4).map(l=>`<div class="prep-l"><b>${esc(l.text)}</b>${meter(lessonStat(l).pct)}</div>`).join('')}</div>`:'<div class="empty">意識中の課題はありません</div>')}
    ${sec('この企業で前回聞かれたこと',prev.length?`<ul class="prep-ul">${prev.map(r=>`<li><span class="mono">${md(r.date)}</span> ${esc(r.asked)}</li>`).join('')}</ul>`:'<div class="empty">まだ記録がありません。初めての面接です</div>')}
    ${sec('ほかの面接でよく聞かれたこと',top.length?`<div class="prep-chips">${top.map(([q,k])=>`<span class="chip gray">${esc(q)}${k>1?` <b class="mono">×${k}</b>`:''}</span>`).join('')}</div>`:'<div class="empty">ふりかえりの「聞かれたこと」がたまると表示されます</div>')}
    ${sec('志望動機・企業メモ',c.memo?`<p class="prep-memo">${esc(c.memo)}</p>`:'<div class="empty">企業の詳細の「メモ」に書いた内容が表示されます</div>')}
    ${sec('この企業のやること',tasks.length?`<div class="list">${tasks.map(taskRow).join('')}</div>`:'<div class="empty">残っているタスクはありません</div>')}
    ${c.id?sec('わたしの軸',`<div class="prep-ms"><b class="mono">${ms.pct==null?'—':ms.pct+'%'}</b><span>マッチ度（${S.axes.filter(a=>a.w).map(a=>`${esc(a.name)} ${axisRating(c,a)?'★'+axisRating(c,a):'未評価'}`).join('・')}）</span></div>`):''}`,
    `<button class="btn" id="p-edit">予定を編集</button><span class="spacer"></span><button class="btn primary" id="p-close">閉じる</button>`,'wide');
  $('#p-close').onclick=closeLayer;
  $('#p-edit').onclick=()=>openEvent(evid);
  bindCopy($('#layer'));
  document.querySelectorAll('#layer [data-toggle]').forEach(b=>b.onclick=x=>busy(x.currentTarget,async()=>{if(await toggleTask(b.dataset.toggle))openPrep(evid)}));
  document.querySelectorAll('#layer [data-task]').forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}

/* ---- 起動 ---- */
function start(){
  // 画面の幅がスマホ版／パソコン版をまたいだら描き直す（管理画面の表示の切り替え）
  mqNarrow.addEventListener?mqNarrow.addEventListener('change',()=>{if(view==='admin'&&!guestPage)render()}):null;
  const params=new URLSearchParams(location.search);
  if(location.pathname==='/install'&&params.get('welcome')&&!demo&&!isStandalone())onboarding=true;
  render();
  // 通知などのリンク（?prep= ?review= ?task= ?event=）から開いたとき
  {
    const p=params;
    if(p.get('prep')&&ev(p.get('prep')))openPrep(p.get('prep'));
    else if(p.get('review')&&ev(p.get('review'))){const r=S.reviews.find(x=>x.evid===p.get('review'));r?openReview(r.id):openReview(null,p.get('review'))}
    else if(p.get('task')&&S.tasks.some(t=>t.id===p.get('task')))openTask(p.get('task'));
    else if(p.get('event')&&ev(p.get('event')))openEvent(p.get('event'));
  }
  const g=params.get('google');
  if(g)toast(g==='ok'?'Googleカレンダーと接続しました。「就活日和」カレンダーに予定を送りました':g==='cancel'?'Googleとの接続をキャンセルしました':'Googleと接続できませんでした。もう一度お試しください');
  if(location.search)history.replaceState({},'',location.pathname);
  // ホーム画面から開いている＝追加済み
  if(!demo&&isStandalone()&&!S.installDone)api('settings/install',{action:'done'}).then(setState).catch(()=>{});
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').then(()=>checkPush()).catch(()=>{});
    // 通知をタップしたとき、開いている画面で該当のページを開く
    navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='open'){refresh().then(()=>openLink(e.data.url))}});
  }
  // しばらく離れて戻ってきたら、最新のデータにする（ほかの端末での変更・通知の反映）
  let hiddenAt=0;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();return}if(!demo&&Date.now()-hiddenAt>60000&&!$('#layer').innerHTML)refresh()});
  window.addEventListener('offline',()=>{const o=document.createElement('div');o.className='offline';o.id='offline';o.textContent='オフラインです。電波が戻ると保存できます';document.body.appendChild(o)});
  window.addEventListener('online',()=>$('#offline')?.remove());
  // ＋ボタン：下へスクロールしている間は丸く縮め、上に戻したり止まったりすると文字を出す
  let lastY=window.scrollY,fabTimer=0;
  window.addEventListener('scroll',()=>{const y=window.scrollY,fab=$('#fab');
    if(y>lastY+4&&y>80)fab.classList.add('mini');else if(y<lastY-4||y<=80)fab.classList.remove('mini');
    lastY=y;clearTimeout(fabTimer);fabTimer=setTimeout(()=>fab.classList.remove('mini'),1200)},{passive:true});
}
async function refresh(){if(demo)return;try{setState(await api('state',null,'GET'));render()}catch(e){if(e.status===401)location.href='/login'}}
start();
