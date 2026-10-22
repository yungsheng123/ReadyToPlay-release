// The fees page: the header menu and its views (calendar, leaderboard, player management).
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.menuKeys = menuKeys;
  FA.refreshMenus = refreshMenus;
  FA.menuSelect = menuSelect;
  FA.syncPanelHeaders = syncPanelHeaders;

  // ---- Header menu, Calendar, Leaderboard, Player management -----------------------------------------
  // The header menu lists the views of this page (the same menu as the badminton page, plus the two pickleball ones):
  // Fees (the list), Calendar (a user who has one), Leaderboard and Player management; also the Calculator (while there
  // is a session), the owner's Logo and QR, and Log out. Everybody has the views: the owner can change things, a master
  // user or a guest (the general link) only looks, and a guest sees hashes where an amount would be. A view is shown in
  // place of the fees list without loading anything. Its header (title, logo, menu) is made here; its content is in
  // fees.html.
  FA.owner = !FeesCore.isReadOnly() && !FA.guest();
  var menus = [];
  FA.hasCalendar = false;
  FA.calendarEnabled = false;
  var MENU_KEYS = ['fees', 'calendar', 'leaderboard', 'players', 'calc', 'profile', 'activity', 'logout'];

  // The keys on offer right now.
  function menuKeys() {
    var keys = ['fees'];
    if (FA.hasCalendar) keys.push('calendar');
    if (!FA.guest()) keys.push('leaderboard', 'players');   // a guest sees neither
    if (FA.current() && !FA.guest()) keys.push('calc');   // a guest has no calculator (it is all money)
    if (FA.owner) keys.push('profile');
    if (FA.owner && FeesCore.role() === 'gm' && !FeesCore.isEmbedded()) keys.push('activity');   // who changed what: the Master Admin only
    if (!FA.guest() && !FeesCore.isEmbedded()) keys.push('logout');
    return keys;
  }

  function refreshMenus() {
    AppShell.refreshTabs();
    var keys = FA.menuKeys();
    menus.forEach(function (m) { MENU_KEYS.forEach(function (k) { m.setHidden(k, keys.indexOf(k) === -1); }); });
  }

  function menuSelect(key) {
    if (key === 'calc') {
      FeesCore.show('fees');
      if (FA.current() && !FA.guest()) FA.openCalc();
      return;
    }
    if (key === 'profile') { Profile.open(); return; }
    if (key === 'activity') { FA.openActivity(); return; }
    FeesCore.show(key);
  }

  function addMenu(host, active) {
    if (FA.guest()) return;   // the menu would only hold "Fees"
    var menu = PageMenu.render({ host: host, active: active, items: MENU_KEYS, onSelect: FA.menuSelect });
    if (menu) menus.push(menu);
  }

  // The owner's eye button opens their own guest page (look-only, with a guest code of their own in its address, not
  // their page code) in a new tab. Its address arrives with the page's data.
  if (FA.owner) PageMenu.wantEye();

  Array.prototype.forEach.call(document.querySelectorAll('.panelview'), function (box) {
    var header = document.createElement('header');
    header.className = 'top';
    header.innerHTML = '<div class="in"><div class="head"><div class="brand"><img class="logo" alt="" width="52" height="52" style="visibility:hidden">'
      + '<div><h1></h1><div class="who"></div></div></div><div class="hbtns"></div></div></div>';
    header.querySelector('h1').textContent = box.getAttribute('data-title');
    box.insertBefore(header, box.firstChild);
    var buttons = header.querySelector('.hbtns');
    addMenu(buttons, box.getAttribute('data-panel'));
    PageMenu.decorate(buttons);   // the eye and QR stay in every view's header
  });
  PageMenu.addEye(document.querySelector('header.feesview .hbtns'), FA.el('btnQr'));
  addMenu(document.querySelector('header.feesview .hbtns'), 'fees');
  FA.refreshMenus();

  // A guest gets a Share button in the header: it makes a welcome message with the page's link, to copy or send to friends.
  if (FA.guest()) {
    var SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'sharebtn';
    shareBtn.title = 'Share this page';
    shareBtn.setAttribute('aria-label', 'Share this page');
    shareBtn.innerHTML = SHARE_ICON;
    var shareHost = document.querySelector('header.feesview .hbtns');
    shareHost.insertBefore(shareBtn, shareHost.firstChild);

    var shareOverlay = document.createElement('div');
    shareOverlay.id = 'shareOverlay';
    shareOverlay.innerHTML = '<div id="shareDialog" role="dialog" aria-modal="true" aria-labelledby="shareTitle">'
      + '<p id="shareTitle">Share this page</p>'
      + '<p id="shareSub">Send this message to your friends so they can see the session and who is coming. You can change the words first.</p>'
      + '<textarea id="shareText" rows="7" aria-label="Message to share"></textarea>'
      + '<div class="row"><button type="button" id="shareClose">Close</button><button type="button" id="shareCopy">Copy</button>'
      + '<button type="button" id="shareSend" class="primary" hidden>Share</button></div></div>';
    document.body.appendChild(shareOverlay);
    var shareMsgBox = FA.el('shareText');
    FA.el('shareSend').hidden = !navigator.share;

    // The welcome message, from the ReadyToPlay brand: what the sport is and who runs it, the coming session (day, time, place) if there is
    // one, and the link of this page (without any #view part). The host-side words are in one place so they are easy to change.
    function shareMessage() {
      var link = location.origin + location.pathname + location.search;
      var who = (FA.el('who').textContent || '').trim();
      if (who === 'Loading...') who = '';
      var sport = (FA.SPORTINFO && FA.SPORTINFO.name) || '';
      var mark = (FA.SPORTINFO && FA.SPORTINFO.emoji) || '\uD83C\uDFC5';   // the sport's own picture from the database (a medal when it has none)
      var lines = ['\uD83D\uDC4B Hi everyone, welcome to ReadyToPlay!', ''];
      if (sport || who) lines.push(mark + ' ' + (sport || 'Our game') + (who ? ' with ' + who : ''));
      var cur = FA.current();
      if (cur) {
        lines.push('\uD83D\uDCC5 ' + FA.prettyDate(cur.date, false));
        var when = cur.startTime && cur.endTime ? FA.prettyTime(cur.startTime) + ' \u2013 ' + FA.prettyTime(cur.endTime)
          : cur.startTime ? 'From ' + FA.prettyTime(cur.startTime) : cur.endTime ? 'Until ' + FA.prettyTime(cur.endTime) : '';
        if (when) lines.push('\u23F0 ' + when);
        if (cur.location) lines.push('\uD83D\uDCCD ' + cur.location);
      }
      lines.push('', 'See who is coming', '', '\uD83D\uDC49 ' + link, '', 'See you on court! \uD83D\uDE4C');
      return lines.join('\n');
    }

    shareBtn.addEventListener('click', function () {
      shareMsgBox.value = shareMessage();
      shareOverlay.style.display = 'flex';
    });
    FA.el('shareClose').addEventListener('click', function () { shareOverlay.style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') shareOverlay.style.display = 'none'; });
    FA.el('shareCopy').addEventListener('click', function () {
      var text = shareMsgBox.value;
      function fallback() {
        shareMsgBox.focus(); shareMsgBox.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { }
        AppShell.toast(ok ? 'Copied' : 'Press and hold the text to copy it');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { AppShell.toast('Copied'); }, fallback);
      else fallback();
    });
    FA.el('shareSend').addEventListener('click', function () {
      navigator.share({ text: shareMsgBox.value }).catch(function () { });   // closing the phone's own share sheet is not an error
    });
  }

  // The views' headers show the same name and logo as the fees header.
  function syncPanelHeaders() {
    var logo = document.querySelector('header.feesview img.logo');
    Array.prototype.forEach.call(document.querySelectorAll('.panelview header'), function (header) {
      var img = header.querySelector('img.logo');
      if (logo && logo.getAttribute('src')) { img.src = logo.getAttribute('src'); img.style.visibility = ''; }
      header.querySelector('.who').textContent = FA.el('who').textContent;
      header.querySelector('.panelqr').hidden = FA.el('btnQr').hidden;
    });
  }

  FeesCore.addPanel('leaderboard', {
    // The bars grow and the numbers count up again each time the view is opened.
    open: function () { FA.rankSignature = ''; FA.renderRanking(); FA.refreshDirectory(); FA.refreshOtherDirectories(); }
  });
})();
