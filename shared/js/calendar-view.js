// The Calendar view of a fees page (badminton and pickleball): a view of the page itself, with sessions of the signed-in
// user's own (stored under their code, so every user has a calendar of their own). Nothing of it is fetched until the
// view is first opened: then calendar.css and calendar.js are loaded, the sessions are fetched and the calendar is
// drawn into #calView. Opening it again only shows it and quietly refreshes the sessions.
//
// A page calls CalendarView.enable({ name, items, onSelect }) once it knows the user has a calendar:
//   name        what the calendar's header shows under its title (the logo and QR button are the page's own)
//   items()     the menu keys to offer in the calendar's own header menu (see PageMenu), asked when the view is first built
//   onSelect    what choosing a menu item does (the page's own menu handler)
// (The versions of calendar.css and calendar.js are worked out by the server: nothing to bump.)
window.CalendarView = (function () {
  var ROOT = window.APP_ROOT != null ? window.APP_ROOT : '../';
  // The version of each file comes from the page (window.ASSET_V, put there by StampedHtmlHandler), so a changed file is fetched at once.
  function asset(path) { var v = window.ASSET_V && window.ASSET_V[path]; return ROOT + path + (v ? '?v=' + v : ''); }
  var CSS = asset('shared/css/calendar.css');
  var JS = asset('shared/js/calendar.js');

  var opts = null;
  var body = null;
  var mounted = false;
  var loading = false;
  var files = null;

  function loadFiles() {
    if (files) return files;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS;
    var script = document.createElement('script');
    script.src = JS;
    files = new Promise(function (resolve, reject) {
      script.onload = resolve;
      script.onerror = function () { reject(new Error('The calendar files could not be fetched.')); };
      document.head.appendChild(link);
      document.head.appendChild(script);
    }).catch(function (err) {
      link.remove();
      script.remove();
      files = null;
      throw err;
    });
    return files;
  }

  function build() {
    var host = document.getElementById('calView');
    host.innerHTML = '<header class="top"><div class="in"><div class="head"><div class="brand">'
      + '<img class="logo" alt="" width="52" height="52"><div><h1>Session calendar</h1><div class="who"></div></div></div>'
      + '<div class="hbtns"></div></div></div></header><main class="calmain"></main>';
    host.querySelector('.who').textContent = opts.name || '';
    var buttons = host.querySelector('.hbtns');
    PageMenu.render({ host: buttons, active: 'calendar', items: opts.items(), onSelect: opts.onSelect });
    PageMenu.decorate(buttons);
    body = host.querySelector('main');
    FeesCore.updatePictures({});   // this header's logo and QR button, like the page's own
  }

  function note(text, retry) {
    body.textContent = '';
    var p = document.createElement('p');
    p.className = 'viewload';
    p.textContent = text;
    if (retry) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Try again';
      b.addEventListener('click', open);
      p.appendChild(b);
    }
    body.appendChild(p);
  }

  function open() {
    if (!body) build();
    if (mounted) { SessionCalendar.refresh(); return; }
    if (loading) return;
    loading = true;
    note('Loading the calendar...', false);
    // mount() replaces the "Loading" note with the calendar once the sessions have arrived.
    loadFiles()
      .then(function () { return SessionCalendar.mount({ code: FeesCore.code, host: body }); })
      .then(function () { mounted = true; })
      .catch(function (err) { note('Could not load the calendar. ' + err.message, true); })
      .then(function () { loading = false; });
  }

  return {
    enable: function (options) {
      opts = options;
      FeesCore.addPanel('calendar', { open: open });
    }
  };
})();
