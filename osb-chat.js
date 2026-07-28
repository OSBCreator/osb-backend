/* ═══════════════════════════════════════════════════════════════════════
   OSB LIVE CHAT — visitor widget
   Add to any page with ONE line, just before </body>:
       <script src="/osb-chat.js" defer></script>
   No other change needed. Styles are self-contained and scoped.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var API = "https://ufnityyhmfzahxkjmlgo.supabase.co/functions/v1/osb-api";
  var KEY_TOKEN = "osb_chat_token";
  var token = null, lastId = 0, poller = null, open = false, started = false;

  /* ── STYLES ────────────────────────────────────────────────────────── */
  var css = ''
  + '#osbc-btn{position:fixed;right:20px;bottom:20px;z-index:99998;display:flex;align-items:center;gap:.55rem;'
  + 'background:#C1121F;color:#fff;border:none;border-radius:40px;padding:.85rem 1.25rem;cursor:pointer;'
  + 'font-family:"Figtree",system-ui,sans-serif;font-size:.86rem;font-weight:600;box-shadow:0 8px 30px rgba(193,18,31,.4);'
  + 'transition:transform .18s,box-shadow .18s}'
  + '#osbc-btn:hover{transform:translateY(-2px);box-shadow:0 12px 38px rgba(193,18,31,.55)}'
  + '#osbc-btn svg{width:18px;height:18px}'
  + '#osbc-btn.hide{display:none}'
  + '#osbc-dot{position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background:#3DBB82;'
  + 'border:2px solid #07070E;display:none}'
  + '#osbc-dot.on{display:block}'
  + '#osbc-panel{position:fixed;right:20px;bottom:20px;z-index:99999;width:370px;max-width:calc(100vw - 32px);'
  + 'height:540px;max-height:calc(100vh - 40px);background:#0E0E18;border:1px solid rgba(255,255,255,.10);'
  + 'border-radius:16px;display:none;flex-direction:column;overflow:hidden;'
  + 'box-shadow:0 24px 70px rgba(0,0,0,.65);font-family:"Figtree",system-ui,sans-serif}'
  + '#osbc-panel.on{display:flex}'
  + '.osbc-hd{display:flex;align-items:center;gap:.7rem;padding:.95rem 1.1rem;background:#11111B;'
  + 'border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}'
  + '.osbc-hd img{height:28px;width:28px;border-radius:50%}'
  + '.osbc-hd .t{font-family:"Cormorant Garamond",Georgia,serif;font-size:1.05rem;font-weight:600;color:#ECECF2;line-height:1.1}'
  + '.osbc-hd .s{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.55rem;letter-spacing:1.5px;'
  + 'text-transform:uppercase;color:rgba(255,255,255,.42);margin-top:2px;display:flex;align-items:center;gap:.35rem}'
  + '.osbc-live{width:6px;height:6px;border-radius:50%;background:#3DBB82;box-shadow:0 0 8px #3DBB82}'
  + '.osbc-x{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:1.4rem;line-height:1;padding:0 .2rem}'
  + '.osbc-x:hover{color:#fff}'
  + '.osbc-body{flex:1;overflow-y:auto;padding:1.1rem;display:flex;flex-direction:column;gap:.7rem}'
  + '.osbc-msg{max-width:82%;padding:.65rem .85rem;border-radius:12px;font-size:.85rem;line-height:1.55;word-wrap:break-word}'
  + '.osbc-msg.them{align-self:flex-start;background:#16161F;color:rgba(255,255,255,.86);border:1px solid rgba(255,255,255,.07)}'
  + '.osbc-msg.me{align-self:flex-end;background:#C1121F;color:#fff}'
  + '.osbc-msg.sys{align-self:center;background:transparent;border:1px dashed rgba(255,255,255,.14);'
  + 'color:rgba(255,255,255,.45);font-size:.74rem;text-align:center;max-width:95%}'
  + '.osbc-who{font-family:"IBM Plex Mono",monospace;font-size:.52rem;letter-spacing:1px;text-transform:uppercase;'
  + 'color:#E85862;margin-bottom:.25rem}'
  + '.osbc-foot{border-top:1px solid rgba(255,255,255,.08);padding:.8rem;flex-shrink:0;background:#0E0E18}'
  + '.osbc-row{display:flex;gap:.5rem}'
  + '.osbc-in{flex:1;background:#16161F;border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:.65rem .8rem;'
  + 'color:#ECECF2;font-family:inherit;font-size:.85rem;outline:none;resize:none;max-height:90px;line-height:1.5}'
  + '.osbc-in:focus{border-color:rgba(193,18,31,.55)}'
  + '.osbc-in::placeholder{color:rgba(255,255,255,.25)}'
  + '.osbc-send{background:#C1121F;border:none;border-radius:10px;color:#fff;padding:0 .95rem;cursor:pointer;'
  + 'font-family:"IBM Plex Mono",monospace;font-size:.62rem;letter-spacing:1.5px;text-transform:uppercase}'
  + '.osbc-send:disabled{opacity:.45;cursor:not-allowed}'
  + '.osbc-note{font-family:"IBM Plex Mono",monospace;font-size:.55rem;letter-spacing:.4px;color:rgba(255,255,255,.28);'
  + 'margin-top:.55rem;line-height:1.6;text-align:center}'
  + '.osbc-note a{color:#E85862;text-decoration:none}'
  + '.osbc-intro{padding:1.4rem 1.2rem;text-align:center}'
  + '.osbc-intro h4{font-family:"Cormorant Garamond",Georgia,serif;font-size:1.3rem;font-weight:600;color:#ECECF2;margin:0 0 .5rem}'
  + '.osbc-intro p{font-size:.82rem;color:rgba(255,255,255,.55);line-height:1.7;margin:0 0 1rem}'
  + '.osbc-name{width:100%;background:#16161F;border:1px solid rgba(255,255,255,.10);border-radius:10px;'
  + 'padding:.7rem .85rem;color:#ECECF2;font-family:inherit;font-size:.85rem;outline:none;text-align:center;margin-bottom:.6rem}'
  + '.osbc-name:focus{border-color:rgba(193,18,31,.55)}'
  + '.osbc-begin{width:100%;background:#C1121F;border:none;border-radius:10px;color:#fff;padding:.75rem;cursor:pointer;'
  + 'font-family:"IBM Plex Mono",monospace;font-size:.66rem;letter-spacing:1.5px;text-transform:uppercase;font-weight:600}'
  + '@media(max-width:480px){#osbc-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100vh - 16px)}'
  + '#osbc-btn{right:14px;bottom:14px}}'
  + '@media(prefers-reduced-motion:reduce){#osbc-btn{transition:none}}';

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ── MARKUP ────────────────────────────────────────────────────────── */
  var btn = document.createElement("button");
  btn.id = "osbc-btn";
  btn.setAttribute("aria-label", "Chat with OSB");
  btn.innerHTML = '<span id="osbc-dot"></span>'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
    + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    + '<span>Talk to someone</span>';

  var panel = document.createElement("div");
  panel.id = "osbc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "OSB live chat");
  panel.innerHTML = ''
    + '<div class="osbc-hd">'
    +   '<img src="/osb-emblem.png" alt="">'
    +   '<div><div class="t">OSB Support</div><div class="s"><span class="osbc-live"></span><span id="osbc-status">Available now</span></div></div>'
    +   '<button class="osbc-x" id="osbc-close" aria-label="Close chat">&times;</button>'
    + '</div>'
    + '<div class="osbc-body" id="osbc-body">'
    +   '<div class="osbc-intro" id="osbc-intro">'
    +     '<h4>You\'re in the right place.</h4>'
    +     '<p>Tell us as much or as little as you want. Nothing you say here is judged, and you do not have to give your real name.</p>'
    +     '<input class="osbc-name" id="osbc-nameinp" placeholder="First name or nickname (optional)" maxlength="40">'
    +     '<button class="osbc-begin" id="osbc-begin">Start the conversation</button>'
    +   '</div>'
    + '</div>'
    + '<div class="osbc-foot" id="osbc-foot" style="display:none">'
    +   '<div class="osbc-row">'
    +     '<textarea class="osbc-in" id="osbc-inp" rows="1" placeholder="Type your message…" maxlength="2000"></textarea>'
    +     '<button class="osbc-send" id="osbc-sendbtn">Send</button>'
    +   '</div>'
    +   '<div class="osbc-note">OSB is not an emergency service. If you are in danger or crisis, contact your local emergency number. <a href="/solace.html">Solace support →</a></div>'
    + '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var body = document.getElementById("osbc-body");
  var foot = document.getElementById("osbc-foot");
  var intro = document.getElementById("osbc-intro");
  var inp = document.getElementById("osbc-inp");
  var statusEl = document.getElementById("osbc-status");

  /* ── HELPERS ───────────────────────────────────────────────────────── */
  function esc(s) {
    return (s == null ? "" : "" + s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function scrollDown() { body.scrollTop = body.scrollHeight; }
  function addMsg(m) {
    var d = document.createElement("div");
    if (m.sender === "system") { d.className = "osbc-msg sys"; d.innerHTML = esc(m.body); }
    else if (m.sender === "operator") {
      d.className = "osbc-msg them";
      d.innerHTML = '<div class="osbc-who">' + esc(m.operator || "OSB") + '</div>' + esc(m.body);
    } else { d.className = "osbc-msg me"; d.innerHTML = esc(m.body); }
    body.appendChild(d); scrollDown();
  }
  function post(path, payload) {
    return fetch(API + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  /* ── FLOW ──────────────────────────────────────────────────────────── */
  function openPanel() {
    open = true; panel.classList.add("on"); btn.classList.add("hide");
    document.getElementById("osbc-dot").classList.remove("on");
    if (started) { scrollDown(); inp && inp.focus(); }
  }
  function closePanel() { open = false; panel.classList.remove("on"); btn.classList.remove("hide"); }

  btn.addEventListener("click", openPanel);
  document.getElementById("osbc-close").addEventListener("click", closePanel);

  document.getElementById("osbc-begin").addEventListener("click", function () {
    var name = (document.getElementById("osbc-nameinp").value || "").trim();
    try { token = localStorage.getItem(KEY_TOKEN); } catch (e) { token = null; }
    post("/api/chat/start", { token: token, name: name, page: location.pathname })
      .then(function (r) {
        if (!r || !r.ok) { intro.innerHTML = '<p>We could not open the chat just now. Please try again, or use the <a href="/contact.html" style="color:#E85862">contact form</a>.</p>'; return; }
        token = r.token;
        try { localStorage.setItem(KEY_TOKEN, token); } catch (e) {}
        started = true;
        intro.remove();
        foot.style.display = "block";
        inp.focus();
        startPolling();
      });
  });

  function send() {
    var v = (inp.value || "").trim();
    if (!v || !token) return;
    inp.value = "";
    addMsg({ sender: "visitor", body: v });
    post("/api/chat/send", { token: token, body: v });
  }
  document.getElementById("osbc-sendbtn").addEventListener("click", send);
  inp.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  inp.addEventListener("input", function () {
    inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 90) + "px";
  });

  function poll() {
    if (!token) return;
    fetch(API + "/api/chat/poll?token=" + encodeURIComponent(token) + "&since=" + lastId)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        statusEl.textContent = d.status === "active" ? ("Connected" + (d.operator ? " · " + d.operator : "")) : "Waiting for the team…";
        (d.messages || []).forEach(function (m) {
          if (m.id > lastId) lastId = m.id;
          if (m.sender === "visitor") return; // already shown locally
          addMsg(m);
          if (!open && m.sender === "operator") document.getElementById("osbc-dot").classList.add("on");
        });
        if (d.status === "closed") { clearInterval(poller); poller = null; }
      })
      .catch(function () {});
  }
  function startPolling() { poll(); if (poller) clearInterval(poller); poller = setInterval(poll, 4000); }

  /* Resume an existing conversation on page load, silently. */
  try {
    var saved = localStorage.getItem(KEY_TOKEN);
    if (saved) {
      fetch(API + "/api/chat/poll?token=" + encodeURIComponent(saved) + "&since=0")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok || d.status === "closed") return;
          token = saved; started = true;
          intro && intro.remove();
          foot.style.display = "block";
          (d.messages || []).forEach(function (m) { if (m.id > lastId) lastId = m.id; addMsg(m); });
          startPolling();
          if ((d.messages || []).some(function (m) { return m.sender === "operator"; })) {
            document.getElementById("osbc-dot").classList.add("on");
          }
        })
        .catch(function () {});
    }
  } catch (e) {}
})();
