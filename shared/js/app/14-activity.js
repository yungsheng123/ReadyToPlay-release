// The fees page: the Activity view (Master Admin only): who changed what and when, newest first, kept for 90 days.
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  var overlay = document.getElementById('actOverlay');
  if (!overlay) { FA.openActivity = function () { }; return; }   // (the guest page has no Activity)
  var list = document.getElementById('actList');
  var sub = document.getElementById('actSub');
  var chips = document.getElementById('actChips');
  var GROUPS = { session: 'session', player: 'player', paid: 'paid', money: 'money', access: 'security', security: 'security' };
  var entries = [];
  var filter = 'all';
  var token = 0;

  function dayName(d) {
    var today = new Date();
    var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
    if (same(d, today)) return 'Today';
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (same(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function render() {
    list.textContent = '';
    var shown = entries.filter(function (e) { return filter === 'all' || GROUPS[e.kind] === filter; });
    if (!shown.length) {
      var none = document.createElement('p');
      none.className = 'actnone';
      none.textContent = entries.length ? 'Nothing of this kind in the last 90 days.' : 'Nothing yet. Changes made on this page show up here.';
      list.appendChild(none);
      return;
    }
    var last = '';
    shown.forEach(function (e) {
      var d = new Date(e.at);
      var day = dayName(d);
      if (day !== last) {
        var h = document.createElement('h4');
        h.textContent = day;
        list.appendChild(h);
        last = day;
      }
      var row = document.createElement('div');
      row.className = 'actrow ' + (GROUPS[e.kind] || '');
      var time = document.createElement('span');
      time.className = 'actt';
      time.textContent = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
      var body = document.createElement('div');
      body.className = 'actb';
      var text = document.createElement('span');
      text.textContent = e.text;
      body.appendChild(text);
      if (e.by) {
        var by = document.createElement('i');
        by.textContent = e.by;
        body.appendChild(by);
      }
      row.appendChild(time);
      row.appendChild(body);
      list.appendChild(row);
    });
  }

  function paintChips() {
    Array.prototype.forEach.call(chips.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-k') === filter); });
  }

  function open() {
    var mine = ++token;
    filter = 'all';
    paintChips();
    entries = [];
    list.textContent = '';
    sub.textContent = 'Loading...';
    overlay.style.display = 'flex';
    FeesCore.api('GET', '/activity', undefined, null)
      .then(function (data) {
        if (mine !== token) return;
        entries = (data && data.entries) || [];
        sub.textContent = 'Who changed what, newest first. Kept for ' + ((data && data.keepDays) || 90) + ' days.';
        render();
      })
      .catch(function (err) {
        if (mine !== token) return;
        sub.textContent = err.status === 403 ? 'Only the Master Admin can see this.' : 'Could not load the activity. ' + err.message;
      });
  }
  function close() { overlay.style.display = 'none'; token++; }

  FA.openActivity = open;
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-k]');
    if (!b) return;
    filter = b.getAttribute('data-k');
    paintChips();
    render();
  });
  document.getElementById('btnActClose').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
