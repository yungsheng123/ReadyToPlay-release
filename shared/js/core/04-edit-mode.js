// FeesCore: select mode (tick several players, then mark them paid or unpaid, or remove them).
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.buildBulkBar = buildBulkBar;
  FC.renderBulkBar = renderBulkBar;
  FC.runBulk = runBulk;
  FC.selectChip = selectChip;

  // ---- Select mode (cfg.bulkEdit): the "Select" button beside Sort by starts it; the Master Admin and the Sub Admin tick players and use the bar at
  // the bottom (the Sub Admin has no Remove, the server would refuse it). "Done" (or Escape) ends it.
  function ticked() {
    return FC.people.filter(function (p) { return FC.selected[p.id]; }).map(function (p) { return p.id; });
  }

  function toggleTick(id) {
    if (FC.selected[id]) delete FC.selected[id]; else FC.selected[id] = true;
    FC.render();
  }

  function startSelect() {
    if (!FC.canSelect() || !FC.people.length) return;
    FC.editing = true;
    FC.filter = 'all';   // (the filter chips are replaced by the select shortcuts meanwhile)
    FC.selected = {};
    FC.render();
  }

  function endSelect() {
    FC.editing = false;
    FC.selected = {};
    FC.render();
  }

  // The shortcut chips of select mode: tick the unpaid, tick everybody, or leave.
  function selectChip(kind) {
    if (kind === 'done') { endSelect(); return; }
    FC.selected = {};
    FC.people.forEach(function (p) { if (kind === 'all' || !p.paid) FC.selected[p.id] = true; });
    FC.render();
  }

  var bulkBar = null;
  function buildBulkBar() {
    bulkBar = document.createElement('div');
    bulkBar.id = 'bulkBar';
    bulkBar.hidden = true;
    bulkBar.innerHTML = '<div class="info"><span id="bulkCount">0 selected</span><button type="button" id="btnBulkAll">Clear</button></div>'
      + '<div class="btns"><button type="button" id="btnBulkPaid">Mark paid</button>'
      + '<button type="button" id="btnBulkUnpaid">Mark unpaid</button>'
      + '<button type="button" id="btnBulkDelete" class="danger">Remove</button></div>';
    document.body.appendChild(bulkBar);

    document.getElementById('btnBulkAll').addEventListener('click', function () { FC.selected = {}; FC.render(); });
    document.getElementById('btnBulkPaid').addEventListener('click', function () { askBulk('bulk-paid'); });
    document.getElementById('btnBulkUnpaid').addEventListener('click', function () { askBulk('bulk-unpaid'); });
    document.getElementById('btnBulkDelete').addEventListener('click', function () { askBulk('bulk-remove'); });
    if (FC.sortRow) FC.sortRow.querySelector('.selbtn').addEventListener('click', startSelect);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && FC.editing && FC.overlay.style.display !== 'flex') endSelect();   // (an open popup takes the Escape first)
    });
  }

  function renderBulkBar() {
    if (!bulkBar) return;
    // Forget ticks for people who are gone.
    Object.keys(FC.selected).forEach(function (id) { if (!FC.findById(id)) delete FC.selected[id]; });
    var show = FC.editing && FC.canSelect();
    bulkBar.hidden = !show;
    document.body.classList.toggle('has-bulk', show);
    // A master user's navigation bar is already at the bottom, so this bar sits just above it.
    var nav = document.getElementById('masterNav');
    bulkBar.style.bottom = nav ? nav.offsetHeight + 'px' : '0';
    var n = ticked().length;
    document.getElementById('bulkCount').textContent = n + ' selected';
    document.getElementById('btnBulkAll').hidden = n === 0;
    document.getElementById('btnBulkDelete').hidden = FC.readOnly;   // the Sub Admin cannot remove players
  }

  function askBulk(action) {
    var ids = ticked();
    if (!ids.length) { FC.showError('Tick at least one player first.'); return; }
    FC.clearError();
    var n = ids.length;
    var who = n === 1 ? FC.findById(ids[0]).name : n + ' players';
    var none = { id: '__bulk', name: '' };
    if (action === 'bulk-paid') FC.showDialog(action, none, 'Mark ' + who + ' as paid?', 'They will show as paid.', 'Confirm paid', false);
    else if (action === 'bulk-unpaid') FC.showDialog(action, none, 'Revert ' + who + ' to unpaid?', 'They will show as unpaid again.', 'Mark unpaid', false);
    else FC.showDialog(action, none, 'Remove ' + who + ' from this session?', 'Their paid status will be removed too. They stay in your saved players.', 'Remove', false);
  }

  function runBulk(action) {
    var ids = ticked();
    if (!ids.length) { FC.closeDialog(); return; }
    var removing = action === 'bulk-remove';
    FC.busy = true;
    FC.clearError();
    FC.api('POST', removing ? '/remove' : '/mark-paid', removing ? { ids: ids } : { ids: ids, paid: action === 'bulk-paid' })
      .then(function (list) {
        FC.people = list || [];
        FC.selected = {};
        FC.render();
        FC.peopleChanged();   // players removed, or marked paid or unpaid: either changes who has paid
      })
      .catch(function (err) { FC.showError('Could not ' + (removing ? 'remove the players' : 'save') + '. ' + err.message); })
      .then(function () { FC.busy = false; FC.closeDialog(); });
  }

  FC.grid.addEventListener('click', function (e) {
    // The click that ends a drag must not open the paid/unpaid popup.
    if (FC.suppressClick) { FC.suppressClick = false; return; }
    if (FC.editing && FC.cfg.bulkEdit) {
      var tapped = e.target.closest('.p[data-pid]');
      if (tapped) toggleTick(tapped.getAttribute('data-pid'));
      return;
    }
    var b = e.target.closest('button[data-id]');
    if (!b) return;
    var p = FC.findById(b.getAttribute('data-id'));
    if (!p) return;
    var act = b.getAttribute('data-act');
    if (act === 'rename') FC.openRenameDialog(p);
    else if (act === 'remove') FC.openRemoveDialog(p);
    else FC.openDialog(p);
  });
})();
