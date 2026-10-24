// The fees page: the player picker (known players with a tick square), shared by page 2 of the new-session sheet and the "Bring players" sheet
// of an empty session. There is one picker in the page (#srcPicker); whoever needs it borrows it with FA.picker.open() and it goes home again
// (page 2 of the new-session sheet) with FA.picker.home().
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.playerMatches = playerMatches;
  FA.picker = { open: open, home: home, render: render, ids: ids };

  var root = FA.el('srcPicker');
  var homeBox = root ? root.parentNode : null;   // where the picker lives when nobody has borrowed it
  var ticked = {};             // ticked known players, by id
  var filter = '';             // what was typed in the search box
  var session = '';            // the earlier session the list is narrowed to ('' = every known player)
  var tag = '';                // the tag the list is narrowed to ('' = every known player)
  var members = {};            // earlier session id -> { known player id: true }, read when that session is first picked
  var loading = false;
  var onChange = null;         // called after every drawing (the owner's button shows how many are ticked)
  var sessionOk = null;        // which earlier sessions are offered as buttons (null = all of them)

  function playerMatches(d, needle) {
    return !needle || d.name.toLowerCase().indexOf(needle) !== -1 || (d.link || '').toLowerCase().indexOf(needle) !== -1
      || FA.tagsOf(d).some(function (t) { return t.toLowerCase().indexOf(needle) !== -1; });
  }

  // Every known player, whoever joined a session most recently first (a player who never joined one comes
  // last, by name). The date is not used to leave anybody out.
  function byLastJoined() {
    return FA.directory.slice().sort(function (a, b) {
      var x = a.lastJoined || '', y = b.lastJoined || '';
      if (x !== y) return x < y ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  // The ticked players in the order of the list.
  function ids() {
    return byLastJoined().filter(function (d) { return ticked[d.id]; }).map(function (d) { return d.id; });
  }

  // Starts the picker afresh and puts it in "host" (the new-session sheet's page 2 when none is given).
  // opts: host, session (an earlier session to start on), sessions (which earlier sessions to offer), onChange.
  function open(opts) {
    opts = opts || {};
    (opts.host || homeBox).appendChild(root);
    ticked = {};
    filter = '';
    session = '';
    tag = '';
    members = {};
    loading = false;
    sessionOk = opts.sessions || null;
    onChange = opts.onChange || null;
    FA.el('srcSearch').value = '';
    if (opts.session) pickSession(opts.session); else render();
  }

  // Back to its own place (page 2 of the new-session sheet).
  function home() {
    if (root.parentNode !== homeBox) homeBox.appendChild(root);
  }

  function inPickedSession(d) {
    if (!session) return true;
    var m = members[session];
    return !!m && !!m[d.id];
  }

  function inPickedTag(d) { return !tag || FA.tagsOf(d).indexOf(tag) !== -1; }

  // The players shown: every known player who matches the search, the picked session and the picked tag.
  function shown() {
    var needle = filter.trim().toLowerCase();
    return byLastJoined().filter(function (d) { return playerMatches(d, needle) && inPickedSession(d) && inPickedTag(d); });
  }

  function render() {
    var list = FA.el('srcList');
    var scrolled = list.scrollTop;
    list.textContent = '';
    var rows = shown();
    renderSessions();
    renderTags();
    if (!rows.length) {
      var none = document.createElement('div');
      none.className = 'msg';
      none.textContent = loading ? 'Loading...' : session || tag ? 'Nobody matches.' : FA.directory.length ? 'No player matches.' : 'There are no players yet.';
      list.appendChild(none);
    }
    rows.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      var on = !!ticked[d.id];
      b.className = on ? 'on' : '';
      b.setAttribute('data-pid', d.id);
      var sq = document.createElement('span');
      sq.className = 'sq';
      if (on) sq.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var who = document.createElement('span');
      who.className = 'srcwho';
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = d.name;
      who.appendChild(nm);
      if (FA.tagsOf(d).length) {
        var lk = document.createElement('span');
        lk.className = 'lk';
        lk.textContent = FA.tagsOf(d).join(' · ');
        who.appendChild(lk);
      }
      var gm = document.createElement('span');
      gm.className = 'gm';
      gm.appendChild(document.createTextNode(d.games + (d.games === 1 ? ' game' : ' games')));
      gm.appendChild(document.createElement('br'));
      gm.appendChild(document.createTextNode(d.lastJoined ? FA.prettyDate(d.lastJoined, true) : 'Not yet'));
      b.appendChild(sq);
      b.appendChild(who);
      b.appendChild(gm);
      list.appendChild(b);
    });
    list.scrollTop = scrolled;
    FA.el('srcCount').textContent = ids().length + ' ticked';
    // "Tick all" works on the players shown (so a search can be ticked in one go); when they are all ticked it unticks them.
    var allOn = rows.length > 0 && rows.every(function (d) { return ticked[d.id]; });
    FA.el('srcAll').textContent = allOn ? 'Untick all' : 'Tick all';
    FA.el('srcAll').hidden = !rows.length;
    if (onChange) onChange();
  }

  // The tags as buttons under "From", the one on the most players first (then by name): pick one to see only the players with it, then
  // "Tick all" ticks them together. Picking the same tag again shows everybody.
  function renderTags() {
    var counts = {};
    FA.directory.forEach(function (d) { FA.tagsOf(d).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    var box = FA.el('srcTags');
    box.textContent = '';
    FA.el('srcTagsRow').hidden = !names.length;
    names.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagfilter' + (tag === t ? ' on' : '');
      b.setAttribute('data-tag', t);
      b.textContent = t + ' ' + counts[t];
      box.appendChild(b);
    });
  }

  FA.el('srcTags').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tag]');
    if (!b) return;
    var t = b.getAttribute('data-tag');
    tag = tag === t ? '' : t;
    render();
  });

  // The earlier sessions as buttons above the list: pick one to see only the players who were in it. What is ticked stays
  // ticked when another one is picked, so players can be gathered from several sessions.
  function renderSessions() {
    var box = FA.el('srcSessions');
    box.textContent = '';
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'tagfilter' + (session ? '' : ' on');
    all.setAttribute('data-sid', '');
    all.textContent = 'All players';
    box.appendChild(all);
    FA.sessions.forEach(function (x) {
      if (sessionOk && !sessionOk(x)) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagfilter' + (session === x.id ? ' on' : '');
      b.setAttribute('data-sid', x.id);
      b.textContent = FA.dayText(x.date, true);
      box.appendChild(b);
    });
  }

  // Narrows the list to the players who were in that earlier session ('' = everybody). Who was in it is asked for once.
  function pickSession(id) {
    session = id;
    if (!session || members[session]) { render(); return; }
    var asked = session;
    loading = true;
    render();
    FeesCore.api('GET', '/sessions/' + encodeURIComponent(asked) + '/players', undefined, null)
      .then(function (players) {
        var m = {};
        (players || []).forEach(function (p) { if (p.playerId) m[p.playerId] = true; });
        members[asked] = m;
      })
      .catch(function () { members[asked] = {}; if (session === asked) FeesCore.showError('Could not read that session.'); })
      .then(function () { loading = false; render(); });
  }

  FA.el('srcSessions').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]');
    if (!b) return;
    var id = b.getAttribute('data-sid');
    pickSession(session === id ? '' : id);
  });

  FA.el('srcAll').addEventListener('click', function () {
    var rows = shown();
    var allOn = rows.length > 0 && rows.every(function (d) { return ticked[d.id]; });
    rows.forEach(function (d) { ticked[d.id] = !allOn; });
    render();
  });

  FA.el('srcList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pid]');
    if (!b) return;
    var id = b.getAttribute('data-pid');
    ticked[id] = !ticked[id];
    render();
  });
  FA.el('srcSearch').addEventListener('input', function () { filter = FA.el('srcSearch').value; render(); });
})();
