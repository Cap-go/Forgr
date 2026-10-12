// Dev-only polished tools used for App Store screenshots and the preview video (?demo=store).

/** Interactive explainer: compound interest with sliders, chart and a live explanation. */
export function compoundHtml(): string {
  return `<!doctype html><html><head><style>
.chart{display:flex;align-items:flex-end;gap:3px;height:150px;margin:6px 0 4px}
.chart div{flex:1;display:flex;flex-direction:column-reverse;border-radius:4px 4px 2px 2px;overflow:hidden;min-height:2px}
.chart .p{background:var(--m-secondary);opacity:.45}.chart .i{background:var(--m-accent)}
.legend{display:flex;gap:16px;font-size:13px;color:var(--m-secondary)}
.legend span::before{content:'';display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--c)}
.slider{padding:12px 0}.slider label{display:flex;justify-content:space-between;font-size:15px;margin-bottom:8px}
.slider b{font-variant-numeric:tabular-nums}
input[type=range]{width:100%;accent-color:var(--m-accent);height:28px}
.big{font-size:44px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.why{font-size:16px;line-height:1.45}
</style></head><body class="m-app">
<header class="m-nav"><h1 class="m-title">Compound Interest</h1></header>
<main class="m-page">
  <div class="m-card"><div class="m-section-title" style="margin:0">After <span id="yrs"></span> years</div>
    <div class="big" id="total"></div>
    <div class="legend"><span style="--c:var(--m-secondary)">You saved <b id="saved"></b></span><span style="--c:var(--m-accent)">Interest <b id="earned"></b></span></div>
    <div class="chart" id="chart"></div></div>
  <div class="m-card">
    <div class="slider"><label>Start with <b id="v0"></b></label><input id="s0" type="range" min="0" max="20000" step="500"></div>
    <div class="slider"><label>Save each month <b id="v1"></b></label><input id="s1" type="range" min="0" max="1000" step="25"></div>
    <div class="slider"><label>Yearly return <b id="v2"></b></label><input id="s2" type="range" min="1" max="12" step="0.5"></div>
    <div class="slider"><label>Years <b id="v3"></b></label><input id="s3" type="range" min="1" max="40" step="1"></div>
  </div>
  <div class="m-card why" id="why"></div>
</main>
<script>
const $=id=>document.getElementById(id);
const eur=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
let st={start:5000,monthly:200,rate:7,years:20};
const sl=['start','monthly','rate','years'];
function calc(){let bal=st.start,saved=st.start;const rows=[];
for(let y=1;y<=st.years;y++){for(let m=0;m<12;m++){bal=bal*(1+st.rate/100/12)+st.monthly;saved+=st.monthly}rows.push({bal,saved})}return rows}
function draw(){const rows=calc(),last=rows[rows.length-1],max=last.bal;
$('yrs').textContent=st.years;$('total').textContent=eur(last.bal);$('saved').textContent=eur(last.saved);$('earned').textContent=eur(last.bal-last.saved);
$('chart').innerHTML=rows.map(r=>'<div style="height:'+(r.bal/max*100)+'%"><span class="p" style="height:'+(r.saved/r.bal*100)+'%"></span><span class="i" style="flex:1"></span></div>').join('');
const lastYearInterest=rows.length>1?last.bal-rows[rows.length-2].bal-st.monthly*12:last.bal-last.saved;
$('why').innerHTML=lastYearInterest>st.monthly*12
 ? 'In year <b>'+st.years+'</b> your money earns <b>'+eur(lastYearInterest)+'</b>, more than you save in a whole year (<b>'+eur(st.monthly*12)+'</b>). That is compounding: interest earning interest.'
 : 'In year <b>'+st.years+'</b> your money earns <b>'+eur(lastYearInterest)+'</b>. Keep going: the longer it stays invested, the more interest earns interest.';
$('v0').textContent=eur(st.start);$('v1').textContent=eur(st.monthly);$('v2').textContent=st.rate+'%';$('v3').textContent=st.years;}
sl.forEach((k,i)=>{const el=$('s'+i);el.value=st[k];el.oninput=()=>{st[k]=Number(el.value);draw();mapp.haptics.selection().catch(()=>{});mapp.storage.set('state',st)}});
mapp.storage.get('state').then(v=>{if(v)st=v;sl.forEach((k,i)=>$('s'+i).value=st[k]);draw()});
draw();
</script></body></html>`;
}

function groceriesHtml(): string {
  return `<!doctype html><html><head><style>.done .m-row-title{color:var(--m-tertiary);text-decoration:line-through}
.check{width:26px;height:26px;border-radius:50%;border:2px solid var(--m-accent);flex:none}.done .check{background:var(--m-accent)}</style></head>
<body class="m-app"><header class="m-nav"><h1 class="m-title">Groceries</h1></header><main class="m-page">
<div class="m-section-title">Produce</div><div class="m-list" id="a"></div>
<div class="m-section-title">Dairy</div><div class="m-list" id="b"></div></main>
<script>
const items={a:[['Avocados',1],['Spinach',0],['Lemons',0]],b:[['Oat milk',1],['Greek yogurt',0]]};
for(const k in items)document.getElementById(k).innerHTML=items[k].map(([t,d])=>'<div class="m-row'+(d?' done':'')+'"><span class="check"></span><span class="m-row-title">'+t+'</span></div>').join('');
</script></body></html>`;
}

function plantsHtml(): string {
  return `<!doctype html><html><head></head><body class="m-app"><header class="m-nav"><h1 class="m-title">Plants</h1></header>
<main class="m-page"><div class="m-list">
<div class="m-row"><span class="m-row-title">Monstera</span><span class="m-row-end">in 2 days</span></div>
<div class="m-row"><span class="m-row-title">Basil</span><span class="m-row-end">today</span></div></div></main></body></html>`;
}

/** Tools seeded for store screenshots, newest first on the home screen. */
export const STORE_TOOLS = [
  { name: 'Plants', emoji: '🪴', color: '#34c759', description: 'Watering reminders.', html: plantsHtml() },
  { name: 'Groceries', emoji: '🛒', color: '#0a84ff', description: 'Grocery list by aisle.', html: groceriesHtml() },
  { name: 'Rent Split', emoji: '🏠', color: '#ff9f0a', description: 'Split rent and bills between roommates.', html: plantsHtml().replace(/Plants/g, 'Rent Split') },
  { name: 'Chords', emoji: '🎸', color: '#ff375f', description: 'Learn chord progressions by playing.', html: plantsHtml().replace(/Plants/g, 'Chords') },
];
