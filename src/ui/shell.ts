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
import { buildSrcdoc, syncSafeArea, type SafeArea } from '../apps/runtime';
import { cloud, memberName } from '../cloud/client';
import { appStore, type MiniAppMeta } from '../apps/store';
import { STARTER_APPS } from '../apps/templates';
import { APP_LINKS, PREF_KEYS } from '../config';
import { lifecycle } from '../lifecycle';
import '@capgo/capacitor-sheets';
import type { CapSheet } from '@capgo/capacitor-sheets';
import { Activity } from './activity';
import capgoSvg from '../assets/capgo.svg?raw';
import { renderMarkdown } from './markdown';
import { exportFile } from '../files';
import { Clipboard } from '@capacitor/clipboard';
import { questionCard, secretCard, type SecretSpec } from './cards';
import { deleteSecret, listSecrets, looksLikeSecret, normalizeSecretName, saveSecret } from '../secrets';
import { takeRequestLog } from '../ai/responses';
import { reportRun } from '../diag';
import { PinchDetector } from './gesture';
import { parseLink, type LinkAction } from '../links';
import { showOnboarding } from './onboarding';
import { h, icon } from './dom';
import { BROWSER, DEVICE, SECURE_STORE } from '../platform';

const HOME_CHAT = 'home';

const SUGGESTIONS = [
  'A grocery list I can share with my partner',
  'A workout log with charts of my progress',
  'A plant watering reminder',
  'Explain compound interest with sliders I can play with',
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
  private sheet = h('cap-sheet-content', { class: 'chat-sheet' });
  private bubble = h('button', { class: 'bubble hidden', 'aria-label': 'Open Forgr chat' }, icon('sparkles'));
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
  private input = h('textarea', { rows: 1, placeholder: 'Describe a tool or a change…', enterkeyhint: 'send' });
  private sendBtn = h('button', { class: 'send', 'aria-label': 'Send' }, icon('send'));
  private sheetTitle = h('div', { class: 'sheet-title' });
  private newChatBtn = h('button', { class: 'chip icon-only', 'aria-label': 'New chat' }, icon('compose'));
  private undoBtn = h('button', { class: 'chip', 'aria-label': 'Undo last change' }, 'Undo');

  /** Swappable for the scripted dev demo. */
  agent: typeof runAgent = runAgent;

  constructor(private readonly root: HTMLElement) {}

  async init(): Promise<void> {
    this.measureSafeArea();
    this.root.append(this.home, this.stage, this.switcher, this.bubble, this.buildChatSheet(), this.modalLayer, this.toastEl);
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
    // The "New app" chat starts with its suggestions, even before any conversation exists.
    await this.loadConversation(HOME_CHAT);

    // Tell the open mini app when Forgr leaves or returns to the screen.
    lifecycle.onChange((active) => {
      this.frame?.contentWindow?.postMessage({ __mapp: 'event', name: active ? 'app.resume' : 'app.pause', payload: { at: Date.now() } }, '*');
    });

    if (Capacitor.isNativePlatform()) {
      // A live update finished downloading: offer to restart into it now.
      void CapacitorUpdater.addListener('downloadComplete', ({ bundle }) => {
        this.showUpdateReady(bundle.id, bundle.version);
      });
      void CapacitorUpdater.notifyAppReady().catch(() => undefined);
      void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const appId = (event.notification.extra as { appId?: string } | undefined)?.appId;
        if (appId && appStore.get(appId)) void this.openApp(appId);
      });
      void CapApp.addListener('appUrlOpen', ({ url }) => this.handleLink(url));
      void CapApp.getLaunchUrl().then((launch) => launch?.url && this.handleLink(launch.url)).catch(() => undefined);
      void CapApp.addListener('backButton', () => {
        if (!this.switcher.classList.contains('hidden')) this.closeSwitcher();
        else if (this.sheetOpen) this.collapseSheet();
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
    const email = session.credentials?.email;
    const avatar = h('button', { class: 'avatar', 'aria-label': 'Account and settings', onclick: () => this.showSettings() },
      email ? email[0].toUpperCase() : icon('person'));

    const grid = h('div', { class: 'grid' });
    for (const app of apps) grid.append(this.appIcon(app));
    grid.append(h('button', { class: 'app-icon new', 'aria-label': 'New app', onclick: () => this.openChat(null) },
      h('span', { class: 'tile' }, icon('plus')),
      h('span', { class: 'label' }, 'New Tool')));

    this.home.replaceChildren(
      h('header', { class: 'home-header' },
        h('h1', { class: 'large-title' }, 'Forgr'),
        avatar),
      grid,
      apps.length < 4
        ? h('p', { class: 'footnote home-note' }, apps.length
          ? 'Tap to open, hold for options. In any tool, pinch with three fingers to come back.'
          : 'Describe a tool below and it appears here.')
        : '',
      h('div', { class: 'composer-bar' },
        h('button', { class: 'composer-pill', onclick: () => this.openChat(null) },
          icon('sparkles'), h('span', {}, 'Describe a new tool'))),
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
      h('div', { class: 'group' },
        h('div', { class: 'action-head' },
          h('span', { class: 'tile small', style: `--tile:${app.color}` }, app.emoji),
          h('div', { class: 'action-text' }, h('strong', {}, app.name), h('span', { class: 'footnote' }, app.description || 'Your app'))),
        h('button', { class: 'row', onclick: () => { close(); void this.openApp(app.id); } }, h('span', { class: 'row-title' }, 'Open'), icon('chevron', 'icon row-icon')),
        h('button', { class: 'row', onclick: () => { close(); void this.openApp(app.id).then(() => this.openChat(app.id)); } }, h('span', { class: 'row-title' }, 'Edit with AI'), icon('pencil', 'icon row-icon')),
        h('button', { class: 'row danger', onclick: () => { close(); this.confirmDelete(app); } }, h('span', { class: 'row-title' }, 'Delete Tool'), icon('trash', 'icon row-icon'))),
      h('div', { class: 'group' }, h('button', { class: 'row center strong', onclick: close }, 'Cancel')),
    ], 'action');
  }

  private confirmDelete(app: MiniAppMeta): void {
    this.showModal((close) => [
      h('div', { class: 'group' },
        h('div', { class: 'action-message' },
          h('strong', {}, `Delete ${app.name}?`),
          h('span', { class: 'footnote' }, `The tool and its data are removed from this ${DEVICE}. This cannot be undone.`)),
        h('button', { class: 'row center danger', onclick: async () => {
          close();
          if (this.currentAppId === app.id) this.goHome();
          await appStore.delete(app.id);
        } }, 'Delete Tool')),
      h('div', { class: 'group' }, h('button', { class: 'row center strong', onclick: close }, 'Cancel')),
    ], 'action');
  }

  // ---------------------------------------------------------------- running apps

  async openApp(id: string): Promise<void> {
    const app = appStore.require(id);
    this.closeSwitcher(true);

    if (this.running && this.conversation.key === HOME_CHAT) {
      // A new app was created from home: the conversation now belongs to it.
      this.conversation.key = id;
      await appStore.writeChat(HOME_CHAT, []);
    }
    this.currentAppId = id;
    // Each app keeps its own conversation in its folder: show it when the app opens.
    if (!this.running && this.conversation.key !== id) await this.loadConversation(id);
    this.mountFrame(app, await appStore.readHtml(id));
    this.home.classList.add('hidden');
    this.stage.classList.remove('hidden');
    this.updateChrome();
    await this.frameLoaded;
  }

  private stopSafeArea: (() => void) | null = null;

  private mountFrame(app: MiniAppMeta, html: string): void {
    this.bridge?.dispose();
    this.stopSafeArea?.();
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
      requestSecret: (spec) => this.secretSheet({
        name: spec.name,
        label: spec.label,
        kind: spec.kind,
        username: spec.username,
        help: `${spec.appName} needs this.`,
        destination: `in the ${SECURE_STORE}`,
      }),
    });
    this.frame = frame;
    this.stopSafeArea = syncSafeArea(frame);
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
    this.stopSafeArea?.();
    this.stopSafeArea = null;
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

  // ---------------------------------------------------------------- links


  private pendingLink: LinkAction | null = null;

  /** mapp://… and https://<site>/l/… links from other apps, ChatGPT, QR codes. */
  private handleLink(url: string): void {
    const link = parseLink(url);
    if (!link) return;
    void this.runLink(link);
  }

  private async runLink(link: LinkAction): Promise<void> {
    if (document.body.classList.contains('onboarding-open')) return;
    const needsAccount = link.action === 'build' || link.action === 'join' || (link.action === 'edit' && link.prompt);
    if (needsAccount && !session.signedIn) {
      this.pendingLink = link;
      this.showSignIn();
      return;
    }
    switch (link.action) {
      case 'home':
        this.goHome();
        return;
      case 'join':
        await this.joinSpace(link.code);
        return;
      case 'open':
      case 'edit': {
        const wanted = link.app.toLowerCase();
        const app = appStore.list().find((a) => a.id === link.app || a.name.toLowerCase() === wanted);
        if (!app) {
          this.toast(`No tool called "${link.app}"`);
          return;
        }
        await this.openApp(app.id);
        // Edits from a link are only prefilled: the user reviews and sends.
        if (link.action === 'edit') this.openChat(app.id, link.prompt);
        return;
      }
      case 'build': {
        if (this.running) {
          this.toast('Finish the current request first');
          return;
        }
        this.goHome();
        this.openChat(null);
        await this.loadConversation(HOME_CHAT);
        const prompt = link.name ? `${link.prompt}\n\nName the tool "${link.name}".` : link.prompt;
        this.input.value = '';
        void this.run(prompt, false, true);
        return;
      }
    }
  }

  private async joinSpace(code: string): Promise<void> {
    try {
      const space = await cloud.joinSpace(code, memberName());
      this.goHome();
      this.toast(`Joined ${space.name}`);
      this.openChat(null, `Build me a tool for the shared space "${space.name}" (${space.spaceId})`);
    } catch (error) {
      this.toast(error instanceof Error ? error.message : 'Could not join');
    }
  }

  // ---------------------------------------------------------------- switcher

  openSwitcher(): void {
    if (!this.switcher.classList.contains('hidden')) return;
    if (document.body.classList.contains('onboarding-open')) return;
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
      h('button', { class: 'switch-btn', onclick: () => this.goHome() }, icon('home'), h('span', {}, 'Home')),
      current
        ? h('button', { class: 'switch-btn accent', onclick: () => { this.closeSwitcher(); this.openChat(current.id); } }, icon('pencil'), h('span', {}, 'Edit'))
        : h('button', { class: 'switch-btn accent', onclick: () => { this.closeSwitcher(); this.openChat(null); } }, icon('plus'), h('span', {}, 'New Tool')),
      current
        ? h('button', { class: 'switch-btn', onclick: () => this.closeSwitcher() }, icon('back'), h('span', {}, 'Back'))
        : null,
    );
    const strip = h('div', { class: 'switch-strip' });
    for (const app of others) {
      strip.append(h('button', { class: 'app-icon', onclick: () => void this.openApp(app.id) },
        h('span', { class: 'tile', style: `--tile:${app.color}` }, app.emoji),
        h('span', { class: 'label' }, app.name)));
    }
    strip.append(h('button', { class: 'app-icon new', onclick: () => { this.goHome(); this.openChat(null); } },
      h('span', { class: 'tile' }, icon('plus')), h('span', { class: 'label' }, 'New Tool')));

    this.switcher.replaceChildren(
      h('div', { class: 'switch-backdrop', onclick: () => current ? this.closeSwitcher() : undefined }),
      h('div', { class: 'switch-top' }, h('div', { class: 'switch-name' }, current ? current.name : 'Forgr')),
      h('div', { class: 'switch-bottom' },
        actions,
        others.length ? h('div', { class: 'switch-label' }, 'Other Tools') : null,
        strip),
    );
    this.stage.onclick = () => {
      if (this.stage.classList.contains('shrunk')) this.closeSwitcher();
    };
  }

  // ---------------------------------------------------------------- chat

  private buildSheet(): void {
    this.input.addEventListener('input', () => this.autosize());
    this.sendBtn.classList.add('idle');
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
    this.newChatBtn.addEventListener('click', () => void this.newChat());
    this.undoBtn.addEventListener('click', async () => {
      if (!this.currentAppId || this.running) return;
      if (await appStore.undo(this.currentAppId)) {
        haptic();
        await this.reloadCurrent();
        this.toast('Reverted the last change');
      }
    });
    this.sheet.append(
      document.createElement('cap-sheet-handle'),
      h('header', { class: 'sheet-head' },
        h('div', { class: 'head-side' }, this.newChatBtn, this.undoBtn),
        this.sheetTitle,
        h('div', { class: 'head-side end' },
          h('button', { class: 'chip icon-only', 'aria-label': 'Hide chat', onclick: () => this.collapseSheet() }, icon('chevronDown')),
          h('button', { class: 'chip strong', onclick: () => this.finishEditing() }, 'Done'))),
      this.messagesEl,
      h('div', { class: 'composer' }, h('div', { class: 'field' }, this.input, this.sendBtn)),
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
    this.sheet.classList.toggle('full', !appId);
    this.sheetOpen = true;
    this.syncChatSheet();
    this.updateChrome();
    if (prompt) {
      this.input.value = prompt;
      this.autosize();
    }
    if (!Capacitor.isNativePlatform() || !appId) window.setTimeout(() => this.input.focus(), 250);
  }

  /** Clears the current conversation; the app's code and data are kept. */
  private async newChat(): Promise<void> {
    if (this.running) {
      this.toast('Stop the current request first');
      return;
    }
    const key = this.conversation.key;
    await appStore.clearChat(key);
    this.conversation = { key, messages: [] };
    this.renderMessages();
    this.input.value = '';
    this.autosize();
    haptic();
    window.setTimeout(() => this.input.focus(), 100);
  }

  private collapseSheet(): void {
    this.input.blur();
    this.sheetOpen = false;
    this.syncChatSheet();
    this.updateChrome();
  }

  private sheetOpen = false;

  /** Animation state of the chat sheet, from cap-sheet-travel-status-change. */
  private chatTravel = 'idle';

  /**
   * Brings the chat sheet to the wanted state (sheetOpen). Calls made while it
   * is animating are ignored or queued by the library, so act only when idle;
   * the travel-status listener calls this again when the animation ends.
   */
  private syncChatSheet(): void {
    if (this.chatTravel !== 'idle') return;
    if (this.sheetOpen && !this.chatSheet.presented) this.chatSheet.present();
    else if (!this.sheetOpen && this.chatSheet.presented) this.chatSheet.dismiss();
  }

  private chatSheet = document.createElement('cap-sheet') as CapSheet;

  /**
   * The chat lives in a Capgo Sheets bottom sheet: drag the handle down to
   * hide it. It is not modal, so the app above stays usable while editing.
   */
  private buildChatSheet(): HTMLElement {
    const sheet = this.chatSheet;
    sheet.setAttribute('content-placement', 'bottom');
    sheet.setAttribute('inert-outside', 'false');
    sheet.setAttribute('close-on-outside-click', 'false');
    sheet.setAttribute('focus-trap', 'false');
    sheet.setAttribute('safe-area', 'none');
    const view = document.createElement('cap-sheet-view');
    view.classList.add('chat-view');
    const content = this.sheet;
    view.append(content);
    const portal = document.createElement('cap-sheet-portal');
    portal.append(view);
    sheet.append(portal);
    sheet.addEventListener('cap-sheet-presented-change', (event) => {
      const { presented, source } = (event as CustomEvent<{ presented: boolean; source: string }>).detail;
      if (!presented && source !== 'programmatic') {
        // Swiped down: same as tapping Hide.
        this.sheetOpen = false;
        this.input.blur();
        this.updateChrome();
      }
    });
    sheet.addEventListener('cap-sheet-travel-status-change', (event) => {
      this.chatTravel = (event as CustomEvent<{ status: string }>).detail.status;
      if (this.chatTravel === 'idle') window.setTimeout(() => this.syncChatSheet(), 0);
    });
    return sheet;
  }

  private finishEditing(): void {
    this.editing = false;
    this.collapseSheet();
  }

  private updateChrome(): void {
    const app = this.currentAppId ? appStore.get(this.currentAppId) : undefined;
    this.sheetTitle.replaceChildren(app ? app.name : 'New Tool');
    this.undoBtn.classList.toggle('hidden', !app);
    const sheetOpen = this.sheetOpen;
    this.bubble.classList.toggle('hidden', !(app && this.editing && !sheetOpen));
    this.bubble.classList.toggle('busy', this.running !== null);
    this.stage.classList.toggle('with-sheet', Boolean(app) && sheetOpen);
  }

  private async loadConversation(key: string): Promise<void> {
    const messages = await appStore.readChat(key);
    this.conversation = { key, messages };
    this.renderMessages();
    const job = this.running ? null : await appStore.readJob(key);
    if (job && this.conversation.key === key) this.showInterrupted(job.prompt);
  }

  /** A run stopped by iOS (app killed or suspended too long): offer to continue it. */
  private showInterrupted(prompt: string): void {
    this.messagesEl.append(h('div', { class: 'error-block' },
      h('p', {}, 'This request was interrupted when Forgr left the screen.'),
      h('button', { class: 'retry', onclick: () => { if (!this.running) void this.run(prompt, true); } }, icon('undo'), 'Continue')));
    this.scrollMessages();
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
          h('p', { class: 'empty-lead' }, app ? `What should change in ${app.name}?` : `Describe the tool you want. Forgr makes it on this ${DEVICE}.`),
          h('div', { class: 'section-label' }, app ? 'Try' : 'Ideas'),
          h('div', { class: 'group ideas' }, ...ideas.map((idea) =>
            h('button', { class: 'row idea', onclick: () => { this.input.value = idea; this.submit(); } },
              h('span', { class: 'row-title' }, idea), icon('chevron', 'icon row-icon'))))));
      return;
    }
    for (const m of this.conversation.messages) {
      this.messagesEl.append(m.card ? this.appCard(m.card) : this.bubbleFor(m.role, m.content));
    }
    this.scrollMessages();
  }

  /** Card for an app the builder created or updated: Open it, or Undo the update. */
  private appCard(card: NonNullable<ChatMessage['card']>): HTMLElement {
    const app = appStore.get(card.appId);
    if (!app) {
      return h('div', { class: 'app-card gone' }, h('span', { class: 'app-card-sub' }, 'This app was deleted.'));
    }
    const sub = card.kind === 'created' ? `New tool · version ${card.version}` : `Updated · version ${card.version}`;
    const open = h('button', { class: 'app-card-open' }, 'Open');
    open.addEventListener('click', async () => {
      haptic();
      if (this.currentAppId !== app.id) await this.openApp(app.id);
      this.editing = true;
      this.collapseSheet();
    });
    const actions: HTMLElement[] = [open];
    if (card.kind === 'updated' && card.version === app.version && card.version > 1) {
      const undo = h('button', { class: 'app-card-undo' }, 'Undo');
      undo.addEventListener('click', async () => {
        if (this.running) return;
        if (await appStore.undo(app.id)) {
          haptic();
          if (this.currentAppId === app.id) await this.reloadCurrent();
          undo.remove();
          this.toast(`Reverted ${app.name}`);
        }
      });
      actions.unshift(undo);
    }
    return h('div', { class: 'app-card' },
      h('span', { class: 'tile app-card-icon', style: `--tile:${app.color}` }, app.emoji),
      h('div', { class: 'app-card-text' },
        h('strong', {}, app.name),
        h('span', { class: 'app-card-sub' }, sub)),
      h('div', { class: 'app-card-actions' }, ...actions));
  }

  private bubbleFor(role: ChatMessage['role'], text: string): HTMLElement {
    const bubble = h('div', { class: `msg ${role}` });
    this.setMessageText(bubble, role, text);
    return bubble;
  }

  /** User text stays plain; assistant replies render as safe Markdown. */
  private setMessageText(bubble: HTMLElement, role: ChatMessage['role'], text: string): void {
    bubble.dataset.raw = text;
    if (role === 'user') {
      bubble.textContent = text;
      return;
    }
    bubble.classList.add('md');
    bubble.replaceChildren(renderMarkdown(text, this.markdownActions));
  }

  private readonly markdownActions = {
    openLink: (url: string) => {
      if (url.startsWith('mapp:')) this.handleLink(url);
      else if (Capacitor.isNativePlatform()) void InAppBrowser.open({ url });
      else window.open(url, '_blank', 'noopener');
    },
    copy: (text: string) => {
      void Clipboard.write({ string: text });
      haptic();
    },
    saveFile: (filename: string, text: string) => {
      void exportFile({ filename, text }).catch((e) => this.toast(e instanceof Error ? e.message : String(e)));
    },
  };

  private scrollMessages(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private autosize(): void {
    this.sendBtn.classList.toggle('idle', !this.input.value.trim());
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
    const secret = looksLikeSecret(text);
    if (secret) {
      this.offerSecureSave(text, secret.suggestedName, secret.value);
      return;
    }
    this.input.value = '';
    this.autosize();
    void this.run(text);
  }

  /** The message looks like a key or password: keep it out of the chat. */
  private offerSecureSave(text: string, suggestedName: string, value: string): void {
    this.input.blur();
    this.showModal((close) => {
      const name = h('input', { class: 'card-input', value: suggestedName, autocapitalize: 'characters', spellcheck: 'false' });
      return [
        h('h2', {}, 'This looks like a secret'),
        h('p', { class: 'muted' }, 'Keys and passwords should not go in the chat. Save it securely and your tools can use it without the AI ever seeing it.'),
        h('label', { class: 'field-label' }, 'Save as', name),
        h('button', { class: 'btn mono', onclick: async () => {
          const secretName = normalizeSecretName(name.value) || suggestedName;
          await saveSecret({ name: secretName, label: secretName, kind: 'api_key' }, value);
          close();
          this.input.value = `I saved ${secretName} securely. Use it where it is needed.`;
          this.autosize();
          this.toast(`Saved ${secretName}`);
        } }, 'Save securely'),
        h('button', { class: 'btn plain', onclick: () => {
          close();
          this.input.value = '';
          this.autosize();
          void this.run(text);
        } }, 'Send anyway'),
      ];
    });
  }

  /** Secure entry sheet shown over a running mini app (mapp.secrets.request). */
  private secretSheet(spec: SecretSpec): Promise<{ saved: boolean }> {
    return new Promise((resolve) => {
      let settled = false;
      this.showModal((close) => {
        const card = secretCard(spec, (value, username) => saveSecret({ name: spec.name, label: spec.label, kind: spec.kind, username }, value));
        void card.done.then((saved) => {
          settled = true;
          resolve({ saved });
          window.setTimeout(close, saved ? 700 : 0);
        });
        return [card.el];
      });
      // Closing the sheet by tapping outside counts as skip.
      const observer = new MutationObserver(() => {
        if (this.modalLayer.classList.contains('hidden')) {
          observer.disconnect();
          if (!settled) resolve({ saved: false });
        }
      });
      observer.observe(this.modalLayer, { attributes: true, attributeFilter: ['class'] });
    });
  }

  private async run(text: string, retry = false, fromLink = false): Promise<void> {
    const conversation = this.conversation;
    if (!conversation.messages.length) this.messagesEl.replaceChildren();
    // Continue from the last finished step when an earlier run was interrupted.
    const saved = retry ? await appStore.readJob(conversation.key) : null;
    if (saved?.restricted) fromLink = true;
    const job = { prompt: text, key: conversation.key };
    if (retry) {
      // Drop the failed answer; the user message stays as the prompt.
      if (conversation.messages.at(-1)?.role === 'assistant') conversation.messages.pop();
      this.messagesEl.querySelector('.error-block:last-of-type')?.remove();
    } else {
      conversation.messages.push({ role: 'user', content: text });
      this.messagesEl.append(this.bubbleFor('user', text));
      // Saved now so the request survives iOS killing Forgr mid-run.
      await appStore.writeChat(conversation.key, conversation.messages);
      await appStore.writeJob(conversation.key, { prompt: text, input: [], answer: '', savedAt: Date.now(), restricted: fromLink });
      if (fromLink) {
        this.messagesEl.append(h('div', { class: 'msg assistant note' }, 'Started from a link. This request can only create a new tool.'));
      }
    }
    const activity = new Activity();
    takeRequestLog();
    const runStartedAt = Date.now();
    let outcome: 'ok' | 'empty' | 'error' | 'stopped' = 'error';
    let errorText: string | undefined;
    let answerChars = 0;
    let toolsRan = 0;
    let lastToolArgs: Record<string, unknown> = {};
    const changedApps = new Map<string, 'created' | 'updated'>();
    // Answers and errors go right after the timeline, like ChatGPT's thought block.
    const status = h('div', { class: 'status-anchor' });
    let ok = false;
    let reply = h('div', { class: 'msg assistant streaming' });
    this.messagesEl.append(activity.el, status);
    this.scrollMessages();

    const controller = new AbortController();
    this.running = controller;
    this.sendBtn.replaceChildren(icon('stop'));
    this.sendBtn.classList.add('stop');
    this.sendBtn.setAttribute('aria-label', 'Stop');
    this.updateChrome();

    const current = this.currentAppId ? appStore.get(this.currentAppId) : undefined;
    try {
      const answer = await this.agent(
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
          ...(fromLink ? { restricted: { createdIds: new Set<string>() } } : {}),
          requestSecret: async (spec) => {
            activity.step(`Waiting for ${spec.label}`);
            const card = secretCard({
              ...spec,
              destination: spec.target === 'cloud' ? 'in your Forgr Cloud' : `in the ${SECURE_STORE}`,
            }, async (value, username) => {
              if (spec.target === 'cloud') await cloud.call('PUT', `/v1/secrets/${spec.name}`, { value });
              else await saveSecret({ name: spec.name, label: spec.label, kind: spec.kind, username: username ?? spec.username }, value);
            });
            this.messagesEl.insertBefore(card.el, status);
            this.scrollMessages();
            const saved = await card.done;
            conversation.messages.push({ role: 'assistant', content: `Asked for ${spec.label} (${spec.name}): ${saved ? 'saved securely' : 'skipped'}.` });
            return { saved };
          },
          askUser: async (q) => {
            activity.step('Waiting for your answer');
            const card = questionCard(q);
            this.messagesEl.insertBefore(card.el, status);
            this.scrollMessages();
            haptic();
            const answer = await card.done;
            conversation.messages.push({ role: 'assistant', content: q.question }, { role: 'user', content: answer ?? '(skipped)' });
            void appStore.writeChat(conversation.key, conversation.messages);
            return answer;
          },
        },
        {
          onDelta: (delta) => {
            if (!reply.isConnected) {
              activity.step('Writing the reply');
              this.messagesEl.insertBefore(reply, status);
            }
            // Re-render Markdown at most once per frame while streaming.
            reply.dataset.raw = (reply.dataset.raw ?? '') + delta;
            if (!reply.dataset.pending) {
              reply.dataset.pending = '1';
              const target = reply;
              requestAnimationFrame(() => {
                delete target.dataset.pending;
                this.setMessageText(target, 'assistant', target.dataset.raw ?? '');
                this.scrollMessages();
              });
            }
          },
          onToolStart: (name, args) => {
            lastToolArgs = args;
            activity.step(toolLabel(name, args));
            if (reply.isConnected) {
              // Text before a tool call is its own message; later text gets a fresh bubble.
              reply.classList.remove('streaming');
              reply = h('div', { class: 'msg assistant streaming' });
            }
            this.scrollMessages();
          },
          onToolProgress: (name, chars) => {
            const what = name === 'create_app' || name === 'write_app' ? 'Writing the tool' : name === 'edit_app' ? 'Writing changes' : name === 'deploy_function' ? 'Writing the function' : 'Preparing';
            activity.update(`${what}${chars > 1024 ? ` · ${(chars / 1024).toFixed(1)} KB` : '…'}`);
          },
          onPhase: (phase, detail) => {
            if (phase === 'connecting') activity.step('Connecting to ChatGPT');
            else if (phase === 'waiting') activity.step('Thinking');
            else if (phase === 'connected-buffered') activity.step('ChatGPT is working (this build shows the result when it is done)');
            else if (phase === 'tool_begin') activity.step(beginLabel(detail ?? ''));
          },
          onReasoning: (delta) => {
            activity.think(delta);
            this.scrollMessages();
          },
          onPaused: () => {
            activity.step('Paused while Forgr is in the background');
          },
          onCheckpoint: (input, answer) => {
            if (job.key !== conversation.key) {
              void appStore.clearJob(job.key);
              job.key = conversation.key;
            }
            void appStore.writeJob(job.key, { prompt: job.prompt, input, answer, savedAt: Date.now(), restricted: fromLink });
          },
          onRetry: () => {
            reply.remove();
            reply = h('div', { class: 'msg assistant streaming' });
            activity.step('Connection dropped, retrying');
          },
          onToolEnd: (name, ok, detail) => {
            toolsRan++;
            if (!ok || !['create_app', 'write_app', 'edit_app', 'update_app_info'].includes(name)) return;
            let id = String(lastToolArgs.id ?? '');
            if (name === 'create_app') id = /"id":"([^"]+)"/.exec(detail)?.[1] ?? id;
            if (!id) return;
            const kind = name === 'create_app' || changedApps.get(id) === 'created' ? 'created' : 'updated';
            changedApps.set(id, kind);
          },
        },
        controller.signal,
        saved?.input.length ? { input: saved.input, answer: saved.answer } : undefined,
      );
      void appStore.clearJob(job.key);
      ok = true;
      answerChars = answer.length;
      outcome = answer.trim() || toolsRan ? 'ok' : 'empty';
      if (outcome === 'empty') {
        // ChatGPT ended without text or any app change: say so instead of silently stopping.
        conversation.messages.push({ role: 'assistant', content: 'Error: ChatGPT finished without replying.' });
        this.messagesEl.insertBefore(h('div', { class: 'error-block' },
          h('p', {}, 'ChatGPT finished without replying. This was reported so we can fix it.'),
          h('button', { class: 'retry', onclick: () => { if (!this.running) void this.run(text, true, fromLink); } }, icon('undo'), 'Try again')), status);
        haptic(ImpactStyle.Medium);
        return;
      }
      conversation.messages.push({ role: 'assistant', content: answer || 'Done.' });
      if (!this.messagesEl.querySelector('.msg.assistant') && answer) {
        this.messagesEl.insertBefore(this.bubbleFor('assistant', answer), status);
      }
      // One card per app the run created or changed, to open it (or undo).
      for (const [appId, kind] of changedApps) {
        const app = appStore.get(appId);
        if (!app) continue;
        const card = { appId, version: app.version, kind };
        conversation.messages.push({ role: 'assistant', content: `${kind === 'created' ? 'Created' : 'Updated'} tool "${app.name}" (version ${app.version}).`, card });
        this.messagesEl.insertBefore(this.appCard(card), status);
      }
      haptic(ImpactStyle.Medium);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome = message === 'Stopped' ? 'stopped' : 'error';
      errorText = message.slice(0, 500);
      conversation.messages.push({ role: 'assistant', content: message === 'Stopped' ? 'Stopped.' : `Error: ${message}` });
      if (message === 'Stopped') {
        void appStore.clearJob(job.key);
        this.messagesEl.insertBefore(h('div', { class: 'msg assistant note' }, 'Stopped.'), status);
      } else {
        this.messagesEl.insertBefore(h('div', { class: 'error-block' },
          h('p', {}, friendlyError(message)),
          h('button', { class: 'retry', onclick: () => { if (!this.running) void this.run(text, true, fromLink); } }, icon('undo'), 'Try again')), status);
      }
    } finally {
      reply.classList.remove('streaming');
      activity.finish(ok);
      void reportRun({ outcome, error: errorText, answerChars, ms: Date.now() - runStartedAt, requests: takeRequestLog() });
      status.remove();
      this.running = null;
      this.sendBtn.replaceChildren(icon('send'));
      this.sendBtn.classList.remove('stop');
      this.sendBtn.setAttribute('aria-label', 'Send');
      await appStore.writeChat(conversation.key, conversation.messages);
      this.updateChrome();
      this.scrollMessages();
    }
  }

  // ---------------------------------------------------------------- modals

  /**
   * Modal sheets use Capgo Sheets: drag down (or tap outside) to dismiss,
   * safe areas and keyboard handled by the library.
   */
  private showModal(build: (close: () => void) => Array<Node | null>, variant: 'sheet' | 'action' = 'sheet'): void {
    this.modalLayer.replaceChildren();
    const sheet = document.createElement('cap-sheet') as CapSheet;
    sheet.setAttribute('content-placement', 'bottom');
    if (variant === 'action') {
      sheet.setAttribute('detached', '');
      sheet.setAttribute('bottom-inset', '0.5em');
    }
    const close = () => sheet.dismiss();
    const content = document.createElement('cap-sheet-content');
    content.className = `modal ${variant}`;
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    if (variant === 'sheet') content.append(document.createElement('cap-sheet-handle'));
    content.append(...build(close).filter((n): n is Node => n !== null));
    const view = document.createElement('cap-sheet-view');
    view.append(document.createElement('cap-sheet-backdrop'), content);
    const portal = document.createElement('cap-sheet-portal');
    portal.append(view);
    sheet.append(portal);
    sheet.addEventListener('cap-sheet-presented-change', (event) => {
      if ((event as CustomEvent<{ presented: boolean }>).detail.presented) return;
      // Let the dismiss animation finish before removing it.
      window.setTimeout(() => {
        if (this.modalLayer.contains(sheet)) {
          this.modalLayer.replaceChildren();
          this.modalLayer.classList.add('hidden');
        }
        portal.remove();
      }, 400);
    });
    this.modalLayer.append(sheet);
    this.modalLayer.classList.remove('hidden');
    requestAnimationFrame(() => sheet.present());
  }

  private showSignIn(): void {
    this.input.blur();
    this.showModal((close) => {
      const error = h('p', { class: 'error-text hidden' });
      const btn = h('button', { class: 'btn mono' }, 'Continue with ChatGPT');
      btn.addEventListener('click', async () => {
        btn.setAttribute('disabled', '');
        btn.textContent = 'Opening ChatGPT…';
        error.classList.add('hidden');
        try {
          await session.signIn();
          close();
          this.toast(`Signed in as ${session.credentials?.email ?? 'ChatGPT user'}`);
          if (this.pendingLink) {
            const link = this.pendingLink;
            this.pendingLink = null;
            void this.runLink(link);
          } else if (this.pendingPrompt) {
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
        h('div', { class: 'signin' },
          icon('logo', 'modal-logo'),
          h('h2', {}, 'Connect ChatGPT'),
          h('p', { class: 'secondary-text' }, `Forgr makes your tools with your own ChatGPT plan. If you are already signed in to ChatGPT in ${BROWSER}, it is one tap, and your saved passwords and passkeys work. No Forgr account.`),
          btn,
          error,
          h('button', { class: 'btn plain', onclick: close }, 'Not Now'),
          h('p', { class: 'footnote center' }, 'Made by Capgo. Not affiliated with OpenAI.')),
      ];
    });
  }

  private showSettings(): void {
    this.showModal((close) => {
      const version = h('p', { class: 'about-version' }, `Version ${__APP_VERSION__}`);
      const updateNote = h('p', { class: 'about-note' }, '');
      if (Capacitor.isNativePlatform()) {
        void CapacitorUpdater.current().then((c) => {
          // The built-in bundle reports the native version as its "version"; its id is what tells it apart.
          const builtin = c.bundle.id === 'builtin';
          version.textContent = builtin ? `Forgr ${c.native} · built-in code` : `Forgr ${c.native} · Live update ${c.bundle.version}`;
          updateNote.textContent = builtin ? 'No live update installed yet.' : `Code ${__APP_VERSION__} delivered by Capgo.`;
        }).catch(() => undefined);
      }
      const checkBtn = h('button', { class: 'about-check' }, 'Check for updates');
      checkBtn.addEventListener('click', () => void this.checkForUpdate(checkBtn));
      const open = (url: string) => {
        if (Capacitor.isNativePlatform()) void InAppBrowser.open({ url });
        else window.open(url, '_blank', 'noopener');
      };
      const email = session.credentials?.email;
      const link = (label: string, url: string) =>
        h('button', { class: 'row', onclick: () => open(url) }, h('span', { class: 'row-title' }, label), icon('external', 'icon row-icon'));
      return [
        h('header', { class: 'modal-nav' },
          h('span', {}),
          h('h2', {}, 'Settings'),
          h('button', { class: 'text-btn strong', onclick: close }, 'Done')),
        h('div', { class: 'group' },
          h('div', { class: 'row account' },
            h('div', { class: 'avatar big' }, email ? email[0].toUpperCase() : icon('person')),
            h('div', { class: 'row-body' },
              h('span', { class: 'row-title' }, email ?? 'Not connected'),
              h('span', { class: 'row-sub' }, email ? 'ChatGPT account' : 'Connect ChatGPT to make tools'))),
          email
            ? h('button', { class: 'row danger', onclick: async () => { await session.signOut(); await cloud.signOut(); close(); this.toast('Signed out'); } }, h('span', { class: 'row-title' }, 'Sign Out'))
            : h('button', { class: 'row accent', onclick: () => { close(); this.showSignIn(); } }, h('span', { class: 'row-title' }, 'Connect ChatGPT'))),
        h('div', { class: 'section-label' }, 'Secrets'),
        h('div', { class: 'group' },
          ...(listSecrets().length
            ? listSecrets().map((sec) => h('div', { class: 'row' },
              icon('lock', 'icon row-icon'),
              h('div', { class: 'row-body' }, h('span', { class: 'row-title' }, sec.label), h('span', { class: 'row-sub' }, sec.name + (sec.username ? ` · ${sec.username}` : ''))),
              h('button', { class: 'text-btn danger', 'aria-label': `Delete ${sec.name}`, onclick: async () => { await deleteSecret(sec.name); close(); this.toast(`Deleted ${sec.name}`); } }, 'Delete')))
            : [h('div', { class: 'row' }, h('span', { class: 'row-sub' }, 'No saved keys or passwords yet.'))])),
        h('p', { class: 'group-footer' }, `Stored in the ${SECURE_STORE}. The AI never sees them; your tools use them when they call their service.`),
        h('div', { class: 'section-label' }, 'Gestures'),
        h('div', { class: 'group' },
          h('button', { class: 'row', onclick: () => { close(); this.showOnboarding(); } }, h('span', { class: 'row-title' }, 'Show the Tour Again'), icon('chevron', 'icon row-icon'))),
        h('p', { class: 'group-footer' }, 'In any tool, pinch with three fingers to open the switcher: Home, Edit, or another tool. Spread three fingers to go back.'),
        h('div', { class: 'section-label' }, 'About'),
        h('div', { class: 'group' },
          link('Privacy Policy', APP_LINKS.privacy),
          link('Terms of Use', APP_LINKS.terms),
          link('Support', APP_LINKS.support)),
        h('div', { class: 'about' },
          icon('logo', 'about-icon'),
          version,
          h('p', { class: 'about-author' }, 'Made by ',
            h('a', { href: AUTHOR_URL, onclick: (e: Event) => { e.preventDefault(); openInSafari(AUTHOR_URL); } }, 'Martin Donadieu')),
          h('p', { class: 'about-note' }, 'Built with Capacitor and shipped with Capgo live updates.'),
          updateNote,
          h('button', { class: 'capgo-pill', onclick: () => openInSafari(CAPGO_URL) }, capgoLogo(), 'Made with Capgo'),
          checkBtn),
      ];
    });
  }

  private showOnboarding(): void {
    void showOnboarding(this.root).then((connect) => {
      localStorage.setItem(PREF_KEYS.onboarded, '1');
      if (connect && !session.signedIn) this.showSignIn();
    });
  }

  /** Asks Capgo for the channel's bundle now and installs it (delta when possible). */
  private async checkForUpdate(button: HTMLElement): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    button.setAttribute('disabled', '');
    button.textContent = 'Checking…';
    try {
      const [current, latest] = await Promise.all([CapacitorUpdater.current(), CapacitorUpdater.getLatest()]);
      const info = latest as typeof latest & { url?: string; manifest?: unknown[] };
      if (info.error || !info.url || !info.version || info.version === current.bundle.version) {
        this.toast(info.error && info.error !== 'no_new_version_available' ? `Capgo: ${info.error}` : `Up to date (${current.bundle.id === 'builtin' ? current.native : current.bundle.version})`);
        return;
      }
      button.textContent = `Downloading ${info.version}…`;
      const bundle = await CapacitorUpdater.download({
        url: info.url,
        version: info.version,
        checksum: info.checksum,
        sessionKey: info.sessionKey,
        ...(info.manifest ? { manifest: info.manifest as never } : {}),
      });
      await CapacitorUpdater.set({ id: bundle.id });
    } catch (error) {
      this.toast(error instanceof Error ? error.message : String(error));
    } finally {
      button.removeAttribute('disabled');
      button.textContent = 'Check for updates';
    }
  }

  private showUpdateReady(id: string, version: string): void {
    if (this.running) return;
    this.showModal((close) => [
      h('h2', {}, 'Update ready'),
      h('p', { class: 'muted' }, `Forgr ${version} is downloaded. Restart now to use it; your tools and chats stay.`),
      h('button', { class: 'btn mono', onclick: () => { close(); void CapacitorUpdater.set({ id }); } }, 'Restart now'),
      h('button', { class: 'btn plain', onclick: close }, 'Later'),
    ]);
  }

  private toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    window.setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }
}

