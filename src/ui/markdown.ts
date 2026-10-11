/**
 * Small, safe Markdown renderer for chat replies. Builds DOM nodes directly
 * (never innerHTML), so model output cannot inject markup or scripts.
 * Supports headings, paragraphs, lists, quotes, rules, GFM tables, fenced
 * code (with Copy / Save as file), inline code, bold, italic, strike, links.
 */

export interface MarkdownActions {
  openLink(url: string): void;
  copy(text: string): void;
  saveFile(filename: string, text: string): void;
}

const EXT: Record<string, string> = {
  csv: 'csv', json: 'json', js: 'js', javascript: 'js', ts: 'ts', typescript: 'ts', html: 'html', css: 'css',
  md: 'md', markdown: 'md', txt: 'txt', text: 'txt', xml: 'xml', yaml: 'yml', yml: 'yml', sql: 'sql',
  ics: 'ics', tsv: 'tsv', sh: 'sh', bash: 'sh', py: 'py', python: 'py', swift: 'swift',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:', 'tel:', 'mapp:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Inline formatting: `code`, **bold**, *italic*, ~~strike~~, [text](url), bare URLs. */
function inline(text: string, actions: MarkdownActions): Node[] {
  const out: Node[] = [];
  const re = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|~~([^~]+?)~~|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(document.createTextNode(text.slice(last, m.index)));
    if (m[2] !== undefined) out.push(el('code', 'md-code', m[2]));
    else if (m[3] !== undefined || m[4] !== undefined) out.push(el('strong', undefined, ...inline(m[3] ?? m[4], actions)));
    else if (m[5] !== undefined) out.push(el('s', undefined, ...inline(m[5], actions)));
    else if (m[6] !== undefined || m[7] !== undefined) out.push(el('em', undefined, ...inline(m[6] ?? m[7], actions)));
    else {
      const label = m[8] ?? m[10];
      const url = safeUrl(m[9] ?? m[10]);
      if (url) {
        const a = el('a', 'md-link', ...(m[8] !== undefined ? inline(label, actions) : [label]));
        a.href = url;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          actions.openLink(url);
        });
        out.push(a);
      } else {
        out.push(document.createTextNode(m[0]));
      }
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function codeBlock(code: string, lang: string, actions: MarkdownActions): HTMLElement {
  const ext = EXT[lang.toLowerCase()] ?? (lang ? 'txt' : looksLikeCsv(code) ? 'csv' : 'txt');
  const copy = el('button', 'md-code-btn', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    actions.copy(code);
    copy.textContent = 'Copied';
    window.setTimeout(() => (copy.textContent = 'Copy'), 1500);
  });
  const save = el('button', 'md-code-btn', 'Save as file');
  save.type = 'button';
  save.addEventListener('click', () => actions.saveFile(`mapp-${new Date().toISOString().slice(0, 10)}.${ext}`, code));
  const pre = el('pre', 'md-pre', el('code', undefined, code));
  return el('div', 'md-codeblock', el('div', 'md-code-head', el('span', 'md-code-lang', lang || ext), el('span', 'md-code-actions', copy, save)), pre);
}

function looksLikeCsv(code: string): boolean {
  const lines = code.trim().split('\n').slice(0, 5);
  if (lines.length < 2) return false;
  const count = (l: string) => (l.match(/,/g) ?? []).length;
  return count(lines[0]) > 0 && lines.every((l) => count(l) === count(lines[0]));
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function renderMarkdown(source: string, actions: MarkdownActions): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) frag.append(el('p', 'md-p', ...inline(paragraph.join('\n'), actions)));
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // closing fence (or end while streaming)
      frag.append(codeBlock(body.join('\n'), fence[2], actions));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 2, 6) as 3 | 4 | 5 | 6;
      frag.append(el(`h${level}`, 'md-h', ...inline(heading[2], actions)));
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      frag.append(el('hr', 'md-hr'));
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      const table = el('table', 'md-table',
        el('thead', undefined, el('tr', undefined, ...head.map((c) => el('th', undefined, ...inline(c, actions))))),
        el('tbody', undefined, ...rows.map((r) => el('tr', undefined, ...head.map((_, j) => el('td', undefined, ...inline(r[j] ?? '', actions)))))));
      frag.append(el('div', 'md-table-wrap', table));
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      const block = el('blockquote', 'md-quote');
      block.append(renderMarkdown(quote.join('\n'), actions));
      frag.append(block);
      continue;
    }
    const item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flush();
      const ordered = /\d/.test(item[1]);
      const list = el(ordered ? 'ol' : 'ul', 'md-list');
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        const task = m[2].match(/^\[( |x|X)\]\s+(.*)$/);
        const li = el('li', task ? 'md-task' : undefined);
        if (task) li.append(el('span', 'md-check', task[1] === ' ' ? '○' : '●'), ' ');
        li.append(...inline(task ? task[2] : m[2], actions));
        list.append(li);
        i++;
        // Indented continuation lines belong to the item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i])) {
          li.append(document.createTextNode(' '), ...inline(lines[i++].trim(), actions));
        }
      }
      frag.append(list);
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    paragraph.push(line);
    i++;
  }
  flush();
  return frag;
}
