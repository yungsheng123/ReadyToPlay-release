// FeesCore: the bottom navigation bar and the view-only banner.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.initialsOf = initialsOf;
  FC.avatarFor = avatarFor;
  FC.markNav = markNav;
  FC.renderNav = renderNav;
  FC.showViewBanner = showViewBanner;

  // ---- Master user: bottom navigation bar and the "view only" banner -------------------------------
  var selfUrl = '';

  function pageUrl(v) {
    return FC.ROOT + 'fees.html?u=' + encodeURIComponent(FC.code) + (v.isSelf ? '' : '&view=' + encodeURIComponent(v.code));
  }

  // The first letter or digit of a word, whole (a name that starts with an emoji or a symbol, such as a flower, would otherwise give half
  // of it, which shows as a blank). A word with no letter or digit at all gives its first character.
  function firstLetter(word) {
    var chars = Array.from(word);
    for (var i = 0; i < chars.length; i++) if (/[\p{L}\p{N}]/u.test(chars[i])) return chars[i].toUpperCase();
    return chars[0] || '';
  }
  function initialsOf(name) {
    var words = String(name).split(/\s+/).filter(Boolean).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); });
    if (!words.length) words = String(name).split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(firstLetter).join('');
  }

  // ---- Player avatars: a round head-and-shoulders picture by gender (blue for male, pink for female). A player with no gender saved is male, as
  // everywhere else. The two pictures live once in the page (a hidden sprite); every avatar is a small <svg><use> that points at one.
  document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
    + '<symbol id="rtp-av-m" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1e3a8a"/><path d="M12 64c2-13 11-19 20-19s18 6 20 19z" fill="#93c5fd"/>'
    + '<circle cx="32" cy="29" r="12" fill="#dbeafe"/><path d="M20 27c0-8 5-12 12-12s12 4 12 12c-2-3-6-4-12-4s-10 1-12 4z" fill="#1e3a8a"/></symbol>'
    + '<symbol id="rtp-av-f" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#9d174d"/><path d="M12 64c2-13 11-19 20-19s18 6 20 19z" fill="#f9a8d4"/>'
    + '<path d="M19 30c-2-12 5-19 13-19s15 7 13 19c0 6 2 9 3 11-5 0-6-2-7-5H23c-1 3-2 5-7 5 1-2 3-5 3-11z" fill="#fce7f3"/><circle cx="32" cy="29" r="11" fill="#fdf2f8"/>'
    + '<path d="M21 26c3-7 8-9 11-9s8 2 11 9c-3-3-7-4-11-4s-8 1-11 4z" fill="#fce7f3"/><circle cx="46" cy="22" r="4" fill="#fce7f3"/></symbol>'
    + '</defs></svg>');

  function avatarFor(gender) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'avimg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', gender === 'F' ? '#rtp-av-f' : '#rtp-av-m');
    svg.appendChild(use);
    return svg;
  }

  var switchTo = null;  var switchEl = document.createElement('div');
  switchEl.id = 'switchOverlay';
  switchEl.innerHTML = '<div id="switchDialog" role="dialog" aria-modal="true" aria-labelledby="switchTitle">'
    + '<p id="switchTitle"></p><p id="switchSub"></p>'
    + '<div class="row"><button type="button" id="btnSwitchCancel">Cancel</button>'
    + '<button type="button" id="btnSwitchConfirm" class="primary">View page</button></div></div>';
  document.body.appendChild(switchEl);

  function closeSwitch() { switchTo = null; switchEl.style.display = 'none'; }
  document.getElementById('btnSwitchCancel').addEventListener('click', closeSwitch);
  document.getElementById('btnSwitchConfirm').addEventListener('click', function () {
    var v = switchTo;
    if (!v) return;
    if (!FC.switchable) { location.href = pageUrl(v); return; }
    closeSwitch();
    FC.showView(FC.viewKey(v));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSwitch(); });

  // Going to someone else's page asks first; coming back to your own page does not.
  function askSwitch(v) {
    switchTo = v;
    document.getElementById('switchTitle').textContent = 'View ' + v.name + '\u2019s page?';
    document.getElementById('switchSub').textContent = 'You can look at their ' + v.sport + ' page, but you can\u2019t make any changes on it.';
    switchEl.style.display = 'flex';
  }

  // Which tab is lit. On a page that can switch in place it follows the view on show (the calendar counts as
  // part of "me"); on a look-only page it is the person being looked at.
  function isCurrent(v) {
    if (!FC.switchable) return v.isSelf ? !FC.readOnly : (FC.readOnly && v.code === FC.view);
    var key = FC.viewKey(v);
    return key === 'fees' ? (FC.activeKey === 'fees' || !!FC.panels[FC.activeKey]) : FC.activeKey === key;
  }

  function markNav() {
    FC.navTabs.forEach(function (t) {
      var on = isCurrent(t.v);
      t.btn.classList.toggle('on', on);
      if (on) t.btn.setAttribute('aria-current', 'page'); else t.btn.removeAttribute('aria-current');
    });
  }

  function renderNav(views) {
    if (FC.embedded || !views || !views.length || document.getElementById('masterNav')) return;
    var nav = document.createElement('nav');
    nav.id = 'masterNav';
    nav.setAttribute('aria-label', 'Switch user page');
    views.forEach(function (v) {
      if (v.isSelf) selfUrl = pageUrl(v);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      FC.navTabs.push({ v: v, btn: b });
      var av = document.createElement('span');
      av.className = 'av';
      av.textContent = FC.initialsOf(v.name);
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = v.name + (v.isSelf ? ' (me)' : '');
      var sp = document.createElement('span');
      sp.className = 'sp';
      sp.textContent = v.sport.charAt(0).toUpperCase() + v.sport.slice(1);
      b.appendChild(av);
      b.appendChild(nm);
      b.appendChild(sp);
      b.addEventListener('click', function () {
        if (FC.switchable) {
          if (FC.viewKey(v) === FC.activeKey) return;
          if (v.isSelf) FC.showView(FC.viewKey(v)); else askSwitch(v);
          return;
        }
        if (isCurrent(v)) return;
        if (v.isSelf) location.href = pageUrl(v); else askSwitch(v);
      });
      nav.appendChild(b);
    });
    document.body.appendChild(nav);
    document.body.classList.add('has-nav');
    FC.setNavHeight();
    FC.markNav();
  }

  function showViewBanner(name) {
    var banner = document.getElementById('viewBanner');
    // A guest (general link) is simply shown the page: no "you are viewing" note.
    if (!FC.readOnly || FC.viewOnly || FC.admin) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'viewBanner';
      document.querySelector('main').insertBefore(banner, FC.msg);
    }
    banner.textContent = '';
    var text = document.createElement('span');
    text.textContent = 'You are viewing ' + name + '\u2019s page. View only: you can\u2019t make changes here.';
    banner.appendChild(text);
    if (selfUrl || FC.embedded) {
      var back = document.createElement('button');
      back.type = 'button';
      back.textContent = 'Back to mine';
      // Inside a frame the page that holds it does the switching.
      back.addEventListener('click', function () {
        if (FC.embedded) window.parent.postMessage({ type: 'fees-back' }, location.origin); else location.href = selfUrl;
      });
      banner.appendChild(back);
    }
  }
  // -------------------------------------------------------------------------------------------------
})();
