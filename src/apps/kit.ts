/**
 * Mapp design kit: a tiny native-feeling stylesheet injected into every mini app
 * before its own code, plus the reference the AI reads when building apps.
 * Safe areas come from the host as --safe-* px variables (env() does not work
 * inside the sandboxed iframe).
 */
export const KIT_VERSION = 1;

export const KIT_CSS = `
:root{color-scheme:light dark;
--m-bg:#f2f2f7;--m-surface:#fff;--m-surface-2:#e5e5ea;--m-fill:rgba(118,118,128,.12);
--m-label:#000;--m-secondary:rgba(60,60,67,.6);--m-tertiary:rgba(60,60,67,.3);--m-separator:rgba(60,60,67,.29);
--m-material:rgba(249,249,249,.8);--m-accent:var(--app-accent,#007aff);--m-accent-text:var(--m-accent);--m-tint:color-mix(in srgb,var(--m-accent) 14%,var(--m-surface));--m-on-accent:#fff;--m-danger:#ff3b30;--m-success:#34c759;
--m-radius:12px;--m-1:4px;--m-2:8px;--m-3:12px;--m-4:16px;--m-5:20px;--m-6:24px;--m-8:32px;
--m-font:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{
--m-bg:#000;--m-surface:#1c1c1e;--m-surface-2:#2c2c2e;--m-fill:rgba(118,118,128,.24);
--m-label:#fff;--m-secondary:rgba(235,235,245,.6);--m-tertiary:rgba(235,235,245,.3);--m-separator:rgba(84,84,88,.6);
--m-material:rgba(22,22,24,.8);--m-danger:#ff453a;--m-accent-text:color-mix(in srgb,var(--m-accent) 72%,#fff);--m-tint:color-mix(in srgb,var(--m-accent) 26%,var(--m-surface));--m-success:#30d158}}
*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
body{margin:0;min-height:100vh;font:17px/1.35 var(--m-font);letter-spacing:-.01em;background:var(--m-bg);color:var(--m-label);
-webkit-font-smoothing:antialiased;overscroll-behavior:none;
padding:var(--safe-top,0) var(--safe-right,0) var(--safe-bottom,0) var(--safe-left,0)}
body.m-app{padding-top:0;padding-bottom:calc(var(--safe-bottom,0px) + 24px)}
body.m-app:has(.m-tabbar,.m-bottom){padding-bottom:calc(var(--safe-bottom,0px) + 96px)}
h1,h2,h3,p{margin:0}h1{font-size:28px;font-weight:700}h2{font-size:22px;font-weight:700}h3{font-size:17px;font-weight:600}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;touch-action:manipulation}
input,textarea,select{font:inherit;font-size:17px;color:inherit}
img,svg,canvas{max-width:100%}
.m-secondary{color:var(--m-secondary)}.m-footnote{font-size:13px;color:var(--m-secondary)}
.m-nav{position:sticky;top:0;z-index:10;padding:var(--safe-top,0) var(--m-4) var(--m-2);
background:color-mix(in srgb,var(--m-bg) 86%,transparent);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px)}
.m-nav-bar{display:flex;align-items:center;justify-content:space-between;gap:var(--m-2);min-height:44px}
.m-nav-btn{min-height:44px;color:var(--m-accent-text);font-size:17px}
.m-nav-btn.strong{font-weight:600}
.m-title{font-size:34px;line-height:41px;font-weight:700;letter-spacing:-.02em;padding-top:var(--m-1)}
.m-nav-sub{font-size:15px;color:var(--m-secondary)}
.m-page{padding:var(--m-2) var(--m-4) var(--m-4)}
.m-section-title{font-size:13px;text-transform:uppercase;letter-spacing:0;color:var(--m-secondary);margin:var(--m-6) var(--m-4) var(--m-2)}
.m-list{background:var(--m-surface);border-radius:var(--m-radius);overflow:hidden;margin:0 0 var(--m-4)}
.m-row{position:relative;display:flex;align-items:center;gap:var(--m-3);min-height:44px;padding:var(--m-3) var(--m-4);width:100%;
text-align:left;color:var(--m-label);text-decoration:none;background:var(--m-surface)}
.m-row+.m-row::before{content:"";position:absolute;top:0;left:var(--m-4);right:0;border-top:.5px solid var(--m-separator)}
button.m-row:active,a.m-row:active{background:var(--m-surface-2)}
.m-row-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.m-row>.m-row-title{flex:1;min-width:0}
.m-row-title{overflow:hidden;text-overflow:ellipsis}
.m-row-sub{font-size:15px;color:var(--m-secondary)}
.m-row-end{margin-left:auto;color:var(--m-secondary);display:flex;align-items:center;gap:var(--m-2);flex:none}
.m-row.chevron::after{content:"";flex:none;width:8px;height:8px;margin-left:var(--m-1);border:solid var(--m-tertiary);border-width:2px 2px 0 0;transform:rotate(45deg)}
.m-card{background:var(--m-surface);border-radius:var(--m-radius);padding:var(--m-4);margin:0 0 var(--m-4)}
.m-button{display:inline-flex;align-items:center;justify-content:center;gap:var(--m-2);min-height:50px;padding:0 var(--m-5);
border-radius:var(--m-radius);background:var(--m-accent);color:var(--m-on-accent);font-size:17px;font-weight:600;transition:opacity .15s}
.m-button.wide{display:flex;width:100%}
.m-button.secondary{background:var(--m-tint);color:var(--m-accent-text)}
.m-button.plain{background:none;color:var(--m-accent-text);min-height:44px;padding:0 var(--m-2)}
.m-button.danger{background:color-mix(in srgb,var(--m-danger) 15%,transparent);color:var(--m-danger)}
.m-button:active,.m-chip:active,.m-nav-btn:active{opacity:.6}
.m-button:disabled{opacity:.35}
.m-input,.m-textarea,.m-select{display:block;width:100%;min-height:44px;padding:11px var(--m-4);border:0;border-radius:var(--m-radius);
background:var(--m-surface);color:var(--m-label);outline:none;-webkit-appearance:none;appearance:none}
.m-list .m-input,.m-card .m-input,.m-bottom .m-input,.m-sheet .m-input{background:var(--m-fill)}
.m-textarea{min-height:96px;resize:vertical;line-height:1.35}
.m-input:focus,.m-textarea:focus,.m-select:focus{box-shadow:0 0 0 2px color-mix(in srgb,var(--m-accent) 55%,transparent)}
::placeholder{color:var(--m-tertiary)}
.m-segmented{display:flex;padding:2px;border-radius:9px;background:var(--m-fill);gap:2px}
.m-segmented>*{flex:1;min-height:32px;border-radius:7px;font-size:13px;font-weight:500;color:var(--m-label)}
.m-segmented>.on,.m-segmented>[aria-pressed="true"]{background:var(--m-surface);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.12)}
@media (prefers-color-scheme:dark){.m-segmented>.on,.m-segmented>[aria-pressed="true"]{background:#636366}}
.m-toggle{-webkit-appearance:none;appearance:none;flex:none;position:relative;width:51px;height:31px;margin:0;border-radius:16px;
background:var(--m-fill);transition:background .2s;cursor:pointer}
.m-toggle::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;
box-shadow:0 2px 6px rgba(0,0,0,.2);transition:transform .2s}
.m-toggle:checked{background:var(--m-success)}.m-toggle:checked::after{transform:translateX(20px)}
.m-chip{display:inline-flex;align-items:center;gap:var(--m-1);min-height:32px;padding:0 var(--m-3);border-radius:16px;
background:var(--m-fill);font-size:15px;color:var(--m-label)}
.m-chip.on{background:var(--m-tint);color:var(--m-accent-text);font-weight:600}
.m-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;
background:var(--m-accent);color:var(--m-on-accent);font-size:13px;font-weight:600}
.m-stat{display:flex;flex-direction:column;gap:2px}
.m-stat-value{font-size:34px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.m-stat-label{font-size:13px;color:var(--m-secondary)}
.m-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--m-2);padding:var(--m-8) var(--m-6);color:var(--m-secondary)}
.m-empty h2,.m-empty h3{color:var(--m-label)}
.m-empty .m-button{margin-top:var(--m-3)}
.m-bottom,.m-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:20;
padding:var(--m-2) calc(var(--safe-right,0px) + var(--m-4)) calc(var(--safe-bottom,0px) + var(--m-2)) calc(var(--safe-left,0px) + var(--m-4));
background:var(--m-material);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);
border-top:.5px solid var(--m-separator)}
.m-bottom{display:flex;gap:var(--m-2);align-items:center}
.m-bottom .m-input{flex:1}.m-bottom .m-button{min-height:44px}
.m-tabbar{display:flex;padding-top:var(--m-1);padding-left:var(--safe-left,0px);padding-right:var(--safe-right,0px)}
.m-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:48px;justify-content:center;font-size:10px;font-weight:500;color:var(--m-secondary)}
.m-tab>:first-child{font-size:22px;line-height:1;width:24px;height:24px}
.m-tab.on{color:var(--m-accent-text)}
.m-fab{position:fixed;z-index:20;right:calc(var(--safe-right,0px) + var(--m-5));bottom:calc(var(--safe-bottom,0px) + var(--m-5));
width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:var(--m-accent);color:var(--m-on-accent);
font-size:28px;box-shadow:0 4px 14px rgba(0,0,0,.18)}
body:has(.m-tabbar) .m-fab{bottom:calc(var(--safe-bottom,0px) + 76px)}
.m-sheet{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.4);
opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s}
.m-sheet.open{opacity:1;visibility:visible}
.m-sheet-panel{max-height:calc(100% - var(--safe-top,0px) - 12px);overflow-y:auto;background:var(--m-bg);border-radius:14px 14px 0 0;
padding:var(--m-2) calc(var(--safe-right,0px) + var(--m-4)) calc(var(--safe-bottom,0px) + var(--m-4)) calc(var(--safe-left,0px) + var(--m-4));
transform:translateY(100%);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.m-sheet-panel::before{content:"";display:block;width:36px;height:5px;border-radius:3px;background:var(--m-tertiary);margin:0 auto var(--m-3)}
.m-sheet.open .m-sheet-panel{transform:none}
.m-toast{position:fixed;z-index:60;left:50%;top:calc(var(--safe-top,0px) + var(--m-3));transform:translate(-50%,-150%);
max-width:calc(100% - 32px);padding:var(--m-3) var(--m-5);border-radius:24px;background:var(--m-surface-2);color:var(--m-label);
font-size:15px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.16);opacity:0;transition:transform .3s,opacity .3s}
.m-toast.show{transform:translate(-50%,0);opacity:1}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`.replace(/\n/g, '');

