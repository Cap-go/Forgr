// Dev-only scripted agent used to record the demo video (?demo=1).
import type { AgentHooks } from '../ai/agent';
import type { ToolContext } from '../ai/tools';
import type { ChatMessage } from '../ai/types';
import { appStore } from '../apps/store';

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function workoutHtml(neon: boolean): string {
  const vars = neon
    ? '--bg:#05060a;--card:#0f1218;--text:#eafff0;--muted:#7d8b84;--accent:#39ff88;--bar:#39ff88'
    : '--bg:#f5f6fa;--card:#fff;--text:#14151a;--muted:#6b7280;--accent:#0ea5e9;--bar:#0ea5e9';
  return `<!doctype html><html><head><style>
:root{${vars}}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text)}
header{padding:calc(var(--safe-top) + 16px) 20px 6px;display:flex;align-items:end;justify-content:space-between}
h1{font-size:34px;margin:0;letter-spacing:-.02em}${neon ? '.streak{background:#39ff8822;color:var(--accent);padding:6px 12px;border-radius:14px;font-weight:700;font-size:14px;box-shadow:0 0 18px #39ff8855}' : '.streak{display:none}'}
.card{background:var(--card);margin:12px 16px;border-radius:20px;padding:16px;${neon ? 'box-shadow:0 0 0 1px #39ff8826' : 'box-shadow:0 1px 3px #0000000f'}}
.label{color:var(--muted);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.chart{display:flex;align-items:end;gap:10px;height:120px;margin-top:14px}.bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:end}
.bar i{width:100%;border-radius:8px;background:var(--bar);${neon ? 'box-shadow:0 0 14px #39ff88aa;' : ''}transition:height .5s}.bar span{font-size:12px;color:var(--muted)}
.ex{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #8882}.ex:first-of-type{border-top:0}.ex b{flex:1;font-weight:600}.ex small{color:var(--muted)}
.add{width:44px;height:44px;border-radius:50%;border:0;background:var(--accent);color:${neon ? '#05060a' : '#fff'};font-size:24px;font-weight:700}
</style></head><body>
<header><h1>Workouts</h1><span class="streak">🔥 5 day streak</span></header>
<div class="card"><div class="label">This week</div><div class="chart" id="chart"></div></div>
<div class="card" id="list"></div>
<script>
const days=['M','T','W','T','F','S','S'];let sets={Mon:3,Tue:5,Wed:2,Thu:6,Fri:4,Sat:0,Sun:0};
const ex=[{n:'Push-ups',s:3,r:'15 reps'},{n:'Squats',s:4,r:'12 reps'},{n:'Plank',s:2,r:'60 sec'}];
function draw(){const v=Object.values(sets),m=Math.max(...v,6);document.getElementById('chart').innerHTML=v.map((x,i)=>'<div class="bar"><i style="height:'+(8+x/m*100)+'%"></i><span>'+days[i]+'</span></div>').join('');
document.getElementById('list').innerHTML='<div class="label">Today</div>'+ex.map((e,i)=>'<div class="ex"><b>'+e.n+'</b><small>'+e.s+' sets · '+e.r+'</small><button class="add" data-i="'+i+'">+</button></div>').join('');
document.querySelectorAll('.add').forEach(b=>b.onclick=()=>{ex[b.dataset.i].s++;sets.Sat++;mapp.haptics.impact('medium');draw()})}
draw();
</script></body></html>`;
}

async function stream(hooks: AgentHooks, text: string): Promise<void> {
  for (const word of text.split(/(?<= )/)) {
    hooks.onDelta(word);
    await wait(55);
  }
}

export async function scriptedAgent(
  history: ChatMessage[],
  _instructions: string,
  ctx: ToolContext,
  hooks: AgentHooks,
): Promise<string> {
  const ask = history[history.length - 1]?.content.toLowerCase() ?? '';
  if (ask.includes('stripe')) {
    hooks.onPhase?.('connecting');
    await wait(400);
    hooks.onPhase?.('waiting');
    const period = await ctx.askUser?.({ question: 'Which period should the dashboard show first?', options: ['Today', 'Last 7 days', 'This month'], allowOther: true, multiple: false });
    const saved = await ctx.requestSecret?.({ name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key', help: 'Stripe Dashboard → Developers → API keys. A restricted read-only key is best.', kind: 'api_key', target: 'device' });
    const answer = `Got it: ${period ?? 'default period'}, key ${saved?.saved ? 'saved' : 'skipped'}.`;
    await stream(hooks, answer);
    return answer;
  }
  if (ask.includes('workout')) {
    hooks.onPhase?.('connecting');
    await wait(500);
    hooks.onPhase?.('waiting');
    for (const part of ['Planning a workout log: ', 'today\'s exercises with sets, ', 'a weekly bar chart, ', 'and data saved on the phone.']) {
      hooks.onReasoning?.(part);
      await wait(350);
    }
    hooks.onPhase?.('tool_begin', 'create_app');
    for (let chars = 800; chars <= 9600; chars += 1600) {
      hooks.onToolProgress?.('create_app', chars);
      await wait(220);
    }
    hooks.onToolStart('create_app', { name: 'Workouts' });
    await wait(900);
    const app = await appStore.create({ name: 'Workouts', emoji: '🏋️', color: '#0ea5e9', description: 'Log sets and see the week.', html: workoutHtml(false) });
    await ctx.openApp(app.id);
    hooks.onToolEnd('create_app', true, '');
    const answer = 'Your Workouts app is ready: tap + to log a set and watch the week fill up.';
    await stream(hooks, answer);
    return answer;
  }
  const id = appStore.list().find((a) => a.name === 'Workouts')?.id;
  if (id) {
    await wait(600);
    hooks.onToolStart('read_app', { id });
    await wait(900);
    hooks.onToolStart('edit_app', { id });
    await wait(1800);
    await appStore.writeHtml(id, workoutHtml(true));
    await ctx.openApp(id);
    const answer = 'Done! Dark neon theme and a streak badge. Undo is one tap away.';
    await stream(hooks, answer);
    return answer;
  }
  const answer = 'Demo mode: try asking for a workout log.';
  await stream(hooks, answer);
  return answer;
}
