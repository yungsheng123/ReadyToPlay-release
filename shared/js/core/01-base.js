// FeesCore: icons, small helpers and the page's own settings.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.iconButton = iconButton;
  FC.closeSortMenu = closeSortMenu;
  FC.paintSort = paintSort;
  FC.showError = showError;
  FC.clearError = clearError;
  FC.relock = relock;
  FC.noteResponse = noteResponse;
  FC.authQuery = authQuery;

  FC.TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  FC.PENCIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l.7-3L10.8 3a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L6 12.3 3 13z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  FC.TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.5h10.4M6.2 4.5V3h3.6v1.5M4.2 4.5l.6 8.3h6.4l.6-8.3M6.8 7v3.8M9.2 7v3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function iconButton(kind, label, id, svg) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ic' + (kind === 'remove' ? ' del' : '');
    b.setAttribute('data-act', kind);
    b.setAttribute('data-id', id);
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    return b;
  }

  FC.cfg = { sport: '', title: '', onInit: null, onFail: null };
  // Where the site's root is from this page: '' for the shared pages (fees.html, guest.html), '../' for a page inside a folder.
  FC.ROOT = window.APP_ROOT != null ? window.APP_ROOT : '../';
  FC.people = [];
  FC.loading = true;
  // The page starts with the class "booting" (placeholders instead of "Loading..." and a zero balance); it is taken off when the data is
  // here or the load failed, and in any case after 20 seconds.
  FC.endBooting = function () { document.body.classList.remove('booting'); };
  setTimeout(FC.endBooting, 20000);
  FC.editing = false;
  FC.selected = {};      // ids ticked in edit mode (pages with cfg.bulkEdit)
  FC.pendingAction = 'paid';
  FC.pendingId = null;
  FC.busy = false;
  FC.scope = null;       // the pickleball session the list belongs to; null for badminton
  FC.emptyText = null;

  FC.filter = 'all';     // tile pages (cfg.tiles): which players are shown: 'all', 'unpaid', 'paid', 'female' or 'male'
  FC.chipsEl = document.getElementById('chips');
  // Sort by (Default = the order the players were added in, A to Z, Z to A): only changes how the list is shown, never the saved order. The
  // choice is remembered on this device.
  FC.sortMode = 'default';
  try { var savedSort = localStorage.getItem('autobot.sortBy'); if (savedSort === 'az' || savedSort === 'za') FC.sortMode = savedSort; } catch (e) { }
  FC.SORT_LABELS = { 'default': 'Default', az: 'A to Z', za: 'Z to A' };
  FC.sortRow = null;
  if (FC.chipsEl) {
    FC.sortRow = document.createElement('div');
    FC.sortRow.className = 'sortrow';
    FC.sortRow.hidden = true;
    FC.sortRow.innerHTML = '<button type="button" class="selbtn" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 8.2l1.8 1.8 3.2-3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Select</button>'
      + '<div class="sortwrap"><button type="button" class="sortbtn" aria-haspopup="true" aria-expanded="false">'
      + '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M5 13l-2.2-2.2M5 13l2.2-2.2M11 13V3M11 3L8.8 5.2M11 3l2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<span class="sortlabel"></span>'
      + '<svg class="sortchev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
      + '<div class="sortmenu" role="menu" hidden></div></div>';
    FC.chipsEl.parentNode.insertBefore(FC.sortRow, FC.chipsEl.nextSibling);
    var sortMenu = FC.sortRow.querySelector('.sortmenu');
    ['default', 'az', 'za'].forEach(function (key) {
      var item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('data-sort', key);
      item.innerHTML = '<span></span><b aria-hidden="true">\u2713</b>';
      item.firstChild.textContent = FC.SORT_LABELS[key];
      sortMenu.appendChild(item);
    });
  }
  function closeSortMenu() {
    if (!FC.sortRow) return;
    FC.sortRow.querySelector('.sortmenu').hidden = true;
    FC.sortRow.querySelector('.sortbtn').setAttribute('aria-expanded', 'false');
  }
  function paintSort() {
    if (!FC.sortRow) return;
    FC.sortRow.querySelector('.sortlabel').textContent = 'Sort by: ' + FC.SORT_LABELS[FC.sortMode];
    FC.sortRow.classList.toggle('sorted', FC.sortMode !== 'default');
    Array.prototype.forEach.call(FC.sortRow.querySelectorAll('.sortmenu button'), function (b) {
      var on = b.getAttribute('data-sort') === FC.sortMode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  FC.grid = document.getElementById('grid');
  FC.overlay = document.getElementById('overlay');
  FC.msg = document.getElementById('msg');
  FC.pasteBox = document.getElementById('pasteBox') || { open: false };   // (the paste box is gone from the pages; the old code still sets it)

  function showError(text) { FC.msg.textContent = text; FC.msg.style.display = 'block'; }
  function clearError() { FC.msg.style.display = 'none'; }

  var query = new URLSearchParams(location.search);
  FC.code = query.get('u') || '';
  // A master user can open another user's page with &view=THEIR-CODE. That page is look-only: the boxes
  // can't be tapped and nothing is sent to the server except reads.
  FC.view = query.get('view') || '';
  // A general link (&v=VIEW-CODE, no personal code) shows the page to anyone, look-only. The code in it is a
  // separate one that can't be used to change anything.
  // guest.html is the same page marked <body data-guest>: it needs no code in its address.
  FC.viewOnly = query.get('v') || (document.body.hasAttribute('data-guest') ? 'public' : '');
  FC.readOnly = (!!FC.view && FC.view !== FC.code) || !!FC.viewOnly;

  // A pickleball page opens with a 6-digit code: the Master Admin's (GM) does everything, the Sub Admin's (Admin) sees everything
  // and may only mark players paid or unpaid and pick a session from the history. The server gives a pass for a correct code;
  // it is kept for this browser tab only (sessionStorage) and goes on every call as &t=. The pass says which of the two it is,
  // so the page can show the right buttons; the server checks it again on every call, so changing it here gains nothing.
  // A general (guest) link needs no code.
  FC.gated = !FC.viewOnly && !!FC.code;
  FC.TOKEN_KEY = 'autobot.pin.' + FC.code;
  FC.token = '';
  if (FC.gated) { try { FC.token = sessionStorage.getItem(FC.TOKEN_KEY) || ''; } catch (e) { } }
  // A page left alone for 30 minutes locks again. Every call to the server renews the pass for 30 more minutes (the new pass
  // comes back in the X-Access-Token header); while someone is using the page without saving anything, a small call
  // renews it about once a minute. Any tap, key press or scroll counts as using the page.
  var IDLE_MS = 30 * 60 * 1000;
  var KEEP_MS = 60 * 1000;
  FC.IDLE_KEY = 'autobot.pin.idle';
  var idleTimer = null;
  var lastActive = Date.now();
  var lastRenewed = Date.now();
  FC.role = FC.token ? FC.token.split('.')[0] : '';   // 'gm', 'admin', or '' (no pass, or a page without codes)
  FC.admin = FC.role === 'admin';
  if (FC.admin) { FC.readOnly = true; document.body.classList.add('admin'); }
  if (FC.viewOnly) document.body.classList.add('guest');   // the guest page has its own colours (see fees.css)

  // The pass is no good any more (it ran out, or the server did not accept it): forget it and ask for the code again.
  function relock(becauseIdle) {
    try {
      sessionStorage.removeItem(FC.TOKEN_KEY);
      if (becauseIdle === true) sessionStorage.setItem(FC.IDLE_KEY, '1');
    } catch (e) { }
    location.reload();
  }

  // The answer of any call may carry a renewed pass: keep the newest.
  function noteResponse(r) {
    // The answer of a change carries the account's change counter (X-Rev). If it went up by exactly one, the change was this page's own;
    // if it jumped further, somebody else changed something as well, so the page reads its data again as soon as it is safe.
    if (r && r.headers && FC.liveRev !== null) {
      var rv = r.headers.get('X-Rev');
      if (rv) {
        rv = Number(rv);
        if (rv === FC.liveRev + 1) FC.liveRev = rv;
        else if (rv > FC.liveRev) { FC.liveRev = rv; FC.liveDirty = true; }
      }
    }
    // After a change that moved the session's quantities, the server sends the new ones in this header (JSON numbers only).
    if (r && r.headers && FC.cfg.onSession) {
      var counts = r.headers.get('X-Session');
      if (counts) { try { FC.cfg.onSession(JSON.parse(counts)); } catch (e) { } }
    }
    if (!FC.gated || !FC.token || !r || !r.headers) return;
    var fresh = r.headers.get('X-Access-Token');
    if (!fresh) return;
    FC.token = fresh;
    lastRenewed = Date.now();
    try { sessionStorage.setItem(FC.TOKEN_KEY, fresh); } catch (e) { }
  }

  // Nothing touched for 30 minutes: lock (the server would refuse the old pass by then too).
  function checkIdle() {
    if (Date.now() - lastActive >= IDLE_MS) FC.relock(true);
  }

  function activity() {
    if (!FC.token) return;
    lastActive = Date.now();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(checkIdle, IDLE_MS);
    if (Date.now() - lastRenewed > KEEP_MS) {
      lastRenewed = Date.now();
      fetch(FC.ROOT + 'api/' + FC.cfg.sport + '/keepalive?' + FC.authQuery()).then(function (r) {
        if (r.status === 401) FC.relock(true); else FC.noteResponse(r);
      }, function () { });
    }
  }

  if (FC.gated && FC.token) {
    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(function (name) {
      window.addEventListener(name, activity, { passive: true, capture: true });
    });
    // A sleeping phone may not run the timer: check when the page comes back.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkIdle(); });
    idleTimer = setTimeout(checkIdle, IDLE_MS);
  }
  // &embed=1: the page is shown inside a frame of a master user's own page (see "Views" below), which supplies
  // the navigation bar, so this copy has none.
  FC.embedded = query.get('embed') === '1' && window.parent !== window;
  // Only a page showing its own account can switch views in place; a look-only page just links to the others.
  FC.switchable = !FC.readOnly;
  if (FC.embedded) document.body.classList.add('embed');

  // How the page identifies itself to the server on every call.
  function authQuery() {
    if (FC.viewOnly) return 'v=' + encodeURIComponent(FC.viewOnly);
    return 'u=' + encodeURIComponent(FC.code) + (FC.readOnly && FC.view ? '&view=' + encodeURIComponent(FC.view) : '') + (FC.token ? '&t=' + encodeURIComponent(FC.token) : '');
  }
  if (FC.readOnly) document.body.classList.add('readonly');   // hides the editing controls from the first moment
})();
