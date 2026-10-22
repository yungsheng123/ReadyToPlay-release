// FeesCore: views (switching pages without reloading).
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.viewKey = viewKey;
  FC.keyOfHash = keyOfHash;
  FC.setNavHeight = setNavHeight;
  FC.showView = showView;

  // ---- Views: switching pages without reloading ------------------------------------------------------
  // A page showing its own account keeps everything on one address. Its own list is the "fees" view; the page
  // can add more of its own (the calendar) with addPanel(), which opens one the first time it is shown. For a
  // master user, every other page in the navigation bar is a frame that is created the first time it is opened
  // and then only hidden and shown, so nothing is fetched before it is asked for. The address bar follows
  // (#calendar, #view=pickleball:CODE), so refresh and Back land on the right view.
  FC.panels = {};             // extra views of this account: key -> { open() }
  FC.activeKey = 'fees';      // 'fees', a panel key, or 'frame:SPORT:CODE'
  var scrollAt = {};           // where each view was scrolled to
  var frames = {};             // 'frame:SPORT:CODE' -> { wrap, hiddenAt }
  FC.viewList = [];           // the navigation bar's entries, as /init sent them
  FC.navTabs = [];
  FC.hashApplied = false;
  var FRAME_STALE_MS = 5 * 60 * 1000;   // a frame left for longer than this is loaded afresh when it is opened again

  function viewKey(v) { return v.isSelf && v.sport === FC.cfg.sport ? 'fees' : 'frame:' + v.sport + ':' + v.code; }

  function findView(key) {
    var found = null;
    FC.viewList.forEach(function (v) { if (FC.viewKey(v) === key) found = v; });
    return found;
  }

  // The page in a frame carries this page's own version number (the ?v= of core/01-base.js in the address of this
  // script), so a copy of that page kept by the browser from before an update is never reused: change the number
  // in the pages' script tags and the frames fetch the newest page. Bump it whenever any page's HTML changes.
  var BUILD = (function () {
    var tag = document.querySelector('script[src*="shared/js/core/01-base.js"]');
    var found = tag ? /[?&]v=([\w.-]+)/.exec(tag.getAttribute('src')) : null;
    return found ? found[1] : '';
  })();

  function frameUrl(v) {
    return FC.ROOT + 'fees.html?u=' + encodeURIComponent(FC.code) + (v.isSelf ? '' : '&view=' + encodeURIComponent(v.code)) + '&embed=1' + (BUILD ? '&b=' + BUILD : '');
  }

  function hashOf(key) {
    if (key === 'fees') return '';
    return key.indexOf('frame:') === 0 ? '#view=' + key.slice(6) : '#' + key;
  }

  function keyOfHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!h) return 'fees';
    if (h.indexOf('view=') === 0) return 'frame:' + h.slice(5);
    return h;
  }

  // The page's own views (the panels) work on any page, even a look-only one; the other users' pages (frames) only
  // for a page showing its own account.
  function validKey(key) {
    if (key === 'fees') return true;
    return key.indexOf('frame:') === 0 ? FC.switchable && !!findView(key) : !!FC.panels[key];
  }

  function setNavHeight() {
    var nav = document.getElementById('masterNav');
    document.documentElement.style.setProperty('--navh', nav ? nav.offsetHeight + 'px' : '0px');
  }
  window.addEventListener('resize', FC.setNavHeight);

  function openFrame(key) {
    var rec = frames[key];
    if (rec && Date.now() - rec.hiddenAt > FRAME_STALE_MS) { rec.wrap.remove(); delete frames[key]; rec = null; }
    if (rec) return;
    var v = findView(key);
    var wrap = document.createElement('div');
    wrap.className = 'viewframe';
    var note = document.createElement('p');
    note.className = 'viewload';
    note.textContent = 'Loading ' + v.name + '’s ' + v.sport + ' page...';
    wrap.appendChild(note);
    var frame = document.createElement('iframe');
    frame.title = v.name + ' ' + v.sport;
    frame.addEventListener('load', function () { wrap.classList.add('ready'); });
    frame.src = frameUrl(v);
    wrap.appendChild(frame);
    document.body.appendChild(wrap);
    frames[key] = { wrap: wrap, hiddenAt: Date.now() };
  }

  // mode: 'push' (the default) adds a Back step, 'replace' only rewrites the address, 'none' leaves it alone.
  function showView(key, mode) {
    if (!validKey(key) || (FC.viewOnly && (key === 'players' || key === 'leaderboard'))) key = 'fees';   // a guest sees neither Players nor Ranking
    if (key === FC.activeKey) return;
    scrollAt[FC.activeKey] = window.pageYOffset;
    if (frames[FC.activeKey]) frames[FC.activeKey].hiddenAt = Date.now();
    FC.activeKey = key;
    var isFrame = key.indexOf('frame:') === 0;
    document.body.setAttribute('data-view', isFrame ? 'frame' : key);
    if (isFrame) openFrame(key);
    Object.keys(frames).forEach(function (k) { frames[k].wrap.hidden = k !== key; });
    if (!isFrame && key !== 'fees') FC.panels[key].open();
    FC.markNav();
    if (!FC.embedded && mode !== 'none') {
      var url = location.pathname + location.search + hashOf(key);
      if (mode === 'replace') history.replaceState(null, '', url); else history.pushState(null, '', url);
    }
    window.scrollTo(0, isFrame ? 0 : (scrollAt[key] || 0));
  }

  // The Back button, or an edited address.
  window.addEventListener('popstate', function () {
    if (!FC.embedded && FC.viewList.length + Object.keys(FC.panels).length) FC.showView(FC.keyOfHash(location.hash), 'none');
  });

  // "Back to mine" inside a frame.
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.type === 'fees-back') FC.showView('fees');
  });
  // -------------------------------------------------------------------------------------------------
})();
