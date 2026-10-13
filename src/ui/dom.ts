type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Tiny element factory: h('button', { class: 'primary', onclick }, 'Go'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) {
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    el.append(child);
  }
  return el;
}

/** Parse a trusted, static SVG string (icons only). */
export function svg(markup: string): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGElement;
}

const stroke = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

export const icons = {
  logo: `<svg viewBox="0 0 1024 1024" aria-hidden="true"><defs><linearGradient id="flg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#2b1a11"/><stop offset="1" stop-color="#0d0907"/></linearGradient><radialGradient id="fht" cx="0.52" cy="0.46" r="0.5"><stop offset="0" stop-color="#ff6a1f" stop-opacity="0.6"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient><linearGradient id="fsp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1bf"/><stop offset="1" stop-color="#ff8a3a"/></linearGradient></defs><rect width="1024" height="1024" rx="228" fill="url(#flg)"/><rect width="1024" height="1024" rx="228" fill="url(#fht)"/><path fill="#fff" d="M812 478 V548 Q812 562 798 566 L708 590 Q658 606 654 652 V690 H724 Q748 690 752 714 L760 776 H300 L308 714 Q312 690 336 690 H408 V652 Q404 610 360 600 Q262 578 188 488 Q262 478 330 478 Z"/><path fill="url(#fsp)" d="M560 150 C576 256 596 276 702 294 C596 312 576 332 560 438 C544 332 524 312 418 294 C524 276 544 256 560 150 Z"/><path fill="#ffc46b" d="M754 196 C760 232 766 238 802 244 C766 250 760 256 754 292 C748 256 742 250 706 244 C742 238 748 232 754 196 Z"/><circle cx="388" cy="196" r="18" fill="#ffc46b" opacity="0.85"/></svg>`,
  send: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${stroke}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" ${stroke}><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${stroke}><path d="M20 6 9 17l-5-5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${stroke}><path d="m9 18 6-6-6-6"/></svg>`,
  external: `<svg viewBox="0 0 24 24" ${stroke}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${stroke}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  compose: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8l-3.6.9.9-3.6z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" ${stroke}><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 5v14M5 12h14"/></svg>`,
  back: `<svg viewBox="0 0 24 24" ${stroke}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" ${stroke}><path d="m6 9 6 6 6-6"/></svg>`,
  person: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" ${stroke}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
} as const;

export function icon(name: keyof typeof icons, className = 'icon'): SVGElement {
  const el = svg(icons[name]);
  el.setAttribute('class', className);
  return el;
}
