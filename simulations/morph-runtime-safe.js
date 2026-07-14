/**
 * L7 .morph Runtime SAFE v2 — visible dream boundary + panic + storage truth
 *
 * Opt-in only. Does NOT replace morph-runtime.js.
 * Usage: <script src="morph-runtime-safe.js"></script> (after page hooks)
 *   or open *-morph-safe.html variants.
 *
 * References: CLAUDE.md (3-layer morph), BOOK_OF_LAW Law XVII,
 *   legal/OPENCLAW_PROVENANCE.md (four domains; browser ≠ ~/.l7 disk).
 *
 * Storage truth:
 *   - This script writes ONLY to browser localStorage (keys l7_morph_*).
 *   - It does NOT write to ~/.l7/morph on disk unless you run Node domains.write().
 *   - Canvas thumbnails are the main quota risk; safe mode caps/skips them.
 */
'use strict';

(function MORPH_RUNTIME_SAFE() {
  const DOMAIN = '.morph';
  const ELEMENT = 'Fire';
  const LETTER = 'י';
  const TETRAGRAMMATON = 'Yod';
  const STORAGE_PREFIX = 'l7_morph_';
  const VERSION = 'safe-2.0.0';

  const PAGE_ID = location.pathname.split('/').pop().replace(/\.html?$/, '');
  const STORE_KEY = STORAGE_PREFIX + PAGE_ID;

  const LAYERS = [
    { n: 1, name: 'ABOVE',  color: '#ffd54f', symbol: '△ ☉' },
    { n: 2, name: 'MIRROR', color: '#e8e8f0', symbol: '◇ ☽' },
    { n: 3, name: 'BELOW',  color: '#e07050', symbol: '▽ ⊕' }
  ];

  const CONFIG = {
    maxBytesPerSave: 400000,
    maxCanvasCssPx: 256,
    saveCanvasSnapshots: false,
    periodicMs: 60000,
    topBarPx: 36
  };

  let panicEngaged = false;
  let morphEngaged = true;
  let saveCount = 0;
  let autoSaveTimer = null;
  let interactionTimer = null;
  let currentLayer = 1;

  const credentials = {
    domain: DOMAIN,
    element: ELEMENT,
    letter: LETTER,
    tetragrammaton: TETRAGRAMMATON,
    pageId: PAGE_ID,
    runtime: VERSION,
    sessionId: null,
    incarnation: 0,
    enteredAt: null,
    lastSaved: null,
    heartBeat: 0,
    heartAlive: false,
    scrollY: 0,
    canvasStates: {},
    customState: {},
    _morphLayer: 1
  };

  function restoreCredentials() {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        const prev = JSON.parse(saved);
        credentials.incarnation = (prev.incarnation || 0) + 1;
        credentials.sessionId = prev.sessionId;
        credentials.heartBeat = prev.heartBeat || 0;
        credentials.customState = prev.customState || {};
        currentLayer = prev._morphLayer || prev.customState?._morphLayer || 1;
      }
    } catch (e) { /* first visit */ }

    if (!credentials.sessionId) {
      credentials.sessionId = 'morph-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2, 8);
    }
    credentials.enteredAt = new Date().toISOString();
    credentials._morphLayer = currentLayer;

    const q = new URLSearchParams(location.search);
    const layerParam = parseInt(q.get('layer') || q.get('morphLayer') || '', 10);
    if (layerParam >= 1 && layerParam <= 3) {
      currentLayer = layerParam;
      credentials._morphLayer = currentLayer;
    }
  }

  function captureHeartState() {
    try {
      const heart = localStorage.getItem('l7_heart_state');
      if (heart) {
        const h = JSON.parse(heart);
        credentials.heartBeat = h.beatCount || 0;
        credentials.heartAlive = h.alive || false;
      }
    } catch (e) { /* noop */ }
    try {
      const identity = localStorage.getItem('l7_identity');
      if (identity) {
        const id = JSON.parse(identity);
        credentials.founder = id.founder || 'Unknown';
      }
    } catch (e) { /* noop */ }
  }

  restoreCredentials();
  captureHeartState();

  function byteLength(str) {
    try {
      return new Blob([str]).size;
    } catch (e) {
      return (str || '').length * 2;
    }
  }

  function scanBrowserMorphStorage() {
    const rows = [];
    let morphTotal = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key) || '';
      const size = byteLength(raw);
      if (key.startsWith('l7_morph') || key.startsWith('l7_heart') || key.startsWith('l7_identity')) {
        rows.push({ key, size });
        if (key.startsWith('l7_morph')) morphTotal += size;
      }
    }
    rows.sort((a, b) => b.size - a.size);
    return { rows, morphTotal, pageKey: STORE_KEY, pageSize: byteLength(localStorage.getItem(STORE_KEY) || '') };
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function injectStyles() {
    const layer = LAYERS[currentLayer - 1] || LAYERS[0];
    const style = document.createElement('style');
    style.id = 'l7-morph-safe-styles';
    style.textContent = `
      body.morph-safe-engaged {
        padding-top: ${CONFIG.topBarPx}px !important;
      }
      #l7-morph-field-frame {
        position: fixed;
        inset: 0;
        z-index: 99990;
        pointer-events: none;
        border: 5px solid ${layer.color};
        box-shadow:
          inset 0 0 80px rgba(255, 140, 40, 0.15),
          0 0 0 2px rgba(0, 0, 0, 0.6),
          0 0 24px rgba(255, 160, 60, 0.35);
        animation: l7-morph-pulse 2.4s ease-in-out infinite;
      }
      #l7-morph-field-frame.panic {
        border-color: #ff3333;
        animation: l7-morph-panic-pulse 0.45s ease-in-out infinite;
        box-shadow: inset 0 0 120px rgba(255, 0, 0, 0.25), 0 0 40px rgba(255, 0, 0, 0.5);
      }
      @keyframes l7-morph-pulse {
        0%, 100% { opacity: 0.85; }
        50% { opacity: 1; }
      }
      @keyframes l7-morph-panic-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.55; }
      }
      .l7-morph-corner {
        position: fixed;
        z-index: 99991;
        width: 48px;
        height: 48px;
        pointer-events: none;
        border: 3px solid ${layer.color};
        opacity: 0.95;
      }
      .l7-morph-corner.tl { top: 8px; left: 8px; border-right: none; border-bottom: none; }
      .l7-morph-corner.tr { top: 8px; right: 8px; border-left: none; border-bottom: none; }
      .l7-morph-corner.bl { bottom: 8px; left: 8px; border-right: none; border-top: none; }
      .l7-morph-corner.br { bottom: 8px; right: 8px; border-left: none; border-top: none; }
      .l7-morph-edge-label {
        position: fixed;
        z-index: 99991;
        color: ${layer.color};
        font: bold 11px/1 'Courier New', monospace;
        letter-spacing: 3px;
        text-shadow: 0 0 8px rgba(0,0,0,0.9);
        pointer-events: none;
        opacity: 0.9;
      }
      #l7-morph-label-safe {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: ${CONFIG.topBarPx}px;
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        background: linear-gradient(90deg, rgba(120,50,10,0.95), rgba(40,20,5,0.92));
        color: #ffd9a0;
        font: 11px/${CONFIG.topBarPx}px 'Courier New', monospace;
        border-bottom: 2px solid ${layer.color};
        user-select: none;
      }
      #l7-morph-label-safe .engaged-badge {
        background: ${layer.color};
        color: #1a0a00;
        padding: 2px 8px;
        border-radius: 3px;
        font-weight: bold;
        animation: l7-morph-badge 1.8s ease-in-out infinite;
      }
      @keyframes l7-morph-badge {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.04); }
      }
      #l7-morph-panic-btn {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 100002;
        pointer-events: auto;
        padding: 14px 20px;
        font: bold 13px 'Courier New', monospace;
        letter-spacing: 2px;
        color: #fff;
        background: linear-gradient(180deg, #cc2200, #880000);
        border: 3px solid #ff6666;
        border-radius: 6px;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(255, 0, 0, 0.45);
      }
      #l7-morph-panic-btn:hover { filter: brightness(1.15); }
      #l7-morph-panic-btn.armed {
        background: #330000;
        border-color: #ff0000;
        animation: l7-morph-panic-pulse 0.35s infinite;
      }
      #l7-morph-storage-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 100002;
        width: min(420px, calc(100vw - 40px));
        max-height: 50vh;
        overflow: auto;
        pointer-events: auto;
        background: rgba(8, 6, 12, 0.96);
        border: 2px solid #6a5030;
        color: #d4c8a8;
        font: 10px/1.5 'Courier New', monospace;
        padding: 10px;
        border-radius: 6px;
        display: none;
      }
      #l7-morph-storage-panel.open { display: block; }
      #l7-morph-storage-panel h4 {
        color: #ffc56e;
        margin: 0 0 8px;
        font-size: 11px;
      }
      #l7-morph-storage-panel .path {
        color: #88cc88;
        word-break: break-all;
      }
      #l7-morph-storage-panel table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
      }
      #l7-morph-storage-panel td {
        padding: 2px 4px;
        border-bottom: 1px solid #2a2a3a;
        vertical-align: top;
      }
      #l7-morph-storage-toggle {
        position: fixed;
        bottom: 72px;
        left: 20px;
        z-index: 100002;
        pointer-events: auto;
        padding: 8px 12px;
        font: 10px 'Courier New', monospace;
        color: #c9a06e;
        background: rgba(20, 14, 8, 0.92);
        border: 1px solid #6a5030;
        border-radius: 4px;
        cursor: pointer;
      }
      body > canvas#cosmos,
      body > canvas:first-of-type {
        top: ${CONFIG.topBarPx}px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function createFieldChrome() {
    document.body.classList.add('morph-safe-engaged');

    const frame = document.createElement('div');
    frame.id = 'l7-morph-field-frame';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);

    ['tl', 'tr', 'bl', 'br'].forEach(function (pos) {
      const c = document.createElement('div');
      c.className = 'l7-morph-corner ' + pos;
      document.body.appendChild(c);
    });

    const edges = [
      { id: 'edge-top', text: '— .MORPH DREAM DOMAIN — ENGAGED —', style: 'top:52px;left:50%;transform:translateX(-50%)' },
      { id: 'edge-bottom', text: '— FIRE / YOD — NOT .work — NOT SHARED —', style: 'bottom:12px;left:50%;transform:translateX(-50%)' },
      { id: 'edge-left', text: '.MORPH', style: 'left:12px;top:50%;transform:translateY(-50%) rotate(-90deg)' },
      { id: 'edge-right', text: 'LAYER ' + currentLayer, style: 'right:8px;top:50%;transform:translateY(-50%) rotate(90deg)' }
    ];
    edges.forEach(function (e) {
      const el = document.createElement('div');
      el.id = e.id;
      el.className = 'l7-morph-edge-label';
      el.textContent = e.text;
      el.setAttribute('style', e.style);
      document.body.appendChild(el);
    });
  }

  function createTopBar() {
    const layer = LAYERS[currentLayer - 1] || LAYERS[0];
    const bar = document.createElement('div');
    bar.id = 'l7-morph-label-safe';
    bar.setAttribute('data-domain', DOMAIN);
    bar.innerHTML =
      '<div class="morph-left" style="display:flex;gap:12px;align-items:center">' +
        '<span class="engaged-badge">.MORPH ENGAGED</span>' +
        '<span>' + layer.symbol + ' ' + layer.name + '</span>' +
        '<span>' + PAGE_ID + '</span>' +
        '<span>#' + credentials.incarnation + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:14px;align-items:center">' +
        '<span id="morph-safe-storage-hint" style="color:#88cc88"></span>' +
        '<span id="morph-save-status">AUTOSAVE: SAFE</span>' +
        '<span id="morph-safe-clock"></span>' +
      '</div>';
    document.body.appendChild(bar);

    setInterval(function () {
      const el = document.getElementById('morph-safe-clock');
      if (el) {
        el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
      }
      const hint = document.getElementById('morph-safe-storage-hint');
      if (hint) {
        const scan = scanBrowserMorphStorage();
        hint.textContent = 'browser: ' + formatBytes(scan.pageSize);
      }
    }, 2000);
  }

  function createPanicAndStorageUI() {
    const panicBtn = document.createElement('button');
    panicBtn.id = 'l7-morph-panic-btn';
    panicBtn.type = 'button';
    panicBtn.textContent = 'PANIC — STOP MORPH';
    panicBtn.title = 'Stop autosave, pause simulation hooks, show storage map';
    document.body.appendChild(panicBtn);

    const storageToggle = document.createElement('button');
    storageToggle.id = 'l7-morph-storage-toggle';
    storageToggle.type = 'button';
    storageToggle.textContent = 'WHERE IS MY DATA?';
    document.body.appendChild(storageToggle);

    const panel = document.createElement('div');
    panel.id = 'l7-morph-storage-panel';
    panel.innerHTML = '<h4>L7 browser storage map</h4><div id="morph-storage-body"></div>';
    document.body.appendChild(panel);

    function renderStoragePanel() {
      const scan = scanBrowserMorphStorage();
      let quota = '';
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (est) {
          const q = document.getElementById('morph-quota-line');
          if (q && est.quota) {
            q.textContent = 'Browser quota: ' + formatBytes(est.usage || 0) + ' / ' + formatBytes(est.quota);
          }
        });
      }
      const body = document.getElementById('morph-storage-body');
      if (!body) return;

      let html =
        '<p><strong>This page</strong> saves to <span class="path">localStorage["' + STORE_KEY + '"]</span> only.</p>' +
        '<p>Size now: <strong>' + formatBytes(scan.pageSize) + '</strong></p>' +
        '<p id="morph-quota-line">Browser quota: estimating…</p>' +
        '<p><strong>NOT written by this script:</strong><br>' +
        '<span class="path">~/.l7/morph/</span> (disk) — only Node <code>domains.write("morph")</code> or symlinks.</p>' +
        '<p>All <code>l7_morph_*</code> keys (' + formatBytes(scan.morphTotal) + ' total):</p><table>';

      if (scan.rows.length === 0) {
        html += '<tr><td colspan="2">(no l7 morph keys in this browser)</td></tr>';
      } else {
        scan.rows.forEach(function (r) {
          html += '<tr><td>' + r.key + '</td><td>' + formatBytes(r.size) + '</td></tr>';
        });
      }
      html += '</table>';
      body.innerHTML = html;
    }

    storageToggle.addEventListener('click', function () {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) renderStoragePanel();
    });

    panicBtn.addEventListener('click', function () {
      engagePanic('user-button');
    });
  }

  function engagePanic(reason) {
    if (panicEngaged) return;
    panicEngaged = true;
    morphEngaged = false;

    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    if (interactionTimer) clearTimeout(interactionTimer);

    const frame = document.getElementById('l7-morph-field-frame');
    if (frame) frame.classList.add('panic');
    const btn = document.getElementById('l7-morph-panic-btn');
    if (btn) {
      btn.classList.add('armed');
      btn.textContent = 'PANIC ACTIVE — AUTOSAVE OFF';
    }
    const status = document.getElementById('morph-save-status');
    if (status) status.textContent = 'PANIC: FROZEN (' + reason + ')';

    if (typeof window._morphPanicHook === 'function') {
      try { window._morphPanicHook(reason); } catch (e) {
        console.warn('[.morph-safe] panic hook error:', e);
      }
    }

    const panel = document.getElementById('l7-morph-storage-panel');
    if (panel) {
      panel.classList.add('open');
      const body = document.getElementById('morph-storage-body');
      if (body) {
        const choice = window.confirm(
          'PANIC engaged — autosave stopped.\n\n' +
          'OK = Clear THIS page morph data (' + STORE_KEY + ')\n' +
          'Cancel = Keep data, only stop saving'
        );
        if (choice) {
          try {
            localStorage.removeItem(STORE_KEY);
            credentials.canvasStates = {};
            credentials.customState = {};
            console.log('[.morph-safe] Cleared', STORE_KEY);
          } catch (e) {
            console.warn('[.morph-safe] Clear failed:', e);
          }
        }
        panel.querySelector('h4').textContent = 'PANIC — storage map';
        const scan = scanBrowserMorphStorage();
        body.innerHTML =
          '<p style="color:#ff8888"><strong>PANIC ACTIVE</strong> — no more autosaves. Reason: ' + reason + '</p>' +
          '<p>Page key: <span class="path">' + STORE_KEY + '</span></p>' +
          '<p>Use WHERE IS MY DATA anytime. Disk path ~/.l7/morph is separate.</p>';
      }
    }

    console.warn('[.morph-safe] PANIC', reason);
  }

  function saveState(reason) {
    if (panicEngaged || !morphEngaged) return;

    credentials.lastSaved = new Date().toISOString();
    credentials.scrollY = window.scrollY || 0;
    credentials.heartBeat++;
    credentials._morphLayer = currentLayer;
    saveCount++;

    credentials.canvasStates = {};
    if (CONFIG.saveCanvasSnapshots) {
      document.querySelectorAll('canvas').forEach(function (c, i) {
        try {
          const cssW = parseInt(c.style.width, 10) || c.width;
          if (cssW > CONFIG.maxCanvasCssPx) return;
          const id = c.id || ('canvas_' + i);
          credentials.canvasStates[id] = c.toDataURL('image/jpeg', 0.35);
        } catch (e) { /* tainted */ }
      });
    }

    if (typeof window._morphSaveHook === 'function') {
      credentials.customState = window._morphSaveHook();
    }

    const payload = JSON.stringify(credentials);
    if (byteLength(payload) > CONFIG.maxBytesPerSave) {
      credentials.canvasStates = {};
      const lean = JSON.stringify(credentials);
      if (byteLength(lean) > CONFIG.maxBytesPerSave) {
        console.warn('[.morph-safe] Save skipped — over budget', formatBytes(byteLength(lean)));
        engagePanic('storage-budget');
        return;
      }
    }

    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(credentials));
    } catch (e) {
      credentials.canvasStates = {};
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(credentials));
      } catch (e2) {
        console.warn('[.morph-safe] Save failed:', e2.message);
        engagePanic('quota-exceeded');
      }
    }

    const indicator = document.getElementById('morph-save-status');
    if (indicator) {
      indicator.textContent = 'SAVED (' + reason + ') #' + saveCount;
    }
  }

  function bindAutosave() {
    window.addEventListener('beforeunload', function () {
      if (!panicEngaged) saveState('exit');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !panicEngaged) saveState('hidden');
    });
    autoSaveTimer = setInterval(function () {
      if (!panicEngaged) saveState('periodic');
    }, CONFIG.periodicMs);
    window.addEventListener('click', function () {
      if (panicEngaged) return;
      if (interactionTimer) clearTimeout(interactionTimer);
      interactionTimer = setTimeout(function () { saveState('interaction'); }, 8000);
    });
  }

  function tryRestore() {
    if (typeof window._morphRestoreHook === 'function' &&
        credentials.customState &&
        Object.keys(credentials.customState).length > 0) {
      window._morphRestoreHook(credentials.customState);
    }
  }

  function boot() {
    injectStyles();
    createFieldChrome();
    createTopBar();
    createPanicAndStorageUI();
    bindAutosave();
    setTimeout(tryRestore, 100);
    console.log('[.morph-safe] Engaged. Page:', PAGE_ID, 'Layer:', currentLayer,
      'Key:', STORE_KEY, 'v', VERSION);
  }

  window.L7_MORPH = Object.freeze({
    credentials: credentials,
    save: saveState,
    panic: engagePanic,
    getStorageReport: scanBrowserMorphStorage,
    clearPageStorage: function () {
      localStorage.removeItem(STORE_KEY);
      credentials.canvasStates = {};
      credentials.customState = {};
    },
    disengage: function () {
      morphEngaged = false;
      document.body.classList.remove('morph-safe-engaged');
    },
    isPanic: function () { return panicEngaged; },
    getState: function () { return credentials.customState; },
    setState: function (obj) { Object.assign(credentials.customState, obj); },
    markDirty: function () { credentials.customState._dirty = true; },
    pageId: PAGE_ID,
    sessionId: credentials.sessionId,
    incarnation: credentials.incarnation,
    domain: DOMAIN,
    version: VERSION,
    storeKey: STORE_KEY
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
