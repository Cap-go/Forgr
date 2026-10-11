/** Starter apps seeded on first launch so Mapp is useful before signing in. */
export const STARTER_APPS = [
  {
    name: 'Habits',
    emoji: '✅',
    color: '#22c55e',
    description: 'Track daily habits with streaks.',
    html: `<!doctype html>
<html><head><style>
:root{--bg:#f6f7f9;--card:#fff;--text:#111;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#0b0c0f;--card:#17191f;--text:#f3f4f6;--muted:#9ca3af}}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text)}
header{padding:calc(var(--safe-top) + 18px) 20px 8px}h1{font-size:34px;margin:0}p.sub{color:var(--muted);margin:4px 0 0}
ul{list-style:none;margin:0;padding:12px 16px calc(var(--safe-bottom) + 110px)}
li{background:var(--card);border-radius:18px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 2px #0000000d}
.check{width:44px;height:44px;border-radius:50%;border:2px solid var(--app-accent);background:none;font-size:20px;color:#fff;touch-action:manipulation}
.done .check{background:var(--app-accent)}.name{flex:1;font-size:17px}.streak{color:var(--muted);font-size:14px}
.del{border:none;background:none;color:var(--muted);font-size:18px;width:36px;height:44px}
form{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(var(--safe-bottom) + 12px);background:var(--bg);display:flex;gap:8px}
input{flex:1;font-size:17px;padding:14px 16px;border-radius:14px;border:1px solid #8883;background:var(--card);color:var(--text)}
form button{border:none;border-radius:14px;padding:0 18px;font-size:17px;font-weight:600;background:var(--app-accent);color:#fff}
.empty{color:var(--muted);text-align:center;padding:40px 20px}
</style></head><body>
<header><h1>Habits</h1><p class="sub" id="sub"></p></header>
<ul id="list"></ul>
<form id="f"><input id="i" placeholder="New habit" autocomplete="off"><button>Add</button></form>
<script>
const day=d=>d.toISOString().slice(0,10);
let habits=[];
async function load(){habits=(await mapp.storage.get('habits'))||[{name:'Drink water',days:[]},{name:'Walk 20 min',days:[]}];render()}
function save(){mapp.storage.set('habits',habits)}
function streak(h){let n=0,d=new Date();while(h.days.includes(day(d))){n++;d.setDate(d.getDate()-1)}return n}
function render(){const t=day(new Date());const list=document.getElementById('list');list.innerHTML='';
const done=habits.filter(h=>h.days.includes(t)).length;document.getElementById('sub').textContent=habits.length?done+' of '+habits.length+' done today':'';
if(!habits.length)list.innerHTML='<p class="empty">Add your first habit below.</p>';
habits.forEach((h,i)=>{const li=document.createElement('li');const isDone=h.days.includes(t);if(isDone)li.className='done';
li.innerHTML='<button class="check">'+(isDone?'✓':'')+'</button><span class="name"></span><span class="streak">🔥 '+streak(h)+'</span><button class="del" aria-label="Delete">✕</button>';
li.querySelector('.name').textContent=h.name;
li.querySelector('.check').onclick=()=>{isDone?h.days=h.days.filter(x=>x!==t):h.days.push(t);mapp.haptics.impact(isDone?'light':'medium');save();render()};
li.querySelector('.del').onclick=()=>{habits.splice(i,1);save();render()};list.appendChild(li)})}
document.getElementById('f').onsubmit=e=>{e.preventDefault();const v=document.getElementById('i').value.trim();if(!v)return;habits.push({name:v,days:[]});document.getElementById('i').value='';save();render()};
load();
</script></body></html>`,
  },
  {
    name: 'Tip Split',
    emoji: '💸',
    color: '#f59e0b',
    description: 'Split a bill with tip between friends.',
    html: `<!doctype html>
<html><head><style>
:root{--bg:#fffaf0;--card:#fff;--text:#1c1917;--muted:#78716c}
@media (prefers-color-scheme:dark){:root{--bg:#120f0a;--card:#1f1a12;--text:#fafaf9;--muted:#a8a29e}}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text);padding:calc(var(--safe-top) + 18px) 20px calc(var(--safe-bottom) + 20px)}
h1{font-size:34px;margin:0 0 18px}.card{background:var(--card);border-radius:20px;padding:18px;margin-bottom:14px}
label{display:block;color:var(--muted);font-size:14px;margin-bottom:8px}
input{width:100%;font-size:34px;font-weight:700;border:none;background:none;color:var(--text);outline:none}
.row{display:flex;gap:8px}.row button{flex:1;height:48px;border-radius:14px;border:none;font-size:17px;font-weight:600;background:#8882;color:var(--text);touch-action:manipulation}
.row button.on{background:var(--app-accent);color:#fff}
.stepper{display:flex;align-items:center;justify-content:space-between}.stepper button{width:52px;height:52px;border-radius:50%;border:none;font-size:26px;background:#8882;color:var(--text)}
.stepper b{font-size:34px}.total{text-align:center;padding:26px 18px}.total .big{font-size:52px;font-weight:800;color:var(--app-accent)}
</style></head><body>
<h1>Tip Split</h1>
<div class="card"><label>Bill amount</label><input id="bill" inputmode="decimal" placeholder="0.00"></div>
<div class="card"><label>Tip</label><div class="row" id="tips"></div></div>
<div class="card"><label>People</label><div class="stepper"><button id="minus">−</button><b id="people">2</b><button id="plus">+</button></div></div>
<div class="card total"><label>Each person pays</label><div class="big" id="each">0.00</div><div id="detail" style="color:var(--muted)"></div></div>
<script>
let tip=15,people=2;const tips=[0,10,15,20];
const tipsEl=document.getElementById('tips');
tips.forEach(t=>{const b=document.createElement('button');b.textContent=t+'%';b.onclick=()=>{tip=t;mapp.haptics.selection();calc()};tipsEl.appendChild(b)});
document.getElementById('minus').onclick=()=>{people=Math.max(1,people-1);mapp.haptics.impact();calc()};
document.getElementById('plus').onclick=()=>{people++;mapp.haptics.impact();calc()};
document.getElementById('bill').oninput=calc;
function calc(){const bill=parseFloat(document.getElementById('bill').value.replace(',','.'))||0;const total=bill*(1+tip/100);
[...tipsEl.children].forEach((b,i)=>b.classList.toggle('on',tips[i]===tip));document.getElementById('people').textContent=people;
document.getElementById('each').textContent=(total/people).toFixed(2);document.getElementById('detail').textContent='Total '+total.toFixed(2)+' incl. '+(total-bill).toFixed(2)+' tip'}
calc();
</script></body></html>`,
  },
  {
    name: 'Focus',
    emoji: '⏳',
    color: '#8b5cf6',
    description: 'A calm 25 minute focus timer.',
    html: `<!doctype html>
<html><head><style>
*{box-sizing:border-box}body{margin:0;height:100vh;font-family:-apple-system,system-ui,sans-serif;color:#fff;
background:radial-gradient(circle at 50% 30%,#6d4dff,#1b1145 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--safe-top) 20px var(--safe-bottom)}
.ring{width:260px;height:260px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#fff var(--p,0%),#ffffff26 0)}
.inner{width:236px;height:236px;border-radius:50%;background:#1b1145;display:grid;place-items:center}
.time{font-size:60px;font-weight:200;font-variant-numeric:tabular-nums}
.btns{display:flex;gap:14px;margin-top:40px}button{min-width:120px;height:54px;border-radius:27px;border:none;font-size:18px;font-weight:600;touch-action:manipulation}
.go{background:#fff;color:#1b1145}.reset{background:#ffffff26;color:#fff}p{opacity:.7;margin-top:22px}
</style></head><body>
<div class="ring" id="ring"><div class="inner"><div class="time" id="t">25:00</div></div></div>
<div class="btns"><button class="reset" id="r">Reset</button><button class="go" id="g">Start</button></div>
<p id="c"></p>
<script>
const LEN=25*60;let left=LEN,timer=null,endAt=0,done=0;
mapp.storage.get('sessions').then(v=>{done=v||0;show()});
function show(){const m=Math.floor(left/60),s=left%60;document.getElementById('t').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
document.getElementById('ring').style.setProperty('--p',(100*(1-left/LEN))+'%');document.getElementById('c').textContent=done+' sessions completed'}
function tick(){left=Math.max(0,Math.round((endAt-Date.now())/1000));show();if(!left){stop();done++;mapp.storage.set('sessions',done);mapp.haptics.notification('success');show()}}
function stop(){clearInterval(timer);timer=null;document.getElementById('g').textContent='Start'}
document.getElementById('g').onclick=()=>{mapp.haptics.impact('medium');if(timer){stop();return}
if(!left)left=LEN;endAt=Date.now()+left*1000;timer=setInterval(tick,250);document.getElementById('g').textContent='Pause';
mapp.notifications.schedule({id:25,title:'Focus done',body:'Take a short break.',at:endAt}).catch(()=>{})};
document.getElementById('r').onclick=()=>{stop();left=LEN;mapp.notifications.cancel(25).catch(()=>{});show()};
show();
</script></body></html>`,
  },
];
