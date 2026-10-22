// FeesCore: long-press drag to reorder the list, and what the player boxes do.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};

  // ---- Long-press drag to reorder -----------------------------------------------------------------
  // Press and hold a name for a moment, then drag it to a new place. A quick tap still opens the usual
  // paid/unpaid popup, and moving before the hold time is up just scrolls the page as normal.
  var LONG_PRESS_MS = 380;
  var MOVE_TOLERANCE = 8;
  var SCROLL_EDGE = 70;
  var SCROLL_STEP = 14;
  var press = null;
  FC.drag = null;
  FC.suppressClick = false;
  var scrollTimer = null;

  function cancelPress() {
    if (press) { clearTimeout(press.timer); press = null; }
  }

  FC.grid.addEventListener('pointerdown', function (e) {
    if (FC.editing || FC.busy || FC.readOnly || FC.filter !== 'all' || FC.sortMode !== 'default' || e.button > 0) return;
    var card = e.target.closest('button.p');
    if (!card) return;
    press = { card: card, x: e.clientX, y: e.clientY };
    press.timer = setTimeout(startDrag, LONG_PRESS_MS);
  });

  FC.grid.addEventListener('contextmenu', function (e) { if (!FC.editing) e.preventDefault(); });

  function startDrag() {
    if (!press) return;
    var card = press.card;
    var rect = card.getBoundingClientRect();
    var ghost = card.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.removeAttribute('data-id');
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    FC.drag = { card: card, ghost: ghost, dx: press.x - rect.left, dy: press.y - rect.top, x: press.x, y: press.y, before: FC.people.slice() };
    card.classList.add('ph');
    moveGhost();
    press = null;
    if (navigator.vibrate) navigator.vibrate(15);
    scrollTimer = setInterval(autoScroll, 16);
  }

  function moveGhost() {
    FC.drag.ghost.style.left = (FC.drag.x - FC.drag.dx) + 'px';
    FC.drag.ghost.style.top = (FC.drag.y - FC.drag.dy) + 'px';
  }

  // Moves the dragged box's slot to wherever the finger is, so the other boxes make room for it.
  function shuffleUnder() {
    var el = document.elementFromPoint(FC.drag.x, FC.drag.y);
    var over = el && el.closest ? el.closest('#grid button.p') : null;
    if (!over || over === FC.drag.card) return;
    var kids = Array.prototype.slice.call(FC.grid.children);
    if (kids.indexOf(FC.drag.card) < kids.indexOf(over)) over.after(FC.drag.card); else over.before(FC.drag.card);
  }

  // Near the top or bottom of the screen the page scrolls so a box can be dragged a long way.
  function autoScroll() {
    if (!FC.drag) return;
    var top = Math.max(0, document.querySelector('header.top').getBoundingClientRect().bottom) + 24;
    if (FC.drag.y < top) window.scrollBy(0, -SCROLL_STEP);
    else if (FC.drag.y > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, SCROLL_STEP);
    else return;
    shuffleUnder();
  }

  document.addEventListener('pointermove', function (e) {
    if (press) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
      return;
    }
    if (!FC.drag) return;
    FC.drag.x = e.clientX;
    FC.drag.y = e.clientY;
    moveGhost();
    shuffleUnder();
  });

  function endDrag(cancelled) {
    cancelPress();
    if (!FC.drag) return;
    var d = FC.drag;
    FC.drag = null;
    clearInterval(scrollTimer);
    d.ghost.remove();
    FC.suppressClick = true;
    setTimeout(function () { FC.suppressClick = false; }, 80);

    var ids = Array.prototype.map.call(FC.grid.querySelectorAll('button.p'), function (c) { return c.getAttribute('data-id'); });
    var byId = {};
    FC.people.forEach(function (p) { byId[p.id] = p; });
    var next = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    var changed = !cancelled && next.length === d.before.length && next.some(function (p, i) { return p !== d.before[i]; });

    if (!changed) { FC.render(); return; }
    FC.people = next;
    FC.render();
    saveOrder(ids, d.before);
  }

  function saveOrder(ids, previous) {
    FC.busy = true;
    FC.clearError();
    FC.api('POST', '/order', { ids: ids })
      .catch(function (err) {
        FC.people = previous;
        FC.render();
        FC.showError('Could not save the new order. ' + err.message);
      })
      .then(function () { FC.busy = false; });
  }

  document.addEventListener('pointerup', function () { endDrag(false); });
  document.addEventListener('pointercancel', function () { endDrag(true); });
  // Once a box is picked up, stop the page scrolling under the finger.
  document.addEventListener('touchmove', function (e) { if (FC.drag) e.preventDefault(); }, { passive: false });
  // -------------------------------------------------------------------------------------------------

  FC.dlgInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btnConfirm').click();
  });
  if (FC.dlgInput2) FC.dlgInput2.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btnConfirm').click();
  });

  if (document.getElementById('btnEdit')) document.getElementById('btnEdit').addEventListener('click', function () {
    FC.editing = !FC.editing;
    FC.selected = {};
    FC.render();
  });
  // The popup of a player (paid / unpaid) has the three dots (Edit player, Remove player); the edit popup has a Remove button too.
  document.getElementById('btnDlgMore').addEventListener('click', function (e) {
    e.stopPropagation();
    var menu = document.getElementById('dlgMenu');
    menu.hidden = !menu.hidden;
    this.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  });
  document.getElementById('dialog').addEventListener('click', function (e) { if (!e.target.closest('#btnDlgMore')) FC.closeDlgMenu(); });   // a tap anywhere else in the popup closes the menu (not the popup)
  document.getElementById('btnDlgEditIc').addEventListener('click', function () {
    var p = FC.busy || FC.pendingId === null ? null : FC.findById(FC.pendingId);
    if (p) FC.openRenameDialog(p);
  });
  document.getElementById('btnDlgRemoveIc').addEventListener('click', function () {
    var p = FC.busy || FC.pendingId === null ? null : FC.findById(FC.pendingId);
    if (p) FC.openRemoveDialog(p);
  });
  var btnDlgRemove = document.getElementById('btnDlgRemove');
  if (btnDlgRemove) btnDlgRemove.addEventListener('click', function () {
    var p = FC.busy || FC.pendingId === null ? null : FC.findById(FC.pendingId);
    if (p) FC.openRemoveDialog(p);
  });

  function addPlayer() {
    if (FC.busy) return;
    var input = document.getElementById('newName');
    var name = input.value.trim();
    if (!name) { FC.showError('Enter a name first.'); return; }
    FC.busy = true;
    FC.clearError();
    FC.api('POST', '/add', { name: name })
      .then(function (list) { FC.people = list || []; input.value = ''; FC.pasteBox.open = false; FC.render(); input.focus(); FC.peopleChanged(); })
      .catch(function (err) { FC.showError('Could not add the player. ' + err.message); })
      .then(function () { FC.busy = false; });
  }
  // Pages that add players another way (pickleball searches known players) leave this box out.
  if (document.getElementById('btnAdd')) {
    document.getElementById('btnAdd').addEventListener('click', addPlayer);
    document.getElementById('newName').addEventListener('keydown', function (e) { if (e.key === 'Enter') addPlayer(); });
  }

  document.getElementById('btnCancel').addEventListener('click', FC.closeDialog);
})();