export const KIT_DOC = `## Mapp design kit (already loaded, do not redefine it)
Every app gets KIT_CSS before its code. Build with these classes and tokens so apps feel native in light and dark.
Tokens: --m-bg --m-surface --m-surface-2 --m-fill --m-label --m-secondary --m-tertiary --m-separator --m-accent (= icon color) --m-accent-text (accent for text) --m-tint (tinted fill) --m-on-accent --m-danger --m-success --m-radius; spacing --m-1..--m-8 (4 8 12 16 20 24 32px).
Safe areas are automatic: body is padded by the insets. With a .m-nav large title, put class="m-app" on body (the nav pads the top, body keeps the bottom inset). .m-bottom, .m-tabbar, .m-fab, .m-sheet and .m-toast pad themselves. Never hardcode 44px/34px status bar offsets; use var(--safe-top) / var(--safe-bottom) for any custom fixed element.
Skeleton:
<body class="m-app">
<header class="m-nav"><div class="m-nav-bar"><span></span><button class="m-nav-btn">Edit</button></div><h1 class="m-title">Groceries</h1></header>
<main class="m-page">
 <div class="m-section-title">To buy</div>
 <div class="m-list"><button class="m-row chevron"><div class="m-row-body"><div class="m-row-title">Milk</div><div class="m-row-sub">Dairy</div></div><span class="m-row-end">2</span></button></div>
 <div class="m-empty"><h3>No items</h3><p>Add what you need below.</p></div>
</main>
<form class="m-bottom"><input class="m-input" placeholder="Add item"><button class="m-button">Add</button></form>
</body>
Components: .m-nav (.m-nav-bar, .m-nav-btn[.strong], .m-title, .m-nav-sub) · .m-page · .m-section-title · .m-list > .m-row (.m-row-title | .m-row-body > .m-row-title + .m-row-sub, .m-row-end; add .chevron for drill-in) · .m-card · .m-button (filled) .secondary .plain .danger .wide · .m-input .m-textarea .m-select · .m-segmented > button.on · input[type=checkbox].m-toggle · .m-chip(.on) · .m-badge · .m-stat > .m-stat-value + .m-stat-label · .m-empty · .m-bottom · .m-tabbar > button.m-tab(.on) > icon + label · .m-fab · .m-sheet.open > .m-sheet-panel (toggle .open, close on backdrop tap) · .m-toast.show · .m-secondary .m-footnote.
Design rules:
- Neutral backgrounds plus ONE accent (--m-accent). No gradients, glows, neon, glassy blobs or colored shadows unless the user asks.
- Large title nav, content in inset grouped lists and cards, system font, 17px body, 13px footnotes. Spacing on the 4/8/12/16/20 grid.
- At most one filled .m-button per screen; other actions are .secondary or .plain.
- Emoji only when they are content (a mood, a category the user picked), never as decoration in titles or buttons.
- Real empty states that say what to do next. No fake sample data unless the user asks for it.
- Tap targets at least 44px. Inputs stay 16px+ so iOS does not zoom.
- Never add a "Home" or "Back to Mapp" button: the three-finger pinch handles that.
- App-specific CSS is fine for layouts the kit lacks; use the tokens instead of hex colors so dark mode keeps working.`;
