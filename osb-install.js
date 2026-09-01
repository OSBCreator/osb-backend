/* ═══════════════════════════════════════════════════════════════════════
   OSB — Install App widget
   Add to any page with ONE line, just before </body>:
       <script src="/osb-install.js" defer></script>
   Registers the service worker, then shows a small "Install app" button
   when the browser confirms the app is actually installable. On iOS
   (which has no install prompt API) it shows manual Add-to-Home-Screen
   instructions instead, since Safari never fires the install event.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var DISMISS_KEY = "osb_install_dismissed";
  var deferredPrompt = null;

  /* ── SERVICE WORKER REGISTRATION ──────────────────────────────────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/service-worker.js").catch(function (err) {
        console.warn("OSB: service worker registration failed", err);
      });
    });
  }

  /* Already running as an installed app? Don't show the prompt at all. */
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true; // iOS's own flag
  if (isStandalone) return;

  var dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) {}
  if (dismissed) return;

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  /* ── STYLES (scoped, self-contained) ──────────────────────────────── */
  var css = ''
    + '#osbi-bar{position:fixed;left:16px;bottom:16px;z-index:99997;'
    + 'width:min(360px, calc(100vw - 32px));background:#0E0E18;border:1px solid rgba(255,255,255,.10);'
    + 'border-radius:14px;padding:.9rem 1rem;display:none;align-items:center;gap:.7rem;'
    + 'box-shadow:0 16px 50px rgba(0,0,0,.5);font-family:"Figtree",system-ui,sans-serif}'
    + '#osbi-bar.on{display:flex}'
    + '#osbi-bar img{width:34px;height:34px;border-radius:8px;flex-shrink:0}'
    + '#osbi-txt{flex:1;min-width:0}'
    + '#osbi-title{font-size:.8rem;font-weight:600;color:#ECECF2;line-height:1.3}'
    + '#osbi-sub{font-size:.68rem;color:rgba(255,255,255,.45);margin-top:1px;overflow:hidden;'
    + 'text-overflow:ellipsis;white-space:nowrap}'
    + '#osbi-actions{display:flex;gap:.4rem;flex-shrink:0}'
    + '#osbi-install{background:#C1121F;color:#fff;border:none;border-radius:8px;padding:.5rem .8rem;'
    + 'font-family:"IBM Plex Mono",monospace;font-size:.6rem;letter-spacing:1px;text-transform:uppercase;'
    + 'cursor:pointer;font-weight:600;white-space:nowrap}'
    + '#osbi-close{background:none;border:none;color:rgba(255,255,255,.35);cursor:pointer;'
    + 'font-size:1.2rem;line-height:1;padding:.2rem .35rem}'
    + '#osbi-close:hover{color:#fff}'
    + '@media(max-width:480px){#osbi-sub{display:none}}';
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ── MARKUP ────────────────────────────────────────────────────────── */
  var bar = document.createElement("div");
  bar.id = "osbi-bar";
  bar.innerHTML = ''
    + '<img src="/icons/icon-96.png" alt="OSB">'
    + '<div id="osbi-txt">'
    +   '<div id="osbi-title">Install OSB</div>'
    +   '<div id="osbi-sub">Quick access, works offline, no app store needed.</div>'
    + '</div>'
    + '<div id="osbi-actions">'
    +   '<button id="osbi-install">' + (isIOS ? "How" : "Install") + '</button>'
    +   '<button id="osbi-close" aria-label="Dismiss">&times;</button>'
    + '</div>';
  document.body.appendChild(bar);

  // If the chat widget is also on this page, its button sits bottom-right.
  // On narrow screens our bottom-left bar would otherwise overlap it —
  // stack ours higher so both are usable at once instead of colliding.
  if (document.getElementById("osbc-btn")) {
    bar.style.bottom = "84px";
  }

  function showBar() { bar.classList.add("on"); }
  function hideBar() { bar.classList.remove("on"); }
  function dismissForNow() {
    hideBar();
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
  }

  document.getElementById("osbi-close").addEventListener("click", dismissForNow);

  /* ── ANDROID / DESKTOP CHROME & EDGE: native install prompt ──────────
     The browser fires this event only when it has decided the site meets
     its own installability criteria (manifest + service worker + https).
     We stash the event and trigger it ourselves from our own button,
     since the spontaneous mini-infobar is easy to miss. */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showBar();
  });

  window.addEventListener("appinstalled", function () {
    hideBar();
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
  });

  /* ── iOS: no install-prompt API exists, so show instructions instead ──
     Safari never fires beforeinstallprompt. Detect iOS directly and show
     the bar after a short delay so it doesn't compete with page load. */
  if (isIOS) {
    setTimeout(showBar, 2500);
  }

  document.getElementById("osbi-install").addEventListener("click", function () {
    if (isIOS) {
      showIOSInstructions();
      return;
    }
    if (!deferredPrompt) { hideBar(); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(function () {
      deferredPrompt = null;
      hideBar();
    });
  });

  function showIOSInstructions() {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);"
      + "display:flex;align-items:flex-end;justify-content:center";
    overlay.innerHTML = ''
      + '<div style="background:#0E0E18;border-radius:16px 16px 0 0;padding:1.5rem 1.5rem 2rem;'
      +   'max-width:440px;width:100%;font-family:Figtree,system-ui,sans-serif;color:#ECECF2">'
      +   '<div style="font-family:Cormorant Garamond,Georgia,serif;font-size:1.3rem;font-weight:600;'
      +     'margin-bottom:1rem">Add OSB to your Home Screen</div>'
      +   '<div style="font-size:.85rem;line-height:2;color:rgba(255,255,255,.7)">'
      +     '1. Tap the <strong>Share</strong> button in Safari (the square with an arrow)<br>'
      +     '2. Scroll down and tap <strong>Add to Home Screen</strong><br>'
      +     '3. Tap <strong>Add</strong> — OSB will appear as an app icon'
      +   '</div>'
      +   '<button id="osbi-ios-close" style="margin-top:1.5rem;width:100%;background:#C1121F;color:#fff;'
      +     'border:none;border-radius:10px;padding:.85rem;font-family:IBM Plex Mono,monospace;'
      +     'font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer">Got it</button>'
      + '</div>';
    document.body.appendChild(overlay);
    document.getElementById("osbi-ios-close").addEventListener("click", function () {
      overlay.remove();
      dismissForNow();
    });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
  }
})();
