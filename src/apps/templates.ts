/**
 * Starter apps seeded on first launch so Mapp is useful before signing in.
 * They rely on the design kit (src/apps/kit.ts) injected before their code.
 */
export const STARTER_APPS = [
  {
    name: 'Habits',
    emoji: '✅',
    color: '#34c759',
    description: 'Track daily habits with streaks.',
    html: `<!doctype html>
<html><head><style>
.check{flex:none;width:28px;height:28px;border-radius:50%;border:2px solid var(--m-tertiary);display:grid;place-items:center;color:var(--m-on-accent);transition:background .15s,border-color .15s}
.check svg{width:16px;height:16px;opacity:0}
.done .check{background:var(--m-accent);border-color:var(--m-accent)}.done .check svg{opacity:1}
.hit{margin:-8px;padding:8px}
.del{flex:none;width:44px;height:44px;margin:-8px -12px -8px 0;color:var(--m-danger);font-size:15px;font-weight:600}
.editing .m-row-end .streak{display:none}
</style></head><body class="m-app">
<header class="m-nav">
  <div class="m-nav-bar"><span></span><button class="m-nav-btn" id="edit">Edit</button></div>
  <h1 class="m-title">Habits</h1>
  <p class="m-nav-sub" id="sub"></p>
</header>
<main class="m-page">
  <div class="m-section-title" id="label">Today</div>
  <div class="m-list" id="list"></div>
  <div class="m-empty" id="empty" hidden><h3>No habits yet</h3><p>Add one below, like "Read 10 pages".</p></div>
</main>
<form class="m-bottom" id="f"><input class="m-input" id="i" placeholder="New habit" autocomplete="off" enterkeyhint="done"><button class="m-button">Add</button></form>
<script>
const day=d=>d.toISOString().slice(0,10);
const tick='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
let habits=[],editing=false;
async function load(){habits=(await mapp.storage.get('habits'))||[{name:'Drink water',days:[]},{name:'Walk 20 minutes',days:[]}];render()}
function save(){mapp.storage.set('habits',habits)}
function streak(h){let n=0;const d=new Date();while(h.days.includes(day(d))){n++;d.setDate(d.getDate()-1)}return n}
function render(){
  const t=day(new Date()),list=document.getElementById('list');list.innerHTML='';
  document.body.classList.toggle('editing',editing);
  document.getElementById('edit').textContent=editing?'Done':'Edit';
  document.getElementById('edit').classList.toggle('strong',editing);
  document.getElementById('edit').hidden=!habits.length;
  const done=habits.filter(h=>h.days.includes(t)).length;
  document.getElementById('sub').textContent=habits.length?(done===habits.length?'All done today':done+' of '+habits.length+' done today'):'';
  document.getElementById('empty').hidden=habits.length>0;
  list.hidden=document.getElementById('label').hidden=!habits.length;
  habits.forEach((h,i)=>{
    const isDone=h.days.includes(t),s=streak(h);
    const row=document.createElement('div');row.className='m-row'+(isDone?' done':'');
    row.innerHTML='<button class="hit" aria-label="Toggle"><span class="check">'+tick+'</span></button><div class="m-row-body"><div class="m-row-title"></div></div><div class="m-row-end"><span class="streak"></span></div>';
    row.querySelector('.m-row-title').textContent=h.name;
    row.querySelector('.streak').textContent=s?s+(s===1?' day':' days'):'';
    row.querySelector('.hit').setAttribute('aria-label',(isDone?'Mark not done: ':'Mark done: ')+h.name);
    row.querySelector('.hit').onclick=()=>{isDone?h.days=h.days.filter(x=>x!==t):h.days.push(t);mapp.haptics.impact(isDone?'light':'medium');save();render()};
    if(editing){const del=document.createElement('button');del.className='del';del.textContent='Delete';del.setAttribute('aria-label','Delete '+h.name);
      del.onclick=()=>{habits.splice(i,1);mapp.haptics.notification('warning');if(!habits.length)editing=false;save();render()};row.querySelector('.m-row-end').appendChild(del)}
    list.appendChild(row)})}
document.getElementById('edit').onclick=()=>{editing=!editing;mapp.haptics.selection();render()};
document.getElementById('f').onsubmit=e=>{e.preventDefault();const input=document.getElementById('i'),v=input.value.trim();if(!v)return;
  habits.push({name:v,days:[]});input.value='';mapp.haptics.impact('light');save();render()};
load();
</script></body></html>`,
  },
  {
    name: 'Tip Split',
    emoji: '💸',
    color: '#ff9500',
    description: 'Split a bill with tip between friends.',
    html: `<!doctype html>
<html><head><style>
.amount{width:100%;border:0;background:none;outline:none;font-size:40px;font-weight:700;letter-spacing:-.02em;color:var(--m-label);padding:0;font-variant-numeric:tabular-nums}
.stepper{display:flex;align-items:center;gap:4px}
.stepper button{width:44px;height:36px;border-radius:9px;background:var(--m-fill);font-size:20px;color:var(--m-label)}
.stepper button:active{opacity:.6}.stepper b{min-width:32px;text-align:center;font-size:17px;font-variant-numeric:tabular-nums;color:var(--m-label)}
.result{text-align:center;padding:var(--m-6) var(--m-4)}.result .m-stat-value{font-size:48px;color:var(--m-label)}
.num{font-variant-numeric:tabular-nums;color:var(--m-label)}
</style></head><body class="m-app">
<header class="m-nav"><h1 class="m-title">Tip Split</h1></header>
<main class="m-page">
  <div class="m-card"><label class="m-footnote" for="bill">Bill amount</label><input class="amount" id="bill" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>
  <div class="m-section-title">Tip</div>
  <div class="m-segmented" id="tips" role="group" aria-label="Tip percentage"></div>
  <div class="m-section-title">Split</div>
  <div class="m-list"><div class="m-row"><span class="m-row-title">People</span><div class="m-row-end stepper"><button id="minus" aria-label="Fewer people">−</button><b id="people">2</b><button id="plus" aria-label="More people">+</button></div></div></div>
  <div class="m-card m-stat result"><span class="m-stat-value" id="each">0.00</span><span class="m-stat-label">each</span></div>
  <div class="m-list">
    <div class="m-row"><span class="m-row-title">Subtotal</span><span class="m-row-end num" id="sub">0.00</span></div>
    <div class="m-row"><span class="m-row-title">Tip</span><span class="m-row-end num" id="tipv">0.00</span></div>
    <div class="m-row"><span class="m-row-title">Total</span><span class="m-row-end num" id="total">0.00</span></div>
  </div>
</main>
<script>
let tip=15,people=2;const tips=[0,10,15,20];
const fmt=n=>n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const $=id=>document.getElementById(id),tipsEl=$('tips');
tips.forEach(t=>{const b=document.createElement('button');b.textContent=t+'%';b.onclick=()=>{tip=t;mapp.haptics.selection();calc()};tipsEl.appendChild(b)});
$('minus').onclick=()=>{if(people>1){people--;mapp.haptics.impact()}calc()};
$('plus').onclick=()=>{people++;mapp.haptics.impact();calc()};
$('bill').oninput=calc;
function calc(){const bill=parseFloat($('bill').value.replace(',','.'))||0,tipAmount=bill*tip/100,total=bill+tipAmount;
  [...tipsEl.children].forEach((b,i)=>{const on=tips[i]===tip;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  $('people').textContent=people;$('minus').disabled=people<=1;
  $('each').textContent=fmt(total/people);$('sub').textContent=fmt(bill);$('tipv').textContent=fmt(tipAmount);$('total').textContent=fmt(total)}
calc();
</script></body></html>`,
  },
  {
    name: 'Focus',
    emoji: '⏳',
    color: '#5856d6',
    description: 'A calm focus timer.',
    html: `<!doctype html>
<html><head><style>
.timer{display:grid;place-items:center;margin:var(--m-6) auto var(--m-8);width:min(72vw,280px);aspect-ratio:1;position:relative}
.timer svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.track{stroke:var(--m-fill)}.bar{stroke:var(--m-accent);transition:stroke-dashoffset .3s linear}
.time{font-size:64px;font-weight:300;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.state{position:absolute;bottom:26%;font-size:15px;color:var(--m-secondary)}
.controls{display:grid;grid-template-columns:1fr 1fr;gap:var(--m-3);margin-bottom:var(--m-6)}
</style></head><body class="m-app">
<header class="m-nav"><h1 class="m-title">Focus</h1></header>
<main class="m-page">
  <div class="m-segmented" id="lengths" role="group" aria-label="Session length"></div>
  <div class="timer" role="timer" aria-live="off">
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46" fill="none" stroke-width="3"/><circle class="bar" id="bar" cx="50" cy="50" r="46" fill="none" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>
    <span class="time" id="t">25:00</span><span class="state" id="state">Ready</span>
  </div>
  <div class="controls"><button class="m-button secondary" id="r">Reset</button><button class="m-button" id="g">Start</button></div>
  <div class="m-list"><div class="m-row"><span class="m-row-title">Sessions completed</span><span class="m-row-end" id="c">0</span></div></div>
  <p class="m-footnote" style="padding:0 var(--m-4)">You get a notification when the session ends, even if you leave the app.</p>
</main>
<script>
const NOTE=25,lengths=[15,25,45];let len=25*60,left=len,timer=null,endAt=0,done=0;
const $=id=>document.getElementById(id);
lengths.forEach(m=>{const b=document.createElement('button');b.textContent=m+' min';b.onclick=()=>{if(timer)return;len=left=m*60;mapp.haptics.selection();show()};$('lengths').appendChild(b)});
mapp.storage.get('sessions').then(v=>{done=v||0;show()});
function show(){const m=Math.floor(left/60),s=left%60;$('t').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  $('bar').style.strokeDashoffset=String(100*left/len);$('bar').style.opacity=left===len?'0':'1';$('c').textContent=done;
  [...$('lengths').children].forEach((b,i)=>{const on=lengths[i]*60===len;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.disabled=!!timer});
  $('state').textContent=timer?'Focusing':left===len?'Ready':left?'Paused':'Done';
  $('g').textContent=timer?'Pause':left<len&&left>0?'Resume':'Start'}
function tick(){left=Math.max(0,Math.round((endAt-Date.now())/1000));if(!left){stop();done++;mapp.storage.set('sessions',done);mapp.haptics.notification('success')}show()}
function stop(){clearInterval(timer);timer=null}
$('g').onclick=()=>{mapp.haptics.impact('medium');
  if(timer){stop();mapp.notifications.cancel(NOTE).catch(()=>{});show();return}
  if(!left)left=len;endAt=Date.now()+left*1000;timer=setInterval(tick,250);
  mapp.notifications.schedule({id:NOTE,title:'Focus session done',body:'Time for a short break.',at:endAt}).catch(()=>{});show()};
$('r').onclick=()=>{stop();left=len;mapp.notifications.cancel(NOTE).catch(()=>{});mapp.haptics.impact('light');show()};
show();
</script></body></html>`,
  },
];
