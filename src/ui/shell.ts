import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { runAgent } from '../ai/agent';
import { buildInstructions } from '../ai/instructions';
import { session } from '../ai/session';
import type { ChatMessage } from '../ai/types';
import { AppBridge, clearLogs } from '../apps/bridge';
import { buildSrcdoc, type SafeArea } from '../apps/runtime';
import { appStore, type MiniAppMeta } from '../apps/store';
import { STARTER_APPS } from '../apps/templates';
import { APP_LINKS, PREF_KEYS } from '../config';
import { PinchDetector } from './gesture';
import { h, icon } from './dom';

const HOME_CHAT = 'home';

const SUGGESTIONS = [
  'A grocery list I can share with my partner',
  'A workout log with charts of my progress',
  'A daily journal with mood emojis',
  'A plant watering reminder',
];

interface Conversation {
  key: string;
  messages: ChatMessage[];
}

function haptic(style: ImpactStyle = ImpactStyle.Light): void {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style }).catch(() => undefined);
}

export class Shell {
  private home = h('main', { class: 'home' });
  private stage = h('section', { class: 'stage hidden' });
  private frame: HTMLIFrameElement | null = null;
  private bridge: AppBridge | null = null;
  private switcher = h('div', { class: 'switcher hidden' });
  private sheet = h('section', { class: 'chat-sheet hidden' });
  private bubble = h('button', { class: 'bubble hidden', 'aria-label': 'Open Mapp chat' }, icon('sparkles'));
  private modalLayer = h('div', { class: 'modal-layer hidden' });
  private toastEl = h('div', { class: 'toast hidden' });

  private currentAppId: string | null = null;
  private editing = false;
  private conversation: Conversation = { key: HOME_CHAT, messages: [] };
  private running: AbortController | null = null;
  private pendingPrompt: string | null = null;
  private safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  private frameLoaded: Promise<void> = Promise.resolve();

  private messagesEl = h('div', { class: 'messages' });
  private input = h('textarea', { rows: 1, placeholder: 'Describe an app or a change…', enterkeyhint: 'send' });
  private sendBtn = h('button', { class: 'send', 'aria-label': 'Send' }, icon('send'));
  private sheetTitle = h('div', { class: 'sheet-title' });
  private undoBtn = h('button', { class: 'chip', 'aria-label': 'Undo last change' }, icon('undo'), 'Undo');

  constructor(private readonly root: HTMLElement) {}

