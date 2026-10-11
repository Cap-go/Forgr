import type { SecretKind } from '../secrets';
import { h, icon } from './dom';

export interface SecretSpec {
  name: string;
  label: string;
  help?: string;
  kind: SecretKind;
  username?: string;
  /** Where the value goes; shown so the user knows. */
  destination: string;
}

/**
 * Secure entry card. The value is handed to `save` and the input is cleared
 * right away; it never becomes chat text. Passwords get username/password
 * fields with autocomplete hints so iOS offers Keychain AutoFill.
 */
export function secretCard(spec: SecretSpec, save: (value: string, username?: string) => Promise<void>): { el: HTMLElement; done: Promise<boolean> } {
  let resolve!: (saved: boolean) => void;
  const done = new Promise<boolean>((r) => { resolve = r; });
  const isPassword = spec.kind === 'password';
  const user = isPassword
    ? h('input', { class: 'card-input', type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Username or email', value: spec.username ?? '' })
    : null;
  const input = h('input', {
    class: 'card-input',
    type: 'password',
    autocomplete: isPassword ? 'current-password' : 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    placeholder: isPassword ? 'Password' : 'Paste it here',
    'aria-label': spec.label,
  });
  const reveal = h('button', { class: 'card-link', type: 'button' }, 'Show');
  reveal.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    reveal.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  const error = h('p', { class: 'card-error hidden' });
  const saveBtn = h('button', { class: 'card-primary', type: 'submit' }, 'Save securely');
  const skip = h('button', { class: 'card-link', type: 'button' }, 'Skip');
  const form = h('form', { class: 'card secret-card', autocomplete: 'on' },
    h('div', { class: 'card-head' }, icon('lock', 'card-icon'), h('div', {},
      h('strong', {}, spec.label),
      h('p', { class: 'card-sub' }, spec.help || `Saved as ${spec.name}.`))),
    ...(user ? [user] : []),
    h('div', { class: 'card-row' }, input, reveal),
    error,
    h('p', { class: 'card-fine' }, `Stored ${spec.destination} as ${spec.name}. The AI never sees it; only your app's code can use it.`),
    h('div', { class: 'card-actions' }, skip, saveBtn));

  const finish = (saved: boolean, text: string) => {
    form.replaceChildren(h('div', { class: 'card-head' }, icon(saved ? 'lock' : 'close', 'card-icon'), h('div', {},
      h('strong', {}, spec.label), h('p', { class: 'card-sub' }, text))));
    form.classList.add('settled');
    resolve(saved);
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = input.value;
    if (!value.trim()) {
      error.textContent = 'Enter a value or tap Skip.';
      error.classList.remove('hidden');
      return;
    }
    saveBtn.setAttribute('disabled', '');
    try {
      await save(value, user?.value.trim() || undefined);
      input.value = '';
      finish(true, `Saved securely as ${spec.name}`);
    } catch (err) {
      saveBtn.removeAttribute('disabled');
      error.textContent = err instanceof Error ? err.message : String(err);
      error.classList.remove('hidden');
    }
  });
  skip.addEventListener('click', () => finish(false, 'Skipped'));
  window.setTimeout(() => (user && !user.value ? user : input).focus(), 200);
  return { el: form, done };
}

export interface QuestionSpec {
  question: string;
  options: string[];
  allowOther: boolean;
  multiple: boolean;
}

/** Question card: tap an option, write your own answer, or skip. Resolves with the answer or null. */
export function questionCard(q: QuestionSpec): { el: HTMLElement; done: Promise<string | null> } {
  let resolve!: (answer: string | null) => void;
  const done = new Promise<string | null>((r) => { resolve = r; });
  const chosen = new Set<string>();
  const card = h('div', { class: 'card question-card' });
  const finish = (answer: string | null) => {
    card.replaceChildren(
      h('p', { class: 'card-question' }, q.question),
      h('p', { class: 'card-answer' }, answer ?? 'Skipped'));
    card.classList.add('settled');
    resolve(answer);
  };
  const options = q.options.map((option) => {
    const btn = h('button', { class: 'card-option', type: 'button' }, option);
    btn.addEventListener('click', () => {
      if (!q.multiple) return finish(option);
      if (chosen.has(option)) chosen.delete(option);
      else chosen.add(option);
      btn.classList.toggle('selected', chosen.has(option));
      confirm.toggleAttribute('disabled', chosen.size === 0);
    });
    return btn;
  });
  const confirm = h('button', { class: 'card-primary', type: 'button', disabled: true }, 'Continue');
  confirm.addEventListener('click', () => finish([...chosen].join(', ')));
  const other = h('input', { class: 'card-input', placeholder: 'Or type your answer', enterkeyhint: 'send' });
  const send = h('button', { class: 'card-send', type: 'submit', 'aria-label': 'Send answer' }, icon('send'));
  const otherForm = h('form', { class: 'card-row' }, other, send);
  otherForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (other.value.trim()) finish(other.value.trim());
  });
  const skip = h('button', { class: 'card-link', type: 'button' }, 'Skip');
  skip.addEventListener('click', () => finish(null));
  card.append(
    h('p', { class: 'card-question' }, q.question),
    h('div', { class: 'card-options' }, ...options),
    ...(q.allowOther ? [otherForm] : []),
    h('div', { class: 'card-actions' }, skip, ...(q.multiple ? [confirm] : [])),
  );
  return { el: card, done };
}
