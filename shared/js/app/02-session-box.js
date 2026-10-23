// The fees page: the total balance, the session box (date, labels, Ended/Past tag), the history list and the session summary.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.guest = guest;
  FA.amountText = amountText;
  FA.renderBalance = renderBalance;
  FA.fitDetails = fitDetails;
  FA.openSummary = openSummary;
  FA.renderHistory = renderHistory;
  FA.renderAll = renderAll;

  // ---- Balance, session bar and history ------------------------------------------------------------
  // A guest never receives any amount; wherever money would show, they see this instead.
  FA.HASH = 'RM ####';
  function guest() { return FeesCore.isGuest(); }

  // The Hide button beside Total balance covers the amount (for a screen others can see); it is remembered on this device.
  var SHOW_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  var HIDE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5c1 0 1.9.3 2.7.7M14.5 8S12 12.5 8 12.5c-1 0-1.9-.3-2.7-.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 13.5l11-11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var balanceHidden = false;
  try { balanceHidden = localStorage.getItem('autobot.hideBalance') === '1'; } catch (e) { }
  var hideBtn = FA.el('btnHideBal');

  function paintHideButton() {
    if (!hideBtn) return;
    hideBtn.innerHTML = balanceHidden ? HIDE_ICON : SHOW_ICON;   // the icon shows what the balance is now
    hideBtn.setAttribute('aria-pressed', balanceHidden ? 'true' : 'false');
    hideBtn.setAttribute('aria-label', balanceHidden ? 'Show amounts' : 'Hide amounts');
    hideBtn.title = balanceHidden ? 'Show amounts' : 'Hide amounts';
  }
  if (hideBtn) {
    paintHideButton();
    hideBtn.addEventListener('click', function () {
      balanceHidden = !balanceHidden;
      try { localStorage.setItem('autobot.hideBalance', balanceHidden ? '1' : '0'); } catch (e) { }
      paintHideButton();
      applyMoneyHidden();
    });
  }

  // The Hide button covers the money of the page's history, not only the total balance: each session's profit, the deposits and withdrawals,
  // the older-sessions figure, and the amounts the delete questions mention. The calculator is left as it is: its prices and totals are
  // what the host is working on, so they always show.
  var MASK = 'RM \u2022\u2022\u2022\u2022';
  function amountText(text) { return balanceHidden ? MASK : text; }
  function applyMoneyHidden() { FA.renderBalance(); FA.renderHistory(); renderLedger(); }

  function renderBalance() {
    if (FA.guest()) {
      FA.el('balance').textContent = FA.HASH;
      FA.el('balance').className = '';
      return;
    }
    renderSessionProfit();   // (also while the amounts are hidden: the pill is covered too)
    var total = FA.carried + FA.ledgerTotal;
    FA.sessions.forEach(function (s) { total += s.profit; });
    // The total balance is the whole account's, not one sport's: every other sport's page adds its carried-over profit, its deposits and
    // withdrawals and the profit of its sessions.
    FA.otherTotals.forEach(function (o) { total += o.carried + o.ledgerTotal; });
    FA.others.forEach(function (o) { total += o.profit; });
    var b = FA.el('balance');
    if (balanceHidden) {
      b.textContent = 'RM \u2022\u2022\u2022\u2022';
      b.className = '';
      return;
    }
    b.textContent = FA.rm(total);
    b.className = total < 0 ? 'neg' : '';
  }

  // The current session's profit, as a pill on the top left of the session box (a guest is never shown any amount).
  function renderSessionProfit() {
    var pill = FA.el('sessProfit');
    var cur = FA.current();
    if (!pill) return;
    if (!cur || FA.guest()) { pill.hidden = true; return; }
    var profit = FA.profitOf(cur);
    pill.hidden = false;
    pill.className = 'sprofit ' + (balanceHidden ? 'hash' : profit < 0 ? 'neg' : 'pos');
    pill.textContent = '';
    var k = document.createElement('span');
    k.textContent = 'Profit';
    var v = document.createElement('b');
    v.textContent = FA.amountText(FA.rm(profit));
    pill.appendChild(k);
    pill.appendChild(v);
  }

  var INFO = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="5.1" r="1" fill="currentColor"/></svg>';
  var EYE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  function rowButton(className, act, id, label, html) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.setAttribute('data-act', act);
    b.setAttribute('data-id', id);
    b.setAttribute('aria-label', label);
    if (html) b.innerHTML = html; else b.textContent = label;
    return b;
  }

  // The details under a history row (when and where, then what the host wrote, with its spaces and new lines as typed): a long one is
  // cut after three lines, with "Show more" / "Show less" under it. The button only shows while there is something more to show.
  function detailBlock(place, description) {
    var wrap = document.createElement('div');
    wrap.className = 'detwrap';
    var box = document.createElement('div');
    box.className = 'det clamped';
    if (place) {
      var p = document.createElement('small');
      p.className = 'dpl';
      p.textContent = place;
      box.appendChild(p);
    }
    if (description) {
      var d = document.createElement('small');
      d.className = 'dds';
      AppShell.linkify(d, description);   // a web address in it is a link
      box.appendChild(d);
    }
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'detmore';
    more.textContent = 'Show more';
    more.setAttribute('aria-expanded', 'false');
    // Without a screen to measure on (the list is not showing), a guess from the length decides.
    var guess = Math.ceil((place || '').length / 30) + (description || '').split('\n').reduce(function (n, l) { return n + Math.max(1, Math.ceil(l.length / 30)); }, 0);
    more.hidden = guess <= 3;
    more.addEventListener('click', function () {
      var open = box.classList.toggle('clamped') === false;
      more.textContent = open ? 'Show less' : 'Show more';
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.appendChild(box);
    wrap.appendChild(more);
    return wrap;
  }

  // Shows the "Show more" button of exactly the rows whose details are cut (measured, so it follows the screen's width).
  function fitDetails() {
    var boxes = document.querySelectorAll('#histList .det.clamped, #sessionDetail .det.clamped');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (!box.clientHeight) continue;   // not showing right now: the guess stays
      box.parentNode.querySelector('.detmore').hidden = box.scrollHeight <= box.clientHeight + 1;
    }
  }
  if (window.ResizeObserver) new ResizeObserver(FA.fitDetails).observe(document.body);
  else window.addEventListener('resize', FA.fitDetails);

  // The summary of a session (the info button on its history row): how many players, what they paid (earning), what the session cost and the
  // profit. The figures are the calculator's own (viewOf), so they match what the calculator shows for that session; a session of another
  // sport comes with them ready made.
  function summaryOf(s, here) {
    if (here) {
      var v = FA.viewOf(s);
      return { players: v.socialFQty + v.socialMQty + v.adhocFQty + v.adhocMQty, earning: v.earning, cost: v.cost, profit: v.profit };
    }
    return { players: s.players || 0, earning: s.earning || 0, cost: s.cost || 0, profit: s.profit || 0 };
  }

  function openSummary(id, other) {
    var s = other || null;
    if (!other) FA.sessions.forEach(function (x) { if (x.id === id) s = x; });
    if (!s) return;
    var f = summaryOf(s, !other);
    FA.el('sumTitle').textContent = FA.dayText(s.date, false);
    FA.el('sumSub').textContent = [s.title, FA.placeLine(s)].filter(Boolean).join(' \u00b7 ');
    var rows = FA.el('sumRows');
    rows.textContent = '';
    [['Players', String(f.players), ''], ['Earning', FA.amountText(FA.rm(f.earning)), ''], ['Cost', FA.amountText(FA.rm(f.cost)), ''],
     ['Profit', FA.amountText(FA.rm(f.profit)), balanceHidden ? '' : f.profit < 0 ? 'neg' : 'pos']].forEach(function (r, i) {
      var line = document.createElement('div');
      line.className = 'sumrow' + (i === 3 ? ' total' : '');
      var k = document.createElement('span');
      k.textContent = r[0];
      var v = document.createElement('b');
      v.textContent = r[1];
      if (r[2]) v.className = r[2];
      line.appendChild(k);
      line.appendChild(v);
      rows.appendChild(line);
    });
    FA.el('sumOverlay').style.display = 'flex';
  }
  if (FA.el('btnSumClose')) {
    FA.el('btnSumClose').addEventListener('click', function () { FA.el('sumOverlay').style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') FA.el('sumOverlay').style.display = 'none'; });
  }

  // One row per session: the date (with "Current" or, for the owner, a "Make current" link), the profit, a
  // view button for everyone and a delete button for the owner.
  function renderHistory() {
    var list = FA.el('histList');
    list.textContent = '';
    // This page's sessions, and (for a host who runs more than one sport) the other sports' sessions in the same list, newest day first.
    var rows = FA.sessions.map(function (s) { return { s: s, sport: FA.SPORT, here: true }; });
    if (FA.multiSport()) FA.others.forEach(function (o) { rows.push({ s: o, sport: o.sport, here: false, code: o.code }); });
    // Two lists: Upcoming (today and later, the soonest first) and Past (the history, the latest first). A session of today whose end time
    // has passed is over: it is Past (the session box says "Ended" for it).
    var today = FA.todayIso();
    var startOf = function (row) { return row.s.startTime || ''; };
    var isOver = function (row) { return FA.sessionState(row.s) !== ''; };
    var pastRows = rows.filter(isOver);
    var upRows = rows.filter(function (row) { return !isOver(row); });
    pastRows.sort(function (a, b) {
      if (a.s.date !== b.s.date) return a.s.date < b.s.date ? 1 : -1;
      if (startOf(a) !== startOf(b)) return startOf(a) < startOf(b) ? 1 : -1;
      return a.here === b.here ? 0 : a.here ? -1 : 1;
    });
    upRows.sort(function (a, b) {
      if (a.s.date !== b.s.date) return a.s.date < b.s.date ? -1 : 1;
      if (startOf(a) !== startOf(b)) return startOf(a) < startOf(b) ? -1 : 1;
      return a.here === b.here ? 0 : a.here ? -1 : 1;
    });
    var coming = upRows.filter(function (row) { return !(row.here && row.s.id === FA.currentId); });   // the ones the session box is not showing
    var tab = FA.histTab || (coming.length ? 'upcoming' : 'past');
    FA.el('histTabUp').textContent = 'Upcoming ' + upRows.length;
    FA.el('histTabPast').textContent = 'Past ' + pastRows.length;
    FA.el('histTabUp').classList.toggle('on', tab === 'upcoming');
    FA.el('histTabPast').classList.toggle('on', tab === 'past');
    (tab === 'upcoming' ? upRows : pastRows).forEach(function (row) {
      var s = row.s, here = row.here;
      var li = document.createElement('li');
      if (!here) li.className = 'other';
      var left = document.createElement('div');
      left.className = 'what';
      var line = document.createElement('span');
      line.textContent = FA.dayText(s.date, false);
      if (row.sport) {
        var badge = document.createElement('i');
        badge.className = 'sp';
        badge.appendChild(FeesCore.sportIcon(row.sport));
        badge.appendChild(document.createTextNode(FA.sportName(row.sport)));
        line.appendChild(badge);
      }
      var isCurrent = here && s.id === FA.currentId;
      if (isCurrent) {
        var tag = document.createElement('i');
        tag.className = 'cur';
        tag.textContent = 'Current';
        line.appendChild(tag);
      }
      // Who still owes (the host's pages): the current session counts from its live list, the others from what the server counted.
      if (here && !FA.guest() && s.date <= today) {
        if (isCurrent) { var live = FeesCore.getPeople(); s.players = live.length; s.unpaid = live.filter(function (x) { return !x.paid; }).length; }
        if (s.players > 0) {
          var owe = document.createElement('i');
          owe.className = s.unpaid > 0 ? 'utag' : 'ptag';
          owe.textContent = s.unpaid > 0 ? s.unpaid + ' unpaid' : 'All paid';
          line.appendChild(owe);
        }
      }
      left.appendChild(line);
      if (s.title) {
        var heading = document.createElement('small');
        heading.className = 'htitle';
        heading.textContent = s.title;
        left.appendChild(heading);
      }
      if (FA.whenOf(s)) left.appendChild(FA.iconLine('hl', FA.ICON_CLOCK, FA.whenOf(s)));
      if (s.location) left.appendChild(FA.iconLine('hl', FA.ICON_PIN, s.location));
      // Any session can be put on the page (a host or Sub Admin; one of another sport opens that sport's page): a past one too, to settle who has paid.
      if (!isCurrent && !FA.guest()) {
        var showBtn = rowButton('showbtn', here ? 'make' : 'open', s.id, 'Show on page');
        if (!here) showBtn.setAttribute('data-code', row.code);
        left.appendChild(showBtn);
      }

      var right = document.createElement('span');
      right.className = 'right';
      var profit = document.createElement('span');
      profit.className = 'pr ' + (FA.guest() || balanceHidden ? 'hash' : s.profit < 0 ? 'neg' : 'pos');
      profit.textContent = FA.guest() ? FA.HASH : FA.amountText(FA.rm(s.profit));
      if (!FA.guest() && isOver(row)) right.appendChild(profit);   // a guest sees no profit, not even as hashes; a coming session has none to show yet
      // See who came and delete: on every session of the account, whichever sport it belongs to (a session of another sport is reached
      // through that sport's page; its buttons carry the page's code).
      var infoBtn = FA.guest() ? null : rowButton('info', 'info', s.id, 'Summary of ' + FA.prettyDate(s.date, false), INFO);
      var viewBtn = rowButton('view', 'view', s.id, 'See who came on ' + FA.prettyDate(s.date, false), EYE);
      if (!here) { viewBtn.setAttribute('data-code', row.code); if (infoBtn) infoBtn.setAttribute('data-code', row.code); }
      if (infoBtn) right.appendChild(infoBtn);
      right.appendChild(viewBtn);
      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
    if (!list.firstChild) {
      var none = document.createElement('li');
      none.className = 'histnone';
      none.textContent = tab === 'upcoming' ? 'No upcoming sessions. Create one with the + button.' : 'Finished sessions show up here, with who still owes.';
      list.appendChild(none);
    }
    FA.el('btnHistory').hidden = !(pastRows.length || coming.length);   // "View History" is there while there is something to look at
    // The line in the session box: how many are still to come after the one on the page, and when the next is.
    var up = FA.el('sessUpcoming');
    if (up) {
      up.hidden = !coming.length;
      up.removeAttribute('data-next');
      if (coming.length) {
        var nx = coming[0].s;
        if (FA.sessionState(FA.current()) === 'ended' && coming[0].here && !FA.guest()) {
          // The session on the page has ended: the next one is one tap away.
          up.setAttribute('data-next', nx.id);
          FA.el('sessUpText').textContent = 'Next: ' + (nx.date === today ? '' : FA.dayText(nx.date, true) + ' \u00b7 ') + (FA.whenOf(nx) || 'no time set');
          FA.el('sessUpNext').textContent = 'Show next';
        } else {
          FA.el('sessUpText').textContent = 'Upcoming: ' + coming.length + (coming.length === 1 ? ' session' : ' sessions');
          FA.el('sessUpNext').textContent = 'Next: ' + FA.dayText(nx.date, true) + (nx.startTime ? ' \u00b7 ' + FA.prettyTime(nx.startTime) : '');
        }
      }
    }
    FA.fitDetails();
    var older = FA.el('older');
    older.hidden = FA.carried === 0 || FA.guest();
    older.textContent = 'Older sessions: ' + FA.amountText(FA.rm(FA.carried)) + ' (already counted in the total balance)';
  }

  function renderLedger() {
    var list = FA.el('ledgerList');
    list.textContent = '';
    FA.ledger.forEach(function (x) {
      var deposit = x.type === 'deposit';
      var li = document.createElement('li');
      var what = document.createElement('div');
      what.className = 'what';
      var remark = document.createElement('span');
      remark.textContent = x.remark;
      var when = document.createElement('small');
      when.textContent = (deposit ? 'Deposit' : 'Withdrawal') + ' · ' + new Date(x.at).toLocaleString('en-GB',
        { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      what.appendChild(remark);
      what.appendChild(when);
      var right = document.createElement('span');
      right.className = 'right';
      var amount = document.createElement('span');
      amount.className = 'pr ' + (FA.guest() || balanceHidden ? 'hash' : deposit ? 'pos' : 'neg');
      amount.textContent = FA.guest() ? FA.HASH : FA.amountText((deposit ? '+' : '-') + 'RM ' + (x.amount / 100).toFixed(2));
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.setAttribute('data-id', x.id);
      del.setAttribute('aria-label', 'Delete this ' + (deposit ? 'deposit' : 'withdrawal'));
      del.innerHTML = FA.TRASH;
      right.appendChild(amount);
      right.appendChild(del);
      li.appendChild(what);
      li.appendChild(right);
      list.appendChild(li);
    });
    FA.el('ledgerBox').hidden = !FA.ledger.length;
    var more = FA.ledgerCount - FA.ledger.length;
    FA.el('ledgerMore').hidden = more <= 0;
    FA.el('ledgerMore').textContent = 'Plus ' + more + ' earlier ' + (more === 1 ? 'entry' : 'entries') + ' (already counted in the total balance)';
    if (FA.guest()) FA.el('ledgerMore').textContent = 'Plus ' + more + ' earlier ' + (more === 1 ? 'entry' : 'entries');
  }

  // The current session as one box: its title, the date, the time, the place and (cut short, with "Show more") what the host wrote.
  function renderSession() {
    var cur = FA.current();
    FA.el('sessionDate').textContent = cur ? FA.dayText(cur.date, false) : 'No session yet';
    FA.el('sessionLabel').textContent = cur ? FA.prettyDate(cur.date, true) : 'Fee collection';
    var title = FA.el('curTitle');
    title.textContent = cur && cur.title ? cur.title : '';
    title.hidden = !title.textContent;
    var when = cur && cur.startTime && cur.endTime ? FA.prettyTime(cur.startTime) + ' \u2013 ' + FA.prettyTime(cur.endTime)
      : cur && cur.startTime ? 'From ' + FA.prettyTime(cur.startTime) : cur && cur.endTime ? 'Until ' + FA.prettyTime(cur.endTime) : '';
    FA.el('sessTime').textContent = when;
    FA.el('sessTimeLine').hidden = !when;
    FA.el('sessPlace').textContent = cur && cur.location ? cur.location : '';
    FA.el('sessPlaceLine').hidden = !(cur && cur.location);
    var detail = FA.el('sessionDetail');
    detail.textContent = '';
    if (cur && cur.description) detail.appendChild(detailBlock('', cur.description));
    detail.hidden = !detail.firstChild;
    FA.el('btnNewSession').hidden = false;
    FA.renderSessLabel();
    renderSessionProfit();
    FA.el('btnSessMore').hidden = !cur || FA.guest() || FeesCore.isReadOnly();
    if (FA.el('btnSessMore').hidden) FA.closeSessMenu();
    FA.fitDetails();
    // Without a session there is nobody to collect from and nothing to calculate.
    FA.el('listTools').hidden = !cur;
    // With no session there is nothing to calculate.
    FA.refreshMenus();
  }

  function renderAll() {
    FA.renderBalance();
    FA.renderHistory();
    renderLedger();
    FA.renderRanking();
    renderSession();
  }

  // The end time of the session on the page passes while the page is open: the label, the tag and the "Show next" line follow the clock.
  setInterval(function () {
    if (!FA.current() || FA.el('histOverlay').style.display === 'flex') return;
    FA.renderSessLabel();
    FA.renderHistory();
  }, 30000);
})();
