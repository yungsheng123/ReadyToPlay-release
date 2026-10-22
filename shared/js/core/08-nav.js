// FeesCore: the bottom navigation bar and the view-only banner.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.initialsOf = initialsOf;
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

  var switchTo = null;
  var switchEl = document.createElement('div');
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
