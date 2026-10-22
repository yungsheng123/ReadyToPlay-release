// The fees page: the new-session sheet (dates, times, overlap and past checks, copy a past session, bring players along).
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.playerMatches = playerMatches;
  FA.nowTimeText = nowTimeText;
  FA.clashOf = clashOf;

  // ---- New session --------------------------------------------------------------------------------
  var sessionOverlay = FA.el('sessionOverlay');
  var sessionSub = FA.el('sessionSub');
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var picked = null;      // the chosen date, 'yyyy-MM-dd'
  var shownMonth = null;  // first day of the month on screen

  function setSessionMessage(text, isError) {
    sessionSub.textContent = text;
    sessionSub.className = isError ? 'err' : '';
  }

  function isoOf(y, m, d) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return y + '-' + two(m + 1) + '-' + two(d);
  }

  var sessSport = '';   // the sport the new session is for (this page's own, unless the host picks the other)

  function hasSession(iso) {
    if (sessSport && sessSport !== FA.SPORT) return false;   // the other sport's days are not known here; the server refuses a taken one
    for (var i = 0; i < FA.sessions.length; i++) if (FA.sessions[i].date === iso) return true;
    return false;
  }

  // Month calendar: today is ringed, the chosen day is filled, days that have passed can't be chosen, and days that already have a session
  // carry a dot (a day can have several sessions, as long as their times do not overlap: checkTimes says when they do).
  function renderCalendar() {
    var y = shownMonth.getFullYear(), m = shownMonth.getMonth();
    FA.el('sessCalMonth').textContent = MONTHS[m] + ' ' + y;
    var grid = FA.el('sessCalGrid');
    grid.textContent = '';
    DAY_LETTERS.forEach(function (letter) {
      var h = document.createElement('div');
      h.className = 'wd';
      h.textContent = letter;
      grid.appendChild(h);
    });
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;   // weeks start on Monday
    for (var i = 0; i < lead; i++) grid.appendChild(document.createElement('div'));
    var days = new Date(y, m + 1, 0).getDate();
    var today = FA.todayIso();
    for (var d = 1; d <= days; d++) {
      var iso = isoOf(y, m, d);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'day' + (iso === today ? ' today' : '') + (iso === picked ? ' sel' : '') + (iso < today ? ' past' : '') + (hasSession(iso) ? ' has' : '');
      b.textContent = String(d);
      b.setAttribute('data-date', iso);
      if (iso < today) { b.title = 'This day has passed'; b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      else if (hasSession(iso)) b.title = 'This day already has a session: choose times that do not overlap it';
      grid.appendChild(b);
    }
    var pick = FA.el('calPick');
    pick.textContent = '';
    if (picked) {
      pick.appendChild(document.createTextNode('New session on '));
      var strong = document.createElement('b');
      strong.textContent = FA.dayText(picked, false);
      pick.appendChild(strong);
    } else {
      pick.textContent = 'Tap a day';
    }
    renderDayStrip();
    // Nothing before this month can be shown: the days there have passed.
    var thisMonth = new Date();
    FA.el('sessCalPrev').disabled = y * 12 + m <= thisMonth.getFullYear() * 12 + thisMonth.getMonth();
    checkTimes();   // the day just chosen may not suit the times typed
  }

  // The next two weeks as a strip of days to tap; a day that already has a session is dotted. The whole month is behind "More dates".
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function renderDayStrip() {
    var strip = FA.el('dayStrip');
    strip.textContent = '';
    var now = new Date();
    for (var i = 0; i < 14; i++) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var iso = isoOf(day.getFullYear(), day.getMonth(), day.getDate());
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dchip' + (iso === picked ? ' sel' : '') + (hasSession(iso) ? ' has' : '');
      b.setAttribute('data-date', iso);
      var wd = document.createElement('span');
      wd.textContent = i === 0 ? 'Today' : WEEKDAYS[day.getDay()];
      var num = document.createElement('b');
      num.textContent = String(day.getDate());
      b.appendChild(wd);
      b.appendChild(num);
      strip.appendChild(b);
    }
  }

  // On a computer there is no swiping: arrows at the ends of the strip (shown only while there are days out of sight) and the mouse wheel move it.
  function updateDayNav() {
    var strip = FA.el('dayStrip');
    FA.el('dayPrev').hidden = strip.scrollLeft <= 1;
    FA.el('dayNext').hidden = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }
  function scrollDays(dir) {
    var strip = FA.el('dayStrip');
    var step = dir * Math.max(120, strip.clientWidth - 60);
    var before = strip.scrollLeft;
    strip.scrollBy({ left: step, behavior: 'smooth' });
    // A browser that does not animate the scroll (or has animations off) gets the jump instead.
    setTimeout(function () { if (strip.scrollLeft === before) strip.scrollLeft = before + step; updateDayNav(); }, 350);
  }
  FA.el('dayPrev').addEventListener('click', function () { scrollDays(-1); });
  FA.el('dayNext').addEventListener('click', function () { scrollDays(1); });
  FA.el('dayStrip').addEventListener('scroll', updateDayNav, { passive: true });
  FA.el('dayStrip').addEventListener('wheel', function (e) {
    var strip = FA.el('dayStrip');
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // a sideways wheel already works
    var before = strip.scrollLeft;
    strip.scrollLeft += e.deltaY;
    if (strip.scrollLeft !== before) e.preventDefault();
    updateDayNav();
  }, { passive: false });
  window.addEventListener('resize', updateDayNav);

  FA.el('dayStrip').addEventListener('click', function (e) {
    var b = e.target.closest('button.dchip');
    if (!b) return;
    picked = b.getAttribute('data-date');
    var parts = picked.split('-');
    shownMonth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    setSessionMessage('Choose the date of the session. It starts with an empty list.', false);
    renderCalendar();
  });
  FA.el('calToggle').addEventListener('click', function () {
    var open = FA.el('calFull').hidden;
    FA.el('calFull').hidden = !open;
    FA.el('calToggle').textContent = open ? 'Fewer dates' : 'More dates';
    FA.el('calToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  FA.el('sessCalGrid').addEventListener('click', function (e) {
    var b = e.target.closest('button.day');
    if (!b || b.disabled) return;
    picked = b.getAttribute('data-date');
    setSessionMessage('Choose the date of the session. It starts with an empty list.', false);
    renderCalendar();
  });
  FA.el('sessCalPrev').addEventListener('click', function () {
    var thisMonth = new Date();
    if (shownMonth.getFullYear() * 12 + shownMonth.getMonth() <= thisMonth.getFullYear() * 12 + thisMonth.getMonth()) return;   // the days before have passed
    shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  FA.el('sessCalNext').addEventListener('click', function () { shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1); renderCalendar(); });

  // New session has two steps when there are known players to bring along: 1 Date, 2 Players. With nobody known
  // yet it is just the date.
  var sessStep = 1;
  var bringing = {};          // ticked known players (by id) to add to the new session
  var srcFilter = '';         // what was typed in the search box of step 2
  var srcSession = '';        // the earlier session the list of step 2 is narrowed to ('' = every known player)
  var srcTag = '';            // the tag the list of step 2 is narrowed to ('' = every known player)
  var srcMembers = {};        // earlier session id -> { known player id: true }, read when that session is first picked
  var srcLoading = false;

  // The players to bring along are this page's own sport's.
  function hasPlayersToBring() { return FA.directory.length > 0 && (!sessSport || sessSport === FA.SPORT); }

  // The sport choice at the top of page 1 (only for a host, and when there is more than one sport).
  function renderSessSports() {
    var box = FA.el('sessSports');
    box.textContent = '';
    if (!FA.owner || FA.catalog.length < 2) { box.hidden = true; return; }
    FA.catalog.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      var added = s.key === FA.SPORT || FA.mySports.some(function (l) { return l.sport === s.key; });
      b.className = 'sportchip' + (s.key === sessSport ? ' on' : '');
      b.setAttribute('data-sport', s.key);
      b.textContent = s.name + (added ? '' : ' +');
      b.title = added ? '' : 'Adds ' + s.name + ' to your account';
      box.appendChild(b);
    });
    box.hidden = false;
  }

  FA.el('sessSports').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sport]');
    if (!b) return;
    sessSport = b.getAttribute('data-sport');
    renderSessSports();
    fillCourtBoxes();
    renderCalendar();
    showSessionStep(1);
  });

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
  function bringingIds() {
    return byLastJoined().filter(function (d) { return bringing[d.id]; }).map(function (d) { return d.id; });
  }

  var sessPicking = false;    // the "Session History" list is showing (copy an earlier session's details)

  function showSessionStep(step) {
    sessStep = step;
    sessPicking = false;
    FA.el('sessPick').hidden = true;
    FA.el('btnSessionCreate').hidden = false;
    FA.el('btnSessHist').hidden = step !== 1 || !FA.sessions.length;
    var two = hasPlayersToBring();
    FA.el('sessSteps').hidden = !two;
    FA.el('sessStep1Tag').className = step === 1 ? 'on' : '';
    FA.el('sessStep2Tag').className = step === 2 ? 'on' : '';
    FA.el('sessStep1').hidden = step !== 1;
    FA.el('sessStep2').hidden = step !== 2;
    FA.el('btnSessionSkip').hidden = step !== 2;
    FA.el('sessionTitle').textContent = step === 2 ? 'Bring players along' : 'New session';
    if (step === 2) {
      FA.el('srcDate').textContent = FA.dayText(picked, false);
      setSessionMessage('Tick who plays again. Optional.', false);
      FA.el('btnSessionCancel').textContent = 'Back';
    } else {
      setSessionMessage('Choose the date of the session. It starts with an empty list.', false);
      FA.el('btnSessionCancel').textContent = 'Cancel';
    }
    updateSessionButtons();
  }

  function updateSessionButtons() {
    var create = FA.el('btnSessionCreate');
    if (sessStep === 2) { var n = bringingIds().length; create.textContent = n ? 'Create session with ' + n + (n === 1 ? ' player' : ' players') : 'Create session'; }
    else create.textContent = hasPlayersToBring() ? 'Next' : 'Create session';
  }

  // Step 2: every known player with a tick square, the most recent joiner first, and what they last did.
  function renderSources() {
    var list = FA.el('srcList');
    var scrolled = list.scrollTop;
    list.textContent = '';
    var needle = srcFilter.trim().toLowerCase();
    var rows = byLastJoined().filter(function (d) { return FA.playerMatches(d, needle) && inPickedSession(d) && inPickedTag(d); });
    renderSourceSessions();
    renderSourceTags();
    if (!rows.length) {
      var none = document.createElement('div');
      none.className = 'msg';
      none.textContent = srcLoading ? 'Loading...' : srcSession || srcTag ? 'Nobody matches.' : FA.directory.length ? 'No player matches.' : 'There are no players yet.';
      list.appendChild(none);
    }
    rows.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      var on = !!bringing[d.id];
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
        lk.textContent = FA.tagsOf(d).join(' \u00b7 ');
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
    FA.el('srcCount').textContent = bringingIds().length + ' ticked';
    // "Tick all" works on the players shown (so a search can be ticked in one go); when they are all ticked it unticks them.
    var allOn = rows.length > 0 && rows.every(function (d) { return bringing[d.id]; });
    FA.el('srcAll').textContent = allOn ? 'Untick all' : 'Tick all';
    FA.el('srcAll').hidden = !rows.length;
    updateSessionButtons();
  }

  // Is this known player in the earlier session the list is narrowed to (or no session is picked)?
  function inPickedSession(d) {
    if (!srcSession) return true;
    var members = srcMembers[srcSession];
    return !!members && !!members[d.id];
  }

  function inPickedTag(d) { return !srcTag || FA.tagsOf(d).indexOf(srcTag) !== -1; }

  // The tags as buttons under "From", the one on the most players first (then by name): pick one to see only the players with it, then
  // "Tick all" ticks them together. Picking the same tag again shows everybody.
  function renderSourceTags() {
    var counts = {};
    FA.directory.forEach(function (d) { FA.tagsOf(d).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    var box = FA.el('srcTags');
    box.textContent = '';
    FA.el('srcTagsRow').hidden = !names.length;
    names.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagfilter' + (srcTag === t ? ' on' : '');
      b.setAttribute('data-tag', t);
      b.textContent = t + ' ' + counts[t];
      box.appendChild(b);
    });
  }

  FA.el('srcTags').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tag]');
    if (!b) return;
    var t = b.getAttribute('data-tag');
    srcTag = srcTag === t ? '' : t;
    renderSources();
  });

  // The earlier sessions as buttons above the list: pick one to see only the players who were in it. What is ticked stays
  // ticked when another one is picked, so players can be gathered from several sessions.
  function renderSourceSessions() {
    var box = FA.el('srcSessions');
    box.textContent = '';
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'tagfilter' + (srcSession ? '' : ' on');
    all.setAttribute('data-sid', '');
    all.textContent = 'All players';
    box.appendChild(all);
    FA.sessions.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagfilter' + (srcSession === x.id ? ' on' : '');
      b.setAttribute('data-sid', x.id);
      b.textContent = FA.dayText(x.date, true);
      box.appendChild(b);
    });
  }

  FA.el('srcSessions').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]');
    if (!b) return;
    var id = b.getAttribute('data-sid');
    srcSession = srcSession === id ? '' : id;
    if (!srcSession || srcMembers[srcSession]) { renderSources(); return; }
    // Who was in that session: asked for once.
    var asked = srcSession;
    srcLoading = true;
    renderSources();
    FeesCore.api('GET', '/sessions/' + encodeURIComponent(asked) + '/players', undefined, null)
      .then(function (players) {
        var members = {};
        (players || []).forEach(function (p) { if (p.playerId) members[p.playerId] = true; });
        srcMembers[asked] = members;
      })
      .catch(function () { srcMembers[asked] = {}; if (srcSession === asked) FeesCore.showError('Could not read that session.'); })
      .then(function () { srcLoading = false; renderSources(); });
  });

  FA.el('srcAll').addEventListener('click', function () {
    var needle = srcFilter.trim().toLowerCase();
    var rows = FA.directory.filter(function (d) { return FA.playerMatches(d, needle) && inPickedSession(d) && inPickedTag(d); });
    var allOn = rows.length > 0 && rows.every(function (d) { return bringing[d.id]; });
    rows.forEach(function (d) { bringing[d.id] = !allOn; });
    renderSources();
  });

  FA.el('srcList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pid]');
    if (!b) return;
    var id = b.getAttribute('data-pid');
    bringing[id] = !bringing[id];
    renderSources();
  });
  FA.el('srcSearch').addEventListener('input', function () { srcFilter = FA.el('srcSearch').value; renderSources(); });

  // The court cost on the sheet is the calculator's Court price and quantity: what is typed here starts the new session's calculator. It begins
  // as the last session's court price and the sport's usual number of courts (for the other sport it is left blank: that sport starts from its own).
  function fillCourtBoxes() {
    var price = FA.el('sessCourt'), qty = FA.el('sessCourtQty');
    if (sessSport && sessSport !== FA.SPORT) { price.value = ''; qty.value = ''; return; }
    var d = (FA.SPORTINFO && FA.SPORTINFO.calc) || FA.DEFAULTS[FA.SPORT] || FA.DEFAULTS.pickleball;
    var last = FA.current() || FA.sessions[0] || null;
    price.value = FA.boxCents(last && last.courtPrice !== undefined && last.courtPrice !== null ? last.courtPrice : d.courtPrice);
    qty.value = FA.boxQty(d.courtQty);
  }
  FeesCore.bindNumberInput(FA.el('sessCourt'));
  FeesCore.bindNumberInput(FA.el('sessCourtQty'));
  function courtBody() { return { courtPrice: FA.centsValue(FA.el('sessCourt')), courtQty: FA.qtyValue(FA.el('sessCourtQty')) }; }

  function openSessionDialog() {
    sessSport = FA.SPORT;
    renderSessSports();
    fillCourtBoxes();
    // Starts on today.
    picked = FA.todayIso();
    var now = new Date();
    shownMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    bringing = {};
    srcFilter = '';
    srcSession = '';
    srcTag = '';
    srcMembers = {};
    srcLoading = false;
    FA.el('srcSearch').value = '';
    FA.el('sessTitle').value = '';
    FA.el('sessLocation').value = '';
    FA.el('sessStart').value = '';
    FA.el('sessEnd').value = '';
    FA.el('sessDesc').value = '';
    FA.el('sessEnd').min = '';
    FA.el('sessStart').classList.remove('bad');
    FA.el('sessEnd').classList.remove('bad');
    renderCalendar();
    FA.el('calFull').hidden = true;
    FA.el('calToggle').textContent = 'More dates';
    FA.el('calToggle').setAttribute('aria-expanded', 'false');
    showSessionStep(1);
    sessionOverlay.style.display = 'flex';
    updateDayNav();
  }

  function closeSessionDialog() { sessionOverlay.style.display = 'none'; }

  // The main button: step 1 goes on to the players (or creates, if there is nobody to bring); step 2 creates.
  function sessionPrimary() {
    if (FA.creating) return;
    if (!picked) { setSessionMessage('Tap a day first.', true); return; }
    if (sessStep === 1 && !checkTimes()) return;
    if (sessStep === 1 && hasPlayersToBring()) {
      showSessionStep(2);
      renderSources();
      return;
    }
    createSession(sessStep === 2 ? bringingIds() : []);
  }

  function sessionBack() {
    if (sessPicking || sessStep === 2) showSessionStep(1); else closeSessionDialog();
  }

  // "Session History" on the new session sheet: this sport's earlier sessions, newest first; choosing one copies its title, time, place, court
  // cost and description into page 1 and puts the date on today.
  function openSessionCopyList() {
    var box = FA.el('sessPick');
    box.textContent = '';
    FA.sessions.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pickrow';
      b.setAttribute('data-sid', s.id);
      var d = document.createElement('b');
      d.textContent = FA.dayText(s.date, false);
      if (s.id === FA.currentId) {
        var tag = document.createElement('i');
        tag.className = 'cur';
        tag.textContent = 'Current';
        d.appendChild(tag);
      }
      b.appendChild(d);
      if (s.title) {
        var t = document.createElement('span');
        t.className = 'pt';
        t.textContent = s.title;
        b.appendChild(t);
      }
      if (FA.whenOf(s)) b.appendChild(FA.iconLine('hl', FA.ICON_CLOCK, FA.whenOf(s)));
      if (s.location) b.appendChild(FA.iconLine('hl', FA.ICON_PIN, s.location));
      box.appendChild(b);
    });
    sessPicking = true;
    box.hidden = false;
    FA.el('sessStep1').hidden = true;
    FA.el('sessStep2').hidden = true;
    FA.el('sessSteps').hidden = true;
    FA.el('btnSessHist').hidden = true;
    FA.el('btnSessionCreate').hidden = true;
    FA.el('btnSessionSkip').hidden = true;
    FA.el('sessionTitle').textContent = 'Copy a session';
    FA.el('btnSessionCancel').textContent = 'Back';
    setSessionMessage('Choose a past session to copy. The date will be today.', false);
  }

  function copySessionInto(s) {
    sessSport = FA.SPORT;
    renderSessSports();
    FA.el('sessTitle').value = s.title || '';
    FA.el('sessLocation').value = s.location || '';
    FA.el('sessStart').value = s.startTime || '';
    FA.el('sessEnd').value = s.endTime || '';
    FA.el('sessDesc').value = s.description || '';
    FA.el('sessCourt').value = FA.boxCents(s.courtPrice);
    FA.el('sessCourtQty').value = FA.boxQty(s.courtQty);
    picked = FA.todayIso();
    var now = new Date();
    shownMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
    showSessionStep(1);
    setSessionMessage('Details copied from ' + FA.prettyDate(s.date, true) + '. Please choose a new date for this session (today is selected for now).', false);
    checkTimes();   // a copied time that has passed today, or one that overlaps a session of that day, replaces the note above
  }

  FA.el('btnSessHist').addEventListener('click', openSessionCopyList);
  FA.el('sessPick').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]');
    if (!b) return;
    var id = b.getAttribute('data-sid');
    var s = null;
    FA.sessions.forEach(function (x) { if (x.id === id) s = x; });
    if (s) copySessionInto(s);
  });

  function createSession(playerIds) {
    if (FA.creating) return;
    var date = picked;
    if (!date) { setSessionMessage('Tap a day first.', true); return; }
    if (!checkTimes()) { showSessionStep(1); checkTimes(); return; }   // (showing page 1 puts the usual note back, so it is said again)
    if (sessSport && sessSport !== FA.SPORT) { createElsewhere(date); return; }
    FA.creating = true;
    setSessionMessage('Creating...', false);
    // The previous session's quantity is saved first, so it can't be lost when the page moves on.
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The number of players could not be saved first');
        return FeesCore.api('POST', '/sessions', {
          date: date, playerIds: playerIds, title: FA.el('sessTitle').value.trim(),
          location: FA.el('sessLocation').value.trim(), startTime: FA.el('sessStart').value, endTime: FA.el('sessEnd').value, description: FA.el('sessDesc').value,
          courtPrice: courtBody().courtPrice, courtQty: courtBody().courtQty
        }, null);
      })
      .then(function (data) {
        closeSessionDialog();
        FeesCore.clearError();
        FA.applyAnswer(data);
        window.scrollTo(0, 0);
        // (If the page did not show the new session, say where it is.)
        if (data && data.session && FA.currentId !== data.session.id) AppShell.notify({ kind: 'add', title: 'Session for ' + FA.prettyDate(data.session.date, true) + ' created', sub: 'Find it under View History, Upcoming' });
      })
      .catch(function (err) {
        if (err.status === 409) { showSessionStep(1); setSessionMessage((err.body && (err.body.message || err.body.Message)) || 'That day already has a session at that time.', true); }
        else if (err.status === 400 && err.body && (err.body.Message || err.body.message)) { showSessionStep(1); setSessionMessage(err.body.Message || err.body.message, true); }   // say what the server did not like
        else setSessionMessage('Could not create the session. ' + err.message, true);
      })
      .then(function () { FA.creating = false; });
  }

  // A session for the other sport: its page is found (or added, the first time, after asking), the session is made there, and the page
  // goes to that sport to show it.
  function createElsewhere(date) {
    var key = sessSport;
    var linked = null;
    FA.mySports.forEach(function (l) { if (l.sport === key) linked = l; });
    if (!linked && !window.confirm('Add ' + FA.sportName(key) + ' to your account?\n\nIt gets its own sessions, players and ledger. Your access codes, logo and QR are copied to it.')) {
      setSessionMessage('Choose the date of the session. It starts with an empty list.', false);
      return;
    }
    FA.creating = true;
    setSessionMessage('Creating...', false);
    var target = null;
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The number of players could not be saved first');
        return linked ? FeesCore.api('POST', '/switch', { code: linked.code }, null) : FeesCore.api('POST', '/add-sport', { sport: key }, null);
      })
      .then(function (t) {
        target = t;
        try { sessionStorage.setItem('autobot.pin.' + t.code, t.token); } catch (e) { }
        return fetch(FA.ROOT + 'api/' + t.sport + '/sessions?u=' + encodeURIComponent(t.code) + '&t=' + encodeURIComponent(t.token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Lean': '1', 'X-Tz-Offset': String(new Date().getTimezoneOffset()) },
          body: JSON.stringify({
            date: date, playerIds: [], title: FA.el('sessTitle').value.trim(),
            location: FA.el('sessLocation').value.trim(), startTime: FA.el('sessStart').value, endTime: FA.el('sessEnd').value, description: FA.el('sessDesc').value,
            courtPrice: courtBody().courtPrice, courtQty: courtBody().courtQty
          })
        });
      })
      .then(function (r) {
        if (r.status === 409 || r.status === 400) {
          return r.json().catch(function () { return null; }).then(function (body) {
            var bad = new Error((body && (body.Message || body.message)) || (r.status === 409 ? 'That day already has a ' + FA.sportName(key) + ' session at that time.' : 'The server did not accept it'));
            bad.status = r.status;
            bad.said = true;   // the server's own words
            throw bad;
          });
        }
        if (!r.ok) throw new Error('The server answered ' + r.status);
        FA.openPage(target);   // the new session is the current one there
      })
      .catch(function (err) {
        FA.creating = false;
        showSessionStep(1);
        if (err.said) setSessionMessage(err.message, true);
        else setSessionMessage('Could not create the session. ' + err.message, true);
      });
  }

  // Minutes since midnight of "HH:mm" (-1 for none), and the part of the day a session takes: from its start (midnight when it has none) to
  // its end (the end of the day when it has none), so a session with no times takes the whole day. Two overlap when each starts before the
  // other ends; one that ends at 8:00 pm and one that starts at 8:00 pm do not. (The server checks the same way.)
  function minutesOf(t) { if (!t) return -1; var q = String(t).split(':'); return parseInt(q[0], 10) * 60 + parseInt(q[1], 10); }
  function spanOf(start, end) { var a = minutesOf(start), b = minutesOf(end); return [a < 0 ? 0 : a, b < 0 ? 1440 : b]; }
  function nowTimeText() { var d = new Date(); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }

  // What to tell the host when the times overlap another session of that day of this page's sport (null when they fit). exceptId: a session
  // being edited.
  function clashOf(date, start, end, exceptId) {
    var mine = spanOf(start, end);
    var hasTimes = minutesOf(start) >= 0 || minutesOf(end) >= 0;
    for (var i = 0; i < FA.sessions.length; i++) {
      var s = FA.sessions[i];
      if (s.date !== date || s.id === exceptId) continue;
      var theirs = spanOf(s.startTime, s.endTime);
      if (!(mine[0] < theirs[1] && theirs[0] < mine[1])) continue;
      var name = s.title ? '\u201c' + s.title + '\u201d' : '';
      var label = (name ? name + ', ' : '') + (FA.whenOf(s) || 'all day');
      if (!hasTimes) return 'That day already has a session (' + label + '). Give this one a start and end time so they do not overlap, or choose another day.';
      if (minutesOf(s.startTime) < 0 && minutesOf(s.endTime) < 0) return 'That day already has a session with no times (' + (name || 'all day') + '). Give it a start and end time first, or choose another day.';
      return 'That time overlaps another session on the same day (' + label + '). Choose times that do not overlap.';
    }
    return null;
  }

  // What is wrong with the date and times on the new session sheet ('' when nothing): the end must be after the start, nothing may be in the
  // past, and the times may not overlap another session of that day. Said as soon as the date or a time is chosen, not only when Create is
  // pressed.
  function sessionProblem() {
    var start = FA.el('sessStart').value, end = FA.el('sessEnd').value;
    if (start && end && end <= start) return 'The end time must be after the start time.';
    var today = FA.todayIso();
    if (picked && picked < today) return 'That date has already passed. Choose today or a later day.';
    if (picked && picked === today) {
      var now = FA.nowTimeText();
      if (start && start < now) return 'The start time has already passed. Choose a time from now on.';
      if (!start && end && end <= now) return 'The end time has already passed. Choose a later time.';
    }
    if (picked && (!sessSport || sessSport === FA.SPORT)) return FA.clashOf(picked, start, end, null) || '';
    return '';
  }

  var timeProblem = '';
  function checkTimes() {
    var start = FA.el('sessStart').value, end = FA.el('sessEnd').value;
    var problem = sessionProblem();
    var onTimes = !!problem && problem.indexOf('date') === -1 && !!(start || end);
    FA.el('sessEnd').min = start || '';
    FA.el('sessStart').classList.toggle('bad', onTimes);
    FA.el('sessEnd').classList.toggle('bad', onTimes);
    if (problem) { setSessionMessage(problem, true); timeProblem = problem; }
    else if (timeProblem && sessionSub.textContent === timeProblem) {
      timeProblem = '';
      setSessionMessage(sessStep === 2 ? 'Tick who plays again. Optional.' : 'Choose the date of the session. It starts with an empty list.', false);
    }
    return !problem;
  }
  ['input', 'change'].forEach(function (name) {
    FA.el('sessStart').addEventListener(name, checkTimes);
    FA.el('sessEnd').addEventListener(name, checkTimes);
  });

  FA.el('btnNewSession').addEventListener('click', openSessionDialog);
  FA.el('btnSessionCancel').addEventListener('click', sessionBack);
  FA.el('btnSessionCreate').addEventListener('click', sessionPrimary);
  FA.el('btnSessionSkip').addEventListener('click', function () { createSession([]); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeSessionDialog();
    FA.closeViewDialog();
    FA.closeTx();
    FA.closeDeleteDialog();
    FA.closeCalc();
    FA.closePm();
  });
})();
