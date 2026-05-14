/**
 * OSB API Utility — osb-fetch.js
 * Timeout · Auto-retry · Graceful failure
 * Include in every HTML page: <script src="/osb-fetch.js"></script>
 */

const OSB = {

  API: 'https://osb-backend-production.up.railway.app',

  /**
   * Fetch with timeout + auto-retry
   * @param {string} url
   * @param {object} options - standard fetch options
   * @param {number} timeoutMs - ms before timeout (default 10000)
   * @param {number} retries - number of retries on failure (default 2)
   */
  async fetch(url, options = {}, timeoutMs = 10000, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);

        // Parse JSON safely
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); }
        catch { data = { ok: false, error: 'Invalid server response' }; }

        // Rate limited — don't retry
        if (res.status === 429) {
          return { ok: false, error: 'Too many requests. Please wait a moment.', status: 429 };
        }

        // Circuit breaker open — don't retry
        if (res.status === 503) {
          return { ok: false, error: 'Service temporarily unavailable. Please try again shortly.', status: 503 };
        }

        return data;

      } catch (err) {
        clearTimeout(timer);

        const isTimeout = err.name === 'AbortError';
        const isLast    = attempt === retries;

        if (isLast) {
          return {
            ok: false,
            error: isTimeout
              ? 'Connection timed out. Check your internet and try again.'
              : 'Network error. Please check your connection.'
          };
        }

        // Wait before retry: 2s, then 4s
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
      }
    }
  },

  /**
   * POST helper
   */
  async post(endpoint, body, timeoutMs = 10000) {
    return this.fetch(this.API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, timeoutMs);
  },

  /**
   * GET helper
   */
  async get(endpoint, timeoutMs = 10000) {
    return this.fetch(this.API + endpoint, {}, timeoutMs, 1);
  },

  /**
   * Debounce — prevent rapid repeated calls
   */
  debounce(fn, delay = 800) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /**
   * Show a toast notification
   * Looks for #toast element — add one to your page
   */
  toast(msg, type = 'info') {
    const el = document.getElementById('toast') || document.getElementById('osb-toast');
    if (!el) { console.warn('OSB.toast: no #toast element found'); return; }
    el.textContent = msg;
    el.className   = 'toast show' + (type === 'error' ? ' toast-error' : '');
    setTimeout(() => el.classList.remove('show'), 4500);
  }

};

// Freeze to prevent accidental mutation
Object.freeze(OSB);
