// FeesCore: edit mode with tick boxes.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.buildBulkBar = buildBulkBar;
  FC.renderBulkBar = renderBulkBar;
  FC.runBulk = runBulk;

  // ---- Edit mode with tick boxes (cfg.bulkEdit): tick several players, then mark them paid or remove them
  function ticked() {
    return FC.people.filter(function (p) { return FC.selected[p.id]; }).map(function (p) { return p.id; });
  }

  function toggleTick(id) {
    if (FC.selected[id]) delete FC.selected[id]; else FC.selected[id] = true;
    FC.render();
  }

  var bulkBar = null;
  function buildBulkBar() {
    bulkBar = document.createElement('div');
    bulkBar.id = 'bulkBar';
    bulkBar.hidden = true;
    bulkBar.innerHTML = '<div class="info"><span id="bulkCount">0 ticked</span><button type="button" id="btnBulkAll">Tick all</button></div>'
      + '<div class="btns"><button type="button" id="btnBulkPaid">Mark as paid</button>'
      + '<button type="button" id="btnBulkDelete" class="danger">Delete selected players</button></div>';
    document.body.appendChild(bulkBar);

    document.getElementById('btnBulkAll').addEventListener('click', function () {
      var all = ticked().length === FC.people.length;
      FC.selected = {};
      if (!all) FC.people.forEach(function (p) { FC.selected[p.id] = true; });
      FC.render();
    });
    document.getElementById('btnBulkPaid').addEventListener('click', function () { askBulk('bulk-paid'); });
    document.getElementById('btnBulkDelete').addEventListener('click', function () { askBulk('bulk-remove'); });
  }

  function renderBulkBar() {
    if (!bulkBar) return;
    // Forget ticks for people who are gone.
    Object.keys(FC.selected).forEach(function (id) { if (!FC.findById(id)) delete FC.selected[id]; });
    var show = FC.editing && !FC.readOnly;
    bulkBar.hidden = !show;
    document.body.classList.toggle('has-bulk', show);
    // A master user's navigation bar is already at the bottom, so this bar sits just above it.
    var nav = document.getElementById('masterNav');
    bulkBar.style.bottom = nav ? nav.offsetHeight + 'px' : '0';
    var n = ticked().length;
    document.getElementById('bulkCount').textContent = n + ' ticked';
    document.getElementById('btnBulkAll').textContent = n === FC.people.length && n > 0 ? 'Untick all' : 'Tick all';
  }

  function askBulk(action) {
    var ids = ticked();
    if (!ids.length) { FC.showError('Tick at least one player first.'); return; }
    FC.clearError();
    var n = ids.length;
    var who = n === 1 ? FC.findById(ids[0]).name : n + ' players';
    if (action === 'bulk-paid') {
      FC.showDialog(action, { id: '__bulk', name: '' }, 'Mark ' + who + ' as paid?', 'Their boxes will turn green.', 'Confirm paid', false);
    } else {
      FC.showDialog(action, { id: '__bulk', name: '' }, 'Remove ' + who + ' from the list?', 'Their paid status will be removed too.', 'Remove', false);
    }
  }

  function runBulk(action) {
    var ids = ticked();
    if (!ids.length) { FC.closeDialog(); return; }
    var removing = action === 'bulk-remove';
    FC.busy = true;
    FC.clearError();
    FC.api('POST', removing ? '/remove' : '/mark-paid', removing ? { ids: ids } : { ids: ids, paid: true })
      .then(function (list) {
        FC.people = list || [];
        FC.selected = {};
        FC.render();
        FC.peopleChanged();   // players removed, or marked paid: either changes who has paid
      })
      .catch(function (err) { FC.showError('Could not ' + (removing ? 'remove the players' : 'save') + '. ' + err.message); })
      .then(function () { FC.busy = false; FC.closeDialog(); });
  }

  FC.grid.addEventListener('click', function (e) {
    // The click that ends a drag must not open the paid/unpaid popup.
    if (FC.suppressClick) { FC.suppressClick = false; return; }
    if (FC.editing && FC.cfg.bulkEdit) {
      var rename = e.target.closest('button[data-act="rename"]');
      if (rename) { var target = FC.findById(rename.getAttribute('data-id')); if (target) FC.openRenameDialog(target); return; }
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
