// Session calendar for Yung Sheng: a month grid where sessions (a title and an optional remark) can be added,
// changed, deleted and dragged. Only sessions from today on are kept: the server clears older ones whenever the
// calendar is opened. This file is not part of the page when it opens: badminton.js loads it (and calendar.css) the
// first time the Calendar view is shown, then calls SessionCalendar.mount(); later, refresh() brings the sessions
// up to date each time the view is shown again.
window.SessionCalendar = (function () {
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];   // weeks start on Sunday, like the Google Sheet

  function el(id) { return document.getElementById(id); }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(y, m, d) { return y + '-' + two(m + 1) + '-' + two(d); }

  var MAX_REMARK = 100;    // the server enforces the same limit
  var COPY_ICON_UNUSED = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5h7v8h-7zM3.5 10.5v-8h7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  var TICK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var catalog = [];        // the sports to choose from: { key, name } (from the database)
  var sportKey = '';       // the sport chosen in the open popup
  function sportName(key) {
    for (var i = 0; i < catalog.length; i++) if (catalog[i].key === key) return catalog[i].name;
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
  }
  var today, todayIso;
  var view;                // first day of the month on screen
  var sessions = [];
  var opened = {};         // phone view: the sessions whose remark is showing (by id)

  // On a phone each session is a small box with just its title; touching it shows its remark (and an Edit button).
  function isPhone() { return window.matchMedia && window.matchMedia('(max-width: 600px)').matches; }
  var code = '';
  var built = false;
  var editing = null;      // the session being edited, or null when adding
  var saving = false;
  var overlay = null;

  function setToday() {
    today = new Date();
    todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function showError(text) {
    var box = el('calMsg');
    box.textContent = text;
    box.style.display = text ? 'block' : 'none';
  }

  function api(method, path, body) {
    return fetch((window.APP_ROOT != null ? window.APP_ROOT : '../') + 'api/calendar' + path + '?u=' + encodeURIComponent(code) + (window.FeesCore ? FeesCore.tokenParam() : ''), {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      if (window.FeesCore) FeesCore.noteResponse(r);
      if (r.ok) return r.json();
      if (r.status === 401 && window.FeesCore) FeesCore.relock(true);   // the pickleball pass ran out: ask for the code again
      // The server explains a refused request in its "Message" (e.g. "Enter a title.").
      return r.json().catch(function () { return null; }).then(function (b) {
        var e = new Error((b && (b.Message || b.message)) || 'Server returned ' + r.status);
        e.status = r.status;
        throw e;
      });
    });
  }

  // ---- Month and year pickers --------------------------------------------------------------------
  function buildPickers() {
    var month = el('calMonth');
    month.textContent = '';
    MONTHS.forEach(function (name, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = name;
      month.appendChild(o);
    });
    var year = el('calYear');
    year.textContent = '';
    for (var y = today.getFullYear(); y <= today.getFullYear() + 6; y++) {
      var o = document.createElement('option');
      o.value = String(y);
      o.textContent = String(y);
      year.appendChild(o);
    }
  }

  function render() {
    el('calMonth').value = String(view.getMonth());
    el('calYear').value = String(view.getFullYear());

    var y = view.getFullYear(), m = view.getMonth();
    var lead = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var grid = el('calGrid');
    grid.textContent = '';
    var i;
    for (i = 0; i < lead; i++) grid.appendChild(cell('out'));

    var byDate = {};
    sessions.forEach(function (s) { (byDate[s.date] = byDate[s.date] || []).push(s); });
    // On one day the sessions with a start time come first, by that time; then the ones without, as the host ordered them.
    Object.keys(byDate).forEach(function (day) {
      var list = byDate[day];
      list.forEach(function (s, i) { s.__at = i; });
      list.sort(function (a, b) {
        var x = a.startTime || '', y = b.startTime || '';
        if (!!x !== !!y) return x ? -1 : 1;
        if (x !== y) return x < y ? -1 : 1;
        return a.__at - b.__at;
      });
    });

    for (var d = 1; d <= days; d++) {
      var iso = isoOf(y, m, d);
      var c = cell((iso === todayIso ? 'today' : '') + (iso < todayIso ? ' past' : ''));
      c.setAttribute('data-d', iso);
      // The day label (number, and the weekday name that only a phone shows) and, beside or below it, the sessions.
      var label = document.createElement('div');
      label.className = 'daylab';
      var dayName = document.createElement('span');
      dayName.className = 'dayname';
      dayName.textContent = DAYS[new Date(y, m, d).getDay()];
      var num = document.createElement('div');
      num.className = 'num';
      num.textContent = String(d);
      label.appendChild(dayName);
      label.appendChild(num);
      c.appendChild(label);
      var pills = document.createElement('div');
      pills.className = 'pills';
      c.appendChild(pills);
      (byDate[iso] || []).forEach(function (s) {
        // Not a <button>: it holds the Edit button of a phone, and a button can't sit inside a button.
        var pill = document.createElement('div');
        pill.className = 'calpill';
        pill.setAttribute('role', 'button');
        pill.tabIndex = 0;
        pill.setAttribute('data-id', s.id);
        if (opened[s.id] && s.remark) pill.classList.add('open');
        // The sport's small picture on the left (a session made before sports were chosen has none).
        if (s.sport) {
          var icon = FeesCore.sportIcon(s.sport);
          icon.title = sportName(s.sport);
          pill.appendChild(icon);
        }
        pill.appendChild(document.createTextNode((s.location || s.title) + timeSuffix(s)));   // the location (else the name) and the times, e.g. "HOPC (7:00pm-10:00pm)"
        if (s.remark) {
          var line = document.createElement('span');
          line.className = 'emline';
          var text = document.createElement('span');
          text.className = 'emtxt';
          text.textContent = s.remark;
          text.title = s.remark;
          line.appendChild(text);
          pill.appendChild(line);
        }
        // Only a phone shows this: the way to the edit popup once the remark is showing.
        var editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'pedit';
        editButton.textContent = 'Edit';
        pill.appendChild(editButton);
        pills.appendChild(pill);
      });
      grid.appendChild(c);
    }
    var rest = (7 - ((lead + days) % 7)) % 7;
    for (i = 0; i < rest; i++) grid.appendChild(cell('out'));
  }

  // "7:00pm" for "19:00".
  function clockText(hhmm) {
    var parts = String(hhmm).split(':');
    var h = parseInt(parts[0], 10);
    return (h % 12 === 0 ? 12 : h % 12) + ':' + parts[1] + (h < 12 ? 'am' : 'pm');
  }

  // " (7:00pm-10:00pm)" after a session's name; with only a start " (7:00pm)", with only an end " (until 10:00pm)"; nothing without times.
  function timeSuffix(s) {
    if (s.startTime && s.endTime) return ' (' + clockText(s.startTime) + '-' + clockText(s.endTime) + ')';
    if (s.startTime) return ' (' + clockText(s.startTime) + ')';
    if (s.endTime) return ' (until ' + clockText(s.endTime) + ')';
    return '';
  }

  function cell(extra) {
    var c = document.createElement('div');
    c.className = 'calcell ' + extra;
    return c;
  }

  function go(year, month) {
    view = new Date(year, month, 1);
    render();
  }

  // ---- Add / edit dialog --------------------------------------------------------------------------
  function setDialogError(text) {
    el('csErr').textContent = text;
    el('csErr').hidden = !text;
  }

  function openDialog(session, date) {
    editing = session;
    el('csTitle').textContent = session ? 'Edit session' : 'Add session';
    el('csDate').min = todayIso;
    el('csDate').value = session ? session.date : date;
    el('csName').value = session ? session.title : '';
    el('csRemark').value = session ? (session.remark || '') : '';
    el('csStart').value = session ? (session.startTime || '') : '';
    el('csEnd').value = session ? (session.endTime || '') : '';
    el('csDesc').value = session ? (session.description || '') : '';
    // The sport: the session's own, or (for a new one) the sport of the page the calendar is opened from.
    sportKey = session && session.sport ? session.sport : (window.FeesCore && FeesCore.sport()) || (catalog[0] ? catalog[0].key : '');
    renderSportChoice();
    el('csDelete').hidden = !session;
    el('csButtons').hidden = false;
    el('csConfirm').hidden = true;
    setDialogError('');
    overlay.style.display = 'flex';
    el('csName').focus();
  }

  function closeDialog() { overlay.style.display = 'none'; editing = null; }

  // The sport choice in the popup (only when there is more than one sport to choose from).
  function renderSportChoice() {
    var box = el('csSport');
    box.textContent = '';
    el('csSportWrap').hidden = catalog.length < 2;
    catalog.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sportchip' + (s.key === sportKey ? ' on' : '');
      b.setAttribute('data-sport', s.key);
      b.appendChild(FeesCore.sportIcon(s.key));
      b.appendChild(document.createTextNode(s.name));
      box.appendChild(b);
    });
  }

  function save() {
    if (saving) return;
    var date = el('csDate').value;
    var title = el('csName').value.trim();
    var remark = el('csRemark').value.trim();
    if (!title) { setDialogError('Enter a title.'); return; }
    if (remark.length > MAX_REMARK) { setDialogError('That remark is too long (at most ' + MAX_REMARK + ' characters).'); return; }
    if (!date || date < todayIso) { setDialogError('Choose today or a later date.'); return; }
    var startTime = el('csStart').value, endTime = el('csEnd').value, description = el('csDesc').value;
    if (startTime && endTime && endTime <= startTime) { setDialogError('The end time must be after the start time.'); return; }
    saving = true;
    el('csSave').textContent = 'Saving...';
    var body = { date: date, title: title, remark: remark, sport: sportKey, startTime: startTime, endTime: endTime, description: description };
    var request = editing
      ? api('POST', '/sessions/' + encodeURIComponent(editing.id) + '/update', body)
      : api('POST', '/sessions', body);
    request
      .then(function (data) {
        sessions = data.sessions || [];
        // Show the month the session is in.
        var parts = date.split('-');
        view = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
        closeDialog();
        render();
      })
      .catch(function (err) { setDialogError(err.message); })
      .then(function () { saving = false; el('csSave').textContent = 'Save'; });
  }

  function remove() {
    if (saving || !editing) return;
    saving = true;
    el('csYes').textContent = 'Deleting...';
    api('POST', '/sessions/' + encodeURIComponent(editing.id) + '/delete')
      .then(function (data) { sessions = data.sessions || []; closeDialog(); render(); })
      .catch(function (err) { el('csConfirm').hidden = true; el('csButtons').hidden = false; setDialogError(err.message); })
      .then(function () { saving = false; el('csYes').textContent = 'Delete'; });
  }

  // ---- Dragging sessions ---------------------------------------------------------------------------
  // Press and hold a session (on a phone), or just start dragging it (with a mouse), then drop it in another place in its own
  // day to change the order (a session can't be moved to another day: dropping it elsewhere puts it back). The sessions with a start
  // time are kept in the order of their times, so this only orders the ones without. A quick tap still opens the edit popup, and
  // moving early on a phone just scrolls the page.
  var LONG_PRESS_MS = 350;
  var MOVE_TOLERANCE = 8;
  var SCROLL_EDGE = 70;
  var SCROLL_STEP = 14;
  var press = null;
  var drag = null;
  var suppressClick = false;
  var scrollTimer = null;
  var dropCell = null;

  function cancelPress() {
    if (press) { clearTimeout(press.timer); press = null; }
  }

  function positionOf(pill) {
    var cell = pill.closest('.calcell[data-d]');
    var ids = Array.prototype.map.call(cell.querySelectorAll('.calpill'), function (p) { return p.getAttribute('data-id'); });
    return { date: cell.getAttribute('data-d'), index: ids.indexOf(pill.getAttribute('data-id')), ids: ids };
  }

  function startDrag() {
    if (!press) return;
    var pill = press.pill;
    var rect = pill.getBoundingClientRect();
    var ghost = pill.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.removeAttribute('data-id');
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    drag = { pill: pill, ghost: ghost, dx: press.x - rect.left, dy: press.y - rect.top, x: press.x, y: press.y, from: positionOf(pill), valid: true };
    pill.classList.add('ph');
    moveGhost();
    press = null;
    if (navigator.vibrate) navigator.vibrate(15);
    scrollTimer = setInterval(autoScroll, 16);
  }

  function moveGhost() {
    drag.ghost.style.left = (drag.x - drag.dx) + 'px';
    drag.ghost.style.top = (drag.y - drag.dy) + 'px';
  }

  // Moves the dragged session's place to wherever the pointer is: into the day under it, among that day's sessions.
  function placeUnderPointer() {
    var under = document.elementFromPoint(drag.x, drag.y);
    var cell = under && under.closest ? under.closest('.calcell[data-d]') : null;
    // Over any other day (or nothing): dropping here puts the session back where it came from.
    drag.valid = !!cell && cell.getAttribute('data-d') === drag.from.date;
    if (!drag.valid) {
      if (dropCell) { dropCell.classList.remove('drop'); dropCell = null; }
      return;
    }
    if (dropCell !== cell) {
      if (dropCell) dropCell.classList.remove('drop');
      dropCell = cell;
      cell.classList.add('drop');
    }
    var holder = cell.querySelector('.pills');
    var before = null;
    var others = Array.prototype.filter.call(holder.querySelectorAll('.calpill'), function (p) { return p !== drag.pill; });
    // Sessions stacked in a column (wide screens): before the first one the pointer is above the middle of. Side by
    // side in rows (phone): before the first one that is on a line below the pointer, or on its line and to its right.
    var inRows = window.getComputedStyle(holder).flexDirection === 'row';
    for (var i = 0; i < others.length; i++) {
      var r = others[i].getBoundingClientRect();
      var isBefore = inRows
        ? (drag.y < r.top || (drag.y <= r.bottom && drag.x < r.left + r.width / 2))
        : drag.y < r.top + r.height / 2;
      if (isBefore) { before = others[i]; break; }
    }
    if (drag.pill.parentNode === holder && drag.pill.nextSibling === before) return;
    holder.insertBefore(drag.pill, before);
  }

  // Near the top or bottom of the screen the page scrolls, so a session can be carried to a day further away. The
  // calendar's own header is at the top and the master navigation bar (when there is one) is at the bottom.
  function autoScroll() {
    if (!drag) return;
    var head = document.querySelector('#calView header.top');
    var nav = el('masterNav');
    var top = (head ? head.getBoundingClientRect().bottom : 0) + 20;
    var bottom = (nav ? nav.getBoundingClientRect().top : window.innerHeight) - SCROLL_EDGE;
    if (drag.y < top) window.scrollBy(0, -SCROLL_STEP);
    else if (drag.y > bottom) window.scrollBy(0, SCROLL_STEP);
    else return;
    placeUnderPointer();
  }

  function endDrag(cancelled) {
    cancelPress();
    if (!drag) return;
    var d = drag;
    drag = null;
    clearInterval(scrollTimer);
    d.ghost.remove();
    d.pill.classList.remove('ph');
    if (dropCell) { dropCell.classList.remove('drop'); dropCell = null; }
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 80);

    var to = positionOf(d.pill);
    var unchanged = cancelled || !d.valid || (to.date === d.from.date && to.index === d.from.index);
    if (unchanged) { render(); return; }

    var id = d.pill.getAttribute('data-id');
    var previous = sessions;
    // Show the result straight away; it is put back if the server refuses.
    var moved = sessions.filter(function (s) { return s.id === id; })[0];
    var others = sessions.filter(function (s) { return s.id !== id && s.date !== to.date; });
    var copy = {};
    for (var key in moved) if (Object.prototype.hasOwnProperty.call(moved, key)) copy[key] = moved[key];
    copy.date = to.date;
    moved = copy;
    var dayList = to.ids.map(function (sid) {
      return sid === id ? moved : sessions.filter(function (s) { return s.id === sid; })[0];
    }).filter(Boolean);
    sessions = others.concat(dayList).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    render();

    saving = true;
    showError('');
    api('POST', '/sessions/' + encodeURIComponent(id) + '/move', { date: to.date, position: to.index })
      .then(function (data) { sessions = data.sessions || sessions; render(); })
      .catch(function (err) { sessions = previous; render(); showError('Could not move the session. ' + err.message); })
      .then(function () { saving = false; });
  }

  // ---- Building the view ---------------------------------------------------------------------------
  var BODY_HTML =
    '<div id="calMsg" role="alert"></div>' +
    '<div class="calbar">' +
      '<select id="calMonth" aria-label="Month"></select>' +
      '<select id="calYear" aria-label="Year"></select>' +
      '<button type="button" id="calPrev" aria-label="Previous month"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<button type="button" id="calNext" aria-label="Next month"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<span class="grow"></span>' +
      '<button type="button" id="calToday">Today</button>' +
    '</div>' +
    '<div class="caldow" id="calDow"></div>' +
    '<div class="calgrid" id="calGrid"></div>' +
    '<p class="calnote">Click a day to add a session, or a session to change or delete it. Press and hold a session, then drag it to change its order within its day. A day\u2019s sessions are kept in the order of their start times.</p>';

  var DIALOG_HTML =
    '<div id="csDialog" role="dialog" aria-modal="true" aria-labelledby="csTitle">' +
      '<p id="csTitle">Add session</p>' +
      '<label for="csDate">Date</label>' +
      '<input id="csDate" type="date">' +
      '<div id="csSportWrap"><label>Sport</label><div class="cssport" id="csSport" role="group" aria-label="Sport"></div></div>' +
      '<label for="csName">Location / title</label>' +
      '<input id="csName" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Sri Petaling (1,2)">' +
      '<div class="csgrid"><div><label for="csStart">Start time</label><input id="csStart" type="time"></div><div><label for="csEnd">End time</label><input id="csEnd" type="time"></div></div>' +
      '<label for="csDesc">Description <span>(optional)</span></label>' +
      '<textarea id="csDesc" rows="3" maxlength="1000" placeholder="Anything players should know"></textarea>' +
      '<label for="csRemark">Remark <span>(optional)</span></label>' +
      '<input id="csRemark" type="text" maxlength="100" autocomplete="off" placeholder="e.g. Court 3, bring shuttles">' +
      '<p id="csErr" hidden></p>' +
      '<div class="csrow" id="csButtons">' +
        '<span><button type="button" id="csDelete" class="danger-outline" hidden>Delete</button></span>' +
        '<span class="csright">' +
          '<button type="button" id="csCancel">Cancel</button>' +
          '<button type="button" id="csSave" class="primary">Save</button>' +
        '</span>' +
      '</div>' +
      '<div class="csrow" id="csConfirm" hidden>' +
        '<span class="csask">Delete session?</span>' +
        '<span class="csright">' +
          '<button type="button" id="csKeep">Keep</button>' +
          '<button type="button" id="csYes" class="dangerfill">Delete</button>' +
        '</span>' +
      '</div>' +
    '</div>';

  function build(host) {
    host.innerHTML = BODY_HTML;
    overlay = document.createElement('div');
    overlay.id = 'csOverlay';
    overlay.innerHTML = DIALOG_HTML;
    document.body.appendChild(overlay);

    var dow = el('calDow');
    DAYS.forEach(function (d) {
      var h = document.createElement('div');
      h.textContent = d;
      dow.appendChild(h);
    });
    buildPickers();

    el('calMonth').addEventListener('change', function () { go(view.getFullYear(), parseInt(el('calMonth').value, 10)); });
    el('calYear').addEventListener('change', function () { go(parseInt(el('calYear').value, 10), view.getMonth()); });
    el('calPrev').addEventListener('click', function () { go(view.getFullYear(), view.getMonth() - 1); });
    el('calNext').addEventListener('click', function () { go(view.getFullYear(), view.getMonth() + 1); });
    el('calToday').addEventListener('click', function () { go(today.getFullYear(), today.getMonth()); });

    el('calGrid').addEventListener('click', function (e) {
      // The click that ends a drag must not open the popup.
      if (suppressClick) { suppressClick = false; return; }
      var pill = e.target.closest('.calpill');
      if (pill) {
        var id = pill.getAttribute('data-id');
        var found = sessions.filter(function (s) { return s.id === id; })[0];
        if (!found) return;
        // On a phone a session with a remark opens and closes it when touched; Edit opens the popup.
        if (isPhone() && found.remark && !e.target.closest('.pedit')) {
          opened[id] = !opened[id];
          pill.classList.toggle('open', !!opened[id]);
          return;
        }
        openDialog(found, found.date);
        return;
      }
      var c = e.target.closest('.calcell[data-d]');
      // Days before today can't be used: sessions that old are removed.
      if (c && !c.classList.contains('past')) openDialog(null, c.getAttribute('data-d'));
    });

    el('csSport').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sport]');
      if (!b) return;
      sportKey = b.getAttribute('data-sport');
      renderSportChoice();
    });
    el('csSave').addEventListener('click', save);
    el('csCancel').addEventListener('click', closeDialog);
    el('csDelete').addEventListener('click', function () { setDialogError(''); el('csButtons').hidden = true; el('csConfirm').hidden = false; });
    el('csKeep').addEventListener('click', function () { el('csConfirm').hidden = true; el('csButtons').hidden = false; });
    el('csYes').addEventListener('click', remove);
    el('csName').addEventListener('keydown', function (e) { if (e.key === 'Enter') el('csRemark').focus(); });
    el('csRemark').addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.style.display === 'flex') closeDialog(); });

    el('calGrid').addEventListener('pointerdown', function (e) {
      if (e.button > 0 || saving) return;
      var pill = e.target.closest('.calpill');
      if (!pill || e.target.closest('.pedit')) return;   // a tap on a button inside never starts a drag
      press = { pill: pill, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
      if (press.touch) press.timer = setTimeout(startDrag, LONG_PRESS_MS);
    });
    el('calGrid').addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // A session can also be opened from the keyboard.
    el('calGrid').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('calpill')) {
        e.preventDefault();
        e.target.click();
      }
    });
    document.addEventListener('pointermove', function (e) {
      if (press) {
        var moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
        if (press.touch) { if (moved > MOVE_TOLERANCE) cancelPress(); return; }
        if (moved <= 6) return;
        startDrag();   // a mouse starts dragging as soon as it moves
      }
      if (!drag) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      moveGhost();
      placeUnderPointer();
    });
    document.addEventListener('pointerup', function () { endDrag(false); });
    document.addEventListener('pointercancel', function () { endDrag(true); });
    // Once a session is picked up, stop the page scrolling under the finger.
    document.addEventListener('touchmove', function (e) { if (drag) e.preventDefault(); }, { passive: false });

    built = true;
  }

  // Fetches the sessions (the server first clears the ones before today) and puts the calendar into host. The
  // first call builds the calendar; the promise fails, and nothing is built, if the server can't be reached.
  function mount(opts) {
    code = opts.code;
    setToday();
    // The sports to choose from, once.
    fetch((window.APP_ROOT != null ? window.APP_ROOT : '../') + 'api/auth/sports').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.sports) { catalog = data.sports; render(); } }).catch(function () { });
    return api('GET', '/init').then(function (data) {
      if (!built) {
        view = new Date(today.getFullYear(), today.getMonth(), 1);
        build(opts.host);
      }
      sessions = data.sessions || [];
      render();
    });
  }

  // Every time the view is shown again: the day may have changed, and the sessions with it. What is on screen
  // stays if the server can't be reached, and nothing is touched while something is being saved or dragged.
  function refresh() {
    if (!built || saving || drag) return;
    setToday();
    api('GET', '/init')
      .then(function (data) {
        if (saving || drag || editing) return;
        sessions = data.sessions || [];
        buildPickers();
        render();
        showError('');
      })
      .catch(function () { });
  }

  return { mount: mount, refresh: refresh };
})();
