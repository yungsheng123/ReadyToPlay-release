// The header controls the badminton and pickleball fees pages share: a small dropdown menu with the views of the
// page ("Fees", "Calendar", and for pickleball "Leaderboard" and "Player management"), the Calculator and "Log out",
// plus the owner's eye button and the QR button that every header carries. The menu sits among the header buttons
// and opens a short list, so it takes no room on the page itself. Choosing an item does not load another page: it calls onSelect(key) and the
// page shows that view or opens that tool. A page calls
// PageMenu.render({ host, active, items, onSelect }) where host is the header's button row, active is the view being
// shown (ticked in the list), items lists the keys to offer, in order, from 'fees', 'calendar', 'leaderboard',
// 'players', 'calc', 'profile' (the host's logo and QR) and 'logout', and onSelect is called with the key chosen ('logout' needs no handler: it signs out). render() returns { setHidden(key, hidden) } to
// hide or show an item later (the pickleball calculator only exists while there is a session).
window.PageMenu = (function () {
  var ICONS = {
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    fees: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v14H4V6zM4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6V3zM9 7h6M9 12h1M12 12h1M15 12h.01M9 16h1M12 16h1M15 16h.01" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    leaderboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8.5 20h7M9.5 17h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    players: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.2 3.2 0 0 1 0 6M18 14.2a6 6 0 0 1 3.5 5.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5zM4 16l4.5-4.5 3.5 3.5 3-3 5 5M15 9.5h.01" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    activity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3.5l2-6 4 12 2-6H20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var LABELS = { fees: 'Fees', calendar: 'Calendar', leaderboard: 'Leaderboard', players: 'Player management', calc: 'Calculator', profile: 'Profile', activity: 'Activity', logout: 'Log out' };

  // Signing out forgets the remembered sign-in (see login.html) and goes to the login page, which stays on the form.
  function logout() {
    try {
      localStorage.removeItem('autobot.login'); sessionStorage.removeItem('autobot.login');
      // the 6-digit-code passes of pickleball pages
      Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf('autobot.pin.') === 0) sessionStorage.removeItem(k); });
    } catch (e) { }
    location.href = (window.APP_ROOT != null ? window.APP_ROOT : '../') + 'login.html?out=1';
  }

  function render(opts) {
    var host = opts.host;
    if (!host || host.querySelector('.pagemenu')) return null;
    var buttons = {};

    var wrap = document.createElement('div');
    wrap.className = 'pagemenu';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'menubtn';
    button.setAttribute('aria-label', 'Menu');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = ICONS.menu;
    wrap.appendChild(button);

    var list = document.createElement('div');
    list.className = 'menulist';
    list.hidden = true;
    (opts.items || ['fees', 'calendar']).forEach(function (key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'menuitem' + (opts.active === key ? ' on' : '');
      if (opts.active === key) b.setAttribute('aria-current', 'page');
      b.innerHTML = ICONS[key];
      var label = document.createElement('span');
      label.textContent = LABELS[key];
      b.appendChild(label);
      if (opts.active === key) b.insertAdjacentHTML('beforeend', ICONS.tick);
      b.addEventListener('click', function () {
        setOpen(false);
        if (key === 'logout') logout();
        else if (key !== opts.active) opts.onSelect(key);
      });
      buttons[key] = b;
      list.appendChild(b);
    });
    wrap.appendChild(list);

    function setOpen(open) {
      list.hidden = !open;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    button.addEventListener('click', function (e) { e.stopPropagation(); setOpen(list.hidden); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

    host.insertBefore(wrap, host.firstChild);
    return { setHidden: function (key, hidden) { if (buttons[key]) buttons[key].hidden = !!hidden; } };
  }

  // The owner's eye button, which opens another page in a new tab (pickleball: the host's own guest page). A page calls
  // wantEye() before it makes its headers, so each gets the button (hidden) between the menu and QR, and setEye(address)
  // once it knows the address: that shows every eye button and points it there.
  var eyeWanted = false;
  var eyeHref = '';

  function eyeButton() {
    var eye = document.createElement('a');
    eye.className = 'eyebtn';
    eye.hidden = !eyeHref;
    if (eyeHref) eye.href = eyeHref;
    eye.target = '_blank';
    eye.rel = 'noopener';
    eye.title = 'Open guest page';
    eye.setAttribute('aria-label', 'Open guest page');
    eye.innerHTML = ICONS.eye;
    return eye;
  }

  // For the page's own header, whose QR button is already in the page: puts the eye in front of it.
  function addEye(host, before) {
    if (eyeWanted && host) host.insertBefore(eyeButton(), before || null);
  }

  // For a header made by a script (the calendar's, a view's): the eye, then a QR button that does what the page's
  // own QR button does and is hidden when that one is.
  function decorate(host) {
    addEye(host, null);
    var real = document.getElementById('btnQr');
    if (!real) return;
    var qr = document.createElement('button');
    qr.type = 'button';
    qr.className = 'panelqr';
    qr.textContent = 'QR';
    qr.hidden = real.hidden;
    qr.addEventListener('click', function () { real.click(); });
    host.appendChild(qr);
    return qr;
  }

  function setEye(href) {
    eyeHref = href;
    Array.prototype.forEach.call(document.querySelectorAll('.eyebtn'), function (eye) { eye.href = href; eye.hidden = !href; });
  }

  return { render: render, wantEye: function () { eyeWanted = true; }, setEye: setEye, addEye: addEye, decorate: decorate, logout: logout };
})();
