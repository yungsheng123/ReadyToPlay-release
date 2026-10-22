// The fees page: applying the server's answers (the whole page or only what changed).
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.applyAnswer = applyAnswer;
  FA.markJoined = markJoined;
  FA.sortSessions = sortSessions;
  FA.applyDirectoryAnswer = applyDirectoryAnswer;
  FA.refreshDirectory = refreshDirectory;

  // ---- Answers that say only what changed ------------------------------------------------------------
  // A change (a new session, a deposit, a player added or deleted ...) is answered either with the whole page's data (a server that
  // does not know X-Lean: applied as the page opening) or with only what changed, which is merged into what the page already has.
  var LEDGER_SHOWN = 20;

  function applyAnswer(data) {
    if (!data || data.sessions) { FeesCore.applyInit(data); return; }
    applyPatch(data);
  }

  function byName(a, b) { return String(a.name).toLowerCase() < String(b.name).toLowerCase() ? -1 : String(a.name).toLowerCase() > String(b.name).toLowerCase() ? 1 : 0; }

  // A player of the directory is added, or the fields that were saved are put on the one the page has (it keeps the games it has).
  function mergePlayer(pl) {
    var found = false;
    FA.directory.forEach(function (d) {
      if (d.id !== pl.id) return;
      found = true;
      ['name', 'link', 'gender', 'tags'].forEach(function (k) { if (pl[k] !== undefined && pl[k] !== null) d[k] = pl[k]; });
    });
    if (!found) FA.directory.push(pl);
    FA.directory.sort(byName);
    FA.ranking.forEach(function (r) { if (r.id === pl.id) { if (pl.name) r.name = pl.name; if (pl.gender) r.gender = pl.gender; } });
    FeesCore.getPeople().forEach(function (p) { if (p.playerId === pl.id) { if (pl.name) p.name = pl.name; if (pl.gender) p.gender = pl.gender; } });
  }

  // A player was put in the current session: that day is their latest, if it is later than the one the page has.
  function markJoined(id) {
    var cur = FA.current();
    if (!cur || !id) return;
    FA.directory.concat(FA.ranking).forEach(function (d) { if (d.id === id && (!d.lastJoined || d.lastJoined < cur.date)) d.lastJoined = cur.date; });
  }

  // A known player is gone: out of the directory and the ranking; in the lists they stay as a guest (same paid status).
  function removeKnownPlayer(id) {
    FA.directory = FA.directory.filter(function (d) { return d.id !== id; });
    FA.ranking = FA.ranking.filter(function (r) { return r.id !== id; });
    FeesCore.getPeople().forEach(function (p) { if (p.playerId === id) p.playerId = null; });
  }

  // Newest day first; on one day the later start first (the same order the server gives).
  function sortSessions() {
    FA.sessions.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      var x = a.startTime || '', y = b.startTime || '';
      if (x !== y) return x < y ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    });
  }

  function applyPatch(p) {
    var sessionChanged = false;
    if (p.removedSessionId) {
      FA.sessions = FA.sessions.filter(function (x) { return x.id !== p.removedSessionId; });
      FA.directoryStale = true;   // the games of that session no longer count
      sessionChanged = true;
    }
    if (p.session) {
      var had = FA.sessions.filter(function (x) { return x.id === p.session.id; })[0];
      p.session.players = had ? had.players : 0;
      p.session.unpaid = had ? had.unpaid : 0;
      FA.sessions = FA.sessions.filter(function (x) { return x.id !== p.session.id; });
      FA.sessions.push(p.session);
      FA.sortSessions();
      sessionChanged = true;
    }
    if (p.prunedIds && p.prunedIds.length) {
      // Sessions dropped from the history: their profit moves into the older-sessions figure, their games into the players' past games.
      FA.sessions.forEach(function (x) { if (p.prunedIds.indexOf(x.id) !== -1) FA.carried += x.profit; });
      FA.sessions = FA.sessions.filter(function (x) { return p.prunedIds.indexOf(x.id) === -1; });
      FA.directoryStale = true;
    }
    if (p.currentId !== undefined) { FA.currentId = p.currentId; FeesCore.setScope(FA.currentId); sessionChanged = true; }
    if (p.entry) { FA.ledger.unshift(p.entry); if (FA.ledger.length > LEDGER_SHOWN) FA.ledger.length = LEDGER_SHOWN; }
    if (p.ledger) FA.ledger = p.ledger;
    if (p.ledgerTotal !== undefined) FA.ledgerTotal = p.ledgerTotal;
    if (p.ledgerCount !== undefined) FA.ledgerCount = p.ledgerCount;
    if (p.player) mergePlayer(p.player);
    if (p.player && p.people) FA.markJoined(p.player.id);   // a player made while in a session: that session is their first
    if (p.removedPlayerId) removeKnownPlayer(p.removedPlayerId);
    if (sessionChanged) {
      FA.pending = null;   // what was typed in the calculator was saved before the call
      FeesCore.setEmptyText(FA.currentId ? null : 'No session yet. Tap "New session" to start collecting fees.');
    }
    if (p.people) FeesCore.setPeople(p.people, sessionChanged); else FeesCore.render();
    if (sessionChanged) FA.showCalc(FA.current());
    FA.renderAll();
    FA.renderPlayers();
  }

  // The answer of a player edit from Player management: the whole directory (older server) or just the player that was saved or made.
  function applyDirectoryAnswer(data) {
    if (data.directory) { FA.directory = data.directory; FA.ranking = data.ranking || FA.ranking; }
    else if (data.player) mergePlayer(data.player);
  }

  // Reads the known players and the ranking (when something changed since they were last read) and redraws the views that show them.
  function refreshDirectory() {
    if (!FA.directoryStale || FA.guest()) return Promise.resolve();
    FA.directoryStale = false;
    return FeesCore.api('GET', '/directory').then(function (data) {
      FA.directory = data.directory || FA.directory;
      FA.ranking = data.ranking || FA.ranking;
      FA.renderRanking();
      FA.renderPlayers();
    }).catch(function () { FA.directoryStale = true; });
  }
})();
