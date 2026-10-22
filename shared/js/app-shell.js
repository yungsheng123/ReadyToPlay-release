// The parts of the page every sport shares: the icons, the note at the bottom of the screen, the progress ring in the header,
// and the bottom tabs with their "More" sheet. A page's own script (shared/js/app/,
// badminton.js) calls AppShell with what is special to it (which tabs it has, what a tab does). The look is in
// shared/css/fees.css. 
window.AppShell = (function () {
  var ICONS = {
    fees: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" />',
    players: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.3c1.8.8 3 2.7 3 5.7"/>',
    leaderboard: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8.5 20h7M9.5 17h5"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
    profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5"/>',
    activity: '<path d="M4 12h3.5l2-6 4 12 2-6H20" />',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>'
  };
  var LABELS = { fees: 'Fees', players: 'Players', leaderboard: 'Ranking', calendar: 'Calendar', more: 'More', calc: 'Calculator', profile: 'Profile', activity: 'Activity', logout: 'Log out' };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  }

  function el(id) { return document.getElementById(id); }

  // ---- A short note at the bottom of the screen ("Copied") ------------------------------------------------------
  var toastEl = document.createElement('div');
  toastEl.id = 'toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  // ---- A card at the bottom of the screen for a change of the player list ("Ali marked as paid", "by Sub Admin") ----------------------------
  // opts: { kind: 'paid' | 'unpaid' | 'add' | 'remove' | 'multi', title, sub }. On screen about 4 seconds; a tap puts it away; a new one replaces it.
  var NOTICE_ICONS = {
    paid: '<path d="M4 10.5l4 4 8-9"/>',
    unpaid: '<path d="M5 8h7a4 4 0 0 1 0 8H8M5 8l3-3M5 8l3 3"/>',
    add: '<circle cx="8" cy="7" r="3"/><path d="M2.5 17c0-3 2.4-5 5.5-5s5.5 2 5.5 5M16 6v6M13 9h6"/>',
    remove: '<circle cx="8" cy="7" r="3"/><path d="M2.5 17c0-3 2.4-5 5.5-5s5.5 2 5.5 5M13 9h6"/>',
    multi: '<path d="M4 6h12M4 10h12M4 14h8"/>'
  };
  var noticeEl = document.createElement('div');
  noticeEl.id = 'notice';
  noticeEl.setAttribute('role', 'status');
  noticeEl.setAttribute('aria-live', 'polite');
  noticeEl.innerHTML = '<span class="ni"></span><span class="nt"><b></b><span></span></span>';
  document.body.appendChild(noticeEl);
  var noticeTimer = null;
  function notify(opts) {
    var kind = NOTICE_ICONS[opts.kind] ? opts.kind : 'multi';
    var ni = noticeEl.querySelector('.ni');
    ni.className = 'ni ' + kind;
    ni.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + NOTICE_ICONS[kind] + '</svg>';
    noticeEl.querySelector('b').textContent = opts.title || '';
    noticeEl.querySelector('.nt > span').textContent = opts.sub || '';
    noticeEl.classList.add('on');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { noticeEl.classList.remove('on'); }, 4000);
  }
  noticeEl.addEventListener('click', function () { clearTimeout(noticeTimer); noticeEl.classList.remove('on'); });

  // ---- Links in text the host wrote ---------------------------------------------------------------------------------------------------
  // Puts text into a node with every web address in it (http://..., https://... or www....) as a real link that opens in a new tab. The text
  // goes in as text (never as HTML), so nothing the host typed can run; only http and https addresses become links.
  var LINK_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

  function linkify(node, text) {
    node.textContent = '';
    text = String(text || '');
    var last = 0, m;
    LINK_PATTERN.lastIndex = 0;
    while ((m = LINK_PATTERN.exec(text)) !== null) {
      var shown = m[0];
      // The punctuation that ends a sentence, or a closing bracket the address never opened, is not part of the link.
      var tail = /[.,;:!?'"\])}]+$/.exec(shown);
      while (tail) {
        var cut = tail[0];
        if (cut.charAt(0) === ')' && shown.indexOf('(') !== -1) { tail = null; break; }
        shown = shown.slice(0, shown.length - cut.length);
        tail = /[.,;:!?'"\])}]+$/.exec(shown);
      }
      var href = /^www\./i.test(shown) ? 'https://' + shown : shown;
      var ok = false;
      try { var u = new URL(href); ok = (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.indexOf('.') !== -1; } catch (e) { ok = false; }
      if (!ok) continue;
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      a.className = 'autolink';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.textContent = shown;
      node.appendChild(a);
      last = m.index + shown.length;
      LINK_PATTERN.lastIndex = last;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }

  // ---- The ring in the header: how many players have paid --------------------------------------------------------
  function setRing(paid, total) {
    if (!el('ringVal')) return;
    el('ringNum').textContent = paid + '/' + total;
    var circumference = 2 * Math.PI * 31;
    el('ringVal').setAttribute('stroke-dasharray', (total ? circumference * paid / total : 0).toFixed(1) + ' ' + circumference.toFixed(1));
    el('ring').setAttribute('aria-label', paid + ' of ' + total + ' players have paid');
    if (el('heroPaid')) el('heroPaid').textContent = paid + ' of ' + total + ' paid';
  }

  // ---- Bottom tabs and the "More" sheet ---------------------------------------------------------------------------
  var tabbar = null;
  var tabCfg = null;       // { primary(): keys, more(): keys, select(key), logout() }
  var moreSheet = null;

  function markTab() {
    if (!tabbar) return;
    var view = document.body.getAttribute('data-view') || 'fees';
    Array.prototype.forEach.call(tabbar.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-tab') === view;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function refreshTabs() {
    if (!tabbar) return;
    var tabs = tabCfg.primary().slice();
    if (tabCfg.more().length) tabs.push('more');
    tabbar.textContent = '';
    tabs.forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-tab', key);
      b.innerHTML = icon(key) + '<span>' + LABELS[key] + '</span>';
      tabbar.appendChild(b);
    });
    markTab();
  }

  function closeMore() { moreSheet.style.display = 'none'; }
  function openMore() {
    var items = moreSheet.querySelector('.items');
    items.textContent = '';
    tabCfg.more().forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-key', key);
      b.innerHTML = icon(key) + '<span>' + LABELS[key] + '</span>';
      items.appendChild(b);
    });
    moreSheet.style.display = 'flex';
  }

  // cfg: primary() the keys of the tabs ('fees', 'players', 'leaderboard', 'calendar', 'calc'); more() the keys in the More
  // sheet ('calc', 'profile', 'logout'; no More tab when empty); select(key) what choosing one does; logout() signing out.
  function tabs(cfg) {
    tabCfg = cfg;
    tabbar = document.createElement('nav');
    tabbar.id = 'tabbar';
    tabbar.setAttribute('aria-label', 'Pages');
    document.body.appendChild(tabbar);
    document.body.classList.add('has-tabs');

    moreSheet = document.createElement('div');
    moreSheet.id = 'moreSheet';
    moreSheet.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="More"><div class="handle"></div><div class="items"></div></div>';
    document.body.appendChild(moreSheet);
    moreSheet.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-key]');
      if (b) {
        closeMore();
        var key = b.getAttribute('data-key');
        if (key === 'logout') cfg.logout(); else cfg.select(key);
        return;
      }
      if (e.target === moreSheet) closeMore();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMore(); });

    tabbar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      var key = b.getAttribute('data-tab');
      if (key === 'more') openMore(); else cfg.select(key);
    });
    // The lit tab follows the view on show (FeesCore sets data-view on the body).
    new MutationObserver(markTab).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
    refreshTabs();
  }

  return { icon: icon, toast: toast, notify: notify, linkify: linkify, setRing: setRing, tabs: tabs, refreshTabs: refreshTabs };
})();
