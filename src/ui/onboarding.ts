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

const tile = (emoji: string, color: string, extra = '') =>
  h('span', { class: `tile ${extra}`, style: `--tile:${color}` }, emoji);

const SLIDES: Slide[] = [
  {
    art: () => h('div', { class: 'art art-welcome' },
      icon('logo', 'welcome-logo'),
      h('div', { class: 'orbit' },
        tile('✅', '#22c55e'), tile('💸', '#f59e0b'), tile('⏳', '#8b5cf6'),
        tile('🛒', '#0ea5e9'), tile('📓', '#ef4444'), tile('🌱', '#10b981'))),
    title: 'Welcome to Mapp',
    body: 'A phone full of apps made just for you. You describe them, AI builds them, and they live right here on your iPhone.',
  },
  {
    art: () => h('div', { class: 'art art-build' },
      h('div', { class: 'msg user typed' }, 'A grocery list I can check off at the store'),
      h('div', { class: 'status s1' }, h('span', { class: 'dots' }), 'Building Groceries…'),
      h('div', { class: 'mini-app' },
        h('div', { class: 'mini-head' }, '🛒 Groceries'),
        ...['Milk', 'Avocados', 'Coffee beans'].map((item, i) =>
          h('div', { class: `mini-row r${i}` }, h('span', { class: 'mini-check' }), item)))),
    title: 'Describe it.\nWatch it appear.',
    body: 'Tell Mapp what you need in plain words. In a few seconds you get a real app with its own icon on your home screen.',
  },
  {
    art: () => h('div', { class: 'art art-edit' },
      h('div', { class: 'mini-app tall' },
        h('div', { class: 'mini-head' }, '🛒 Groceries'),
        h('div', { class: 'mini-row' }, h('span', { class: 'mini-check on' }), 'Milk'),
        h('div', { class: 'mini-row aisle' }, h('span', { class: 'mini-tag' }, 'Dairy'), h('span', { class: 'mini-tag' }, 'Produce'))),
      h('div', { class: 'msg user small' }, 'Group items by aisle'),
      h('span', { class: 'fake-bubble' }, icon('sparkles'))),
    title: 'Change anything,\nanytime',
    body: 'Open the floating chat inside an app and ask for changes. Every change is saved, so Undo always takes you back.',
  },
  {
    art: () => h('div', { class: 'art art-pinch practice-area' },
      h('div', { class: 'pinch-demo' }, h('span', { class: 'f f1' }), h('span', { class: 'f f2' }), h('span', { class: 'f f3' })),
      h('div', { class: 'practice-done' }, icon('check'))),
    title: 'Pinch with\nthree fingers',
    body: 'Inside any app, pinch three fingers together to open the switcher. Try it now on the screen.',
    practice: true,
  },
  {
    art: () => h('div', { class: 'art art-switch' },
      h('div', { class: 'switch-card' }, h('div', { class: 'mini-head' }, '✅ Habits'), h('div', { class: 'mini-row' }, h('span', { class: 'mini-check on' }), 'Drink water')),
      h('div', { class: 'switch-row' },
        h('span', { class: 'pill' }, icon('home'), 'Home'),
        h('span', { class: 'pill accent' }, icon('pencil'), 'Edit'),
        h('span', { class: 'pill' }, icon('chevron'), 'Back')),
      h('div', { class: 'switch-apps' }, tile('💸', '#f59e0b', 'small'), tile('⏳', '#8b5cf6', 'small'), tile('🛒', '#0ea5e9', 'small'))),
    title: 'Home, Edit,\nor another app',
    body: 'The switcher takes you home, opens the AI editor, or jumps to your other apps. Spread three fingers to go back.',
  },
  {
    art: () => h('div', { class: 'art art-private' },
      h('div', { class: 'shield' }, icon('shield')),
      h('ul', { class: 'facts' },
        h('li', {}, icon('check'), 'Apps and data stay on this iPhone'),
        h('li', {}, icon('check'), 'Runs on your own ChatGPT plan'),
        h('li', {}, icon('check'), 'Sign in kept in the iOS Keychain'),
        h('li', {}, icon('check'), 'No ads, no tracking'))),
    title: 'Yours, and private',
    body: 'There is no Mapp account. Connect ChatGPT once and start building. You can also try the starter apps first.',
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
      layer.querySelector('.practice-hint')?.replaceChildren('Nice! That is all it takes.');
      window.setTimeout(next, 900);
    });

    const render = () => {
      const slide = SLIDES[index];
      const last = index === SLIDES.length - 1;
      const title = h('h1', {}, ...slide.title.split('\n').flatMap((line, i) => (i ? [h('br'), line] : [line])));
      const actions = last
        ? [
          h('button', { class: 'primary chatgpt', onclick: () => finish(true) }, 'Connect ChatGPT'),
          h('button', { class: 'secondary', onclick: () => finish(false) }, 'Try the starter apps first'),
        ]
        : slide.practice
          ? [
            h('p', { class: 'practice-hint' }, '👆 Use three fingers anywhere on the screen'),
            h('button', { class: 'secondary', onclick: next }, 'Skip practice'),
          ]
          : [
            h('button', { class: 'primary', onclick: next }, index === 0 ? 'Show me how' : 'Next'),
            h('button', { class: 'secondary', onclick: () => { index = SLIDES.length - 1; render(); } }, 'Skip tour'),
          ];
      layer.replaceChildren(
        h('div', { class: 'onb-art', key: String(index) }, slide.art()),
        h('div', { class: 'onb-copy' },
          h('div', { class: 'dots-row' }, ...SLIDES.map((_, i) => h('span', { class: i === index ? 'on' : i < index ? 'past' : '' }))),
          title,
          h('p', { class: 'muted' }, slide.body),
          ...actions),
      );
    };

    render();
    root.append(layer);
  });
}
