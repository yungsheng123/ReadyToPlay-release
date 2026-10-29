// The fees page: the header ring, the quick Add button, the bottom tabs, and starting everything.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};

  // ---- What the list area shows when there is nothing to list (see cfg.emptyView in FeesCore) ----
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function iconBox(tint, svg) { var d = node('div', 'es-ic ' + tint); d.innerHTML = svg; return d; }
  function button(text, primary, onClick) { var b = node('button', primary ? 'es-btn primary' : 'es-btn', text); b.type = 'button'; b.addEventListener('click', onClick); return b; }
  var IC_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M8.5 3v4M15.5 3v4M12 13v4M10 15h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var IC_USERS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.3c1.8.8 3 2.7 3 5.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function copyGuestLink() {
    var url = new URL('guest.html?v=' + encodeURIComponent(FA.guestCode), location.href).href;
    var done = function () { AppShell.toast('Guest link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); }); return; }
    window.prompt('Copy this link:', url);
  }

  function emptyView(kind) {
    if (kind === 'loading') {
      var sk = node('div', 'skelgrid');
      for (var i = 0; i < 8; i++) { var cell = node('div', 'skelp'); cell.appendChild(node('i')); cell.appendChild(node('b')); sk.appendChild(cell); }
      sk.setAttribute('aria-label', 'Loading');
      return sk;
    }
    // A guest, and a Sub Admin (who cannot create or bring anything), get the plain message.
    if (FA.guest() || FeesCore.isReadOnly()) return null;
    var card = node('div', 'emptycard');
    if (kind === 'nosession') {
      card.appendChild(iconBox('green', IC_CAL));
      card.appendChild(node('h3', '', 'Start your first session'));
      card.appendChild(node('p', 'es-sub', 'Three steps and your players can see the list.'));
      var steps = node('ol', 'es-steps');
      ['Create a session: pick the day, time and place.', 'Add players by name, or bring them from an earlier session.', 'Share the guest link so everyone can see who is in.'].forEach(function (s) { steps.appendChild(node('li', '', s)); });
      card.appendChild(steps);
      card.appendChild(button('Create session', true, function () { FA.el('btnNewSession').click(); }));
      return card;
    }
    if (kind === 'noplayers') {
      card.appendChild(iconBox('blue', IC_USERS));
      card.appendChild(node('h3', '', 'No players yet'));
      card.appendChild(node('p', 'es-sub', 'Search above to add a player, or bring the usual group.'));
      var row = node('div', 'es-actions');
      var last = FA.lastSessionWithPlayers();
      if (last) row.appendChild(button('Bring players from ' + FA.prettyDate(last.date, true), false, function () { FA.openBringPlayers(); }));
      if (FA.guestCode) row.appendChild(button('Share guest link', false, copyGuestLink));
      if (row.firstChild) card.appendChild(row);
      return card;
    }
    return null;
  }

  // ---- Header ring, quick Add and bottom tabs (the parts shared with the other sports are in shared/js/app-shell.js) ----
  // The Add button: what was typed in the search box (a known player with exactly that name, or else a guest) first joins the Adding players
  // row; then everybody in the row goes into the session together. Enter puts the typed name in the row; with the box empty it adds the row.
  function onAdd() {
    if (FA.pBusy) return;
    if (FA.pSearch.value.trim() && !FA.queueTyped()) return;
    if (FA.queueList().length) FA.commitQueue();
    else { FA.pSearch.focus(); AppShell.toast('Type a name or tap players first.'); }
  }
  FA.el('btnQuickAdd').addEventListener('click', onAdd);
  FA.pSearch.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (FA.pSearch.value.trim()) FA.queueTyped();
    else if (FA.queueList().length) FA.commitQueue();
  });

  function moreKeys() {
    var keys = FA.menuKeys();
    return ['calc', 'profile', 'activity', 'logout'].filter(function (k) { return keys.indexOf(k) !== -1; });
  }
  AppShell.tabs({
    primary: function () {
      var t = FA.guest() ? ['fees'] : ['fees', 'players', 'leaderboard'];   // (a guest's tab bar is hidden: there is only the one view)
      if (FA.hasCalendar) t.push('calendar');
      return t;
    },
    more: moreKeys,
    select: FA.menuSelect,
    logout: function () { PageMenu.logout(); }
  });

  FA.recalc();

  // What the sport's settings change on the page: the heading and tab title, the logo's text, and the calculator's shuttlecock row.
  function applySportToPage() {
    var info = FA.SPORTINFO;
    if (!info) return;
    var h1 = document.querySelector('header.feesview h1');
    if (h1) h1.textContent = info.name || info.title;   // just the sport ("Badminton"), not "Badminton fees"
    var logo = document.querySelector('header.feesview img.logo');
    if (logo && info.logoAlt) logo.alt = info.logoAlt;
    document.title = info.name || info.title;
    Array.prototype.forEach.call(document.querySelectorAll('.shuttle'), function (node) { node.style.display = info.hasShuttle ? '' : 'none'; });
    var tubeEach = FA.el('cTubeEach');
    if (tubeEach && tubeEach.parentNode && tubeEach.parentNode.parentNode) tubeEach.parentNode.parentNode.style.display = info.hasShuttle ? '' : 'none';
  }

  // Which sport this page is for: an old page copy says so itself; the shared pages ask the server which sport the host's code (or the
  // guest link, or the public page of a sport) belongs to, and get that sport's settings with the answer.
  function resolveSport(go) {
    if (FA.SPORT) {
      fetch((window.APP_ROOT != null ? window.APP_ROOT : '../') + 'api/auth/host-sport?sport=' + encodeURIComponent(FA.SPORT))
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (info) { if (info) { FA.SPORTINFO = info; applySportToPage(); } go(); });
      return;
    }
    var q = new URLSearchParams(location.search);
    var url = (window.APP_ROOT != null ? window.APP_ROOT : '../') + 'api/auth/host-sport?';
    if (q.get('v')) url += 'v=' + encodeURIComponent(q.get('v'));
    else if (q.get('u')) url += 'u=' + encodeURIComponent(q.get('u'));
    else if (document.body.hasAttribute('data-guest') && q.get('sport')) url += 'v=public&sport=' + encodeURIComponent(q.get('sport'));
    else { go(); return; }   // no code at all: the page says so
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { FeesCore.showError('Could not reach the server.'); return null; })
      .then(function (info) {
        if (info) { FA.SPORTINFO = info; FA.SPORT = info.sport; applySportToPage(); }
        go();
      });
  }

  function begin() {
    if (!FA.guest()) {
      fetch(FA.ROOT + 'api/auth/sports').then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
        if (data && data.sports) { FA.catalog = data.sports; FA.renderSportLabels(); FA.renderHistory(); }
      }).catch(function () { });
    }
    FeesCore.start({
    tiles: true,
    emptyView: emptyView,
    onCounts: function (paid, total) {
      var onPage = FA.current();
      if (onPage && !FA.guest()) { onPage.players = total; onPage.unpaid = total - paid; }
      if (!FA.guest()) { AppShell.setRing(paid, total); return; }
      AppShell.setRing(total, total);   // a guest sees how many players there are, not how many have paid
      FA.el('ringNum').textContent = String(total);
      var label = document.querySelector('#ring .rs');
      if (label) label.textContent = total === 1 ? 'player' : 'players';
      FA.el('ring').setAttribute('aria-label', total + (total === 1 ? ' player' : ' players'));
    },
    sport: FA.SPORT,
    title: FA.SPORTINFO ? (FA.SPORTINFO.name || FA.SPORTINFO.title) : 'Fees',
    keepPasteClosed: true,
    bulkEdit: true,
    // Under each player's name: the unique link (only the owner has the list to look it up in).
    // Under each player's name: their tags (and "Guest" for a guest, to the host). The unique link is never shown
    // here: it is only in Player management, for the host.
    subtitle: function (p) {
      var known = p.playerId ? FA.knownById(p.playerId) : null;
      if (!known) return FA.owner ? 'Guest' : '';
      return FA.tagsOf(known).join(' \u00b7 ');
    },
    // The tags of a player of the session (from the known players): the filter chips offer the tags the players of the session have.
    tagsOf: function (p) {
      var known = p.playerId ? FA.knownById(p.playerId) : null;
      return known ? FA.tagsOf(known) : [];
    },
    // The pencil edits the name and the link together for players that have a link.
    linkOf: function (p) {
      var known = p.playerId ? FA.knownById(p.playerId) : null;
      return known ? known.link : null;
    },
    onLinkChanged: function (p, link) {
      var known = p.playerId ? FA.knownById(p.playerId) : null;
      if (known) { known.name = p.name; known.link = link; if (p.gender) known.gender = p.gender; }
      // The ranking shows the same player; keep it in step.
      FA.ranking.forEach(function (r) { if (r.id === p.playerId) { r.name = p.name; r.link = link; } });
      FA.renderRanking();
    },
    onPeopleChange: function () { FA.refreshState(); },
    onSession: function (s) { FA.applySessionCounts(s); },
    // Every name of a pasted list is a guest of the session (no known player is made), so the page has nothing more to read.
    // The live look (see fees-core.js) waits while this page has numbers waiting to be saved, or is making a session or switching page.
    liveBusy: function () { return !!(FA.pending || FA.saveTimer) || FA.creating || FA.switching; },
    onInit: FA.applyState
  }); }
  resolveSport(begin);
})();