  async init(): Promise<void> {
    this.measureSafeArea();
    this.root.append(this.home, this.stage, this.switcher, this.bubble, this.sheet, this.modalLayer, this.toastEl);
    this.buildSheet();
    this.setupBubble();
    new PinchDetector(document, (dir) => {
      if (dir === 'in') this.openSwitcher();
      else if (dir === 'out') this.closeSwitcher();
    });

    await Promise.all([session.restore(), appStore.load()]);
    await this.seed();
    appStore.onChange(() => {
      this.renderHome();
      if (!this.switcher.classList.contains('hidden')) this.renderSwitcher();
    });
    session.onChange(() => this.renderHome());
    this.renderHome();

    if (Capacitor.isNativePlatform()) {
      void CapacitorUpdater.notifyAppReady().catch(() => undefined);
      void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const appId = (event.notification.extra as { appId?: string } | undefined)?.appId;
        if (appId && appStore.get(appId)) void this.openApp(appId);
      });
      void CapApp.addListener('backButton', () => {
        if (!this.switcher.classList.contains('hidden')) this.closeSwitcher();
        else if (!this.sheet.classList.contains('hidden')) this.collapseSheet();
        else if (this.currentAppId) this.openSwitcher();
      });
    }

    if (!localStorage.getItem(PREF_KEYS.onboarded)) this.showOnboarding();
  }

  // ---------------------------------------------------------------- setup

  private measureSafeArea(): void {
    const probe = h('div', { class: 'safe-probe' });
    document.body.append(probe);
    const style = getComputedStyle(probe);
    this.safe = {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
    probe.remove();
  }

  private async seed(): Promise<void> {
    if (localStorage.getItem(PREF_KEYS.seeded)) return;
    if (!appStore.list().length) {
      for (const starter of [...STARTER_APPS].reverse()) await appStore.create(starter);
    }
    localStorage.setItem(PREF_KEYS.seeded, '1');
  }

  // ---------------------------------------------------------------- home

  private renderHome(): void {
    const apps = appStore.list();
    const avatar = h('button', { class: 'avatar', 'aria-label': 'Settings', onclick: () => this.showSettings() },
      session.credentials?.email ? session.credentials.email[0].toUpperCase() : icon('settings'));

    const grid = h('div', { class: 'grid' });
    for (const app of apps) grid.append(this.appIcon(app));
    grid.append(h('button', { class: 'app-icon new', onclick: () => this.openChat(null) },
      h('span', { class: 'tile' }, icon('plus')),
      h('span', { class: 'label' }, 'New app')));

    const hour = new Date().getHours();
    const greeting = hour < 5 ? 'Up late?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    this.home.replaceChildren(
      h('header', { class: 'home-header' },
        h('div', { class: 'brand' }, icon('logo', 'brand-logo'), h('span', {}, 'Mapp')),
        avatar),
      h('h1', { class: 'greeting' }, greeting),
      h('p', { class: 'muted' }, apps.length ? 'Your apps. Tap to open, hold to edit.' : 'Build your first app by chatting.'),
      grid,
      h('div', { class: 'hint' }, h('span', { class: 'fingers' }, '🤏'), 'Pinch with three fingers anywhere to come back here.'),
      h('button', { class: 'composer-pill', onclick: () => this.openChat(null) },
        icon('sparkles'), h('span', {}, 'What do you want to build?')),
    );
  }

  private appIcon(app: MiniAppMeta): HTMLElement {
    let timer = 0;
    let longPressed = false;
    const el = h('button', { class: 'app-icon' },
      h('span', { class: 'tile', style: `--tile:${app.color}` }, app.emoji),
      h('span', { class: 'label' }, app.name));
    el.addEventListener('touchstart', () => {
      longPressed = false;
      timer = window.setTimeout(() => {
        longPressed = true;
        haptic(ImpactStyle.Medium);
        this.showAppActions(app);
      }, 480);
    }, { passive: true });
    const cancel = () => window.clearTimeout(timer);
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchmove', cancel, { passive: true });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!longPressed) this.showAppActions(app);
    });
    el.addEventListener('click', () => {
      if (longPressed) return;
      haptic();
      void this.openApp(app.id);
    });
    return el;
  }

  private showAppActions(app: MiniAppMeta): void {
    this.showModal((close) => [
      h('div', { class: 'modal-head' },
        h('span', { class: 'tile small', style: `--tile:${app.color}` }, app.emoji),
        h('div', {}, h('strong', {}, app.name), h('p', { class: 'muted' }, app.description || 'Your app'))),
      h('button', { class: 'row-btn', onclick: () => { close(); void this.openApp(app.id); } }, icon('chevron'), 'Open'),
      h('button', { class: 'row-btn', onclick: () => { close(); void this.openApp(app.id).then(() => this.openChat(app.id)); } }, icon('pencil'), 'Edit with AI'),
      h('button', { class: 'row-btn danger', onclick: () => { close(); this.confirmDelete(app); } }, icon('trash'), 'Delete app'),
    ]);
  }

  private confirmDelete(app: MiniAppMeta): void {
    this.showModal((close) => [
      h('h2', {}, `Delete ${app.name}?`),
      h('p', { class: 'muted' }, 'The app and its data are removed from this phone. This cannot be undone.'),
      h('button', { class: 'primary danger', onclick: async () => {
        close();
        if (this.currentAppId === app.id) this.goHome();
        await appStore.delete(app.id);
      } }, 'Delete'),
      h('button', { class: 'secondary', onclick: close }, 'Cancel'),
    ]);
  }

  // ---------------------------------------------------------------- running apps

  async openApp(id: string): Promise<void> {
    const app = appStore.require(id);
    this.closeSwitcher(true);
    if (this.currentAppId !== id && this.conversation.key !== HOME_CHAT && !this.running) {
      await this.loadConversation(id);
    }
    if (this.running && this.conversation.key === HOME_CHAT) {
      // A new app was created from home: the conversation now belongs to it.
      this.conversation.key = id;
      await appStore.writeChat(HOME_CHAT, []);
    }
    this.currentAppId = id;
    this.mountFrame(app, await appStore.readHtml(id));
    this.home.classList.add('hidden');
    this.stage.classList.remove('hidden');
    this.updateChrome();
    await this.frameLoaded;
  }

  private mountFrame(app: MiniAppMeta, html: string): void {
    this.bridge?.dispose();
    this.frame?.remove();
    clearLogs(app.id);
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const frame = h('iframe', {
      class: 'app-frame',
      title: app.name,
      sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-downloads',
      allow: 'camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen',
    });
    this.frameLoaded = new Promise((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
      window.setTimeout(resolve, 4000);
    });
    frame.srcdoc = buildSrcdoc(app, html, this.safe, dark);
    this.bridge = new AppBridge(frame, app, {
      goHome: () => this.goHome(),
      openEditor: (prompt) => this.openChat(app.id, prompt),
      openSwitcher: () => this.openSwitcher(),
    });
    this.frame = frame;
    this.stage.replaceChildren(frame);
  }

  private async reloadCurrent(): Promise<void> {
    if (!this.currentAppId) return;
    const app = appStore.require(this.currentAppId);
    this.mountFrame(app, await appStore.readHtml(app.id));
    await this.frameLoaded;
  }

  goHome(): void {
    this.closeSwitcher(true);
    this.bridge?.dispose();
    this.bridge = null;
    this.frame?.remove();
    this.frame = null;
    this.currentAppId = null;
    this.editing = false;
    this.stage.classList.add('hidden');
    this.home.classList.remove('hidden');
    if (!this.running) {
      this.collapseSheet();
      void this.loadConversation(HOME_CHAT);
    }
    this.updateChrome();
  }

  // ---------------------------------------------------------------- switcher

  openSwitcher(): void {
    if (!this.switcher.classList.contains('hidden')) return;
    haptic(ImpactStyle.Medium);
    this.input.blur();
    this.renderSwitcher();
    this.switcher.classList.remove('hidden');
    this.stage.classList.add('shrunk');
    this.sheet.classList.add('behind');
    this.bubble.classList.add('behind');
  }

  closeSwitcher(instant = false): void {
    if (this.switcher.classList.contains('hidden')) return;
    if (!instant) haptic();
    this.switcher.classList.add('hidden');
    this.stage.classList.remove('shrunk');
    this.sheet.classList.remove('behind');
    this.bubble.classList.remove('behind');
  }

  private renderSwitcher(): void {
    const current = this.currentAppId ? appStore.get(this.currentAppId) : undefined;
    const others = appStore.list().filter((a) => a.id !== current?.id);
    const actions = h('div', { class: 'switch-actions' },
      h('button', { class: 'switch-btn', onclick: () => this.goHome() }, icon('home'), 'Home'),
      current
        ? h('button', { class: 'switch-btn accent', onclick: () => { this.closeSwitcher(); this.openChat(current.id); } }, icon('pencil'), 'Edit')
        : h('button', { class: 'switch-btn accent', onclick: () => { this.closeSwitcher(); this.openChat(null); } }, icon('plus'), 'New app'),
      current
        ? h('button', { class: 'switch-btn', onclick: () => this.closeSwitcher() }, icon('chevron'), 'Back')
        : null,
    );
    const strip = h('div', { class: 'switch-strip' });
    for (const app of others) {
      strip.append(h('button', { class: 'app-icon', onclick: () => void this.openApp(app.id) },
        h('span', { class: 'tile', style: `--tile:${app.color}` }, app.emoji),
        h('span', { class: 'label' }, app.name)));
    }
    strip.append(h('button', { class: 'app-icon new', onclick: () => { this.goHome(); this.openChat(null); } },
      h('span', { class: 'tile' }, icon('plus')), h('span', { class: 'label' }, 'New')));

    this.switcher.replaceChildren(
      h('div', { class: 'switch-backdrop', onclick: () => current ? this.closeSwitcher() : undefined }),
      h('div', { class: 'switch-top' }, current ? h('div', { class: 'switch-name' }, `${current.emoji} ${current.name}`) : h('div', { class: 'switch-name' }, 'Mapp')),
      h('div', { class: 'switch-bottom' },
        actions,
        h('div', { class: 'switch-label' }, others.length ? 'Your other apps' : 'Your apps'),
        strip),
    );
    this.stage.onclick = () => {
      if (this.stage.classList.contains('shrunk')) this.closeSwitcher();
    };
  }

  // ---------------------------------------------------------------- chat

  private buildSheet(): void {
    this.input.addEventListener('input', () => this.autosize());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !Capacitor.isNativePlatform()) {
        e.preventDefault();
        this.submit();
      }
    });
    this.sendBtn.addEventListener('click', () => {
      if (this.running) this.running.abort();
      else this.submit();
    });
    this.undoBtn.addEventListener('click', async () => {
      if (!this.currentAppId || this.running) return;
      if (await appStore.undo(this.currentAppId)) {
        haptic();
        await this.reloadCurrent();
        this.toast('Reverted the last change');
      }
    });
    const grabber = h('div', { class: 'grabber' });
    let startY = 0;
    grabber.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    grabber.addEventListener('touchend', (e) => {
      if (e.changedTouches[0].clientY - startY > 50) this.collapseSheet();
    });
    this.sheet.append(
      grabber,
      h('header', { class: 'sheet-head' },
        this.sheetTitle,
        this.undoBtn,
        h('button', { class: 'chip', onclick: () => this.collapseSheet() }, 'Hide'),
        h('button', { class: 'chip strong', onclick: () => this.finishEditing() }, 'Done')),
      this.messagesEl,
      h('div', { class: 'composer' }, this.input, this.sendBtn),
    );
  }

  private setupBubble(): void {
    let dragging = false;
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    this.bubble.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const rect = this.bubble.getBoundingClientRect();
      sx = t.clientX;
      sy = t.clientY;
      ox = rect.left;
      oy = rect.top;
      dragging = false;
    }, { passive: true });
    this.bubble.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!dragging && Math.hypot(t.clientX - sx, t.clientY - sy) < 8) return;
      dragging = true;
      e.preventDefault();
      const x = Math.min(window.innerWidth - 64, Math.max(8, ox + t.clientX - sx));
      const y = Math.min(window.innerHeight - 64, Math.max(this.safe.top + 8, oy + t.clientY - sy));
      this.bubble.style.left = `${x}px`;
      this.bubble.style.top = `${y}px`;
      this.bubble.style.right = 'auto';
      this.bubble.style.bottom = 'auto';
    }, { passive: false });
    this.bubble.addEventListener('touchend', () => {
      if (!dragging) return;
      // Snap to the nearest side like a native floating button.
      const rect = this.bubble.getBoundingClientRect();
      const left = rect.left + rect.width / 2 < window.innerWidth / 2 ? 12 : window.innerWidth - rect.width - 12;
      this.bubble.style.left = `${left}px`;
    });
    this.bubble.addEventListener('click', () => {
      if (dragging) { dragging = false; return; }
      haptic();
      this.openChat(this.currentAppId);
    });
  }

  openChat(appId: string | null, prompt?: string): void {
    if (appId && appId !== this.currentAppId) return;
    this.editing = appId !== null;
    const key = appId ?? HOME_CHAT;
    if (this.conversation.key !== key && !this.running) void this.loadConversation(key);
    this.sheet.classList.remove('hidden');
    this.sheet.classList.toggle('full', !appId);
    this.updateChrome();
    if (prompt) {
      this.input.value = prompt;
      this.autosize();
    }
    if (!Capacitor.isNativePlatform() || !appId) window.setTimeout(() => this.input.focus(), 250);
  }

  private collapseSheet(): void {
    this.input.blur();
    this.sheet.classList.add('hidden');
    this.updateChrome();
  }

  private finishEditing(): void {
    this.editing = false;
    this.collapseSheet();
  }

  private updateChrome(): void {
    const app = this.currentAppId ? appStore.get(this.currentAppId) : undefined;
    this.sheetTitle.replaceChildren(app ? `${app.emoji} Editing ${app.name}` : '✨ New app');
    this.undoBtn.classList.toggle('hidden', !app);
    const sheetOpen = !this.sheet.classList.contains('hidden');
    this.bubble.classList.toggle('hidden', !(app && this.editing && !sheetOpen));
    this.bubble.classList.toggle('busy', this.running !== null);
    this.stage.classList.toggle('with-sheet', Boolean(app) && sheetOpen);
  }

  private async loadConversation(key: string): Promise<void> {
    const messages = await appStore.readChat(key);
    this.conversation = { key, messages };
    this.renderMessages();
  }

  private renderMessages(): void {
    this.messagesEl.replaceChildren();
    if (!this.conversation.messages.length) {
      const app = this.currentAppId ? appStore.get(this.currentAppId) : undefined;
      const ideas = app
        ? ['Make it prettier', 'Add a dark theme', 'Add a reminder notification', 'Fix anything broken']
        : SUGGESTIONS;
      this.messagesEl.append(
        h('div', { class: 'empty-chat' },
          h('p', {}, app ? `Tell me what to change in ${app.name}.` : 'Describe the app you want. I build it on your phone in seconds.'),
          h('div', { class: 'ideas' }, ...ideas.map((idea) =>
            h('button', { class: 'idea', onclick: () => { this.input.value = idea; this.submit(); } }, idea)))));
      return;
    }
    for (const m of this.conversation.messages) this.messagesEl.append(this.bubbleFor(m.role, m.content));
    this.scrollMessages();
  }

  private bubbleFor(role: ChatMessage['role'], text: string): HTMLElement {
    return h('div', { class: `msg ${role}` }, text);
  }

  private scrollMessages(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private autosize(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 140)}px`;
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text || this.running) return;
    if (!session.signedIn) {
      this.pendingPrompt = text;
      this.showSignIn();
      return;
    }
    this.input.value = '';
    this.autosize();
    void this.run(text);
  }

  private async run(text: string): Promise<void> {
    const conversation = this.conversation;
    if (!conversation.messages.length) this.messagesEl.replaceChildren();
    conversation.messages.push({ role: 'user', content: text });
    this.messagesEl.append(this.bubbleFor('user', text));
    const status = h('div', { class: 'status' }, h('span', { class: 'dots' }), 'Thinking…');
    let reply = h('div', { class: 'msg assistant streaming' });
    this.messagesEl.append(status);
    this.scrollMessages();

    const controller = new AbortController();
    this.running = controller;
    this.sendBtn.replaceChildren(icon('stop'));
    this.sendBtn.classList.add('stop');
    this.updateChrome();

    const current = this.currentAppId ? appStore.get(this.currentAppId) : undefined;
    try {
      const answer = await runAgent(
        conversation.messages,
        buildInstructions(current, appStore.list()),
        {
          openApp: async (id) => {
            if (this.currentAppId === id && this.frame) await this.reloadCurrent();
            else await this.openApp(id);
            this.editing = true;
            this.updateChrome();
          },
          settle: () => new Promise((r) => window.setTimeout(r, 1200)),
        },
        {
          onDelta: (delta) => {
            if (!reply.isConnected) this.messagesEl.insertBefore(reply, status);
            reply.textContent += delta;
            this.scrollMessages();
          },
          onToolStart: (name, args) => {
            status.replaceChildren(h('span', { class: 'dots' }), toolLabel(name, args));
            if (reply.isConnected) {
              // Text before a tool call is its own message; later text gets a fresh bubble.
              reply.classList.remove('streaming');
              reply = h('div', { class: 'msg assistant streaming' });
            }
            this.scrollMessages();
          },
          onToolEnd: (name, ok) => {
            if (!ok && name !== 'read_skill') status.classList.add('warn');
          },
        },
        controller.signal,
      );
      conversation.messages.push({ role: 'assistant', content: answer || 'Done.' });
      if (!this.messagesEl.querySelector('.msg.assistant') && answer) {
        this.messagesEl.insertBefore(this.bubbleFor('assistant', answer), status);
      }
      haptic(ImpactStyle.Medium);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      conversation.messages.push({ role: 'assistant', content: message === 'Stopped' ? 'Stopped.' : `⚠️ ${message}` });
      this.messagesEl.insertBefore(h('div', { class: 'msg assistant error' }, message === 'Stopped' ? 'Stopped.' : message), status);
    } finally {
      reply.classList.remove('streaming');
      status.remove();
      this.running = null;
      this.sendBtn.replaceChildren(icon('send'));
      this.sendBtn.classList.remove('stop');
      await appStore.writeChat(conversation.key, conversation.messages);
      this.updateChrome();
      this.scrollMessages();
    }
  }

  // ---------------------------------------------------------------- modals

  private showModal(build: (close: () => void) => Array<Node | null>): void {
    const close = () => {
      this.modalLayer.classList.add('hidden');
      this.modalLayer.replaceChildren();
    };
    const card = h('div', { class: 'modal' }, ...build(close));
    this.modalLayer.replaceChildren(h('div', { class: 'modal-backdrop', onclick: close }), card);
    this.modalLayer.classList.remove('hidden');
  }

  private showSignIn(): void {
    this.input.blur();
    this.showModal((close) => {
      const error = h('p', { class: 'error-text hidden' });
      const btn = h('button', { class: 'primary chatgpt' }, 'Continue with ChatGPT');
      btn.addEventListener('click', async () => {
        btn.setAttribute('disabled', '');
        btn.textContent = 'Opening ChatGPT…';
        error.classList.add('hidden');
        try {
          await session.signIn();
          close();
          this.toast(`Signed in as ${session.credentials?.email ?? 'ChatGPT user'}`);
          if (this.pendingPrompt) {
            const text = this.pendingPrompt;
            this.pendingPrompt = null;
            this.input.value = '';
            this.autosize();
            void this.run(text);
          }
        } catch (e) {
          error.textContent = e instanceof Error ? e.message : String(e);
          error.classList.remove('hidden');
          btn.removeAttribute('disabled');
          btn.textContent = 'Continue with ChatGPT';
        }
      });
      return [
        icon('logo', 'modal-logo'),
        h('h2', {}, 'Connect ChatGPT'),
        h('p', { class: 'muted' }, 'Mapp builds your apps with AI using your own ChatGPT plan. Your sign in stays in the iOS Keychain. No Mapp account needed.'),
        btn,
        error,
        h('button', { class: 'secondary', onclick: close }, 'Not now'),
        h('p', { class: 'fine' }, 'Mapp is made by Capgo and is not affiliated with OpenAI.'),
      ];
    });
  }

  private showSettings(): void {
    this.showModal((close) => {
      const bundle = h('span', { class: 'muted' }, '');
      if (Capacitor.isNativePlatform()) {
        void CapacitorUpdater.current().then((c) => {
          bundle.textContent = `Live update ${c.bundle.version === 'builtin' ? 'built-in' : c.bundle.version}`;
        }).catch(() => undefined);
      }
      const open = (url: string) => {
        if (Capacitor.isNativePlatform()) void InAppBrowser.open({ url });
        else window.open(url, '_blank', 'noopener');
      };
      const email = session.credentials?.email;
      return [
        h('h2', {}, 'Settings'),
        h('div', { class: 'account' },
          h('div', { class: 'avatar big' }, email ? email[0].toUpperCase() : '?'),
          h('div', {}, h('strong', {}, email ?? 'Not connected'), h('p', { class: 'muted' }, email ? 'ChatGPT account' : 'Connect ChatGPT to build apps'))),
        email
          ? h('button', { class: 'row-btn danger', onclick: async () => { await session.signOut(); close(); this.toast('Signed out'); } }, icon('logout'), 'Sign out')
          : h('button', { class: 'row-btn', onclick: () => { close(); this.showSignIn(); } }, icon('sparkles'), 'Connect ChatGPT'),
        h('div', { class: 'gesture-help' },
          h('strong', {}, 'Gestures'),
          h('p', { class: 'muted' }, 'Pinch with three fingers inside any app to open the switcher: go Home, Edit the app with AI, or jump to another app. Spread three fingers to go back.')),
        h('button', { class: 'row-btn', onclick: () => { close(); this.showOnboarding(); } }, icon('hand'), 'Show the tour again'),
        h('button', { class: 'row-btn', onclick: () => open(APP_LINKS.privacy) }, icon('shield'), 'Privacy policy'),
        h('button', { class: 'row-btn', onclick: () => open(APP_LINKS.terms) }, icon('external'), 'Terms of use'),
        h('button', { class: 'row-btn', onclick: () => open(APP_LINKS.support) }, icon('external'), 'Support'),
        h('p', { class: 'fine' }, `Mapp ${__APP_VERSION__} · `, bundle),
        h('button', { class: 'secondary', onclick: close }, 'Close'),
      ];
    });
  }

  private showOnboarding(): void {
    const slides = [
      { art: h('div', { class: 'art art-apps' }, ...['✅', '💸', '⏳', '🌱', '📓', '✨'].map((e, i) =>
        h('span', { class: 'tile', style: `--tile:${['#22c55e', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#6d4dff'][i]}` }, e))),
        title: 'Your own apps,\nmade by you', body: 'Mapp is a phone full of apps that only you have. Habit trackers, lists, timers, journals: whatever you need.' },
      { art: h('div', { class: 'art art-chat' },
        h('div', { class: 'msg user' }, 'Add a chart of my weekly streaks'),
        h('div', { class: 'msg assistant' }, 'Done! Your Habits app now shows a weekly chart.')),
        title: 'Just ask', body: 'Describe what you want and AI builds or changes the app right away, using your ChatGPT plan.' },
      { art: h('div', { class: 'art art-pinch' }, h('span', { class: 'f f1' }), h('span', { class: 'f f2' }), h('span', { class: 'f f3' })),
        title: 'Pinch with\nthree fingers', body: 'Inside any app, pinch three fingers together to go home, edit the app, or switch to another one.' },
    ];
    let index = 0;
    const layer = h('div', { class: 'onboarding' });
    const render = () => {
      const slide = slides[index];
      const last = index === slides.length - 1;
      layer.replaceChildren(
        h('div', { class: 'onb-art' }, slide.art),
        h('h1', {}, ...slide.title.split('\n').flatMap((line, i) => i ? [h('br'), line] : [line])),
        h('p', { class: 'muted' }, slide.body),
        h('div', { class: 'dots-row' }, ...slides.map((_, i) => h('span', { class: i === index ? 'on' : '' }))),
        h('button', { class: 'primary', onclick: () => {
          haptic();
          if (!last) { index++; render(); return; }
          localStorage.setItem(PREF_KEYS.onboarded, '1');
          layer.remove();
          if (!session.signedIn) this.showSignIn();
        } }, last ? 'Start building' : 'Next'),
        ...(last ? [] : [h('button', { class: 'secondary', onclick: () => { localStorage.setItem(PREF_KEYS.onboarded, '1'); layer.remove(); } }, 'Skip')]),
      );
    };
    render();
    this.root.append(layer);
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    window.setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }
}

function toolLabel(name: string, args: Record<string, unknown>): string {
  const appName = (id: unknown) => appStore.get(String(id))?.name ?? 'app';
  switch (name) {
    case 'create_app': return `Building ${String(args.name ?? 'your app')}…`;
    case 'edit_app':
    case 'write_app': return `Updating ${appName(args.id)}…`;
    case 'read_app': return `Reading ${appName(args.id)}…`;
    case 'open_app': return `Opening ${appName(args.id)}…`;
    case 'get_app_logs': return 'Checking for errors…';
    case 'update_app_info': return 'Updating icon and name…';
    case 'read_skill': return `Reading Capgo skill: ${String(args.name ?? '')}`;
    case 'list_skills': return 'Checking Capgo skills…';
    default: return 'Working…';
  }
}
