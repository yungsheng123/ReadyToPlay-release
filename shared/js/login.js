// The login page (login.html): the strip of logos, sign in, create an account, change a password, "remember me" and the
// show-password eyes. The calls go to api/auth (AuthController).
(function () {
  var KEY = 'autobot.login';
  function el(id) { return document.getElementById(id); }

  // Where a signed-in user goes: their own page, with their own code (the same as their personal link).
  function pageUrl(me) { return 'fees.html?u=' + encodeURIComponent(me.code); }

  function stored() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function forget() {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { }
  }
  function remember(me, keep) {
    forget();
    try { (keep ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ code: me.code, sport: me.sport, name: me.name })); } catch (e) { }
  }

  // Coming back with "Remember me" goes straight to the page; ?out=1 (from Log out) shows the form instead.
  var query = new URLSearchParams(location.search);
  if (query.get('out')) forget();
  var me = stored();
  if (me && me.code && me.sport && !query.get('out')) {
    location.replace(pageUrl(me));
    return;
  }

  // The strip of logos: up to 5 picked at random by the server. It is repeated enough times to fill the width and slid by
  // exactly one run, so the loop is seamless. Nothing is shown if there are none (or the server can't be reached).
  function loadLogos() {
    fetch('api/auth/logos')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var ids = (data && data.logos) || [];
        if (!ids.length) return;
        var strip = el('logoStrip'), track = el('logoTrack');
        strip.hidden = false;
        var step = 48 + 14;
        var copies = Math.max(2, Math.ceil(Math.max(strip.clientWidth, 320) / (step * ids.length)) + 1);
        for (var c = 0; c < copies; c++) {
          ids.forEach(function (id) {
            var img = new Image();
            img.alt = '';
            img.width = 48;
            img.height = 48;
            img.src = 'api/auth/logo-image?id=' + encodeURIComponent(id);
            track.appendChild(img);
          });
        }
        track.style.setProperty('--shift', '-' + (step * ids.length) + 'px');
        track.style.setProperty('--dur', Math.round(step * ids.length / 28) + 's');   // about 28 pixels a second
      })
      .catch(function () { });
  }
  loadLogos();

  // Every password box gets a small eye at its right end: press it to see what is typed, press again to hide it.
  var EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="on"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></g>'
    + '<g class="off"><path d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6C3.9 9.3 2 12 2 12s3.6 6 10 6a10 10 0 0 0 3.5-.6M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  Array.prototype.forEach.call(document.querySelectorAll('input[type="password"]'), function (input) {
    var wrap = document.createElement('div');
    wrap.className = 'lg-pw';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'lg-eye';
    eye.setAttribute('aria-label', 'Show password');
    eye.setAttribute('aria-pressed', 'false');
    eye.innerHTML = EYE;
    eye.addEventListener('click', function () {
      var showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      eye.setAttribute('aria-pressed', showing ? 'true' : 'false');
      eye.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
    });
    wrap.appendChild(eye);
  });

  function show(id) {
    ['formSignIn', 'formSignUp', 'formChange'].forEach(function (f) { el(f).hidden = f !== id; });
    var signIn = id !== 'formSignUp';
    el('tabSignIn').className = signIn ? 'on' : '';
    el('tabSignUp').className = signIn ? '' : 'on';
    el('tabSignIn').setAttribute('aria-selected', signIn ? 'true' : 'false');
    el('tabSignUp').setAttribute('aria-selected', signIn ? 'false' : 'true');
    message('', false);
  }

  function message(text, good) {
    el('err').style.display = !good && text ? 'block' : 'none';
    el('err').textContent = good ? '' : text;
    el('ok').style.display = good && text ? 'block' : 'none';
    el('ok').textContent = good ? text : '';
  }

  // Every host chooses an access code; only digits can be typed in it.
  ['suPin', 'suPin2', 'pcPin', 'pcPin2'].forEach(function (id) {
    el(id).addEventListener('input', function () { el(id).value = el(id).value.replace(/\D/g, '').slice(0, 6); });
  });

  el('tabSignIn').addEventListener('click', function () { show('formSignIn'); });
  el('tabSignUp').addEventListener('click', function () { show('formSignUp'); });
  el('goChange').addEventListener('click', function () { el('chUser').value = el('siUser').value; show('formChange'); });
  el('goBack').addEventListener('click', function () { show('formSignIn'); });

  function call(path, body) {
    return fetch('api/auth/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (data) {
        if (r.ok) return data;
        var err = new Error((data && (data.message || data.Message)) || 'Could not reach the server (' + r.status + ').');
        err.status = r.status;
        throw err;
      });
    });
  }

  function busy(button, on, label) {
    button.disabled = on;
    button.textContent = on ? 'Please wait...' : label;
  }

  function done(me, keep) {
    remember(me, keep);
    location.replace(pageUrl(me));
  }

  // An older pickleball account has no access code yet: the host chooses one now (the password they just typed proves who they are).
  function showPinSetup(me, user, pass, keep) {
    ['formSignIn', 'formSignUp', 'formChange'].forEach(function (f) { el(f).hidden = true; });
    document.querySelector('.lg-tabs').hidden = true;
    message('', false);
    el('formPin').hidden = false;
    el('pcPin').focus();
    el('formPin').onsubmit = function (e) {
      e.preventDefault();
      var pin = el('pcPin').value;
      if (!/^\d{6}$/.test(pin)) { message('The access code must be 6 digits.', false); return; }
      if (pin !== el('pcPin2').value) { message('The two codes are different.', false); return; }
      message('', false);
      busy(el('btnPin'), true, 'Save code and continue');
      call('access-code', { username: user, password: pass, pin: pin })
        .then(function () { done(me, keep); })
        .catch(function (err) { message(err.message, false); busy(el('btnPin'), false, 'Save code and continue'); });
    };
  }

  el('formSignIn').addEventListener('submit', function (e) {
    e.preventDefault();
    var user = el('siUser').value.trim(), pass = el('siPass').value;
    if (!user || !pass) { message('Enter your username and password.', false); return; }
    message('', false);
    busy(el('btnSignIn'), true, 'Sign in');
    call('login', { username: user, password: pass })
      .then(function (account) {
        if (account.needsPin) { showPinSetup(account, user, pass, el('siRemember').checked); return; }
        done(account, el('siRemember').checked);
      })
      .catch(function (err) { message(err.message, false); busy(el('btnSignIn'), false, 'Sign in'); });
  });

  // The sports to sign up for come from the database (api/auth/sports); the two radio buttons in the page are what shows until they arrive.
  fetch('api/auth/sports').then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    var box = document.querySelector('.lg-sport');
    if (!box || !data || !data.sports || !data.sports.length) return;
    var chosen = Array.prototype.map.call(document.querySelectorAll('input[name="sport"]:checked'), function (i) { return i.value; });
    box.textContent = '';
    box.style.gridTemplateColumns = 'repeat(' + Math.min(data.sports.length, 3) + ', 1fr)';
    data.sports.forEach(function (s) {
      var input = document.createElement('input');
      input.type = 'checkbox';   // one or more sports
      input.name = 'sport';
      input.id = 'sp_' + s.key;
      input.value = s.key;
      input.checked = chosen.indexOf(s.key) !== -1;
      var label = document.createElement('label');
      label.setAttribute('for', input.id);
      label.textContent = s.name;
      box.appendChild(input);
      box.appendChild(label);
    });
  }).catch(function () { });

  el('formSignUp').addEventListener('submit', function (e) {
    e.preventDefault();
    var sports = Array.prototype.map.call(document.querySelectorAll('input[name="sport"]:checked'), function (i) { return i.value; });
    var sport = sports[0];
    var pass = el('suPass').value;
    if (!el('suName').value.trim()) { message('Enter your name.', false); return; }
    if (!el('suUser').value.trim()) { message('Choose a username.', false); return; }
    if (pass.length < 8) { message('Choose a password of at least 8 characters.', false); return; }
    if (pass !== el('suPass2').value) { message('The two passwords are different.', false); return; }
    if (!sport) { message('Choose at least one sport.', false); return; }
    var pin = el('suPin').value;
    if (!/^\d{6}$/.test(pin)) { message('Choose an access code of 6 digits.', false); return; }
    if (pin !== el('suPin2').value) { message('The two access codes are different.', false); return; }
    message('', false);
    busy(el('btnSignUp'), true, 'Create account');
    call('register', { name: el('suName').value.trim(), username: el('suUser').value.trim(), password: pass, sport: sport, sports: sports, pin: pin })
      .then(function (account) { done(account, el('suRemember').checked); })
      .catch(function (err) { message(err.message, false); busy(el('btnSignUp'), false, 'Create account'); });
  });

  el('formChange').addEventListener('submit', function (e) {
    e.preventDefault();
    var user = el('chUser').value.trim(), old = el('chOld').value, next = el('chNew').value;
    if (!user || !old) { message('Enter your username and current password.', false); return; }
    if (next.length < 8) { message('Choose a new password of at least 8 characters.', false); return; }
    if (next !== el('chNew2').value) { message('The two new passwords are different.', false); return; }
    message('', false);
    busy(el('btnChange'), true, 'Change password');
    call('change-password', { username: user, password: old, newPassword: next })
      .then(function () {
        el('siUser').value = user;
        el('siPass').value = '';
        ['chOld', 'chNew', 'chNew2'].forEach(function (id) { el(id).value = ''; });
        show('formSignIn');
        message('Password changed. Sign in with the new one.', true);
      })
      .catch(function (err) { message(err.message, false); })
      .then(function () { busy(el('btnChange'), false, 'Change password'); });
  });
})();
