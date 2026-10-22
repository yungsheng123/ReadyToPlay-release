// The fees page: the sport, the state the page keeps (sessions, players, ledger, the session on screen) and small helpers.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.el = el;
  FA.shuttleUnit = shuttleUnit;
  FA.viewOf = viewOf;
  FA.profitOf = profitOf;
  FA.current = current;
  FA.rm = rm;
  FA.dayText = dayText;
  FA.prettyDate = prettyDate;
  FA.prettyTime = prettyTime;
  FA.whenOf = whenOf;
  FA.iconLine = iconLine;
  FA.placeLine = placeLine;
  FA.todayIso = todayIso;

  FA.SPORT = document.body.getAttribute('data-sport') || '';   // an old copy of a page may still carry it; the shared pages learn it below
  FA.SPORTINFO = null;   // the sport's settings from the database: { sport, name, title, logoAlt, emoji, hasShuttle, calc }
  // The prices a calculator starts with when the database cannot say (cents; the server has the same ones, see
  // MongoRepository.Sports.cs). After that a new session starts with the host's last prices.
  FA.DEFAULTS = {
    pickleball: { socialFPrice: 1000, socialMPrice: 1000, adhocFPrice: 1000, adhocMPrice: 1000, courtPrice: 7800, courtQty: 1, tubePrice: null },
    badminton: { socialFPrice: 1500, socialMPrice: 2000, adhocFPrice: 1000, adhocMPrice: 1500, courtPrice: 1600, courtQty: null, tubePrice: 12900 }
  };

  FA.ROOT = window.APP_ROOT != null ? window.APP_ROOT : '../';
  var money = FeesCore.money;
  FA.mySports = [];      // the pages of this account, one per sport the host runs: { sport, name, code } (the owner only)
  FA.others = [];        // the sessions of the account's other sports, for the one list: { id, sport, code, date, location, startTime, endTime, description, profit }
  FA.otherTotals = [];   // what each other sport adds to the total balance: { sport, code, carried, ledgerTotal } (cents)
  FA.otherDirs = {};     // the known players and ranking of the account's other sports, read when Players or Ranking is opened: sport -> { sport, code, directory, ranking }
  FA.pmSport = '';       // Player management: the sport the list is narrowed to ('' = every sport)
  FA.rankSport = '';     // Ranking: the sport it shows ('' = every sport together)
  FA.catalog = [];       // every sport there is to choose from: { key, name } (from the database)
  // newest date first: { id, date: 'yyyy-MM-dd', the calculator (socialFPrice, socialFQty, ... courtPrice, courtQty, tubePrice, shuttleQty, share), profit }, prices in cents
  FA.sessions = [];
  FA.carried = 0;        // profit (cents) of sessions already dropped from the history
  FA.ledger = [];        // latest deposits and withdrawals, newest first: { id, type, amount (cents), remark, at }
  FA.ledgerTotal = 0;    // deposits minus withdrawals over ALL entries, in cents
  FA.ledgerCount = 0;
  FA.directory = [];     // known players (owner only): { id, name, link, games }
  FA.ranking = [];       // top 10 by games, for everyone: { id, name, link, games }
  FA.currentId = null;   // the session on screen: the one created most recently
  FA.creating = false;

  FA.TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.5h10.4M6.2 4.5V3h3.6v1.5M4.2 4.5l.6 8.3h6.4l.6-8.3M6.8 7v3.8M9.2 7v3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function el(id) { return document.getElementById(id); }
  // The cost of one shuttlecock: a tube (12) divided by 12, rounded up to the cent (the server does the same).
  function shuttleUnit(tubeCents) { return tubeCents > 0 ? Math.ceil(tubeCents / 12) : 0; }
  function earningOf(s) {
    return (s.socialFPrice || 0) * (s.socialFQty || 0) + (s.socialMPrice || 0) * (s.socialMQty || 0)
         + (s.adhocFPrice || 0) * (s.adhocFQty || 0) + (s.adhocMPrice || 0) * (s.adhocMQty || 0);
  }
  function costOf(s) { return (s.courtPrice || 0) * (s.courtQty || 0) + FA.shuttleUnit(s.tubePrice) * (s.shuttleQty || 0); }
  FA.AA_STEP = 50;   // AA: how much (cents) both Social prices go up each time (the server has the same, see CalcRules)
  // What a session's calculator holds once its calculation type is applied (the server does the same, see CalcRules.ViewOf). Fixed Rate: the
  // prices stay as they are, whatever the profit or loss. AA: a session that would lose money counts its Regular players as Social (the counts are merged) and
  // raises both Social prices, RM 0.50 at a time, until there is no loss. No type (an older session): earning minus cost.
  function viewOf(s) {
    var v = {
      adjusted: false, raised: 0,
      socialFPrice: s.socialFPrice || 0, socialMPrice: s.socialMPrice || 0, adhocFPrice: s.adhocFPrice || 0, adhocMPrice: s.adhocMPrice || 0,
      socialFQty: s.socialFQty || 0, socialMQty: s.socialMQty || 0, adhocFQty: s.adhocFQty || 0, adhocMQty: s.adhocMQty || 0,
      cost: costOf(s), earning: earningOf(s)
    };
    v.profit = v.earning - v.cost;
    if (s.calcMode === 'aa') {
      var players = v.socialFQty + v.socialMQty + v.adhocFQty + v.adhocMQty;
      if (players > 0) {   // with nobody to charge there is nothing to move
        var female = v.socialFQty + v.adhocFQty, male = v.socialMQty + v.adhocMQty;
        var deficit = v.cost - (v.socialFPrice * female + v.socialMPrice * male);   // negative: it would make a profit
        var perStep = players * FA.AA_STEP;
        // the smallest number of steps (up, or down when it would make a profit) after which there is no loss
        var raise = Math.max(-100000, Math.min(100000, Math.ceil(deficit / perStep)));
        v.adjusted = true;
        v.raised = raise;
        v.socialFPrice = Math.max(0, v.socialFPrice + raise * FA.AA_STEP); v.socialMPrice = Math.max(0, v.socialMPrice + raise * FA.AA_STEP);
        v.socialFQty = female; v.socialMQty = male; v.adhocFQty = 0; v.adhocMQty = 0;
        v.earning = v.socialFPrice * female + v.socialMPrice * male;
        v.profit = v.earning - v.cost;
      }
    }
    return v;
  }
  function profitOf(s) { return FA.viewOf(s).profit; }
  function current() {
    for (var i = 0; i < FA.sessions.length; i++) if (FA.sessions[i].id === FA.currentId) return FA.sessions[i];
    return null;
  }
  function rm(cents) { return (cents < 0 ? '-' : '') + 'RM ' + (Math.abs(cents) / 100).toFixed(2); }

  // A session's date as shown to the host, with "(Today)" after it when it is today.
  function dayText(iso, short) { return FA.prettyDate(iso, short) + (iso === FA.todayIso() ? ' (Today)' : ''); }

  function prettyDate(iso, short) {
    var p = iso.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return d.toLocaleDateString('en-GB', short
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // "19:30" as "7:30 PM".
  function prettyTime(hhmm) {
    var m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return '';
    var h = parseInt(m[1], 10);
    return (h % 12 === 0 ? 12 : h % 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // The time of a session ("7:30 PM \u2013 9:30 PM", "From 7:30 PM", "Until 9:30 PM"), or ''.
  function whenOf(s) {
    if (!s) return '';
    if (s.startTime && s.endTime) return FA.prettyTime(s.startTime) + ' \u2013 ' + FA.prettyTime(s.endTime);
    if (s.startTime) return 'From ' + FA.prettyTime(s.startTime);
    if (s.endTime) return 'Until ' + FA.prettyTime(s.endTime);
    return '';
  }

  FA.ICON_CAL = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  FA.ICON_CLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  FA.ICON_PIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2s4.6-4.1 4.6-7.6a4.6 4.6 0 0 0-9.2 0c0 3.5 4.6 7.6 4.6 7.6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="6.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  // A small line with an icon (time, place, date) for the history rows and the details popup.
  function iconLine(className, icon, text) {
    var line = document.createElement('div');
    line.className = className;
    var ic = document.createElement('span');
    ic.className = 'hic';
    ic.innerHTML = icon;
    var tx = document.createElement('span');
    tx.textContent = text;
    line.appendChild(ic);
    line.appendChild(tx);
    return line;
  }

  // The time and location of a session as one line ("7:30 PM - 9:30 PM · Sports Hall A"), or ''.
  function placeLine(s) {
    var bits = [];
    if (s && s.startTime && s.endTime) bits.push(FA.prettyTime(s.startTime) + ' \u2013 ' + FA.prettyTime(s.endTime));
    else if (s && s.startTime) bits.push('From ' + FA.prettyTime(s.startTime));
    else if (s && s.endTime) bits.push('Until ' + FA.prettyTime(s.endTime));
    if (s && s.location) bits.push(s.location);
    return bits.join(' \u00b7 ');
  }

  function todayIso() {
    var d = new Date();
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  }
})();
