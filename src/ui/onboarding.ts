import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PinchDetector } from './gesture';
import { h, icon } from './dom';

interface Slide {
  art: () => HTMLElement;
  title: string;
  body: string;
  /** Interactive slides advance themselves; the button becomes a skip link. */
  practice?: boolean;
}

/** Neutral mock of a mini app: a title bar and a few list rows. */
const mockApp = (title: string, rows: Array<{ text: string; on?: boolean; cls?: string }>, extra = '') =>
  h('div', { class: `mock-app ${extra}` },
    h('div', { class: 'mock-title' }, title),
    h('div', { class: 'mock-list' },
      ...rows.map((row) => h('div', { class: `mock-row ${row.cls ?? ''}` },
        h('span', { class: `mock-check${row.on ? ' on' : ''}` }), h('span', {}, row.text)))));

const mockTiles = (count: number) =>
  h('div', { class: 'mock-tiles' }, ...Array.from({ length: count }, () => h('span', { class: 'mock-tile' })));

const SLIDES: Slide[] = [
  {
    art: () => h('div', { class: 'art art-welcome' }, icon('logo', 'welcome-logo')),
    title: 'Welcome to Mapp',
    body: 'Apps made just for you. Describe what you need and it is built right on your iPhone.',
  },
  {
    art: () => h('div', { class: 'art art-build' },
      h('div', { class: 'msg user' }, 'A grocery list I can check off at the store'),
      h('div', { class: 'status' }, h('span', { class: 'dots' }), 'Building Groceries…'),
      mockApp('Groceries', [{ text: 'Milk', cls: 'r0' }, { text: 'Avocados', cls: 'r1' }, { text: 'Coffee beans', cls: 'r2' }])),
    title: 'Describe it',
    body: 'Say what you need in plain words. A working app shows up on your home screen in seconds.',
  },
  {
    art: () => h('div', { class: 'art art-edit' },
      mockApp('Groceries', [{ text: 'Milk', on: true }, { text: 'Avocados' }, { text: 'Bread', cls: 'late' }]),
      h('div', { class: 'msg user' }, 'Group items by aisle'),
      h('span', { class: 'fake-bubble' }, icon('sparkles'))),
    title: 'Change anything',
    body: 'Tap the chat button inside an app to ask for changes. Undo takes you back at any time.',
  },
  {
    art: () => h('div', { class: 'art art-pinch practice-area' },
      h('div', { class: 'pinch-demo' }, h('span', { class: 'f f1' }), h('span', { class: 'f f2' }), h('span', { class: 'f f3' })),
      h('div', { class: 'practice-done' }, icon('check'))),
    title: 'Pinch with three fingers',
    body: 'Inside any app, pinch three fingers together to open the switcher. Try it here.',
    practice: true,
  },
  {
    art: () => h('div', { class: 'art art-switch' },
      h('div', { class: 'switch-card' }, mockApp('Habits', [{ text: 'Drink water', on: true }, { text: 'Walk' }])),
      h('div', { class: 'switch-row' },
        h('span', { class: 'pill' }, icon('home'), 'Home'),
        h('span', { class: 'pill accent' }, icon('pencil'), 'Edit'),
        h('span', { class: 'pill' }, icon('back'), 'Back')),
      mockTiles(4)),
    title: 'Home, Edit, or switch',
    body: 'The switcher takes you home, opens the editor, or jumps to another app. Spread three fingers to go back.',
  },
  {
    art: () => h('div', { class: 'art art-private' },
      h('div', { class: 'lock-badge' }, icon('lock')),
      h('ul', { class: 'facts' },
        h('li', {}, icon('check'), 'Apps and data stay on this iPhone'),
        h('li', {}, icon('check'), 'Runs on your own ChatGPT plan'),
        h('li', {}, icon('check'), 'Sign in kept in the iOS Keychain'),
        h('li', {}, icon('check'), 'No ads, no tracking'))),
    title: 'Private by design',
    body: 'There is no Mapp account. Connect ChatGPT to start building, or try the starter apps first.',
  },
];

function haptic(kind: 'light' | 'success'): void {
  if (!Capacitor.isNativePlatform()) return;
  if (kind === 'success') void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  else void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

/** Full screen tour. Resolves with true when the user wants to connect ChatGPT. */
export function showOnboarding(root: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    let index = 0;
    const layer = h('div', { class: 'onboarding' });
    document.body.classList.add('onboarding-open');

    const finish = (connect: boolean) => {
      document.body.classList.remove('onboarding-open');
      layer.classList.add('leaving');
      window.setTimeout(() => layer.remove(), 250);
      resolve(connect);
    };
    const next = () => {
      haptic('light');
      index++;
      render();
    };

    // Practice: a real three-finger pinch on the tour advances it.
    new PinchDetector(layer, (direction) => {
      const slide = SLIDES[index];
      if (!slide?.practice || direction !== 'in') return;
      haptic('success');
      layer.querySelector('.practice-area')?.classList.add('done');
      layer.querySelector('.practice-hint')?.replaceChildren('That’s it.');
      window.setTimeout(next, 900);
    });

    const render = () => {
      const slide = SLIDES[index];
      const last = index === SLIDES.length - 1;
      const title = h('h1', {}, slide.title);
      const actions = last
        ? [
          h('button', { class: 'btn mono', onclick: () => finish(true) }, 'Connect ChatGPT'),
          h('button', { class: 'btn plain', onclick: () => finish(false) }, 'Try the Starter Apps'),
        ]
        : slide.practice
          ? [
            h('p', { class: 'practice-hint' }, 'Use three fingers anywhere on the screen'),
            h('button', { class: 'btn plain', onclick: next }, 'Skip'),
          ]
          : [
            h('button', { class: 'btn primary', onclick: next }, 'Continue'),
            h('button', { class: 'btn plain', onclick: () => { index = SLIDES.length - 1; render(); } }, 'Skip Tour'),
          ];
      layer.replaceChildren(
        h('div', { class: 'onb-art', key: String(index) }, slide.art()),
        h('div', { class: 'onb-copy' },
          h('div', { class: 'dots-row', 'aria-label': `Step ${index + 1} of ${SLIDES.length}` }, ...SLIDES.map((_, i) => h('span', { class: i === index ? 'on' : '' }))),
          title,
          h('p', { class: 'onb-body' }, slide.body),
          ...actions),
      );
    };

    render();
    root.append(layer);
  });
}
