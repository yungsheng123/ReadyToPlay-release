// The host's own logo and QR (menu item "Logo and QR"): a popup with the two pictures as they are now, a button to
// choose a new one from the phone or computer, and one to go back to the standard picture. A chosen picture is
// shrunk on the page first (the logo to a 256 pixel square, the QR to at most 900 pixels on its longest side) and
// then sent to api/profile; the server keeps it in the database. Only the host, with their own code, can change them.
// The page shows them straight away (FeesCore.updatePictures).
window.Profile = (function () {
  var LOGO_SIDE = 256;
  var QR_SIDE = 900;
  var MAX_PICKED_BYTES = 12 * 1024 * 1024;   // a picture file bigger than this is not even opened
  var overlay = null;

  function el(id) { return document.getElementById(id); }

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'profOverlay';
    overlay.innerHTML = '<div id="profDialog" role="dialog" aria-modal="true" aria-labelledby="profTitle">'
      + '<p id="profTitle">Profile</p>'
      + '<p id="profMsg" role="status"></p>'
      + '<div class="profrow">'
      +   '<div class="profpic logo"><img id="profLogoImg" alt="Your logo" width="64" height="64"></div>'
      +   '<div class="profwho"><b>Logo</b><span>Shown at the top of your pages. A square picture works best.</span>'
      +     '<div class="profbtns"><button type="button" id="profLogoPick">Choose picture</button><button type="button" id="profLogoDel">Use standard</button></div></div>'
      + '</div>'
      + '<div class="profrow">'
      +   '<div class="profpic qr"><img id="profQrImg" alt="Your QR" width="64" height="64"><span id="profQrNone">None yet</span></div>'
      +   '<div class="profwho"><b>QR</b><span>The payment QR players scan when they tap QR.</span>'
      +     '<div class="profbtns"><button type="button" id="profQrPick">Choose picture</button><button type="button" id="profQrDel">Remove</button></div></div>'
      + '</div>'
      // The two 6-digit codes of a pickleball page (only the Master Admin sees this part).
      + '<div class="profrow codes" id="profCodes" hidden>'
      +   '<div class="profwho"><b>Access codes</b><span>6 digits. Your own code opens your page and does everything. A Sub Admin code is for people who may only look, mark players paid or unpaid and pick a session; leave it empty for no Sub Admin access.</span>'
      +     '<label for="profGm">Your code (Master Admin)</label><input id="profGm" type="text" inputmode="numeric" maxlength="6" autocomplete="off">'
      +     '<label for="profAdmin">Sub Admin code</label><input id="profAdmin" type="text" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="None">'
      +     '<div class="profbtns"><button type="button" id="profCodesSave">Save codes</button></div></div>'
      + '</div>'
      + '<input type="file" id="profFile" accept="image/png,image/jpeg,image/*" hidden>'
      + '<div class="row"><button type="button" id="profClose" class="primary">Close</button></div>'
      + '</div>';
    document.body.appendChild(overlay);

    el('profClose').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.style.display === 'flex') close(); });
    el('profLogoPick').addEventListener('click', function () { choose('logo'); });
    el('profQrPick').addEventListener('click', function () { choose('qr'); });
    el('profLogoDel').addEventListener('click', function () { remove('logo'); });
    el('profQrDel').addEventListener('click', function () { remove('qr'); });
    el('profCodesSave').addEventListener('click', saveCodes);
    ['profGm', 'profAdmin'].forEach(function (id) {
      el(id).addEventListener('input', function () { el(id).value = el(id).value.replace(/\D/g, '').slice(0, 6); });
    });
  }

  // The access codes, shown to the Master Admin of a pickleball page only.
  function loadCodes() {
    var box = el('profCodes');
    box.hidden = FeesCore.role() !== 'gm';
    if (box.hidden) return;
    el('profGm').value = '';
    el('profAdmin').value = '';
    call('access', 'access', undefined, 'GET')
      .then(function (data) { el('profGm').value = data.gm || ''; el('profAdmin').value = data.admin || ''; })
      .catch(function (err) { message(err.message, true); });
  }

  function saveCodes() {
    var gm = el('profGm').value, admin = el('profAdmin').value;
    if (!/^\d{6}$/.test(gm)) { message('Your code must be 6 digits.', true); return; }
    if (admin && !/^\d{6}$/.test(admin)) { message('The Sub Admin code must be 6 digits, or empty.', true); return; }
    if (gm === admin) { message('The two codes must be different.', true); return; }
    message('Saving...', false);
    call('access', 'access', { gm: gm, admin: admin })
      .then(function () { message(admin ? 'Codes saved. Anyone unlocked with an old code is asked again.' : 'Saved. There is no Sub Admin access now.', false); })
      .catch(function (err) { message(err.message, true); });
  }

  function message(text, isError) {
    el('profMsg').textContent = text;
    el('profMsg').className = isError ? 'err' : '';
  }

  // What the popup shows now: the pictures in use, and which ones can be taken off (only an uploaded one can).
  function refresh() {
    var p = FeesCore.pictures();
    el('profLogoImg').src = FeesCore.logoUrl();
    el('profLogoDel').hidden = !(p.logoRev > 0);
    var hasQr = p.hasQr;
    el('profQrImg').hidden = !hasQr;
    el('profQrNone').hidden = hasQr;
    if (hasQr) el('profQrImg').src = FeesCore.pictureUrl('qr', p.qrRev);
    el('profQrDel').hidden = !(p.qrRev > 0);
  }

  function open() {
    if (!overlay) build();
    message('', false);
    refresh();
    loadCodes();
    overlay.style.display = 'flex';
  }

  function close() { if (overlay) overlay.style.display = 'none'; }

  function call(kind, path, body, method) {
    var api = (window.APP_ROOT != null ? window.APP_ROOT : '../') + 'api/';
    var where = kind === 'access' ? api + (FeesCore.sport() || document.body.getAttribute('data-sport') || 'pickleball') + '/' : api + 'profile/';
    return fetch(where + path + '?u=' + encodeURIComponent(FeesCore.code) + FeesCore.tokenParam(), {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      FeesCore.noteResponse(r);
      return r.json().catch(function () { return null; }).then(function (data) {
        if (r.ok) return data;
        if (r.status === 401) FeesCore.relock(true);   // the pass ran out: ask for the code again
        var err = new Error((data && (data.Message || data.message)) || 'Server returned ' + r.status);
        err.status = r.status;
        throw err;
      });
    });
  }

  // Reads the chosen file, shrinks it on a canvas, and returns it as base64 (PNG, or JPEG if the PNG came out too big).
  function prepare(file, kind) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('Choose a picture.')); return; }
      if (file.size > MAX_PICKED_BYTES) { reject(new Error('That picture is too big. Choose one under 12 MB.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { reject(new Error('Could not read that picture.')); return; }
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        if (kind === 'logo') {
          // The middle square of the picture, as a LOGO_SIDE square.
          var side = Math.min(w, h);
          canvas.width = canvas.height = LOGO_SIDE;
          ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, LOGO_SIDE, LOGO_SIDE);
        } else {
          // The whole picture, no bigger than QR_SIDE on its longest side (a QR must stay sharp, so never smaller than needed).
          var scale = Math.min(1, QR_SIDE / Math.max(w, h));
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        var limit = (kind === 'logo' ? 300 : 1200) * 1024 * 4 / 3;
        var data = canvas.toDataURL('image/png');
        if (data.length > limit) data = canvas.toDataURL('image/jpeg', 0.9);
        if (data.length > limit) { reject(new Error('That picture is still too big. Try a smaller one.')); return; }
        resolve(data.slice(data.indexOf(',') + 1));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that picture. Try a PNG or JPEG.'));
      };
      img.src = url;
    });
  }

  // A note in the Profile popup, and (when that popup is not open: the picture was chosen from the logo or the QR popup) a short note at the
  // bottom of the screen too.
  function say(text, isError) {
    message(text, isError);
    if (overlay && overlay.style.display !== 'flex' && window.AppShell) AppShell.toast(text);
  }

  function choose(kind) {
    var input = el('profFile');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      say('Uploading...', false);
      prepare(file, kind)
        .then(function (data) { return call(kind, 'upload-' + kind, { data: data }); })
        .then(function (result) {
          FeesCore.updatePictures(kind === 'logo' ? { logoRev: result.rev } : { qrRev: result.rev, hasQr: true });
          refresh();
          say(kind === 'logo' ? 'Logo saved.' : 'QR saved.', false);
        })
        .catch(function (err) { say(err.message, true); });
    };
    input.click();
  }

  // The picture chooser straight away (from the logo popup or the QR popup): kind is 'logo' or 'qr'.
  function pick(kind) {
    if (!overlay) build();
    choose(kind);
  }

  function remove(kind) {
    message('Removing...', false);
    call(kind, 'remove-' + kind)
      .then(function () {
        // Back to the standard one: for the QR that is the file under /qr, if the host has one (the server knows).
        FeesCore.updatePictures(kind === 'logo' ? { logoRev: 0 } : { qrRev: 0 });
        return kind === 'qr' ? checkQr() : null;
      })
      .then(function () { refresh(); message(kind === 'logo' ? 'The standard logo is back.' : 'QR removed.', false); })
      .catch(function (err) { message(err.message, true); });
  }

  // After an uploaded QR is removed there may still be a file QR for this host: ask the server.
  function checkQr() {
    return fetch(FeesCore.pictureUrl('qr', 0)).then(function (r) { FeesCore.updatePictures({ hasQr: r.ok }); }, function () { FeesCore.updatePictures({ hasQr: false }); });
  }

  return { open: open, pick: pick };
})();
