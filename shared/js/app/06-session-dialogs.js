// The fees page: delete, the session menu, View History, Edit session and the who-came dialog.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.openDeleteDialog = openDeleteDialog;
  FA.closeDeleteDialog = closeDeleteDialog;
  FA.closeSessMenu = closeSessMenu;
  FA.closeViewDialog = closeViewDialog;

  // ---- Delete a session ---------------------------------------------------------------------------
  var deleteOverlay = FA.el('deleteOverlay');
  var deleteSub = FA.el('deleteSub');
  var deleteId = null;
  var deleteKind = 'session';   // 'session', 'entry' (a deposit or withdrawal), 'player' or 'other' (a session of another sport)
  var deleteRow = null;         // for 'other': the session of the other sport
  var deleting = false;

  function setDeleteMessage(text, isError) {
    deleteSub.textContent = text;
    deleteSub.className = isError ? 'err' : '';
  }

  function openDeleteDialog(id, kind, code) {
    if (kind === 'player') {
      var known = FA.knownById(id);
      if (!known) return;
      deleteKind = 'player';
      deleteId = id;
      FA.el('deleteTitle').textContent = 'Delete ' + known.name + '?';
      setDeleteMessage(known.name + ' leaves the player list and the ranking. Their name stays in the session lists as a guest, with the same paid status.', false);
      FA.el('btnDeleteConfirm').textContent = 'Delete player';
      deleteOverlay.style.display = 'flex';
      return;
    }
    if (kind === 'otherplayer') {
      var theirs = FA.findOtherPlayer(code, id);
      if (!theirs) return;
      deleteKind = 'otherplayer';
      deleteId = id;
      deleteRow = { sport: code, code: FA.otherDirs[code].code };
      FA.el('deleteTitle').textContent = 'Delete ' + theirs.name + ' (' + FA.sportName(code) + ')?';
      setDeleteMessage(theirs.name + ' leaves the ' + FA.sportName(code) + ' player list and ranking. Their name stays in that sport\u2019s session lists as a guest, with the same paid status.', false);
      FA.el('btnDeleteConfirm').textContent = 'Delete player';
      deleteOverlay.style.display = 'flex';
      return;
    }
    if (kind === 'entry') {
      var entry = null;
      FA.ledger.forEach(function (x) { if (x.id === id) entry = x; });
      if (!entry) return;
      deleteKind = 'entry';
      deleteId = id;
      FA.el('deleteTitle').textContent = 'Delete this ' + (entry.type === 'deposit' ? 'deposit' : 'withdrawal') + '?';
      setDeleteMessage(FA.amountText('RM ' + (entry.amount / 100).toFixed(2)) + ' (' + entry.remark + ') is removed, and the total balance changes by that amount.', false);
      FA.el('btnDeleteConfirm').textContent = 'Delete';
      deleteOverlay.style.display = 'flex';
      return;
    }
    if (kind === 'other') {
      var o = FA.findOther(id);
      if (!o) return;
      deleteKind = 'other';
      deleteId = id;
      deleteRow = o;
      FA.el('deleteTitle').textContent = 'Delete ' + FA.dayText(o.date, false) + ' (' + FA.sportName(o.sport) + ')?';
      setDeleteMessage('Its player list and its profit of ' + FA.amountText(FA.rm(o.profit)) + ' are removed, and the total balance changes by that amount.', false);
      FA.el('btnDeleteConfirm').textContent = 'Delete session';
      deleteOverlay.style.display = 'flex';
      return;
    }
    var s = null;
    FA.sessions.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return;
    deleteKind = 'session';
    deleteId = id;
    FA.el('deleteTitle').textContent = 'Delete ' + FA.dayText(s.date, false) + '?';
    setDeleteMessage('Its player list and its profit of ' + FA.amountText(FA.rm(s.profit)) + ' are removed, and the total balance changes by that amount.', false);
    FA.el('btnDeleteConfirm').textContent = 'Delete session';
    deleteOverlay.style.display = 'flex';
  }

  function closeDeleteDialog() { deleteId = null; deleteOverlay.style.display = 'none'; }

  function confirmDelete() {
    if (deleting || deleteId === null) return;
    var id = deleteId;
    var kind = deleteKind;
    var row = deleteRow;
    var path = (kind === 'entry' ? '/ledger/' : (kind === 'player' || kind === 'otherplayer') ? '/players/' : '/sessions/') + encodeURIComponent(id) + '/delete';
    deleting = true;
    // Numbers typed for the session being deleted are dropped; anything else waiting is saved first.
    if (deleteKind === 'session' && FA.pending && FA.pending.id === id) FA.pending = null;
    if (FA.saveTimer) clearTimeout(FA.saveTimer);
    FeesCore.busyWhile(FA.saveNow(false))
      .then(function () { return kind === 'other' || kind === 'otherplayer' ? FA.otherCall(row, 'POST', path) : FeesCore.api('POST', path, undefined, null); })
      .then(function (data) {
        FA.closeDeleteDialog();
        FeesCore.clearError();
        if (kind === 'otherplayer') {
          var dir = FA.otherDirs[row.sport];
          dir.directory = dir.directory.filter(function (x) { return x.id !== id; });
          dir.ranking = dir.ranking.filter(function (x) { return x.id !== id; });
          FA.rankSignature = '';
          FA.renderPlayers();
          FA.renderRanking();
          return;
        }
        if (kind === 'other') {
          // The other sport's page answers for itself; this page only drops the row and counts the total balance again.
          FA.others = FA.others.filter(function (x) { return x.id !== id; });
          FA.renderHistory();
          FA.renderBalance();
          return;
        }
        FA.applyAnswer(data);
        if (kind === 'player') FA.renderPlayers();   // Player management shows the list without them
      })
      .catch(function (err) { setDeleteMessage('Could not delete it. ' + err.message, true); })
      .then(function () { deleting = false; });
  }

  FA.el('rankFilter').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sport]');
    if (!b) return;
    FA.rankSport = b.getAttribute('data-sport');
    FA.rankSignature = '';
    FA.renderRanking();
  });
  // ---- The three dots of the session box: Edit session and Delete session ------------------------------------------------------------
  function closeSessMenu() {
    FA.el('sessMenu').hidden = true;
    FA.el('btnSessMore').setAttribute('aria-expanded', 'false');
  }
  FA.el('btnSessMore').addEventListener('click', function (e) {
    e.stopPropagation();
    FA.el('sessMenu').hidden = !FA.el('sessMenu').hidden;
    FA.el('btnSessMore').setAttribute('aria-expanded', FA.el('sessMenu').hidden ? 'false' : 'true');
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.smorewrap')) FA.closeSessMenu(); });
  FA.el('btnDeleteSession').addEventListener('click', function () { FA.closeSessMenu(); if (FA.currentId) FA.openDeleteDialog(FA.currentId); });

  // ---- View History: the session history in a popup --------------------------------------------------------------------------------------
  var histOverlay = FA.el('histOverlay');
  function closeHistory() { histOverlay.style.display = 'none'; }
  FA.histTab = '';   // 'upcoming' or 'past' ('' = Upcoming when there is a coming session, else Past)
  function openHistory(tab) { FA.histTab = tab || ''; FA.renderHistory(); histOverlay.style.display = 'flex'; FA.fitDetails(); }
  FA.el('btnHistory').addEventListener('click', function () { openHistory(''); });
  if (FA.el('sessUpcoming')) FA.el('sessUpcoming').addEventListener('click', function () {
    var next = FA.el('sessUpcoming').getAttribute('data-next');
    if (next) FA.makeCurrent(next); else openHistory('upcoming');
  });
  FA.el('btnBackLatest').addEventListener('click', function () { FA.backToLatest(); });
  FA.el('histTabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    FA.histTab = b.getAttribute('data-tab');
    FA.renderHistory();
  });
  FA.el('btnHistClose').addEventListener('click', closeHistory);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeHistory(); });

  // ---- Edit session: title, times, location, court cost and description of the current session (not its date) ------------------------
  var editOverlay = FA.el('editOverlay');
  var editBusy = false;
  function editMessage(text, isError) {
    FA.el('editSub').textContent = text;
    FA.el('editSub').className = isError ? 'err' : '';
  }
  function closeEdit() { if (editOverlay) editOverlay.style.display = 'none'; }
  function openEdit() {
    var cur = FA.current();
    if (!cur) return;
    FA.el('eTitle').value = cur.title || '';
    FA.el('eStart').value = cur.startTime || '';
    FA.el('eEnd').value = cur.endTime || '';
    FA.el('eLocation').value = cur.location || '';
    FA.el('eCourt').value = FA.boxCents(cur.courtPrice);
    FA.el('eCourtQty').value = FA.boxQty(cur.courtQty);
    FA.el('eDesc').value = cur.description || '';
    FA.el('eStart').classList.remove('bad');
    FA.el('eEnd').classList.remove('bad');
    editMessage('The date cannot be changed. Create a new session for another day.', false);
    editOverlay.style.display = 'flex';
  }
  function saveEdit() {
    var cur = FA.current();
    if (!cur || editBusy) return;
    if (FA.el('eStart').value && FA.el('eEnd').value && FA.el('eEnd').value <= FA.el('eStart').value) { editMessage('The end time must be after the start time.', true); return; }
    var clash = FA.clashOf(cur.date, FA.el('eStart').value, FA.el('eEnd').value, cur.id);
    if (clash) { editMessage(clash, true); return; }
    editBusy = true;
    editMessage('Saving...', false);
    // What was typed in the calculator is saved first (the page is redrawn from the answer).
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The calculator numbers could not be saved first');
        return FeesCore.api('POST', '/sessions/' + encodeURIComponent(cur.id) + '/update', {
          title: FA.el('eTitle').value.trim(), startTime: FA.el('eStart').value, endTime: FA.el('eEnd').value, location: FA.el('eLocation').value.trim(),
          courtPrice: FA.centsValue(FA.el('eCourt')), courtQty: FA.qtyValue(FA.el('eCourtQty')), description: FA.el('eDesc').value
        }, null);
      })
      .then(function (data) {
        if (data && data.session) {
          FA.sessions = FA.sessions.map(function (x) {
            if (x.id !== data.session.id) return x;
            data.session.players = x.players;
            data.session.unpaid = x.unpaid;
            return data.session;
          });
          FA.sortSessions();
          FA.showCalc(FA.current());
          FA.renderAll();
        }
        closeEdit();
      })
      .catch(function (err) {
        if ((err.status === 400 || err.status === 409) && err.body && (err.body.Message || err.body.message)) editMessage(err.body.Message || err.body.message, true);
        else editMessage('Could not save the session. ' + err.message, true);
      })
      .then(function () { editBusy = false; });
  }
  if (editOverlay) {
    FeesCore.bindNumberInput(FA.el('eCourt'));
    FeesCore.bindNumberInput(FA.el('eCourtQty'));
    FA.el('btnEditSession').addEventListener('click', function () { FA.closeSessMenu(); openEdit(); });
    FA.el('btnEditCancel').addEventListener('click', closeEdit);
    FA.el('btnEditSave').addEventListener('click', saveEdit);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeEdit(); });
  }
  FA.el('histList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var id = b.getAttribute('data-id');
    var act = b.getAttribute('data-act');
    var other = b.hasAttribute('data-code') ? FA.findOther(id) : null;   // a session of another sport
    if (act === 'info') FA.openSummary(id, other);
    else if (act === 'view') openViewDialog(id, other);
    else if (act === 'make') { closeHistory(); FA.makeCurrent(id); }
    else if (act === 'open') FA.openOther(b.getAttribute('data-code'), id);
    else FA.openDeleteDialog(id, other ? 'other' : 'session');
  });
  FA.el('ledgerList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (b) FA.openDeleteDialog(b.getAttribute('data-id'), 'entry');
  });
  FA.el('btnDeleteCancel').addEventListener('click', FA.closeDeleteDialog);
  FA.el('btnDeleteConfirm').addEventListener('click', confirmDelete);

  // ---- Who came on a day (open to everyone) --------------------------------------------------------
  var viewOverlay = FA.el('viewOverlay');
  var viewToken = 0;

  function closeViewDialog() { viewToken++; viewOverlay.style.display = 'none'; }

  // The top of the popup: the session's title, date, time and place, then the full description as the host wrote it.
  function fillViewInfo(s) {
    var box = FA.el('viewInfo');
    box.textContent = '';
    if (s.title) {
      var h = document.createElement('div');
      h.className = 'vtitle';
      h.textContent = s.title;
      box.appendChild(h);
    }
    box.appendChild(FA.iconLine('vl vdate', FA.ICON_CAL, FA.dayText(s.date, false)));
    if (FA.whenOf(s)) box.appendChild(FA.iconLine('vl', FA.ICON_CLOCK, FA.whenOf(s)));
    if (s.location) box.appendChild(FA.iconLine('vl', FA.ICON_PIN, s.location));
    FA.el('viewDescWrap').hidden = !s.description;
    AppShell.linkify(FA.el('viewDesc'), s.description || '');   // a web address in it is a link
  }

  function openViewDialog(id, other) {
    var s = other || null;
    if (!other) FA.sessions.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return;
    var token = ++viewToken;
    var sub = FA.el('viewSub');
    var list = FA.el('viewList');
    fillViewInfo(s);
    sub.textContent = 'Loading...';
    sub.className = '';
    list.textContent = '';
    viewOverlay.style.display = 'flex';

    (other ? FA.otherCall(other, 'GET', '/sessions/' + encodeURIComponent(id) + '/players') : FeesCore.api('GET', '/sessions/' + encodeURIComponent(id) + '/players', undefined, null))
      .then(function (players) {
        if (token !== viewToken) return;   // closed, or another day was opened meanwhile
        players = players || [];
        var paid = players.filter(function (p) { return p.paid; }).length;
        sub.textContent = players.length
          ? players.length + (players.length === 1 ? ' player' : ' players') + ' came' + (FA.guest() ? '' : ', ' + paid + ' paid')
          : 'No players were added for this day.';
        // The same look as the current session's list: a round avatar (a ring and a tick for paid, a red ring for unpaid; neutral for a guest),
        // the gender sign on its corner and the name under it.
        players.forEach(function (p) {
          var cell = document.createElement('div');
          cell.className = 'p tile avc ' + (FA.guest() ? 'guestp' : p.paid ? 'paid' : 'unpaid');
          var av = document.createElement('span');
          av.className = 'av';
          av.setAttribute('aria-hidden', 'true');
          av.textContent = FA.initialsOf(p.name) || '?';
          av.appendChild(FA.genderMark(p.gender));
          var n = document.createElement('span');
          n.className = 'n';
          var nm = document.createElement('span');
          nm.className = 'nm';
          nm.textContent = p.name;
          nm.title = p.name;
          n.appendChild(nm);
          cell.appendChild(av);
          cell.appendChild(n);
          cell.setAttribute('aria-label', p.name + (FA.guest() ? '' : p.paid ? ', paid' : ', unpaid'));
          list.appendChild(cell);
        });
      })
      .catch(function (err) {
        if (token !== viewToken) return;
        sub.textContent = 'Could not load the players. ' + err.message;
        sub.className = 'err';
      });
  }

  FA.el('btnViewClose').addEventListener('click', FA.closeViewDialog);
})();
