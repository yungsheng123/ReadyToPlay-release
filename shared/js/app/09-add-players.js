// The fees page: adding players (search, the Adding players row, guests, creating a new player).
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.lastSessionWithPlayers = lastSessionWithPlayers;
  FA.openBringPlayers = openBring;
  FA.knownById = knownById;
  FA.genderMark = genderMark;
  FA.queueList = queueList;
  FA.queueTyped = queueTyped;
  FA.commitQueue = commitQueue;

  // ---- Adding players: search the known ones, or create a new one with its own link -----------------
  FA.pSearch = FA.el('pSearch');
  var pDrop = FA.el('pDrop');
  var pForm = FA.el('pForm');
  FA.pBusy = false;

  function knownById(id) {
    for (var i = 0; i < FA.directory.length; i++) if (FA.directory[i].id === id) return FA.directory[i];
    return null;
  }

  function inSession(id) {
    return FeesCore.getPeople().some(function (p) { return p.playerId === id; });
  }

  function dropButton(cls, act, id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('data-act', act);
    if (id) b.setAttribute('data-id', id);
    return b;
  }

  function textSpan(cls, text) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  // The gender being added (the male / female buttons in the suggestions); it goes back to male after each player is added.
  var addGender = 'M';

  function genderMark(g) {
    var mark = document.createElement('i');
    mark.className = 'gmark ' + (g === 'F' ? 'f' : 'm');
    mark.textContent = g === 'F' ? '\u2640\ufe0e' : '\u2642\ufe0e';
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', g === 'F' ? 'Female' : 'Male');
    return mark;
  }

  // Suggestions under the search box: "Create new player" first, then known players whose name or link
  // contains what was typed.
  function renderDrop() {
    var typed = FA.pSearch.value.trim();
    if (!typed || !pForm.hidden) { pDrop.hidden = true; return; }
    var key = typed.toLowerCase();
    var found = FA.directory.filter(function (d) {
      return d.name.toLowerCase().indexOf(key) !== -1 || d.link.toLowerCase().indexOf(key) !== -1;
    }).slice(0, 6);

    pDrop.textContent = '';
    // Who is being added: male or female (a player already known keeps the gender saved for them).
    pDrop.appendChild(textSpan('glabel', 'Who is \u201c' + typed + '\u201d?'));
    var gpick = document.createElement('div');
    gpick.className = 'gpick inline';
    [['M', '\u2642 Male'], ['F', '\u2640 Female']].forEach(function (g) {
      var gb = dropButton('gbtn ' + g[0].toLowerCase() + (addGender === g[0] ? ' on' : ''), 'gender');
      gb.setAttribute('data-g', g[0]);
      gb.setAttribute('aria-pressed', addGender === g[0] ? 'true' : 'false');
      gb.textContent = g[1];
      gpick.appendChild(gb);
    });
    pDrop.appendChild(gpick);
    // A guest: only in this session, with no unique link and not on the ranking.
    var guestBtn = dropButton('make', 'guest');
    var gplus = textSpan('plus', '+');
    var gtxt = document.createElement('span');
    gtxt.className = 'txt';
    gtxt.appendChild(textSpan('nm', 'Add \u201c' + typed + '\u201d as guest'));
    gtxt.appendChild(textSpan('sub', 'Goes into the Adding players row first'));
    guestBtn.appendChild(gplus);
    guestBtn.appendChild(gtxt);
    pDrop.appendChild(guestBtn);

    if (!found.length) pDrop.appendChild(textSpan('none', 'No known player matches'));
    found.forEach(function (d) {
      var here = inSession(d.id);
      var queued = inQueue(d.id);
      var b = dropButton(here ? 'on' : queued ? 'picked' : '', 'pick', d.id);
      if (here) b.disabled = true;
      var left = document.createElement('span');
      var knownName = textSpan('nm', d.name);
      knownName.appendChild(FA.genderMark(d.gender));
      left.appendChild(knownName);
      if (FA.tagsOf(d).length) left.appendChild(textSpan('lk', FA.tagsOf(d).join(' \u00b7 ')));
      b.appendChild(left);
      b.appendChild(textSpan('gm', here ? 'Already added' : queued ? '\u2713 Picked' : d.games + (d.games === 1 ? ' game' : ' games')));
      pDrop.appendChild(b);
    });
    pDrop.hidden = false;
  }

  function showFormError(text, existing) {
    FA.el('pfErrText').textContent = text;
    var use = FA.el('pfUse');
    use.hidden = !existing;
    if (existing) { use.textContent = 'Add ' + existing.name + ' instead'; use.setAttribute('data-id', existing.id); }
    FA.el('pfErr').hidden = !text;
  }

  function openForm(name) {
    FA.pSearch.value = '';
    pDrop.hidden = true;
    FA.el('pfName').value = name;
    FA.el('pfLink').value = '';
    showFormError('', null);
    pForm.hidden = false;
    FA.el('pfLink').focus();
  }

  function closeForm() { pForm.hidden = true; }

  // Whatever was typed in the calculator is saved first, because the page is redrawn from the answer; the
  // adding also moves the Regular quantity to the new number of players.
  function afterPlayerChange(request) {
    FA.pBusy = true;
    return FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The calculator numbers could not be saved first');
        return request();
      })
      .then(function (data) {
        closeForm();
        FA.pSearch.value = '';
        pDrop.hidden = true;
        FeesCore.clearError();
        FA.applyAnswer(data);
      });
  }

  // ---- Adding players: tap known players in the search list, or add a typed name as a guest, and they join the "Adding players" row under the
  // search box (each with a small x to take it off again, in the order they were put there); the Add button then puts them all into the
  // session in one call, at the end of the list.
  var queue = [];          // { id } for a known player, { name, gender } for a guest, in the order they were put there
  var queueSession = null; // the session they were picked for

  function inQueue(id) { return queue.some(function (e) { return e.id === id; }); }

  // The queue without any known player who is in the session by now, and emptied when another session is on screen.
  function queueList() {
    if (queueSession !== FA.currentId) { queue = []; queueSession = FA.currentId; }
    queue = queue.filter(function (e) { return e.id ? (!inSession(e.id) && FA.knownById(e.id)) : true; });
    return queue.slice();
  }

  function renderTray() {
    var list = FA.queueList();
    var tray = FA.el('addTray');
    var box = FA.el('trayChips');
    box.textContent = '';
    list.forEach(function (e, i) {
      var label = e.id ? FA.knownById(e.id).name : e.name;
      var chip = document.createElement('span');
      chip.className = 'traychip' + (e.id ? '' : ' guestchip');
      var name = document.createElement('span');
      name.textContent = label;
      chip.appendChild(name);
      if (!e.id) chip.appendChild(textSpan('gtag', 'guest'));
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'trayx';
      x.setAttribute('data-i', String(i));
      x.setAttribute('aria-label', 'Take ' + label + ' off the list to add');
      x.innerHTML = '&times;';
      chip.appendChild(x);
      box.appendChild(chip);
    });
    tray.hidden = !list.length;
    FA.el('btnQuickAdd').textContent = list.length ? 'Add ' + list.length + (list.length === 1 ? ' player' : ' players') : 'Add';
  }

  function toggleQueue(id) {
    if (!id || inSession(id) || !FA.knownById(id)) return;
    FA.queueList();
    if (inQueue(id)) queue = queue.filter(function (e) { return e.id !== id; }); else queue.push({ id: id });
    queueSession = FA.currentId;
    renderTray();
    renderDrop();   // the list stays open: a picked player shows ticked
  }

  // A typed name as a guest (no unique link, not on the ranking): into the Adding players row, not straight into the list.
  function queueGuest(name, gender) {
    name = (name || '').replace(/\s+/g, ' ').trim();
    if (!name) return;
    FA.queueList();
    var again = queue.some(function (e) { return !e.id && e.name.toLowerCase() === name.toLowerCase(); });
    if (again) { AppShell.toast(name + ' is already in the Adding players row.'); return; }
    queue.push({ name: name, gender: gender === 'F' ? 'F' : 'M' });
    queueSession = FA.currentId;
    FA.pSearch.value = '';
    pDrop.hidden = true;
    addGender = 'M';
    renderTray();
    FA.pSearch.focus();
  }

  // What was typed in the search box, put in the row: the known player who has exactly that name, or else a guest.
  // Returns false when nothing was put in the row.
  function queueTyped() {
    var typed = FA.pSearch.value.trim();
    if (!typed) return false;
    var same = FA.directory.filter(function (d) { return d.name.toLowerCase() === typed.toLowerCase(); });
    if (same.length > 1) { renderDrop(); AppShell.toast('Several players have that name. Choose one.'); return false; }
    if (same.length === 1) {
      if (inSession(same[0].id)) { AppShell.toast(same[0].name + ' is already in this session.'); return false; }
      FA.queueList();
      if (!inQueue(same[0].id)) queue.push({ id: same[0].id });
      queueSession = FA.currentId;
      FA.pSearch.value = '';
      pDrop.hidden = true;
      renderTray();
      FA.pSearch.focus();
      return true;
    }
    var before = FA.queueList().length;
    queueGuest(typed, addGender);
    return FA.queueList().length > before;
  }

  function commitQueue() {
    var list = FA.queueList();
    if (FA.pBusy || !list.length) return;
    var entries = list.map(function (e) { return e.id ? { playerId: e.id } : { name: e.name, gender: e.gender }; });
    var knownIds = list.filter(function (e) { return e.id; }).map(function (e) { return e.id; });
    FA.el('btnQuickAdd').disabled = true;
    afterPlayerChange(function () { return FeesCore.api('POST', '/players/add-many', { entries: entries }); })
      .then(function () { knownIds.forEach(FA.markJoined); queue = []; FA.renderPlayers(); })
      .catch(function (err) {
        FeesCore.showError(err.body && (err.body.Message || err.body.message) ? (err.body.Message || err.body.message) : 'Could not add the players. ' + err.message);
      })
      .then(function () { FA.pBusy = false; FA.el('btnQuickAdd').disabled = false; renderTray(); });
  }

  FA.el('addTray').addEventListener('click', function (e) {
    var x = e.target.closest('button.trayx');
    if (!x) return;
    var i = parseInt(x.getAttribute('data-i'), 10);
    var list = FA.queueList();
    queue = list.filter(function (item, n) { return n !== i; });
    renderTray();
    renderDrop();
    e.stopPropagation();
  });
  FA.el('trayClear').addEventListener('click', function () { queue = []; renderTray(); renderDrop(); });

  // The empty session's "Bring players from ..." button: the known players of the most recent session that had some (not a later one).
  function lastSessionWithPlayers() {
    var cur = FA.current();
    var best = null;
    FA.sessions.forEach(function (s) {
      if (!cur || s.id === cur.id || !(s.players > 0) || s.date > cur.date) return;
      if (!best || s.date > best.date) best = s;
    });
    return best;
  }

  // "Bring players" (the empty session's button): the same picker as page 2 of the new-session sheet, in a sheet of its own. It starts on the
  // players of the most recent earlier session that had some; the host ticks who plays again, and Add puts them in the session.
  var bringOverlay = FA.el('bringOverlay');

  function updateBringButton() {
    var n = FA.picker.ids().length;
    FA.el('btnBringAdd').textContent = n ? 'Add ' + n + (n === 1 ? ' player' : ' players') : 'Add players';
  }

  function bringMessage(text, isError) {
    FA.el('bringSub').textContent = text;
    FA.el('bringSub').className = isError ? 'err' : '';
  }

  function openBring() {
    if (FA.pBusy || !bringOverlay) return;
    var from = lastSessionWithPlayers();
    bringMessage('Tick who plays again. They are added to this session.', false);
    FA.picker.open({
      host: FA.el('bringPickerHost'),
      session: from ? from.id : '',
      sessions: function (s) { return s.id !== FA.currentId && s.players > 0; },   // the earlier sessions that had players
      onChange: updateBringButton
    });
    bringOverlay.style.display = 'flex';
  }

  function closeBring() {
    if (!bringOverlay || bringOverlay.style.display !== 'flex') return;
    bringOverlay.style.display = 'none';
    FA.picker.home();   // the picker goes back to the new-session sheet
  }

  function addBrought() {
    var ids = FA.picker.ids();
    if (FA.pBusy) return;
    if (!ids.length) { bringMessage('Tick at least one player.', true); return; }
    var entries = ids.map(function (id) { return { playerId: id }; });
    FA.el('btnBringAdd').disabled = true;
    afterPlayerChange(function () { return FeesCore.api('POST', '/players/add-many', { entries: entries }); })
      .then(function () { ids.forEach(function (id) { FA.markJoined(id); }); closeBring(); FA.renderPlayers(); })
      .catch(function (err) {
        bringMessage('Could not add the players. ' + (err.body && (err.body.Message || err.body.message) ? (err.body.Message || err.body.message) : err.message), true);
      })
      .then(function () { FA.pBusy = false; FA.el('btnBringAdd').disabled = false; });
  }

  if (bringOverlay) {
    FA.el('btnBringCancel').addEventListener('click', closeBring);
    FA.el('btnBringAdd').addEventListener('click', addBrought);
    bringOverlay.addEventListener('click', function (e) { if (e.target === bringOverlay) closeBring(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBring(); });
  }
  function addKnown(id) {
    if (FA.pBusy || inSession(id)) return;
    afterPlayerChange(function () { return FeesCore.api('POST', '/players/add', { playerId: id }); })
      .then(function () { FA.markJoined(id); FA.renderPlayers(); })
      .catch(function (err) {
        FeesCore.showError(err.body && err.body.message ? err.body.message : 'Could not add the player. ' + err.message);
      })
      .then(function () { FA.pBusy = false; });
  }

  function createPlayer() {
    if (FA.pBusy) return;
    var name = FA.el('pfName').value.trim();
    var link = FA.el('pfLink').value.trim();
    if (!name) { showFormError('Enter a name.', null); return; }
    if (!link) { showFormError('Type the player\u2019s unique link first.', null); return; }
    showFormError('', null);
    afterPlayerChange(function () { return FeesCore.api('POST', '/players/create', { name: name, link: link }); })
      .catch(function (err) {
        if (err.status === 409 && err.body) showFormError(err.body.message || 'That link is already used.', err.body.existing);
        else showFormError('Could not add the player. ' + err.message, null);
      })
      .then(function () { FA.pBusy = false; });
  }

  FA.pSearch.addEventListener('input', renderDrop);
  FA.pSearch.addEventListener('focus', renderDrop);
  pDrop.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'gender') { addGender = b.getAttribute('data-g') === 'F' ? 'F' : 'M'; renderDrop(); e.stopPropagation(); return; }
    if (act === 'guest') queueGuest(FA.pSearch.value.trim(), addGender);
    else toggleQueue(b.getAttribute('data-id'));
    e.stopPropagation();   // (the list is drawn again, so the tapped button is gone before the page-wide click handler looks at it)
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.sbox, #pDrop, #addTray')) pDrop.hidden = true; });
  FA.el('pfCancel').addEventListener('click', closeForm);
  FA.el('pfAdd').addEventListener('click', createPlayer);
  FA.el('pfLink').addEventListener('keydown', function (e) { if (e.key === 'Enter') createPlayer(); });
  FA.el('pfUse').addEventListener('click', function () { addKnown(FA.el('pfUse').getAttribute('data-id')); });
})();
