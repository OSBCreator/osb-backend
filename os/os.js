/* OSB OS — one script for every page.
   Every feature starts only if its markup is on the page, runs inside its own
   try/catch, and never writes remote text as HTML. If a backend is down the
   page still reads and works; only the live part shows a calm message. */
(function () {
  'use strict';

  var D = window.OSB || {};
  var API = 'https://ufnityyhmfzahxkjmlgo.supabase.co/functions/v1/osb-api';
  var NEWS = 'https://ufnityyhmfzahxkjmlgo.supabase.co/functions/v1/osb-news';
  var KEYS = ['R', 'S', 'E', 'I'];

  document.documentElement.classList.add('js');

  /* ── helpers ── */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function safe(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.warn('OSB: ' + name + ' stopped safely', e); }
  }
  function getStore(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function setStore(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function isHttp(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }

  /* fetch with a timeout; resolves {ok, status, data} and never rejects */
  function request(url, opts, ms) {
    opts = opts || {};
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    if (ctrl) opts.signal = ctrl.signal;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 10000);
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return null; }).then(function (d) {
        return { ok: r.ok, status: r.status, data: d };
      });
    }).catch(function (e) {
      clearTimeout(timer);
      return { ok: false, status: 0, data: null, aborted: !!(e && e.name === 'AbortError') };
    });
  }
  function postJSON(path, body, ms) {
    return request(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    }, ms);
  }
  function toast(msg) {
    var t = $('.toast') || document.body.appendChild(el('div', 'toast'));
    t.setAttribute('role', 'status');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 4200);
  }
  function tierOf(t) {
    if (t >= 17) return { key: 'crit', label: 'CRITICAL' };
    if (t >= 12) return { key: 'high', label: 'HIGH' };
    return { key: 'low', label: 'LOW' };
  }

  /* ── signal panel (shared by engine, story, board) ── */
  var Signal = {
    show: function (vals, o) {
      var p = $('#signal');
      if (!p) return;
      o = o || {};
      var src = $('#sig-source', p), title = $('#sig-title', p);
      if (src) src.textContent = o.source || '';
      if (title) title.textContent = o.title || '';
      var text = $('#sig-text', p), box = $('#sig-vals', p);
      if (!vals) {
        if (box) box.hidden = true;
        if (text) { text.hidden = false; text.textContent = o.text || ''; }
        return;
      }
      if (text) text.hidden = true;
      if (box) box.hidden = false;
      var total = 0;
      KEYS.forEach(function (k, i) {
        var v = vals[i];
        var row = $('.sig-row[data-k="' + k + '"]', p);
        if (!row) return;
        $$('.segs i', row).forEach(function (seg, n) { seg.classList.toggle('on', v !== null && n < v); });
        var vEl = $('.v', row);
        if (vEl) vEl.textContent = (v === null || v === undefined) ? '–' : String(v);
        total += v || 0;
      });
      var tier = tierOf(total);
      var num = $('#sig-total', p); if (num) num.textContent = String(total);
      var lab = $('#sig-total-label', p); if (lab) lab.textContent = o.complete ? 'RSEI TOTAL' : 'SO FAR';
      var tierEl = $('#sig-tier', p);
      if (tierEl) {
        tierEl.className = 'tier' + (o.complete ? ' tier-' + tier.key : '');
        tierEl.textContent = o.complete ? tier.label : '…';
      }
      var mark = $('#sig-mark', p);
      if (mark) mark.style.left = (Math.max(0, Math.min(16, total - 4)) / 16 * 100) + '%';
      var list = $('#sig-alerts', p);
      if (list) {
        list.textContent = '';
        (o.extraAlerts || []).forEach(function (a) { list.appendChild(el('li', a.cls || '', a.text)); });
        if ((vals[2] || 0) >= 4) list.appendChild(el('li', 'a-E', 'E at 4 or above: support referral, whatever the total.'));
        if (o.complete && total >= 17) list.appendChild(el('li', 'a-crit', 'Critical. Stop all transfers and call your bank.'));
        else if (o.complete && total >= 12) list.appendChild(el('li', 'a-high', 'High. Send nothing. Screenshot everything.'));
      }
    }
  };

  /* ── command palette ── */
  safe('palette', function () {
    var btn = $('#search-btn');
    var index = D.index || [];
    if (!btn) return;
    var box = null, input = null, list = null, items = [], sel = 0, lastFocus = null;

    function build() {
      box = el('div', 'palette');
      box.hidden = true;
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Search OSB');
      var inner = el('div', 'pal-box');
      var row = el('div', 'pal-in');
      var lab = el('label', 'sr-only', 'Search cases, publications, dispatches and areas');
      lab.setAttribute('for', 'pal-q');
      input = el('input');
      input.id = 'pal-q';
      input.type = 'search';
      input.setAttribute('autocomplete', 'off');
      input.placeholder = 'Search cases, publications, dispatches…';
      var esc = el('button', 'kbd', 'ESC');
      esc.type = 'button';
      esc.setAttribute('aria-label', 'Close search');
      esc.addEventListener('click', close);
      row.appendChild(lab); row.appendChild(input); row.appendChild(esc);
      list = el('ul', 'pal-list');
      list.setAttribute('role', 'listbox');
      list.id = 'pal-list';
      input.setAttribute('aria-controls', 'pal-list');
      var foot = el('div', 'pal-foot', '⌘K OR / TO OPEN · ↑↓ TO MOVE · ENTER TO OPEN · ESC TO CLOSE');
      inner.appendChild(row); inner.appendChild(list); inner.appendChild(foot);
      box.appendChild(inner);
      document.body.appendChild(box);
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      input.addEventListener('input', render);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) location.href = items[sel].p; }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
    }
    function render() {
      var q = (input.value || '').toLowerCase().trim();
      var words = q ? q.split(/\s+/) : [];
      items = index.filter(function (it) {
        if (!words.length) return it.top;
        var hay = (it.t + ' ' + it.k + ' ' + it.p + ' ' + (it.x || '')).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) >= 0; });
      }).slice(0, 14);
      sel = 0;
      list.textContent = '';
      if (!items.length) { list.appendChild(el('li', 'pal-empty', 'Nothing matches. Try a case number, a pillar or a title.')); return; }
      items.forEach(function (it, i) {
        var li = el('li');
        var a = el('a');
        a.href = it.p;
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        a.appendChild(el('span', 'pal-kind', it.k));
        var t = el('span', '', it.t);
        t.appendChild(el('span', 'pal-path', it.p));
        a.appendChild(t);
        li.appendChild(a);
        list.appendChild(li);
      });
    }
    function move(d) {
      if (!items.length) return;
      sel = (sel + d + items.length) % items.length;
      $$('a', list).forEach(function (a, i) {
        a.setAttribute('aria-selected', i === sel ? 'true' : 'false');
        if (i === sel && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
      });
    }
    function open() {
      if (!box) build();
      lastFocus = document.activeElement;
      box.hidden = false;
      input.value = '';
      render();
      input.focus();
    }
    function close() {
      if (!box) return;
      box.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    btn.addEventListener('click', open);
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
      else if (e.key === '/' && !typing && (!box || box.hidden)) { e.preventDefault(); open(); }
      else if (e.key === 'Escape' && box && !box.hidden) { close(); }
    });
  });

  /* ── rail: keep the current area visible on phones ── */
  safe('rail', function () {
    var cur = $('.rail-list a[aria-current]');
    if (cur && window.matchMedia && window.matchMedia('(max-width:760px)').matches && cur.scrollIntoView) {
      cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  });

  /* ── cookie notice ── */
  safe('cookies', function () {
    var bar = $('#cookie');
    if (!bar) return;
    function measure() { document.body.style.setProperty('--cookie-h', bar.offsetHeight + 'px'); }
    if (!getStore('osb-cookie-consent')) {
      bar.hidden = false;
      document.body.classList.add('has-cookie');
      measure();
      window.addEventListener('resize', measure);
    }
    $$('[data-cookie]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        setStore('osb-cookie-consent', b.getAttribute('data-cookie'));
        bar.hidden = true;
        document.body.classList.remove('has-cookie');
        window.removeEventListener('resize', measure);
      });
    });
  });

  /* ── briefings sign-up ── */
  safe('newsletter', function () {
    $$('form[data-newsletter]').forEach(function (f) {
      var msg = $('.msg', f);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('input[type=email]', f);
        var email = (input && input.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.className = 'msg err'; msg.textContent = 'Enter a valid email address.'; return; }
        msg.className = 'msg'; msg.textContent = 'Subscribing…';
        postJSON('/api/newsletter', { email: email }, 12000).then(function (r) {
          if (r.ok && r.data && r.data.ok) { msg.className = 'msg ok'; msg.textContent = 'Subscribed. Thank you.'; f.reset(); }
          else { msg.className = 'msg err'; msg.textContent = (r.data && r.data.error) ? String(r.data.error) : 'Could not subscribe just now. Please try again.'; }
        });
      });
    });
  });

  /* ── calm view toggle ── */
  safe('calm', function () {
    var b = $('#calm-toggle');
    if (!b) return;
    function sync() {
      var on = document.body.classList.contains('calm');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? 'Calm view · on' : 'Calm view · off';
    }
    b.addEventListener('click', function () { document.body.classList.toggle('calm'); sync(); });
    sync();
  });

  /* ── RSEI engine ── */
  safe('engine', function () {
    var root = $('#engine');
    var E = D.engine;
    if (!root || !E) return;
    var Q = E.questions, BANDS = E.bands;
    var st = { scope: null, qi: 0, answers: [null, null, null, null, null, null, null, null], result: null };
    var scopeBox = $('#eng-scope'), qBox = $('#eng-q'), resBox = $('#eng-result'), prog = $$('#eng-progress i');

    function pillarVals() {
      return KEYS.map(function (k, pi) {
        var xs = [st.answers[pi * 2], st.answers[pi * 2 + 1]].filter(function (x) { return typeof x === 'number'; });
        if (!xs.length) return null;
        return Math.round(xs.reduce(function (a, b) { return a + b; }, 0) / xs.length);
      });
    }
    function scopeLabel() {
      var s = (E.scopes || []).filter(function (x) { return x.id === st.scope; })[0];
      return s ? s.label : '';
    }
    function paintProgress() {
      prog.forEach(function (p, i) {
        p.className = typeof st.answers[i] === 'number' ? Q[i].p : (i === st.qi && st.scope ? 'now' : '');
      });
    }
    function live() {
      var n = st.answers.filter(function (x) { return typeof x === 'number'; }).length;
      if (!n) { Signal.show(null, { source: 'IDLE', title: 'No signal yet', text: 'Answer the first question and your four channels start to fill. Nothing you enter is stored unless you choose to send it.' }); return; }
      Signal.show(pillarVals(), { source: 'YOUR ANSWERS · ' + n + ' OF 8', title: 'Building your signal', complete: false });
    }
    function showScope() {
      scopeBox.hidden = false; qBox.hidden = true; resBox.hidden = true;
      paintProgress();
    }
    function showQ() {
      var q = Q[st.qi];
      scopeBox.hidden = true; qBox.hidden = false; resBox.hidden = true;
      $('#q-meta').textContent = 'QUESTION ' + (st.qi + 1) + ' OF 8 · ' + q.p + ' · ' + E.pillars[q.p];
      $('#q-meta').className = 'eyebrow c-' + q.p;
      $('#q-text').textContent = q.text;
      $('#q-sub').textContent = q.sub;
      $('#q-scope').textContent = scopeLabel();
      var box = $('#q-opts');
      box.textContent = '';
      q.o.forEach(function (t, i) {
        var b = el('button', 'opt');
        b.type = 'button';
        b.setAttribute('aria-pressed', st.answers[st.qi] === i + 1 ? 'true' : 'false');
        b.appendChild(el('span', 'n', i + 1));
        b.appendChild(el('span', '', t));
        b.addEventListener('click', function () { pick(i + 1); });
        box.appendChild(b);
      });
      paintProgress();
      var h = $('#q-text');
      if (h && h.focus) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    function pick(v) {
      st.answers[st.qi] = v;
      live();
      if (st.qi < 7) { st.qi += 1; showQ(); } else { finish(); }
    }
    function local() {
      var v = pillarVals();
      return { R: v[0] || 1, S: v[1] || 1, E: v[2] || 1, I: v[3] || 1, by: 'local' };
    }
    function finish() {
      qBox.hidden = true;
      resBox.hidden = false;
      $('#res-tier').textContent = 'Reading your answers…';
      $('#res-body').hidden = true;
      var answers = {}, seq = { R: 0, S: 0, E: 0, I: 0 };
      Q.forEach(function (q, i) { seq[q.p] += 1; answers[q.p.toLowerCase() + seq[q.p]] = st.answers[i]; });
      request(API + '/api/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: answers })
      }, 6000).then(function (r) {
        var res = local();
        var d = r.data;
        if (r.ok && d && d.ok && d.pillars) {
          var ok = KEYS.every(function (k) { var x = d.pillars[k]; return typeof x === 'number' && x >= 1 && x <= 5; });
          if (ok) res = { R: d.pillars.R, S: d.pillars.S, E: d.pillars.E, I: d.pillars.I, by: 'server' };
        }
        showResult(res);
      });
    }
    function showResult(res) {
      var vals = [res.R, res.S, res.E, res.I];
      var total = vals[0] + vals[1] + vals[2] + vals[3];
      var band = BANDS[0];
      for (var i = 0; i < BANDS.length; i++) { if (total <= BANDS[i].max) { band = BANDS[i]; break; } }
      var t = tierOf(total);
      st.result = { vals: vals, total: total, band: band, by: res.by, risk: t.key === 'crit' ? 'critical' : t.key };
      $('#res-head').textContent = 'YOUR RESULT · ' + total + '/20 · ' + scopeLabel().toUpperCase();
      var tierEl = $('#res-tier');
      tierEl.textContent = band.name;
      tierEl.className = 'h2 c-' + (t.key === 'crit' ? 'red' : (t.key === 'high' ? 'R' : 'SE'));
      $('#res-msg').textContent = band.message;
      $('#res-advice').textContent = band.advice;
      $('#res-eflag').hidden = !(vals[2] >= 4);
      $('#res-body').hidden = false;
      document.body.classList.remove('calm');
      var ct = $('#calm-toggle'); if (ct) { ct.setAttribute('aria-pressed', 'false'); ct.textContent = 'Calm view · off'; }
      Signal.show(vals, { source: 'YOUR RESULT', title: band.name, complete: true });
      paintProgress();
      tierEl.setAttribute('tabindex', '-1');
      if (tierEl.focus) tierEl.focus();
    }
    function reportCanvas() {
      if (!st.result) return null;
      var c = document.createElement('canvas');
      c.width = 1200; c.height = 675;
      var x = c.getContext('2d');
      if (!x) return null;
      var r = st.result;
      x.fillStyle = '#0B1015'; x.fillRect(0, 0, 1200, 675);
      x.fillStyle = '#C0272D'; x.fillRect(0, 0, 1200, 10);
      x.fillStyle = '#E8EEF2'; x.font = '700 34px Arial'; x.fillText('OSB · RSEI Assessment', 60, 90);
      x.fillStyle = '#9AA8B4'; x.font = '20px Arial';
      x.fillText(new Date().toISOString().slice(0, 10) + ' · ' + scopeLabel(), 60, 126);
      x.fillStyle = '#E8EEF2'; x.font = '700 120px Arial'; x.fillText(String(r.total), 60, 280);
      x.fillStyle = '#9AA8B4'; x.font = '40px Arial'; x.fillText('/ 20', 60 + x.measureText(String(r.total)).width + 150, 280);
      x.fillStyle = '#E8EEF2'; x.font = '700 34px Arial'; x.fillText(r.band.name, 60, 345);
      var cols = { R: '#F2B544', S: '#6FC3DF', E: '#FF5A5F', I: '#B79CFF' };
      KEYS.forEach(function (k, i) {
        var y = 410 + i * 50;
        x.fillStyle = cols[k]; x.font = '700 26px Arial'; x.fillText(k, 60, y + 22);
        for (var n = 0; n < 5; n++) { x.fillStyle = n < r.vals[i] ? cols[k] : '#222C35'; x.fillRect(110 + n * 92, y, 86, 26); }
        x.fillStyle = '#E8EEF2'; x.font = '24px Arial'; x.fillText(String(r.vals[i]), 590, y + 22);
      });
      x.fillStyle = '#9AA8B4'; x.font = '18px Arial';
      x.fillText('Behavioural assessment, not a verdict. onlinesecuritybureau.com', 60, 640);
      return c;
    }
    function download() {
      var c = reportCanvas();
      if (!c) return;
      var a = document.createElement('a');
      a.download = 'OSB-RSEI-Assessment-' + new Date().toISOString().slice(0, 10) + '.jpg';
      a.href = c.toDataURL('image/jpeg', 0.9);
      document.body.appendChild(a); a.click(); a.remove();
    }
    function send(e) {
      e.preventDefault();
      var f = e.target, msg = $('#send-msg');
      if (!st.result) return;
      if (!$('#send-consent').checked) { msg.className = 'msg err'; msg.textContent = 'Please tick the consent box first. Nothing is sent without it.'; return; }
      var btn = $('#send-btn');
      btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending securely…';
      var r = st.result, img = null;
      try { var c = reportCanvas(); img = c ? c.toDataURL('image/jpeg', 0.82) : null; } catch (err) { img = null; }
      var v = function (id) { var n = $('#' + id, f); return n ? n.value.trim() : ''; };
      var body = {
        result: 'RSEI Score: ' + r.total + '/20 | Tier: ' + r.band.name + ' | R:' + r.vals[0] + ' S:' + r.vals[1] + ' E:' + r.vals[2] + ' I:' + r.vals[3] + ' | Context: ' + scopeLabel(),
        score: r.total, scored_by: r.by, risk: r.risk,
        pillar_r: r.vals[0], pillar_s: r.vals[1], pillar_e: r.vals[2], pillar_i: r.vals[3],
        email: v('send-email') || 'Not provided', country: v('send-country') || 'Not provided',
        platform: v('send-platform') || 'Not provided', money: v('send-money') || 'Not provided',
        story: v('send-story') || 'Not provided',
        intel_consent: !!($('#send-intel') && $('#send-intel').checked),
        timestamp: new Date().toLocaleString(), consent: true, report_image: img
      };
      postJSON('/api/score', body, 20000).then(function (res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = body.email !== 'Not provided'
            ? 'Sent to OSB. Your assessment report will be emailed to you, and OSB will reply if a personal response is needed.'
            : 'Sent to OSB. Your situation will be reviewed.';
          btn.textContent = 'Sent';
        } else {
          btn.disabled = false;
          msg.className = 'msg err';
          msg.textContent = res.aborted ? 'The connection timed out. Please try again.' : 'Could not send just now. Please try again, or use the contact page.';
        }
      });
    }
    function restart() {
      st = { scope: null, qi: 0, answers: [null, null, null, null, null, null, null, null], result: null };
      document.body.classList.add('calm');
      var ct = $('#calm-toggle'); if (ct) { ct.setAttribute('aria-pressed', 'true'); ct.textContent = 'Calm view · on'; }
      var f = $('#send-form'); if (f) f.reset();
      var m = $('#send-msg'); if (m) m.textContent = '';
      var b = $('#send-btn'); if (b) { b.disabled = false; b.textContent = 'Send to OSB privately'; }
      live(); showScope();
    }

    $$('#eng-scope [data-scope]').forEach(function (b) {
      b.addEventListener('click', function () { st.scope = b.getAttribute('data-scope'); st.qi = 0; showQ(); });
    });
    $('#q-back').addEventListener('click', function () { if (st.qi > 0) { st.qi -= 1; showQ(); } else { showScope(); } });
    $('#res-restart').addEventListener('click', restart);
    $('#res-download').addEventListener('click', download);
    var sf = $('#send-form'); if (sf) sf.addEventListener('submit', send);
    $('#eng-nojs').hidden = true;
    root.hidden = false;
    live(); showScope();
  });

  /* ── story: step through the seven moves ── */
  safe('story', function () {
    var root = $('#story');
    var S = D.story;
    if (!root || !S) return;
    var items = $$('#thread > li'), i = 0;
    function path(ci, upto) {
      var x = function (d) { return (d - 1) / 59 * 600; };
      var y = function (v) { return 36 - (v - 1) / 4 * 32; };
      var p = '';
      S.forEach(function (e, n) {
        if (e.d > upto) return;
        p += n === 0 ? ('M ' + x(e.d) + ' ' + y(e.v[ci])) : (' H ' + x(e.d) + ' V ' + y(e.v[ci]));
      });
      return p + ' H ' + x(upto);
    }
    function go(n) {
      i = Math.max(0, Math.min(S.length - 1, n));
      items.forEach(function (li, k) { li.hidden = k > i; });
      KEYS.forEach(function (k, ci) { var t = $('#trace-' + k); if (t) t.setAttribute('d', path(ci, S[i].d)); });
      $('#story-pos').textContent = 'MOVE ' + (i + 1) + ' OF ' + S.length;
      $('#story-next').textContent = i >= S.length - 1 ? 'Start again' : 'Next move →';
      Signal.show(S[i].v, {
        source: 'STORY · DAY ' + S[i].d, title: S[i].label, complete: true,
        extraAlerts: i >= 2 ? [{ cls: '', text: 'Off-platform. The app’s safety tools can no longer see this.' }] : []
      });
    }
    $('#story-next').addEventListener('click', function () { go(i >= S.length - 1 ? 0 : i + 1); });
    $('#story-prev').addEventListener('click', function () { go(i - 1); });
    $('#story-controls').hidden = false;
    go(0);
  });

  /* ── investigation board ── */
  safe('board', function () {
    var root = $('#board');
    var B = D.board;
    if (!root || !B) return;
    var nodes = $$('.node', root), lines = $$('line', root);
    function select(id) {
      nodes.forEach(function (n) { n.setAttribute('aria-pressed', n.getAttribute('data-id') === id ? 'true' : 'false'); });
      lines.forEach(function (l) { l.classList.toggle('hot', l.getAttribute('data-a') === id || l.getAttribute('data-b') === id); });
      var info = B[id];
      if (!info) return;
      if (info.v) Signal.show(info.v, { source: info.src, title: info.title, complete: true });
      else Signal.show(null, { source: info.src, title: info.title, text: info.text });
    }
    nodes.forEach(function (n) { n.addEventListener('click', function () { select(n.getAttribute('data-id')); }); });
    select(root.getAttribute('data-start') || 'IFN-004');
  });

  /* ── Intelligence Wire ── */
  safe('wire', function () {
    var list = $('#wire-list');
    if (!list) return;
    var status = $('#wire-status');
    var filters = $$('#wire-filters button');
    var current = 'ALL';
    function ago(ms) {
      var s = (Date.now() - Number(ms)) / 1000;
      if (!isFinite(s) || s < 0) return '';
      if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }
    function apply() {
      $$('.wire-item', list).forEach(function (li) {
        li.hidden = !(current === 'ALL' || li.getAttribute('data-p') === current);
      });
      filters.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === current ? 'true' : 'false'); });
    }
    filters.forEach(function (b) { b.addEventListener('click', function () { current = b.getAttribute('data-f'); apply(); }); });
    request(NEWS, { cache: 'no-store' }, 9000).then(function (r) {
      var items = (r.ok && r.data && Array.isArray(r.data.items)) ? r.data.items : [];
      items = items.filter(function (i) { return i && i.title && isHttp(i.link); }).slice(0, 40);
      list.textContent = '';
      if (!items.length) {
        if (status) status.textContent = 'The wire is updating. Live headlines could not load just now; please check back shortly.';
        return;
      }
      if (status) status.textContent = '';
      items.forEach(function (i) {
        var lens = i.lens || {};
        var p = /^(R|S|E|I)$/.test(lens.p) ? lens.p : 'SE';
        var li = el('li', 'wire-item');
        li.setAttribute('data-p', p);
        var th = el('div', 'thumb p-' + p, p);
        th.setAttribute('aria-hidden', 'true');
        var src = i.img || i.image || i.thumb;
        if (isHttp(src)) {
          var img = el('img');
          img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = src;
          img.addEventListener('error', function () { img.remove(); });
          th.appendChild(img);
        }
        var body = el('div');
        body.appendChild(el('div', 'wire-meta', (i.src || 'News') + (i.pub ? ' · ' + ago(i.pub) : '') + ' · ' + p + (lens.name ? ' · ' + lens.name : '')));
        var t = el('div', 'wire-title');
        var a = el('a', '', i.title);
        a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        t.appendChild(a);
        body.appendChild(t);
        if (lens.note) body.appendChild(el('div', 'wire-lens', lens.note));
        li.appendChild(th); li.appendChild(body);
        list.appendChild(li);
      });
      $('#wire-filters').hidden = false;
      apply();
    });
  });

  /* ── contact forms ── */
  safe('contact', function () {
    var tabs = $$('[data-tab]');
    if (!tabs.length) return;
    function show(name) {
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', t.getAttribute('data-tab') === name ? 'true' : 'false'); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.getAttribute('data-tab')); }); });
    show(tabs[0].getAttribute('data-tab'));
    function ref(type) { return 'OSB/' + type + '/' + new Date().getFullYear() + '/' + String(Math.floor(Math.random() * 9000) + 1000); }

    var cf = $('#contact-form');
    if (cf) cf.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.msg', cf), btn = $('button[type=submit]', cf);
      if (!$('#cf-consent').checked) { msg.className = 'msg err'; msg.textContent = 'Please tick the consent box first.'; return; }
      var message = $('#cf-message').value.trim();
      if (!message) { msg.className = 'msg err'; msg.textContent = 'Please write a message.'; return; }
      btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
      postJSON('/api/contact', { type: 'contact', email: $('#cf-email').value.trim() || 'anonymous', reason: $('#cf-reason').value, message: message }, 20000).then(function (r) {
        if (r.ok) { msg.className = 'msg ok'; msg.textContent = 'Sent. Your reference is ' + ref('ENQ') + '.'; cf.reset(); btn.textContent = 'Sent'; }
        else { btn.disabled = false; msg.className = 'msg err'; msg.textContent = r.aborted ? 'The connection timed out. Please try again.' : 'Something went wrong. Please try again.'; }
      });
    });
    var inf = $('#intel-form');
    if (inf) inf.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.msg', inf), btn = $('button[type=submit]', inf);
      var user = $('#in-user').value.trim(), content = $('#in-content').value.trim(), platform = $('#in-platform').value.trim();
      if (!user || !content) { msg.className = 'msg err'; msg.textContent = 'Please add a username and describe what you observed.'; return; }
      btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Submitting…';
      postJSON('/api/community', { username: user, content: (platform ? '[Platform: ' + platform + '] ' : '') + content, pillar: $('#in-pillar').value || 'OTHER', ifn_ref: 'INTEL-SUBMISSION' }, 20000).then(function (r) {
        if (r.ok) { msg.className = 'msg ok'; msg.textContent = 'Submitted. Your reference is ' + ref('INT') + '.'; inf.reset(); btn.textContent = 'Submitted'; }
        else { btn.disabled = false; msg.className = 'msg err'; msg.textContent = r.aborted ? 'The connection timed out. Please try again.' : 'Something went wrong. Please try again.'; }
      });
    });
  });

  /* ── community: composer and approved posts ── */
  safe('community', function () {
    var form = $('#post-form'), feed = $('#community-feed');
    if (form) {
      var ta = $('#post-content'), count = $('#post-count');
      if (ta && count) ta.addEventListener('input', function () { count.textContent = ta.value.length + ' / 1200'; });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var msg = $('.msg', form), btn = $('button[type=submit]', form);
        var user = $('#post-user').value.trim(), content = ta.value.trim();
        var ask = $('#post-ask') && $('#post-ask').checked;
        if (!user) { msg.className = 'msg err'; msg.textContent = 'Please choose a username.'; return; }
        if (!content) { msg.className = 'msg err'; msg.textContent = 'Please write something first.'; return; }
        btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Submitting…';
        postJSON(ask ? '/api/community/ask' : '/api/community', { username: user, content: content, pillar: $('#post-pillar').value || null }, 20000).then(function (r) {
          btn.disabled = false;
          if (r.ok && r.data && r.data.ok) {
            msg.className = 'msg ok';
            msg.textContent = ask ? 'Your question has been sent to OSB privately.' : 'Submitted. Your post will appear after OSB review.';
            ta.value = ''; if (count) count.textContent = '0 / 1200';
          } else { msg.className = 'msg err'; msg.textContent = (r.data && r.data.error) ? 'Could not submit: ' + String(r.data.error) : 'Could not submit just now. Please try again.'; }
        });
      });
    }
    if (feed) {
      request(API + '/api/community?limit=50', {}, 10000).then(function (r) {
        var rows = (r.ok && r.data && r.data.ok && Array.isArray(r.data.data)) ? r.data.data : [];
        var status = $('#community-status');
        if (!rows.length) { if (status) status.textContent = 'Community posts could not load just now, or none are published yet.'; return; }
        if (status) status.textContent = '';
        rows.forEach(function (p) {
          var lines = String(p.content || '').split('\n').filter(Boolean);
          var title = lines[0] && lines[0].length > 10 ? lines[0] : 'Community post';
          var body = lines.slice(1).join('\n').trim() || String(p.content || '');
          var when = p.created_at ? new Date(p.created_at) : null;
          var item = el('article', 'post');
          item.appendChild(el('div', 'post-meta', (p.username || 'Anonymous') + (when && !isNaN(when) ? ' · ' + when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '') + (p.pillar ? ' · ' + p.pillar : '')));
          item.appendChild(el('div', 'post-title', title));
          item.appendChild(el('div', 'post-body', body.length > 1200 ? body.slice(0, 1200) + '…' : body));
          feed.appendChild(item);
        });
      });
    }
  });

  /* ── Solace 30-day companion ── */
  safe('companion', function () {
    var days = $$('.day[data-day]');
    if (!days.length) return;
    var n = days.length, cur = 1;
    var m = /day-(\d+)/.exec(location.hash || '');
    if (m) cur = Math.max(1, Math.min(n, parseInt(m[1], 10) || 1));
    function go(k) {
      cur = Math.max(1, Math.min(n, k));
      days.forEach(function (d) { d.classList.toggle('on', Number(d.getAttribute('data-day')) === cur); });
      $('#day-pos').textContent = 'DAY ' + cur + ' OF ' + n;
      $('#day-bar').style.width = (cur / n * 100) + '%';
      $('#day-prev').disabled = cur === 1;
      $('#day-next').disabled = cur === n;
      if (history.replaceState) history.replaceState(null, '', '#day-' + cur);
    }
    $('#day-prev').addEventListener('click', function () { go(cur - 1); window.scrollTo(0, 0); });
    $('#day-next').addEventListener('click', function () { go(cur + 1); window.scrollTo(0, 0); });
    $('#day-controls').hidden = false;
    go(cur);
  });
})();