function toolLabel(name: string, args: Record<string, unknown>): string {
  const appName = (id: unknown) => appStore.get(String(id))?.name ?? 'the tool';
  switch (name) {
    case 'create_app': return `Installing ${String(args.name ?? 'your tool')} and checking it runs`;
    case 'edit_app': return `Applying ${Array.isArray(args.edits) ? args.edits.length : ''} changes to ${appName(args.id)}`.replace('  ', ' ');
    case 'write_app': return `Replacing ${appName(args.id)} and checking it runs`;
    case 'read_app': return `Reading the code of ${appName(args.id)}`;
    case 'open_app': return `Opening ${appName(args.id)}`;
    case 'get_app_logs': return 'Checking the tool for errors';
    case 'update_app_info': return 'Updating the icon and name';
    case 'list_apps': return 'Looking at your tools';
    case 'read_skill': return `Reading Capgo skill: ${String(args.name ?? '')}`;
    case 'list_skills': return 'Checking Capgo skills';
    case 'list_cloud': return 'Looking at your cloud';
    case 'deploy_function': return `Deploying server function ${String(args.name ?? '')}`;
    case 'set_secret': return `Saving secret ${String(args.name ?? '')}`;
    case 'join_space': return 'Joining the shared space';
    default: return 'Working';
  }
}

