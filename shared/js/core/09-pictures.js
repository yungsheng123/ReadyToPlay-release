// FeesCore: the logo and the QR picture.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.pictureUrl = pictureUrl;
  FC.currentLogoUrl = currentLogoUrl;
  FC.updatePictures = updatePictures;
  FC.applyInit = applyInit;
  FC.showGate = showGate;

  // ---- The logo and the QR ------------------------------------------------------------------------------
  // Each host can upload their own (see profile.js). The page asks the server for them by the numbers /init sent
  // (logoRev, qrRev: 0 = none uploaded); a new number means a new picture. Every host's logo and QR are kept in the
  // database, the three first hosts' included; a host with no logo gets a plain person picture. The QR always comes from the server, which knows whose
  // it is (an uploaded one, or the file under /qr), so a page that is only looked at is never given the owner's code.
  FC.pictures = { staticLogo: '', logoRev: 0, qrRev: 0, hasQr: false };

  // A user with no logo of their own gets this plain person picture, so a new account never shows somebody else's logo.
  var DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
    + '<rect width="96" height="96" fill="#cfe3d3"/><circle cx="48" cy="38" r="17" fill="#6f9a7b"/><path d="M14 92c2-21 16-33 34-33s32 12 34 33z" fill="#6f9a7b"/></svg>');

  function pictureUrl(kind, rev) {
    return FC.ROOT + 'api/' + FC.cfg.sport + '/' + kind + '?' + FC.authQuery() + '&r=' + rev;
  }

  function currentLogoUrl() {
    return FC.pictures.logoRev > 0 ? FC.pictureUrl('logo', FC.pictures.logoRev) : FC.pictures.staticLogo;
  }

  // Puts the logo (every header's, and the browser tab's) and the QR on screen.
  function showPictures() {
    var logoUrl = FC.currentLogoUrl();
    Array.prototype.forEach.call(document.querySelectorAll('img.logo'), function (img) {
      // An uploaded logo that can't be fetched falls back to the standard one.
      img.onerror = function () { img.onerror = null; img.src = FC.pictures.staticLogo; };
      img.src = logoUrl;
      img.style.visibility = '';
    });
    // A logo in a header can be tapped: it gets a small pencil (the host's own page only, see fees.css) and the usual button manners.
    Array.prototype.forEach.call(document.querySelectorAll('header img.logo'), function (img) {
      if (!img.parentNode.classList.contains('logowrap')) {
        var wrap = document.createElement('span');
        wrap.className = 'logowrap';
        img.parentNode.insertBefore(wrap, img);
        wrap.appendChild(img);
        var badge = document.createElement('span');
        badge.className = 'logobadge';
        badge.setAttribute('aria-hidden', 'true');
        badge.innerHTML = FC.PENCIL;
        wrap.appendChild(badge);
      }
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'Logo');
      img.tabIndex = 0;
    });
    var tabIcon = document.querySelector('link[rel="icon"]');
    if (tabIcon) tabIcon.href = logoUrl;
    // The QR button is always shown (the popup says what to do when there is no QR).
    document.getElementById('btnQr').hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll('.panelqr'), function (b) { b.hidden = false; });
    if (FC.qrOverlay.style.display === 'flex') FC.renderQr();     // a QR was just uploaded or removed: the open popup follows
    if (FC.logoOverlay.style.display === 'flex') FC.renderLogo();
  }

  // After the host uploaded or removed a picture: { logoRev, qrRev, hasQr } (any of them).
  function updatePictures(change) {
    if (change.logoRev !== undefined) FC.pictures.logoRev = change.logoRev;
    if (change.qrRev !== undefined) FC.pictures.qrRev = change.qrRev;
    if (change.hasQr !== undefined) FC.pictures.hasQr = change.hasQr;
    showPictures();
  }

  // Puts what /init returned on screen: the account's name, QR and player list, then lets the page's own
  // script show the rest (calculator numbers, sessions, ...).
  function applyInit(data) {
    document.getElementById('who').textContent = data.name;
    document.title = FC.cfg.title + ' - ' + data.name;
    FC.pictures = { staticLogo: DEFAULT_AVATAR, logoRev: data.logoRev || 0, qrRev: data.qrRev || 0, hasQr: !!data.hasQr };
    showPictures();
    FC.people = data.people || [];
    FC.editing = false;
    FC.loading = false;
    FC.endBooting();
    document.body.classList.toggle('readonly', FC.readOnly);
    FC.viewList = data.views || [];
    FC.renderNav(data.views);
    FC.showViewBanner(data.name);
    if (FC.cfg.onInit) FC.cfg.onInit(data);
    FC.render();
    FC.pasteBox.open = !FC.people.length && !FC.cfg.keepPasteClosed;
    // Opened at an address like fees.html?u=CODE#calendar (a refresh, a bookmark): go straight to that view.
    if (!FC.hashApplied) {
      FC.hashApplied = true;
      if (!FC.embedded) FC.showView(FC.keyOfHash(location.hash), 'replace');
    }
  }

  // The 6-digit code screen, shown over the page until a correct code is entered; the page then reloads with its pass.
  function showGate() {
    document.body.classList.add('locked');
    var gate = document.createElement('div');
    gate.id = 'gate';
    gate.innerHTML = '<form id="gateForm" autocomplete="off" novalidate>'
      + '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>'
      + '<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
      + '<p id="gateTitle">Enter access code</p>'
      + '<p id="gateSub">Type the 6-digit code for this page.</p>'
      + '<input id="gatePin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" aria-label="6-digit code" placeholder="------">'
      + '<p id="gateErr" role="alert"></p></form>';
    document.body.appendChild(gate);
    var input = document.getElementById('gatePin');
    var err = document.getElementById('gateErr');
    // Locked again because nobody used the page for 5 minutes: say so.
    try {
      if (sessionStorage.getItem(FC.IDLE_KEY)) {
        sessionStorage.removeItem(FC.IDLE_KEY);
        document.getElementById('gateSub').textContent = 'Locked after 5 minutes without use. Type the 6-digit code again.';
      }
    } catch (e) { }
    var checking = false;
    // The sixth digit opens the page: no button to press.
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      err.textContent = '';
      if (input.value.length === 6) submit();
    });
    input.focus();
    document.getElementById('gateForm').addEventListener('submit', function (e) { e.preventDefault(); if (/^\d{6}$/.test(input.value)) submit(); });
    // Someone who signed in with their password (not a Sub Admin who was given the link) is sent back to the sign-in page when the code is
    // wrong three times: the password is asked for again.
    function signedInWithPassword() {
      try {
        var me = JSON.parse(localStorage.getItem('autobot.login') || sessionStorage.getItem('autobot.login') || 'null');
        return !!me && me.code === FC.code;
      } catch (e) { return false; }
    }
    function backToSignIn() {
      try { localStorage.removeItem('autobot.login'); sessionStorage.removeItem('autobot.login'); sessionStorage.removeItem(FC.TOKEN_KEY); } catch (e) { }
      input.disabled = true;
      err.textContent = 'Wrong code three times. Taking you back to sign in...';
      setTimeout(function () { location.href = FC.ROOT + 'login.html?out=1'; }, 2200);
    }
    // The page is locked for a while: the box waits, and the time left counts down.
    var lockTimer = null;
    function lockedFor(seconds, first) {
      clearInterval(lockTimer);
      input.disabled = true;
      var until = Date.now() + seconds * 1000;
      function tick() {
        var left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        if (left === 0) {
          clearInterval(lockTimer);
          err.textContent = 'You can try again now.';
          input.disabled = false;
          input.focus();
          return;
        }
        err.textContent = (first ? first + ' ' : '') + 'Try again in ' + Math.floor(left / 60) + ':' + (left % 60 < 10 ? '0' : '') + (left % 60) + '.';
      }
      tick();
      lockTimer = setInterval(tick, 1000);
    }
    function submit() {
      if (checking) return;
      checking = true;
      input.disabled = true;
      err.textContent = 'Checking...';
      fetch(FC.ROOT + 'api/' + FC.cfg.sport + '/unlock?u=' + encodeURIComponent(FC.code), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: input.value })
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (data) {
          if (r.ok && data && data.token) {
            try { sessionStorage.setItem(FC.TOKEN_KEY, data.token); } catch (e2) { }
            location.reload();
            return;
          }
          input.value = '';
          checking = false;
          if (r.status === 429 && data && data.retryAfter) {
            if (data.wrongNow && signedInWithPassword()) { backToSignIn(); return; }
            lockedFor(data.retryAfter, data.wrongNow ? 'Wrong code.' : 'Too many tries.');
            return;
          }
          err.textContent = (data && (data.message || data.Message)) || 'Could not check the code (' + r.status + ').';
          input.disabled = false;
          input.focus();
        });
      }).catch(function () {
        err.textContent = 'Could not reach the server.';
        input.disabled = false;
        checking = false;
        input.focus();
      });
    }
  }
})();
