// FeesCore: the saving state, the call to the server (api) and drawing the player list.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.busyWhile = busyWhile;
  FC.api = api;
  FC.render = render;

  // ---- Saving state ----------------------------------------------------------------------------------
  // While anything is being saved, a see-through layer covers the page (with a "Saving..." note if it takes
  // more than a moment), so nothing can be tapped or typed until the server has answered.
  FC.busyCount = 0;
  var busyEl = document.createElement('div');
  busyEl.id = 'busy';
  busyEl.innerHTML = '<div class="pill" role="status"><span class="spin" aria-hidden="true"></span>Saving...</div>';
  document.body.appendChild(busyEl);

  function beginBusy() {
    FC.busyCount++;
    if (FC.busyCount !== 1) return;
    busyEl.classList.add('on');
    document.body.setAttribute('aria-busy', 'true');
    // Drop the cursor out of any box, so the phone keyboard goes away and typing can't carry on.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function endBusy() {
    FC.busyCount = Math.max(0, FC.busyCount - 1);
    if (FC.busyCount !== 0) return;
    busyEl.classList.remove('on');
    document.body.removeAttribute('aria-busy');
  }

  // Keys do nothing while saving (Enter, Escape, ...).
  document.addEventListener('keydown', function (e) {
    if (FC.busyCount > 0) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // Keeps the page locked until the promise has finished, whether it worked or not.
  function busyWhile(promise) {
    beginBusy();
    return promise.then(function (v) { endBusy(); return v; }, function (e) { endBusy(); throw e; });
  }
  // ---------------------------------------------------------------------------------------------------

  // Calls api/<sport><path> with the link code (and the session, when there is one). Pass a scope as the
  // fourth argument to use another session than the current one, or null to send none. Anything that
  // changes data locks the page until it is saved; pass quiet = true for a background save that should not
  // (the calculators save like that while you type).
  function api(method, path, body, scopeOverride, quiet) {
    // The Sub Admin's page is look-only except for marking players paid and picking a session (the server checks this too).
    var adminMay = FC.admin && /\/(paid|mark-paid|select|show-latest)$/.test(path);
    if (FC.readOnly && method !== 'GET' && !adminMay) return Promise.reject(new Error('This page is view only'));
    var s = scopeOverride === undefined ? FC.scope : scopeOverride;
    var url = FC.ROOT + 'api/' + FC.cfg.sport + path + '?' + FC.authQuery() + (s ? '&s=' + encodeURIComponent(s) : '');
    if (method !== 'GET') FC.liveIdle = 0;   // the page is being used: the live look goes back to every 3 seconds
    var locks = method !== 'GET' && !quiet;
    if (locks) beginBusy();
    var request = fetch(url, {
      method: method,
      // X-Lean: this page can use the "only what changed" answers (a server that does not know it sends the whole page's data).
      headers: { 'Content-Type': 'application/json', 'X-Lean': '1', 'X-Tz-Offset': String(new Date().getTimezoneOffset()) },   // the time zone: the server's "today" and "now" are the host's own
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      FC.noteResponse(r);
      if (!r.ok) {
        if (r.status === 401 && FC.gated) FC.relock(true);   // the pass ran out: ask for the code again
        // The server sometimes explains itself (e.g. which player already has a link): keep that in err.body.
        return r.json().catch(function () { return null; }).then(function (body) {
          var e = new Error('Server returned ' + r.status);
          e.status = r.status;
          e.body = body;
          throw e;
        });
      }
      return r.status === 204 || r.headers.get('Content-Length') === '0' ? null : r.json().catch(function () { return null; });
    });
    if (!locks) return request;
    return request.then(function (v) { endBusy(); return v; }, function (e) { endBusy(); throw e; });
  }

  function render() {
    if (!FC.people.length) FC.editing = false;
    FC.grid.classList.toggle('editing', FC.editing);
    FC.grid.classList.toggle('avgrid', !!FC.cfg.tiles && !FC.editing);   // players as an avatar grid, four to a row
    var btnEdit = document.getElementById('btnEdit');   // the old Edit button is gone from the pages: a player is edited from their own popup
    if (btnEdit) { btnEdit.hidden = !FC.people.length || FC.readOnly; btnEdit.textContent = FC.editing ? 'Done' : 'Edit'; }
    FC.grid.textContent = '';
    var tiles = !!FC.cfg.tiles;
    if (!FC.people.length) FC.filter = 'all';
    // Tile pages can narrow the list to the unpaid, the paid, the female or the male players (never while editing).
    var shown = (!tiles || FC.editing || FC.filter === 'all') ? FC.people : FC.people.filter(function (p) {
      if (FC.filter === 'paid') return !!p.paid;
      if (FC.filter === 'unpaid') return !p.paid;
      return (p.gender === 'F' ? 'female' : 'male') === FC.filter;   // (a player saved before gender existed is male)
    });
    if (tiles && !FC.editing && FC.sortMode !== 'default') {
      var order = {};
      FC.people.forEach(function (p, i) { order[p.id] = i; });
      shown = shown.slice().sort(function (a, b) {
        var c = String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase(), undefined, { sensitivity: 'base' });
        if (c === 0) return order[a.id] - order[b.id];   // the same name: the order they were added in
        return FC.sortMode === 'za' ? -c : c;
      });
    }
    shown.forEach(function (p, i) {
      var state = FC.viewOnly ? 'guestp' : (p.paid ? 'paid' : 'unpaid');   // a guest is not shown who has paid: every player looks the same
      var n = document.createElement('span');
      n.className = 'n';
      if (tiles) {
        // Tile: a round avatar with the initials, then the name, a status line and the tags.
        var nameEl = document.createElement('span');
        nameEl.className = 'nm';
        // The gender mark: a blue male sign or a red female sign. In the avatar grid it sits on the corner of the avatar; in edit mode it
        // follows the name (the last word and the sign stay together).
        var mark = document.createElement('i');
        mark.className = 'gmark ' + (p.gender === 'F' ? 'f' : 'm');
        mark.textContent = p.gender === 'F' ? '\u2640\ufe0e' : '\u2642\ufe0e';
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', p.gender === 'F' ? 'Female' : 'Male');
        if (FC.editing) {
          var cut = p.name.lastIndexOf(' ');
          var lastWord = cut === -1 ? p.name : p.name.slice(cut + 1);
          var holder = nameEl;
          if (lastWord.length <= 12) {
            if (cut !== -1) nameEl.appendChild(document.createTextNode(p.name.slice(0, cut + 1)));
            holder = document.createElement('span');
            holder.className = 'last';
            holder.textContent = lastWord;
            nameEl.appendChild(holder);
          } else nameEl.textContent = p.name;
          holder.appendChild(mark);
        } else { nameEl.textContent = p.name; nameEl.title = p.name; }   // (a long name is cut with "..." in the avatar grid; the title has all of it)
        n.appendChild(nameEl);
        if (!FC.viewOnly) {
          var st = document.createElement('small');
          st.className = 'st';
          st.textContent = p.paid ? '\u2713 Paid' + (p.paidBy ? ' \u00b7 ' + (p.paidBy === 'gm' ? 'GM' : 'Admin') : '') : 'Unpaid';
          n.appendChild(st);
        }
      } else {
        n.textContent = (i + 1) + '. ' + p.name;
      }
      var avatar = null;
      if (tiles) {
        avatar = document.createElement('span');
        avatar.className = 'av';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = FC.initialsOf(p.name) || '?';
        if (!FC.editing) avatar.appendChild(mark);
      }
      // A page can show a small second line under the name (pickleball: the player's unique link).
      var subText = FC.cfg.subtitle ? FC.cfg.subtitle(p) : '';
      if (subText) {
        var small = document.createElement('small');
        small.className = 'sub';
        small.textContent = subText;
        n.appendChild(small);
      }
      // A paid player shows who marked them (pickleball): "Marked by GM" (Master Admin) or "Marked by Admin" (Sub Admin).
      if (p.paid && p.paidBy && !tiles && !FC.viewOnly) {
        var by = document.createElement('small');
        by.className = 'by';
        by.textContent = 'Marked by ' + (p.paidBy === 'gm' ? 'GM' : 'Admin');
        n.appendChild(by);
      }

      if (FC.editing) {
        var row = document.createElement('div');
        row.className = 'p ' + state + (tiles ? ' tile' : '') + (FC.cfg.bulkEdit && FC.selected[p.id] ? ' picked' : '');
        var acts = document.createElement('div');
        acts.className = 'acts';
        if (FC.cfg.bulkEdit) {
          // Select mode: tick players (no pencil, no trash: a player is edited from their own popup), then use the bar at the bottom.
          row.setAttribute('data-pid', p.id);
          var tick = FC.iconButton('select', (FC.selected[p.id] ? 'Untick ' : 'Tick ') + p.name, p.id, FC.selected[p.id] ? FC.TICK : '');
          tick.classList.add('chk');
          tick.setAttribute('aria-pressed', FC.selected[p.id] ? 'true' : 'false');
          acts.appendChild(tick);
        } else {
          acts.appendChild(FC.iconButton('rename', 'Rename ' + p.name, p.id, FC.PENCIL));
          acts.appendChild(FC.iconButton('remove', 'Remove ' + p.name, p.id, FC.TRASH));
        }
        if (avatar) row.appendChild(avatar);
        row.appendChild(n);
        row.appendChild(acts);
        FC.grid.appendChild(row);
        return;
      }

      // On a page that is only being looked at, the boxes are plain (not buttons).
      var tappable = !FC.readOnly || FC.admin;
      var b = document.createElement(tappable ? 'button' : 'div');
      b.className = 'p ' + state + (tiles ? ' tile avc' : '');   // avc: a cell of the avatar grid (a dragged copy keeps the class)
      if (tappable) {
        b.type = 'button';
        b.setAttribute('data-id', p.id);
      }
      var s = document.createElement('span');
      s.className = 's';
      if (p.paid) s.innerHTML = FC.TICK;
      s.appendChild(document.createTextNode(p.paid ? 'Paid' : 'Unpaid'));
      if (avatar) b.appendChild(avatar);
      b.appendChild(n);
      if (!tiles && !FC.viewOnly) b.appendChild(s);
      FC.grid.appendChild(b);
    });
    var paidCount = FC.people.filter(function (p) { return p.paid; }).length;
    var pct = FC.people.length ? Math.round(paidCount * 100 / FC.people.length) : 0;
    document.getElementById('paidCount').textContent = paidCount;
    document.getElementById('total').textContent = FC.people.length;
    document.getElementById('barFill').style.width = pct + '%';
    document.getElementById('bar').setAttribute('aria-valuenow', pct);
    var emptyEl = document.getElementById('empty');
    emptyEl.textContent = FC.loading ? 'Loading...' : (FC.people.length && !shown.length ? (FC.filter === 'paid' ? 'Nobody has paid yet.' : FC.filter === 'female' ? 'No female players.' : FC.filter === 'male' ? 'No male players.' : 'Everybody has paid.') : (FC.emptyText || 'No players yet. Search above to add a player.'));
    // The page may show something richer than the plain message (cfg.emptyView(kind) gives an element, or null): kind is "loading",
    // "nosession" (no session yet), "noplayers" (a session with nobody in it) or "filter" (the filter shows nobody).
    if (!shown.length && FC.cfg.emptyView) {
      var kind = FC.loading ? 'loading' : FC.people.length ? 'filter' : FC.emptyText ? 'nosession' : 'noplayers';
      var view = FC.cfg.emptyView(kind);
      if (view) { emptyEl.textContent = ''; emptyEl.appendChild(view); }
    }
    emptyEl.hidden = shown.length > 0;
    document.getElementById('hint').hidden = FC.editing || FC.people.length < 2 || FC.readOnly || FC.filter !== 'all';
    document.getElementById('hint').textContent = FC.sortMode !== 'default' && tiles ? 'Sorted ' + FC.SORT_LABELS[FC.sortMode] + '. Choose Default to drag players into your own order.' : 'Hold a name, then drag to reorder';
    FC.renderChips(paidCount);
    if (FC.cfg.onCounts) FC.cfg.onCounts(paidCount, FC.people.length);
    FC.renderBulkBar();
    FC.noteListChanges();
  }
})();
