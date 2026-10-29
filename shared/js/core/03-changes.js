// FeesCore: the card that tells what changed in the list.
// (Part of FeesCore (the player list, popups and the call to the server shared by every fee page): the files share the namespace window.FeesCoreParts; see fees.html for the order they load in.)
(function () {
  var FC = window.FeesCoreParts = window.FeesCoreParts || {};
  // What other files use from this one:
  FC.noteListChanges = noteListChanges;
  FC.renderChips = renderChips;
  FC.canSelect = canSelect;
  FC.tagChips = tagChips;
  FC.hasTagKey = hasTagKey;
  FC.peopleChanged = peopleChanged;
  FC.findById = findById;
  FC.closeDlgMenu = closeDlgMenu;
  FC.showDialog = showDialog;
  FC.openRemoveDialog = openRemoveDialog;
  FC.openRenameDialog = openRenameDialog;
  FC.openDialog = openDialog;
  FC.closeDialog = closeDialog;

  // ---- What changed in the list: a card at the bottom of the screen -------------------------------------------------------------------
  // Whoever changes the list (marks someone paid or unpaid, adds or removes players, on this page or another device) gets a card saying what
  // and by whom. The list is compared with how it was last drawn; a different session, the first drawing and a guest page say nothing.
  var seenList = null;      // { id: { name, paid, paidBy } } as last drawn
  var seenScope = null;     // the session that list belonged to
  FC.noticeLive = null;    // set while a reload caused by somebody else's change is drawn: { by } (their role, as the server said)

  function roleName(r) { return r === 'gm' ? 'Master Admin' : r === 'admin' ? 'Sub Admin' : ''; }

  function noteListChanges() {
    var now = {};
    FC.people.forEach(function (p) { now[p.id] = { name: p.name, paid: !!p.paid, paidBy: p.paidBy || '' }; });
    var before = seenList, sameSession = seenScope === FC.scope;
    seenList = now;
    seenScope = FC.scope;
    if (!before || !sameSession || FC.loading || FC.viewOnly || !window.AppShell || !AppShell.notify) return;
    var added = [], removed = [], paid = [], unpaid = [], paidBy = '';
    Object.keys(now).forEach(function (id) {
      if (!before[id]) added.push(now[id].name);
      else if (before[id].paid !== now[id].paid) {
        if (now[id].paid) { paid.push(now[id].name); paidBy = now[id].paidBy; } else unpaid.push(now[id].name);
      }
    });
    Object.keys(before).forEach(function (id) { if (!now[id]) removed.push(before[id].name); });
    var total = added.length + removed.length + paid.length + unpaid.length;
    if (!total) return;

    // Who: this page's own role for its own change; for somebody else's, who marked the player paid, or else who made the latest change.
    var who;
    if (FC.noticeLive) who = roleName(paid.length && !added.length && !removed.length && !unpaid.length && paidBy ? paidBy : FC.noticeLive.by) || 'Someone';
    else who = roleName(FC.role);
    var by = (who ? 'by ' + who + ' \u00b7 ' : '') + 'just now';

    var kind, title, sub = by;
    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
    if (total === 1) {
      if (added.length) { kind = 'add'; title = added[0] + ' added to the list'; }
      else if (removed.length) { kind = 'remove'; title = removed[0] + ' removed from the list'; }
      else if (paid.length) { kind = 'paid'; title = paid[0] + ' marked as paid'; }
      else { kind = 'unpaid'; title = unpaid[0] + ' marked as unpaid'; }
    } else if (!removed.length && !added.length && !unpaid.length) { kind = 'paid'; title = plural(paid.length, 'player') + ' marked as paid'; }
    else if (!removed.length && !added.length && !paid.length) { kind = 'unpaid'; title = plural(unpaid.length, 'player') + ' marked as unpaid'; }
    else if (!removed.length && !paid.length && !unpaid.length) { kind = 'add'; title = plural(added.length, 'player') + ' added'; }
    else if (!added.length && !paid.length && !unpaid.length) { kind = 'remove'; title = plural(removed.length, 'player') + ' removed'; }
    else {
      kind = 'multi';
      title = 'Player list updated';
      var parts = [];
      if (added.length) parts.push(added.length + ' added');
      if (removed.length) parts.push(removed.length + ' removed');
      if (paid.length) parts.push(paid.length + ' paid');
      if (unpaid.length) parts.push(unpaid.length + ' unpaid');
      sub = parts.join(', ') + ' \u00b7 ' + by;
    }
    AppShell.notify({ kind: kind, title: title, sub: sub });
  }

  // Who may tick players and mark them paid or unpaid in one go ("Select"): the Master Admin and the Sub Admin (the Sub Admin has no Remove), on
  // pages that have it (cfg.bulkEdit), never a guest.
  function canSelect() { return !!FC.cfg.bulkEdit && !FC.viewOnly && (!FC.readOnly || FC.admin); }

  // The tags of the players in this session, for the filter chips (case does not matter: "Regular" and "regular" are one chip): the tag on the most
  // players first, then by name. Only for a page that can look the tags up (cfg.tagsOf(player)), and never for a guest: the tags are the host's own
  // grouping and a guest is not shown them in the list either.
  function personTags(p) { return FC.cfg.tagsOf ? (FC.cfg.tagsOf(p) || []) : []; }
  function hasTagKey(p, key) { return personTags(p).some(function (t) { return String(t).toLowerCase() === key; }); }
  function tagChips() {
    if (FC.viewOnly || !FC.cfg.tagsOf) return [];
    var by = {};
    FC.people.forEach(function (p) {
      personTags(p).forEach(function (t) {
        var k = String(t).toLowerCase();
        if (!by[k]) by[k] = { key: k, label: t, count: 0 };
        by[k].count++;
      });
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  }

  // The filter chips above the tiles: All / Unpaid / Paid / Female / Male, each with its count (the last two show the gender symbol), then one "Tags"
  // chip when the players of this session have tags. It opens a panel under the row with one chip for each tag (so the row stays short however many
  // tags there are); picking a tag shows only those players and closes the panel, and the "Tags" chip then says which tag is on.
  var CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  FC.tagOpen = false;   // the tag panel is open
  FC.tagPanel = null;
  if (FC.chipsEl) {
    FC.tagPanel = document.createElement('div');
    FC.tagPanel.id = 'tagChips';
    FC.tagPanel.className = 'chips tagpanel';
    FC.tagPanel.hidden = true;
    FC.chipsEl.parentNode.insertBefore(FC.tagPanel, FC.chipsEl.nextSibling);
  }

  function renderChips(paidCount) {
    if (!FC.chipsEl) return;
    var selecting = FC.editing && canSelect();
    FC.chipsEl.hidden = !FC.cfg.tiles || !FC.people.length || (FC.editing && !selecting);   // (a guest gets All, female and male: how many are coming, not who has paid)
    if (FC.sortRow) {
      FC.sortRow.hidden = FC.chipsEl.hidden || selecting;
      var selBtn = FC.sortRow.querySelector('.selbtn');
      if (selBtn) selBtn.hidden = !canSelect();
      FC.paintSort();
    }
    var tags = FC.chipsEl.hidden || selecting ? [] : tagChips();
    if (!tags.length) FC.tagOpen = false;
    if (FC.tagPanel) { FC.tagPanel.hidden = !FC.tagOpen; FC.tagPanel.textContent = ''; }
    if (FC.chipsEl.hidden) return;
    FC.chipsEl.textContent = '';
    if (selecting) {
      // Select mode: shortcuts to tick the unpaid or everybody, and Done to leave (the filter chips come back).
      var unpaidCount = FC.people.length - paidCount;
      [['unpaid', 'Select unpaid ' + unpaidCount], ['all', 'Select all ' + FC.people.length], ['done', 'Done']].forEach(function (c) {
        var sb = document.createElement('button');
        sb.type = 'button';
        sb.className = 'chip' + (c[0] === 'done' ? ' done' : '');
        sb.setAttribute('data-s', c[0]);
        sb.textContent = c[1];
        FC.chipsEl.appendChild(sb);
      });
      return;
    }
    var females = FC.people.filter(function (p) { return p.gender === 'F'; }).length;
    [['all', 'All', FC.people.length], ['unpaid', 'Unpaid', FC.people.length - paidCount], ['paid', 'Paid', paidCount],
     ['female', '\u2640\ufe0e', females, 'Female'], ['male', '\u2642\ufe0e', FC.people.length - females, 'Male']].filter(function (c) {
      return !FC.viewOnly || (c[0] !== 'paid' && c[0] !== 'unpaid');   // a guest is never shown who has paid
    }).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (c[3] ? ' g ' + c[0] : '') + (FC.filter === c[0] ? ' on' : '');
      b.setAttribute('data-f', c[0]);
      b.textContent = c[1] + ' ' + c[2];
      if (c[3]) b.setAttribute('aria-label', c[3] + ' ' + c[2]);
      FC.chipsEl.appendChild(b);
    });
    if (!tags.length) return;
    var active = null;
    tags.forEach(function (c) { if (FC.filter === 'tag:' + c.key) active = c; });
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chip tagtoggle' + (active ? ' on' : '');
    toggle.setAttribute('data-t', 'toggle');
    toggle.setAttribute('aria-expanded', FC.tagOpen ? 'true' : 'false');
    toggle.setAttribute('aria-controls', 'tagChips');
    toggle.appendChild(document.createTextNode(active ? active.label + ' ' + active.count : 'Tags'));
    toggle.insertAdjacentHTML('beforeend', CHEV);
    FC.chipsEl.appendChild(toggle);
    tags.forEach(function (c) {
      var tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'chip tag' + (FC.filter === 'tag:' + c.key ? ' on' : '');
      tb.setAttribute('data-f', 'tag:' + c.key);
      tb.textContent = c.label + ' ' + c.count;
      tb.setAttribute('aria-label', 'Tag ' + c.label + ', ' + c.count);
      FC.tagPanel.appendChild(tb);
    });
  }
  if (FC.chipsEl) FC.chipsEl.addEventListener('click', function (e) {
    var s = e.target.closest('button[data-s]');
    if (s) { FC.selectChip(s.getAttribute('data-s')); return; }   // (04-edit-mode.js)
    if (e.target.closest('button[data-t]')) { FC.tagOpen = !FC.tagOpen; FC.render(); return; }
    var b = e.target.closest('button[data-f]');
    if (!b) return;
    var picked = b.getAttribute('data-f');
    FC.filter = picked === FC.filter ? 'all' : picked;   // the chip that is already on, tapped again, goes back to All
    FC.tagOpen = false;
    FC.render();
  });
  if (FC.tagPanel) FC.tagPanel.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-f]');
    if (!b) return;
    var picked = b.getAttribute('data-f');
    FC.filter = picked === FC.filter ? 'all' : picked;
    FC.tagOpen = false;
    FC.render();
  });
  if (FC.sortRow) {
    FC.sortRow.querySelector('.sortbtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = FC.sortRow.querySelector('.sortmenu');
      menu.hidden = !menu.hidden;
      FC.sortRow.querySelector('.sortbtn').setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    FC.sortRow.querySelector('.sortmenu').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sort]');
      if (!b) return;
      FC.sortMode = b.getAttribute('data-sort');
      try { localStorage.setItem('autobot.sortBy', FC.sortMode); } catch (err) { }
      FC.closeSortMenu();
      FC.render();
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.sortwrap')) FC.closeSortMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') FC.closeSortMenu(); });
  }

  // Lets the page's own script react when people are added, removed, renamed or loaded, or marked paid (not on reorder).
  function peopleChanged() {
    if (FC.cfg.onPeopleChange) FC.cfg.onPeopleChange(FC.people.length, FC.people);
  }

  function findById(id) {
    for (var i = 0; i < FC.people.length; i++) if (FC.people[i].id === id) return FC.people[i];
    return null;
  }

  FC.dlgInput = document.getElementById('dlgInput');
  FC.dlgInput2 = document.getElementById('dlgInput2');   // second box (pickleball: the unique link), if the page has it
  FC.dlgGender = document.getElementById('dlgGender');   // the male / female buttons of the edit dialog, if the page has them
  FC.dlgGenderValue = 'M';

  function setDlgGender(g) {
    FC.dlgGenderValue = g === 'F' ? 'F' : 'M';
    Array.prototype.forEach.call(FC.dlgGender.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-g') === FC.dlgGenderValue;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  if (FC.dlgGender) FC.dlgGender.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-g]');
    if (b) setDlgGender(b.getAttribute('data-g'));
  });

  // The "three dots" button in the top right corner of a player's popup. It opens a small menu with Edit player and Remove player.
  var DOTS = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="3" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="13" r="1.4" fill="currentColor"/></svg>';
  var dlgIcons = document.createElement('div');
  dlgIcons.id = 'dlgIcons';
  dlgIcons.hidden = true;
  dlgIcons.innerHTML = '<button type="button" id="btnDlgMore" aria-label="More" title="More" aria-haspopup="true" aria-expanded="false">' + DOTS + '</button>'
    + '<div id="dlgMenu" role="menu" hidden>'
    + '<button type="button" role="menuitem" id="btnDlgEditIc">' + FC.PENCIL + '<span>Edit player</span></button>'
    + '<button type="button" role="menuitem" id="btnDlgRemoveIc">' + FC.TRASH + '<span>Remove player</span></button></div>';
  function closeDlgMenu() {
    var menu = document.getElementById('dlgMenu');
    if (menu) menu.hidden = true;
    var more = document.getElementById('btnDlgMore');
    if (more) more.setAttribute('aria-expanded', 'false');
  }
  FC.overlay.querySelector('#dialog').insertBefore(dlgIcons, FC.overlay.querySelector('#dialog').firstChild);

  function showDialog(action, p, title, sub, confirmText, withInput) {
    FC.pendingAction = action;
    FC.pendingId = p.id;
    var extraRemove = document.getElementById('btnDlgRemove');   // (the text Remove button belongs to the edit popup)
    if (extraRemove) extraRemove.hidden = true;
    dlgIcons.hidden = true;
    FC.closeDlgMenu();
    document.getElementById('dialog').classList.remove('pdlg', 'edlg', 'noicons');   // (only the player's own popup and its edit popup have the grid of buttons, see openDialog / openRenameDialog)
    document.getElementById('dlgTitle').textContent = title;
    var subEl = document.getElementById('dlgSub');
    subEl.textContent = sub;
    subEl.className = '';
    document.getElementById('btnConfirm').textContent = confirmText;
    FC.dlgInput.style.display = withInput ? 'block' : 'none';
    if (FC.dlgInput2) FC.dlgInput2.style.display = 'none';
    if (FC.dlgGender) FC.dlgGender.hidden = true;
    FC.overlay.style.display = 'flex';
    if (withInput) { FC.dlgInput.value = p.name; FC.dlgInput.focus(); FC.dlgInput.select(); }
  }

  function openRemoveDialog(p) {
    FC.showDialog('remove', p, 'Remove ' + p.name + ' from the list?', 'Their paid status will be removed too.', 'Remove', false);
  }

  // The pencil. On a page that gives players a unique link (cfg.linkOf), name and link are edited together.
  function openRenameDialog(p) {
    var link = FC.cfg.linkOf && FC.dlgInput2 ? FC.cfg.linkOf(p) : null;
    if (link === null || link === undefined) {
      FC.showDialog('rename', p, 'Edit player', 'Their paid status stays the same.', 'Save', true);
    } else {
      FC.showDialog('rename', p, 'Edit player', 'Their paid status stays the same. Each player needs their own unique link.', 'Save', true);
      FC.dlgInput2.style.display = 'block';
      FC.dlgInput2.value = link;
    }
    // A page with genders (the tile pages) can change it here too.
    if (FC.cfg.tiles && FC.dlgGender) { FC.dlgGender.hidden = false; setDlgGender(p.gender); }
    var extraRemove = document.getElementById('btnDlgRemove');
    if (extraRemove) extraRemove.hidden = FC.readOnly;
    document.getElementById('dialog').classList.add('edlg');   // Cancel | Save, then Remove on its own line
  }

  function openDialog(p) {
    FC.showDialog('paid', p,
      p.paid ? 'Revert ' + p.name + ' to unpaid?' : 'Mark ' + p.name + ' as paid?',
      p.paid ? (p.paidBy ? 'Marked as paid by ' + roleName(p.paidBy) + '. ' : '') + 'It will show as unpaid again.' : 'It will show as paid.',
      p.paid ? 'Mark unpaid' : 'Confirm paid', false);
    // The player's popup: Remove (trash) and Edit player (pencil) as two small icons in its top right corner, then Cancel | the paid button
    // (a Sub Admin has no icons).
    dlgIcons.hidden = FC.readOnly;
    document.getElementById('dialog').classList.add('pdlg');
    document.getElementById('dialog').classList.toggle('noicons', !!FC.readOnly);   // no icons: the title may use the whole width
  }

  function closeDialog() { FC.pendingId = null; FC.overlay.style.display = 'none'; }
})();
