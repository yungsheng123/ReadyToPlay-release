// FeesCore: live updates, and the public FeesCore object.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};

  // ---- Live updates (the Master Admin's and the Sub Admin's pages) ---------------------------------------
  // Every few seconds the page asks one very cheap question ("what is the account's change counter?", no database read, and it does not
  // renew the pass, so an idle page still locks). When the number is not the one the page knows, somebody else changed something (the
  // Sub Admin marked a player paid, another device added a player ...), and the page reads its data again, the same call as opening it:
  // tiles, the paid ring, the calculator, the profit, the history and the Total balance all follow. It waits while a popup is open, while
  // something is being typed or saved, and while the browser tab is in the background; it never touches a guest page.
  var LIVE_MS = Math.max(1000, window.LIVE_MS || 3000);   // 3 s: a change shows after 1.5 s on average (see PerfTest/LivePolling.md)
  FC.liveRev = null;        // the counter as the page knows it
  var liveBy = '';           // the role of whoever made the account's latest change, as the server last said ("gm", "admin" or "")
  FC.liveDirty = false;     // something changed elsewhere and the page has not read it yet
  var liveTimer = null;
  var liveFails = 0;
  // How many looks in a row found nothing new, and nobody touched the page: the longer it has been quiet, the less often the page asks
  // (every 3 seconds at first; after a minute of quiet every 6, after 3 minutes every 15, after 6 minutes every 30). A touch, a key, a call of
  // its own, a change, or coming back to the tab starts the quick looks again.
  FC.liveIdle = 0;
  var liveStarted = false;

  function liveAllowed() { return FC.gated && !!FC.token && !FC.viewOnly && !(FC.view && FC.view !== FC.code) && !FC.embedded; }

  // A dialog is open (the calculator may stay open: its numbers follow).
  function liveOpenPopup() {
    var nodes = document.querySelectorAll('[id$="Overlay"], #overlay, #moreSheet');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === 'calcOverlay') continue;
      if (nodes[i].style.display === 'flex') return true;
    }
    return false;
  }

  // Something has been typed in a box and not sent yet.
  function liveTyping() {
    var a = document.activeElement;
    return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'button')) && a.value.length > 0;
  }

  function liveSafe() {
    return FC.busyCount === 0 && !FC.drag && !FC.editing && !liveOpenPopup() && !liveTyping() && !(FC.cfg.liveBusy && FC.cfg.liveBusy());
  }

  function liveSchedule() {
    clearTimeout(liveTimer);
    var wait = LIVE_MS + Math.floor(Math.random() * 250);   // a little jitter, so pages do not all ask in the same instant
    var quiet = FC.liveIdle * LIVE_MS / 1000;   // seconds of quiet, about
    if (quiet >= 360) wait = Math.max(wait, 30000);
    else if (quiet >= 180) wait = Math.max(wait, 15000);
    else if (quiet >= 60) wait = Math.max(wait, 6000);
    if (liveFails > 0) wait = Math.min(30000, LIVE_MS * Math.pow(2, Math.min(liveFails, 5)));   // after a failure: ask less often
    liveTimer = setTimeout(livePoll, wait);
  }

  function liveFetchRev() {
    return fetch(FC.ROOT + 'api/' + FC.cfg.sport + '/rev?u=' + encodeURIComponent(FC.code) + '&t=' + encodeURIComponent(FC.token), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { FC.relock(true); return null; }
        if (!r.ok) throw new Error('rev ' + r.status);
        return r.json();
      });
  }

  function livePoll() {
    if (!liveAllowed()) return;
    if (document.hidden) return;   // in the background the page does not ask at all; coming back to the tab starts it again (below)
    liveFetchRev().then(function (d) {
      liveFails = 0;
      if (!d) return;
      liveBy = d.by || '';
      if (FC.liveRev === null) FC.liveRev = d.rev;
      else if (d.rev !== FC.liveRev) { FC.liveRev = d.rev; FC.liveDirty = true; FC.liveIdle = 0; }
      else FC.liveIdle++;
    }, function () { liveFails++; }).then(function () {
      return FC.liveDirty && liveSafe() ? liveReload() : null;
    }).then(liveSchedule, liveSchedule);
  }

  function liveReload() {
    FC.liveDirty = false;
    // (a change seen in the answer of this page's own call has not told who made it: ask, it costs no database call)
    return liveFetchRev().then(function (d) { if (d) liveBy = d.by || ''; }, function () { })
      .then(function () { return FC.api('GET', '/init'); })
      .then(function (data) {
        FC.noticeLive = { by: liveBy };   // the card for this drawing says the change was somebody else's
        try { FC.applyInit(data); } finally { FC.noticeLive = null; }
      }, function () { FC.liveDirty = true; });   // could not read: try again at the next look
  }

  document.addEventListener('visibilitychange', function () {
    if (!liveStarted) return;
    if (document.hidden) { clearTimeout(liveTimer); return; }   // the tab went to the background: stop asking
    FC.liveIdle = 0;
    clearTimeout(liveTimer);
    livePoll();   // back on the tab: look right away
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (name) {
    document.addEventListener(name, function () { FC.liveIdle = 0; }, { passive: true });
  });

  // config: { tiles (players as tiles with an avatar and filter chips), onCounts(paid, total), sport, title, onInit(data), onFail(err), onPeopleChange(count, players), subtitle(player), linkOf(player), onLinkChanged(player, link), keepPasteClosed, bulkEdit }. Fetches everything the page needs in one request.
  function start(config) {
    FC.cfg = config;
    if (FC.cfg.bulkEdit) FC.buildBulkBar();
    FC.render();
    if (!FC.code && !FC.viewOnly) { FC.showInvalid(); return; }
    if (FC.gated && !FC.token) { FC.showGate(); return; }
    // Live updates: the first look at the counter is taken together with the page's data, so a change in between is not missed.
    if (liveAllowed()) {
      liveStarted = true;
      liveFetchRev().then(function (d) { if (d && FC.liveRev === null) FC.liveRev = d.rev; }, function () { });
      liveSchedule();
    }
    FC.api('GET', '/init')
      .then(FC.applyInit)
      .catch(function (err) {
        if (err.status === 404) { FC.showInvalid(); return; }
        FC.loading = false;
        FC.endBooting();
        document.getElementById('who').textContent = '';
        if (FC.cfg.onFail) FC.cfg.onFail(err);
        FC.render();
        FC.showError('Could not load the list. ' + err.message);
      });
  }

  // A small picture of a sport (badminton: a shuttlecock, pickleball: a ball) for the history list and the calendar. Its colour comes from
  // the sport's class (see sessions.css); a sport without a picture of its own gets a plain dot.
  var SPORT_ICONS = {
    badminton: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.4a2.3 2.3 0 0 1-2.3-2.3h4.6A2.3 2.3 0 0 1 8 14.4z" fill="currentColor"/><path d="M5.7 11.4L3.3 3.7M8 11.4V2.6M10.3 11.4l2.4-7.7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M3.3 3.7C6 2 10 2 12.7 3.7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    pickleball: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="currentColor"/><g fill="#ffffff" fill-opacity=".85"><circle cx="5.6" cy="6" r="1"/><circle cx="9.7" cy="5" r="1"/><circle cx="10.7" cy="8.9" r="1"/><circle cx="6.4" cy="10.1" r="1"/><circle cx="8" cy="7.8" r=".8"/></g></svg>'
  };
  function sportIcon(key) {
    var span = document.createElement('span');
    span.className = 'spicon ' + String(key || '').replace(/[^a-z0-9]/g, '');
    span.innerHTML = SPORT_ICONS[key] || '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>';
    return span;
  }

  window.FeesCore = {
    sportIcon: sportIcon,
    code: FC.code,
    start: start,
    applyInit: FC.applyInit,
    api: FC.api,
    busyWhile: FC.busyWhile,
    render: FC.render,
    showError: FC.showError,
    clearError: FC.clearError,
    setScope: function (id) { FC.scope = id || null; },
    setEmptyText: function (text) { FC.emptyText = text; },
    isLoading: function () { return FC.loading; },
    getPeople: function () { return FC.people; },
    // Shows a list the server answered with (a player added: the answer is the whole list).
    setPeople: function (list, leaveEditMode) { FC.people = list || []; if (leaveEditMode) FC.editing = false; FC.render(); },
    isReadOnly: function () { return FC.readOnly; },
    isGuest: function () { return !!FC.viewOnly; },
    // The sport of this page ('badminton', 'pickleball'), as the page set it when it started (it comes from the database).
    sport: function () { return FC.cfg.sport; },
    root: function () { return FC.ROOT; },
    // 'gm' (Master Admin), 'admin' (Sub Admin), or '' (a page without codes).
    role: function () { return FC.role; },
    // The pass as an address part (&t=...), for the scripts that make their own calls (profile, calendar); relock() when one is refused.
    tokenParam: function () { return FC.token ? '&t=' + encodeURIComponent(FC.token) : ''; },
    relock: FC.relock,
    // Call with every answer of a call the page makes itself (profile, calendar): keeps the newest pass.
    noteResponse: FC.noteResponse,
    isEmbedded: function () { return FC.embedded; },
    logoUrl: FC.currentLogoUrl,
    pictureUrl: FC.pictureUrl,
    pictures: function () { return { logoRev: FC.pictures.logoRev, qrRev: FC.pictures.qrRev, hasQr: FC.pictures.hasQr, staticLogo: FC.pictures.staticLogo }; },
    updatePictures: FC.updatePictures,
    // An extra view of this account (the calendar): handler.open() runs every time it is shown.
    addPanel: function (key, handler) { FC.panels[key] = handler; },
    show: function (key) { FC.showView(key); },
    money: FC.money,
    bindNumberInput: FC.bindNumberInput
  };
})();
