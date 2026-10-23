// FeesCore: the QR popup, the logo popup and helpers for the calculators.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.renderQr = renderQr;
  FC.renderLogo = renderLogo;
  FC.showInvalid = showInvalid;
  FC.money = money;
  FC.bindNumberInput = bindNumberInput;

  // ---- The QR popup and the logo popup ---------------------------------------------------------------------------------------------
  // The QR button is always there. Tapping it shows the QR; with none (or one that cannot be shown) it says so: the host is asked to upload
  // their own, everybody else is told the host has not added one yet. Tapping a logo shows it large; the host's own logo first offers
  // "View logo" and "Choose logo". Only the Master Admin of the page can change a picture (the server checks this again).
  function canChangePictures() { return !FC.readOnly && !FC.viewOnly && FC.gated && !!FC.token; }

  var QR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v.01M14.5 20.5h.01M17.5 20.5h3v-3"/></svg>';
  var EYE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var PHOTO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 3.5 3L16 12l4 4.5"/></svg>';

  FC.qrOverlay = document.getElementById('qrOverlay');
  FC.qrOverlay.innerHTML = '<div id="qrBox" role="dialog" aria-modal="true" aria-labelledby="qrTitle">'
    + '<p id="qrTitle"></p>'
    + '<img id="qrImg" alt="QR code for receiving payment">'
    + '<div id="qrNone" hidden>' + QR_ICON + '<span>Nothing to show</span></div>'
    + '<p id="qrText" hidden></p>'
    + '<div class="qrbtns"><button type="button" id="btnQrClose">Close</button><button type="button" id="btnQrChange" class="primary" hidden></button></div></div>';

  function closeQr() { FC.qrOverlay.style.display = 'none'; }

  // What the QR popup shows now: the QR, or why there is none.
  function renderQr() {
    var img = document.getElementById('qrImg'), none = document.getElementById('qrNone'), text = document.getElementById('qrText');
    var change = document.getElementById('btnQrChange'), title = document.getElementById('qrTitle');
    var mine = canChangePictures();
    function showNone() {
      img.hidden = true; none.hidden = false; text.hidden = false;
      title.textContent = 'No QR yet';
      text.textContent = mine ? 'Upload your own payment QR so players can scan it to pay you.' : 'The host has not added a QR yet.';
      change.hidden = !mine; change.textContent = 'Upload QR';
    }
    if (!FC.pictures.hasQr) { showNone(); return; }
    title.textContent = mine ? 'Your payment QR' : 'Payment QR';
    none.hidden = true; text.hidden = true; img.hidden = false;
    change.hidden = !mine; change.textContent = 'Change QR';
    img.onerror = function () { img.onerror = null; showNone(); };   // a QR that cannot be shown counts as no QR
    // The copy fetched ahead (see preloadQr) when there is one for this QR: it is on screen at once. Otherwise the picture's own address.
    var url = qrCopy && qrCopy.rev === FC.pictures.qrRev ? qrCopy.url : FC.pictureUrl('qr', FC.pictures.qrRev);
    if (img.getAttribute('src') !== url) img.src = url;
    else if (img.complete && !img.naturalWidth) showNone();
  }

  // The QR is fetched as soon as the page knows there is one (after sign-in, when the page opens), so the QR button shows it without a wait.
  // The picture is kept as a local copy (the page's own address changes with every renewed pass, so the browser's cache could not be reused).
  var qrCopy = null;       // { rev, url } of the copy that is ready
  var qrFetching = -1;     // the rev being fetched now
  FC.preloadQr = function () {
    var rev = FC.pictures.qrRev;
    if (!FC.pictures.hasQr || !window.fetch || !window.URL || !URL.createObjectURL) return;
    if ((qrCopy && qrCopy.rev === rev) || qrFetching === rev) return;
    qrFetching = rev;
    fetch(FC.pictureUrl('qr', rev)).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
      if (qrFetching === rev) qrFetching = -1;
      if (!blob || !blob.size || rev !== FC.pictures.qrRev) return;   // not there, or the QR was changed meanwhile
      var url = URL.createObjectURL(blob);
      var ready = new Image();
      ready.onload = function () {
        if (rev !== FC.pictures.qrRev) { URL.revokeObjectURL(url); return; }
        if (qrCopy) URL.revokeObjectURL(qrCopy.url);
        qrCopy = { rev: rev, url: url };
        if (FC.qrOverlay.style.display === 'flex') FC.renderQr();   // the popup was opened while it came: show it now
      };
      ready.onerror = function () { URL.revokeObjectURL(url); };
      ready.src = url;
    }, function () { if (qrFetching === rev) qrFetching = -1; });
  };

  document.getElementById('btnQr').addEventListener('click', function () { FC.renderQr(); FC.qrOverlay.style.display = 'flex'; });
  document.getElementById('btnQrClose').addEventListener('click', closeQr);
  document.getElementById('btnQrChange').addEventListener('click', function () { if (window.Profile && canChangePictures()) Profile.pick('qr'); });

  FC.logoOverlay = document.createElement('div');
  FC.logoOverlay.id = 'logoOverlay';
  FC.logoOverlay.innerHTML = '<div id="logoBox" role="dialog" aria-modal="true" aria-labelledby="logoTitle">'
    + '<p id="logoTitle"></p>'
    + '<img id="logoImg" alt="Logo">'
    + '<div id="logoOpts"><button type="button" class="logoopt" id="btnLogoView">' + EYE_ICON + '<span>View logo</span></button>'
    + '<button type="button" class="logoopt" id="btnLogoChoose">' + PHOTO_ICON + '<span>Choose logo</span></button></div>'
    + '<div class="qrbtns"><button type="button" id="btnLogoClose">Close</button></div></div>';
  document.body.appendChild(FC.logoOverlay);
  var logoMode = 'menu';   // 'menu': the two options (the host's own logo); 'view': the logo large

  function renderLogo() {
    var img = document.getElementById('logoImg'), big = logoMode === 'view';
    document.getElementById('logoTitle').textContent = big && !canChangePictures() ? 'Logo' : 'Your logo';
    img.className = big ? 'big' : 'small';
    img.onerror = function () { img.onerror = null; img.src = FC.pictures.staticLogo; };
    img.src = FC.currentLogoUrl();
    document.getElementById('logoOpts').hidden = big;
  }
  function closeLogo() { FC.logoOverlay.style.display = 'none'; }
  function openLogo() {
    logoMode = canChangePictures() ? 'menu' : 'view';   // anyone else just sees it
    FC.renderLogo();
    FC.logoOverlay.style.display = 'flex';
  }
  document.getElementById('btnLogoView').addEventListener('click', function () { logoMode = 'view'; FC.renderLogo(); });
  document.getElementById('btnLogoChoose').addEventListener('click', function () { if (window.Profile && canChangePictures()) Profile.pick('logo'); });
  document.getElementById('btnLogoClose').addEventListener('click', closeLogo);
  // The logo in any header (the page's own, or a view's) is tappable.
  document.addEventListener('click', function (e) {
    var logo = e.target.closest ? e.target.closest('header img.logo') : null;
    if (logo && !FC.loading) openLogo();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('header img.logo') && !FC.loading) { e.preventDefault(); openLogo(); }
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { FC.closeDialog(); closeQr(); closeLogo(); } });

  document.getElementById('btnConfirm').addEventListener('click', function () {
    if (FC.busy || FC.pendingId === null) return;
    if (FC.pendingAction === 'bulk-paid' || FC.pendingAction === 'bulk-remove') { FC.runBulk(FC.pendingAction); return; }
    var p = FC.findById(FC.pendingId);
    if (!p) { FC.closeDialog(); return; }
    if (FC.pendingAction === 'rename') {
      var newName = FC.dlgInput.value.trim();
      var subEl = document.getElementById('dlgSub');
      var withLink = !!FC.dlgInput2 && FC.dlgInput2.style.display === 'block';
      var newLink = withLink ? FC.dlgInput2.value.trim() : '';
      if (!newName) { subEl.textContent = 'Enter a name.'; subEl.className = 'err'; return; }
      if (withLink && !newLink) { subEl.textContent = 'Enter the unique link.'; subEl.className = 'err'; return; }
      var newGender = FC.dlgGender && !FC.dlgGender.hidden ? FC.dlgGenderValue : null;
      if (newName === p.name && (!withLink || newLink === FC.cfg.linkOf(p)) && (newGender === null || newGender === (p.gender === 'F' ? 'F' : 'M'))) { FC.closeDialog(); return; }
      FC.busy = true;
      FC.clearError();
      var keepOpen = false;
      var renameBody = withLink ? { name: newName, link: newLink } : { name: newName };
      if (newGender !== null) renameBody.gender = newGender;
      FC.api('POST', '/' + encodeURIComponent(p.id) + '/rename', renameBody)
        .then(function (res) {
          p.name = (res && res.name) || newName;
          if (newGender !== null) p.gender = newGender;
          if (withLink && FC.cfg.onLinkChanged) FC.cfg.onLinkChanged(p, (res && res.link) || newLink);
          FC.render();
          FC.peopleChanged();   // a new name can change what the page counts (e.g. the badminton female / male quantities)
        })
        .catch(function (err) {
          if (err.status === 409 && err.body && err.body.message) {
            // The link belongs to someone else: say so and leave the box open to fix it.
            subEl.textContent = err.body.message;
            subEl.className = 'err';
            keepOpen = true;
          } else {
            FC.showError('Could not save the player. ' + err.message);
          }
        })
        .then(function () { FC.busy = false; if (!keepOpen) FC.closeDialog(); });
      return;
    }
    FC.busy = true;
    FC.clearError();
    if (FC.pendingAction === 'remove') {
      FC.api('POST', '/' + encodeURIComponent(p.id) + '/delete')
        .then(function () { FC.people = FC.people.filter(function (x) { return x.id !== p.id; }); FC.render(); FC.peopleChanged(); })
        .catch(function (err) { FC.showError('Could not remove the player. ' + err.message); })
        .then(function () { FC.busy = false; FC.closeDialog(); });
      return;
    }
    var next = !p.paid;
    FC.api('POST', '/' + encodeURIComponent(p.id) + '/paid', { paid: next })
      .then(function (res) { p.paid = next; p.paidBy = next ? ((res && res.paidBy) || null) : null; FC.render(); FC.peopleChanged(); })
      .catch(function (err) { FC.showError('Could not save. ' + err.message); })
      .then(function () { FC.busy = false; FC.closeDialog(); });
  });


  function showInvalid() { document.body.classList.add('invalid'); }

  // ---- Helpers for the calculators ----------------------------------------------------------------
  function money(cents) { return (cents < 0 ? '-' : '') + (Math.abs(cents) / 100).toFixed(2); }

  // Keeps what is typed in a calculator box to a price (at most 2 decimals) or a whole number.
  function sanitize(el) {
    var v = el.value;
    if (el.getAttribute('data-kind') === 'qty') {
      el.value = v.replace(/\D/g, '');
      return;
    }
    v = v.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    var dot = v.indexOf('.');
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    el.value = v;
  }

  function tidy(el) {
    if (!el.value || el.value === '.') { el.value = ''; return; }
    if (el.getAttribute('data-kind') === 'qty') el.value = String(parseInt(el.value, 10));
    else el.value = parseFloat(el.value).toFixed(2);
  }

  // Makes a calculator box (data-kind="price" or "qty") sanitise what is typed, tidy it on leaving, and
  // select its whole value when tapped so typing replaces it. onInput runs after every change, onBlur
  // after the box is tidied.
  function bindNumberInput(el, onInput, onBlur) {
    el.addEventListener('input', function () { sanitize(el); if (onInput) onInput(el); });
    el.addEventListener('blur', function () { tidy(el); if (onBlur) onBlur(el); });

    // The mouseup guard stops desktop browsers from dropping the selection again when the click is
    // released; the timeout is for phones.
    var justFocused = false;
    el.addEventListener('focus', function () {
      justFocused = true;
      el.select();
      setTimeout(function () { if (document.activeElement === el) el.setSelectionRange(0, el.value.length); }, 0);
    });
    el.addEventListener('mouseup', function (e) {
      if (justFocused) { e.preventDefault(); justFocused = false; }
    });
  }
  // -------------------------------------------------------------------------------------------------
})();
