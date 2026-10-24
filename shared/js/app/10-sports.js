// The fees page: the sports of the account and starting the page from the server's answer.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.sportName = sportName;
  FA.multiSport = multiSport;
  FA.sessionState = sessionState;
  FA.renderSessLabel = renderSessLabel;
  FA.renderSportLabels = renderSportLabels;
  FA.openPage = openPage;
  FA.findOther = findOther;
  FA.otherCall = otherCall;
  FA.openOther = openOther;
  FA.applyState = applyState;

  // ---- Sports of the account ----------------------------------------------------------------------
  // A host who runs both sports has one page per sport (own sessions, players, ranking and ledger). The chips under the name go from
  // one to the other; the new-session sheet can start a session in either (adding the sport's page the first time).
  function sportName(key) {
    for (var i = 0; i < FA.catalog.length; i++) if (FA.catalog[i].key === key) return FA.catalog[i].name;
    if (FA.SPORTINFO && FA.SPORTINFO.sport === key) return FA.SPORTINFO.name;
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function multiSport() { return FA.owner && FA.mySports.length > 1; }

  // "Current session", or "Next session" when it is for a later day than today; with the sport's name for a host who runs more than one.
  // "past" (its day has gone), "ended" (today, and its end time has passed), or '' for the session on the page.
  function sessionState(cur) {
    if (!cur) return '';
    var today = FA.todayIso();
    if (cur.date < today) return 'past';
    return cur.date === today && cur.endTime && cur.endTime < FA.nowTimeText() ? 'ended' : '';
  }

  function renderSessLabel() {
    var cur = FA.current();
    var st = FA.sessionState(cur);
    var label = st === 'past' ? 'Past session' : st === 'ended' ? 'Ended session' : cur && cur.date > FA.todayIso() ? 'Next session' : 'Current session';
    FA.el('sessLabelTop').textContent = FA.multiSport() ? label + ' \u00b7 ' + FA.sportName(FA.SPORT) : label;
    var tag = FA.el('sessTag');
    tag.hidden = !st;
    tag.textContent = st === 'past' ? 'Past' : st === 'ended' ? 'Ended' : '';
    tag.className = 'stag ' + st;
    // An older session shown on the page (not the one the page shows by itself): a note, and the way back.
    FA.el('pastBanner').hidden = !(st === 'past' && cur.id !== nextToBeHeldId() && !FA.guest());
  }

  // The session the page shows when none is picked (the same rule as SessionTimes.ChooseCurrent on the server): the soonest session that has not
  // been and gone. On the earliest day from today on that is the earliest start that has not ended; when everything on today has ended the last one
  // stays; with nothing from today on, the session held most recently.
  function nextToBeHeldId() {
    var today = FA.todayIso(), now = FA.nowTimeText();
    var all = FA.sessions.slice();
    function start(s) { return s.startTime || ''; }
    function later(a, b) { return a.date !== b.date ? (a.date < b.date ? 1 : -1) : start(a) !== start(b) ? (start(a) < start(b) ? 1 : -1) : (a.id < b.id ? 1 : -1); }
    function sooner(a, b) { return -later(a, b); }
    var fromToday = all.filter(function (s) { return s.date >= today; });
    if (!fromToday.length) { all.sort(later); return all.length ? all[0].id : null; }
    var day = fromToday.map(function (s) { return s.date; }).sort()[0];
    var onDay = fromToday.filter(function (s) { return s.date === day; });
    if (day === today) {
      var live = onDay.filter(function (s) { return !(s.endTime && s.endTime < now); });
      if (!live.length) { onDay.sort(later); return onDay[0].id; }
      onDay = live;
    }
    onDay.sort(sooner);
    return onDay[0].id;
  }

  // A host who runs more than one sport: the balance and the current session say which sport they are for.
  function renderSportLabels() {
    var multi = FA.multiSport();
    var name = multi ? FA.sportName(FA.SPORT) : '';
    FA.el('balLabel').textContent = 'Total balance';
    FA.renderSessLabel();
    FA.el('histNote').textContent = multi ? 'last 30 sessions of each sport' : 'last 30 sessions';
  }

  // Opens a page of this account. The server gives a pass for it (no code to type again); it is kept for this tab like the one the page's own
  // code gives.
  function openPage(target) {
    try { sessionStorage.setItem('autobot.pin.' + target.code, target.token); } catch (e) { }
    location.href = FA.ROOT + 'fees.html?u=' + encodeURIComponent(target.code);
  }

  function findOther(id) {
    for (var i = 0; i < FA.others.length; i++) if (FA.others[i].id === id) return FA.others[i];
    return null;
  }

  // A call to another sport's page of this account (for its sessions in the one list). The server gives a pass for that page when asked; it
  // is kept in memory for a few minutes and asked for again when it has run out.
  var otherPass = {};   // page code -> { token, until }
  function otherCall(row, method, path, body) {
    function pass() {
      var p = otherPass[row.code];
      if (p && p.until > Date.now()) return Promise.resolve(p.token);
      return FeesCore.api('POST', '/switch', { code: row.code }, null).then(function (t) {
        otherPass[row.code] = { token: t.token, until: Date.now() + 4 * 60 * 1000 };
        return t.token;
      });
    }
    function send(token) {
      var headers = { 'X-Lean': '1' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      return fetch(FA.ROOT + 'api/' + row.sport + path + '?u=' + encodeURIComponent(row.code) + '&t=' + encodeURIComponent(token), {
        method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (answer) {
          if (r.ok) return answer;
          var e = new Error((answer && (answer.Message || answer.message)) || 'The server answered ' + r.status);
          e.status = r.status;
          e.body = answer;
          throw e;
        });
      });
    }
    return pass().then(send).catch(function (err) {
      if (err.status !== 401) throw err;
      delete otherPass[row.code];
      return pass().then(send);
    });
  }

  // A session of another sport, tapped in the list: the page of that sport opens with this session as its current one.
  function openOther(code, sessionId) {
    if (FA.switching) return;
    FA.switching = true;
    FeesCore.clearError();
    var target = null;
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The calculator numbers could not be saved first');
        return FeesCore.api('POST', '/switch', { code: code }, null);
      })
      .then(function (t) {
        target = t;
        return fetch(FA.ROOT + 'api/' + t.sport + '/sessions/' + encodeURIComponent(sessionId) + '/select?u=' + encodeURIComponent(t.code) + '&t=' + encodeURIComponent(t.token), {
          method: 'POST', headers: { 'X-Lean': '1' }
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('The server answered ' + r.status);
        FA.openPage(target);
      })
      .catch(function (err) { FA.switching = false; FeesCore.showError('Could not open that session. ' + err.message); });
  }

  // ---- Start --------------------------------------------------------------------------------------
  // Takes the sessions part of an /init (or new session) response and puts it on screen.
  function applyState(data) {
    FA.sessions = data.sessions || [];
    FA.carried = data.carried || 0;
    FA.directory = data.directory || [];
    FA.ranking = data.ranking || [];
    FA.ledger = data.ledger || [];
    FA.ledgerTotal = data.ledgerTotal || 0;
    FA.ledgerCount = data.ledgerCount || 0;
    FA.currentId = data.current ? data.current.id : null;
    FA.mySports = data.sports || [];
    FA.others = data.otherSessions || [];
    FA.otherTotals = data.otherTotals || [];
    FA.renderSportLabels();
    FeesCore.setScope(FA.currentId);
    FeesCore.setEmptyText(FA.currentId ? null : 'No session yet. Tap "New session" to start collecting fees.');
    var cur = FA.current();
    // A host with "cost + profit share" rows under Profit (Yung Sheng) gets them; nobody else.
    FA.payRows = !!data.calcPayRows && !FA.guest();
    if (FA.el('cPay')) FA.el('cPay').hidden = !FA.payRows;
    FA.pending = null;
    FA.showCalc(cur);
    FA.guestCode = FA.owner && data.guestCode ? data.guestCode : '';
    if (FA.owner && data.guestCode) PageMenu.setEye('guest.html?v=' + encodeURIComponent(data.guestCode));
    FA.hasCalendar = !!data.hasCalendar && FA.owner;
    if (FA.hasCalendar && !FA.calendarEnabled) {
      FA.calendarEnabled = true;
      CalendarView.enable({
        name: data.name,
        items: FA.menuKeys,
        onSelect: FA.menuSelect
      });
    }
    FA.renderAll();
    FA.syncPanelHeaders();
  }
})();