function friendlyError(message: string): string {
  if (/network connection was lost|load failed|failed to fetch|offline/i.test(message)) return 'The connection dropped before the answer finished.';
  if (/usage limit/i.test(message)) return message;
  if (/sign in/i.test(message)) return 'Your ChatGPT session expired. Sign in again from Settings.';
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

/** Label while the model is writing a tool call, before it runs. */
function beginLabel(name: string): string {
  switch (name) {
    case 'create_app': return 'Writing the tool';
    case 'write_app': return 'Rewriting the tool';
    case 'edit_app': return 'Writing changes';
    case 'deploy_function': return 'Writing the server function';
    case 'read_app': return 'Reading the tool';
    case 'read_skill':
    case 'list_skills': return 'Checking Capgo skills';
    default: return 'Preparing the next step';
  }
}

const AUTHOR_URL = 'https://x.com/martindonadieu';
const CAPGO_URL = 'https://capgo.app/?utm_source=mapp&utm_medium=app&utm_campaign=settings';

function capgoLogo(): Element {
  const tpl = document.createElement('template');
  tpl.innerHTML = capgoSvg.trim(); // bundled static asset, not user content
  const logo = tpl.content.firstElementChild as SVGElement;
  logo.setAttribute('class', 'capgo-logo');
  logo.setAttribute('aria-hidden', 'true');
  return logo;
}

/**
 * Opens a link in Safari itself (not an in-app browser). In the iOS shell,
 * Capacitor hands window.open targets to UIApplication.open.
 */
function openInSafari(url: string): void {
  window.open(url, '_blank', 'noopener');
}
