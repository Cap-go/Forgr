import { h, icon } from './dom';

interface Step {
  row: HTMLElement;
  label: HTMLElement;
  time: HTMLElement;
  startedAt: number;
}

function seconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Live timeline of what the builder is doing: each step with its own timer,
 * the model's reasoning summary under the running step, and a collapsed
 * "Worked for 42s" summary once finished.
 */
export class Activity {
  readonly el = h('details', { class: 'activity', open: true });
  private summary = h('summary', { class: 'activity-summary' });
  private list = h('div', { class: 'activity-steps' });
  private reasoning = h('div', { class: 'activity-reasoning hidden' });
  private current: Step | null = null;
  private steps = 0;
  private readonly startedAt = Date.now();
  private timer = window.setInterval(() => this.tick(), 1000);
  private reasoningText = '';

  constructor() {
    this.el.append(this.summary, this.list, this.reasoning);
    this.summary.textContent = 'Working…';
  }

  /** Starts a new step (finishing the previous one) unless it is the same label. */
  step(label: string): void {
    if (this.current && this.current.label.textContent === label) return;
    this.finishCurrent();
    const time = h('span', { class: 'activity-time' }, '0s');
    const text = h('span', { class: 'activity-label' }, label);
    const row = h('div', { class: 'activity-step running' }, h('span', { class: 'dots', 'aria-hidden': 'true' }), text, time);
    this.list.append(row);
    this.current = { row, label: text, time, startedAt: Date.now() };
    this.steps++;
    this.clearReasoning();
    this.tick();
  }

  /** Updates the running step's label (e.g. growing KB count). */
  update(label: string): void {
    if (!this.current) this.step(label);
    else this.current.label.textContent = label;
  }

  /** Streams the reasoning summary under the running step. */
  think(delta: string): void {
    this.reasoningText += delta;
    const text = this.reasoningText.trim();
    if (!text) return;
    // Show the latest paragraph, like ChatGPT's live thinking line.
    const last = text.split(/\n{2,}/).pop() ?? text;
    this.reasoning.textContent = last.replace(/\*\*/g, '');
    this.reasoning.classList.remove('hidden');
  }

  finish(ok: boolean, note?: string): void {
    window.clearInterval(this.timer);
    this.finishCurrent(ok);
    this.clearReasoning();
    const total = seconds(Date.now() - this.startedAt);
    this.summary.textContent = note ?? `${ok ? 'Worked' : 'Stopped'} for ${total}${this.steps > 1 ? ` · ${this.steps} steps` : ''}`;
    this.el.open = false;
    this.el.classList.add('finished');
  }

  private finishCurrent(ok = true): void {
    if (!this.current) return;
    const { row, time, startedAt } = this.current;
    row.classList.remove('running');
    row.classList.add(ok ? 'done' : 'failed');
    row.querySelector('.dots')?.replaceWith(icon(ok ? 'check' : 'alert', 'activity-icon'));
    time.textContent = seconds(Date.now() - startedAt);
    this.current = null;
  }

  private clearReasoning(): void {
    this.reasoningText = '';
    this.reasoning.textContent = '';
    this.reasoning.classList.add('hidden');
  }

  private tick(): void {
    if (this.current) this.current.time.textContent = seconds(Date.now() - this.current.startedAt);
    if (!this.el.classList.contains('finished')) this.summary.textContent = `Working · ${seconds(Date.now() - this.startedAt)}`;
  }
}
