// The fees page: dragging a tag onto a player, and editing tags.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};

  // ---- Drag a tag onto a player (owner) -------------------------------------------------------------------------------
  // Press and hold a tag in the row on top, then drag it onto a player in the list: the player gets that tag. With a mouse
  // the drag starts as soon as the pointer moves; on a phone it starts after a short hold (moving earlier is just a tap or
  // a scroll). A plain tap still narrows the list to that tag.
  var tagPress = null;          // a tag pressed, drag not started yet
  var tagDrag = null;           // the drag in progress
  var tagScrollTimer = null;
  FA.tagSuppress = false;      // the click that ends a drag must not also filter the list
  var TAG_HOLD_MS = 350;
  var TAG_MOVE = 6;

  // A line under the list's count: what just happened (or why it did not).
  function pmFlash(text, isError) {
    FA.el('pmCount').textContent = text;
    FA.el('pmCount').className = 'pmcount' + (isError ? ' err' : '');
  }

  function cancelTagPress() {
    if (tagPress) { clearTimeout(tagPress.timer); tagPress = null; }
  }

  function startTagDrag() {
    if (!tagPress) return;
    var ghost = tagPress.btn.cloneNode(true);
    ghost.className = 'tagfilter tagghost';
    ghost.removeAttribute('data-tag');
    document.body.appendChild(ghost);
    tagDrag = { tag: tagPress.tag, ghost: ghost, x: tagPress.x, y: tagPress.y, over: null };
    clearTimeout(tagPress.timer);
    tagPress = null;
    document.body.classList.add('tagdragging');
    if (navigator.vibrate) navigator.vibrate(15);
    moveTagGhost();
    tagScrollTimer = setInterval(function () {
      if (!tagDrag) return;
      var top = Math.max(0, document.querySelector('.panelview[data-panel="players"] header.top').getBoundingClientRect().bottom) + 24;
      if (tagDrag.y < top) window.scrollBy(0, -14);
      else if (tagDrag.y > window.innerHeight - 70) window.scrollBy(0, 14);
      else return;
      markTagTarget();
    }, 16);
  }

  function moveTagGhost() {
    tagDrag.ghost.style.left = (tagDrag.x - tagDrag.ghost.offsetWidth / 2) + 'px';
    tagDrag.ghost.style.top = (tagDrag.y - tagDrag.ghost.offsetHeight / 2 - 26) + 'px';   // a little above the finger, so it stays visible
    markTagTarget();
  }

  // The player row under the pointer lights up.
  function markTagTarget() {
    var found = document.elementFromPoint(tagDrag.x, tagDrag.y);
    var row = found && found.closest ? found.closest('#pmList li') : null;
    if (row === tagDrag.over) return;
    if (tagDrag.over) tagDrag.over.classList.remove('pmdrop');
    tagDrag.over = row;
    if (row) row.classList.add('pmdrop');
  }

  function endTagDrag(cancelled) {
    cancelTagPress();
    if (!tagDrag) return;
    var d = tagDrag;
    tagDrag = null;
    clearInterval(tagScrollTimer);
    d.ghost.remove();
    document.body.classList.remove('tagdragging');
    if (d.over) d.over.classList.remove('pmdrop');
    FA.tagSuppress = true;
    setTimeout(function () { FA.tagSuppress = false; }, 80);
    if (!cancelled && d.over) assignTag(d.over.getAttribute('data-id'), d.tag, d.over.getAttribute('data-sport'));
  }

  // Gives the known player this tag (one they already have is left alone) and saves them.
  function assignTag(id, tag, sport) {
    var player = sport ? FA.findOtherPlayer(sport, id) : FA.knownById(id);
    if (!player || FA.pmBusy) return;
    if (FA.hasTag(player, tag)) { pmFlash(player.name + ' already has the tag ' + tag + '.', true); return; }
    if (FA.tagsOf(player).length >= FA.MAX_TAGS) { pmFlash(player.name + ' already has ' + FA.MAX_TAGS + ' tags.', true); return; }
    var body = { name: player.name, link: player.link, tags: FA.tagsOf(player).concat([tag]) };
    FA.pmBusy = true;
    pmFlash('Saving...', false);
    (sport
      ? FA.otherCall({ sport: sport, code: FA.otherDirs[sport].code }, 'POST', '/players/' + encodeURIComponent(player.id) + '/update', body)
      : FeesCore.api('POST', '/players/' + encodeURIComponent(player.id) + '/update', body, null))
      .then(function (data) {
        if (sport) FA.mergeOtherPlayer(sport, data.player); else FA.applyDirectoryAnswer(data);
        FeesCore.render();   // the tags under the names on the fees list
        FA.renderRanking();
        FA.renderPlayers();
        pmFlash('Added the tag ' + tag + ' to ' + player.name + '.', false);
        // A Regular tag moves the player to the Regular rows of the calculator: the answer carries the new quantities (X-Session header).
      })
      .catch(function (err) { pmFlash('Could not add the tag. ' + err.message, true); })
      .then(function () { FA.pmBusy = false; });
  }

  if (FA.owner) {
    FA.el('pmFilter').addEventListener('pointerdown', function (e) {
      if (FA.pmBusy || e.button > 0) return;
      var b = e.target.closest('button[data-tag]');
      if (!b) return;
      tagPress = { btn: b, tag: b.getAttribute('data-tag'), x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
      if (tagPress.touch) tagPress.timer = setTimeout(startTagDrag, TAG_HOLD_MS);
    });
    document.addEventListener('pointermove', function (e) {
      if (tagPress) {
        var moved = Math.hypot(e.clientX - tagPress.x, e.clientY - tagPress.y);
        if (moved <= TAG_MOVE) return;
        if (tagPress.touch) { cancelTagPress(); return; }   // moved before the hold time: not a drag
        startTagDrag();
      }
      if (!tagDrag) return;
      tagDrag.x = e.clientX;
      tagDrag.y = e.clientY;
      moveTagGhost();
    });
    document.addEventListener('pointerup', function () { endTagDrag(false); });
    document.addEventListener('pointercancel', function () { endTagDrag(true); });
    // Once a tag is picked up, stop the page scrolling under the finger.
    document.addEventListener('touchmove', function (e) { if (tagDrag) e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') endTagDrag(true); });
    FA.el('pmFilter').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---- Edit tags (owner): rename a tag, or take it off every player that has it ------------------------------------------------------
  // The tags of the players on screen (all sports of the account, or the one the sport chip picked) with how many players have each. A rename or
  // a removal is one call per sport that has the tag; the answer lists the players whose tags changed.
  var tgBusy = false;
  var tgMode = null;   // the row being changed: { tag, kind: 'rename' | 'delete' }
  var TG_NOTE = 'Renaming or removing a tag changes it on every player who has it.';

  function tgTargets(tag) {
    var seen = {}, list = [];
    FA.pmAllRows().forEach(function (r) {
      if (!FA.hasTag(r.p, tag) || seen[r.sport]) return;
      seen[r.sport] = true;
      list.push(r.here ? { sport: r.sport, here: true } : { sport: r.sport, here: false, code: r.code });
    });
    return list;
  }

  function tgSay(text, isError) {
    FA.el('tgSub').textContent = text;
    FA.el('tgSub').className = isError ? 'err' : '';
  }

  function isRegularTag(tag) { var k = tag.toLowerCase(); return k === 'regular' || k === 'adhoc'; }

  function tgButton(className, text, html) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    if (html) b.innerHTML = html; else b.textContent = text;
    return b;
  }

  function renderTgList() {
    var list = FA.el('tgList');
    list.textContent = '';
    var counts = FA.tagCounts();
    if (!counts.length) { var none = document.createElement('li'); none.className = 'tgnone'; none.textContent = 'No tags yet.'; list.appendChild(none); return; }
    counts.forEach(function (c) {
      var li = document.createElement('li');
      li.setAttribute('data-tag', c.tag);
      var mode = tgMode && tgMode.tag.toLowerCase() === c.tag.toLowerCase() ? tgMode.kind : '';
      if (mode === 'rename') {
        var input = document.createElement('input');
        input.type = 'text'; input.maxLength = 30; input.value = c.tag; input.autocomplete = 'off';
        input.setAttribute('aria-label', 'New name for ' + c.tag);
        input.className = 'tgin';
        li.appendChild(input);
        li.appendChild(tgButton('tgcancel', 'Cancel'));
        li.appendChild(tgButton('tgsave primary', 'Save'));
        list.appendChild(li);
        return;
      }
      var name = document.createElement('span');
      name.className = 'tgname';
      name.appendChild(FA.tagChip(c.tag, c.tag.toLowerCase() === FA.FREE_TAG ? 'free' : ''));
      var n = document.createElement('small');
      n.textContent = c.count + (c.count === 1 ? ' player' : ' players');
      name.appendChild(n);
      li.appendChild(name);
      if (mode === 'delete') {
        var ask = document.createElement('span');
        ask.className = 'tgask';
        ask.textContent = 'Remove this tag from ' + (c.count === 1 ? 'the player' : 'all ' + c.count + ' players') + '?' + (isRegularTag(c.tag) ? ' They will leave the Regular rows of the calculator.' : '');
        li.appendChild(ask);
        li.appendChild(tgButton('tgcancel', 'Keep'));
        li.appendChild(tgButton('tgremove', 'Remove'));
        list.appendChild(li);
        return;
      }
      var ren = tgButton('tgren icon', '', FA.PENCIL); ren.setAttribute('aria-label', 'Rename ' + c.tag);
      var del = tgButton('tgdel icon', '', FA.TRASH); del.setAttribute('aria-label', 'Remove tag ' + c.tag);
      li.appendChild(ren);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function openTg() {
    tgMode = null;
    tgSay(TG_NOTE, false);
    renderTgList();
    FA.el('tgOverlay').style.display = 'flex';
  }
  function closeTg() { FA.el('tgOverlay').style.display = 'none'; tgMode = null; }

  // Sends the change to every sport that has the tag, then updates the lists on screen from the answers.
  function changeTag(tag, to) {
    if (tgBusy) return;
    var targets = tgTargets(tag);
    if (!targets.length) { tgMode = null; renderTgList(); return; }
    var path = to === null ? '/tag-delete' : '/tag-rename';
    var body = to === null ? { tag: tag } : { from: tag, to: to };
    tgBusy = true;
    tgSay('Saving...', false);
    Promise.all(targets.map(function (t) {
      return (t.here ? FeesCore.api('POST', path, body, null) : FA.otherCall({ sport: t.sport, code: t.code }, 'POST', path, body)).then(function (data) {
        var dir = t.here ? FA.directory : (FA.otherDirs[t.sport] ? FA.otherDirs[t.sport].directory : []);
        (data.changed || []).forEach(function (c) { dir.forEach(function (d) { if (d.id === c.id) d.tags = c.tags; }); });
      });
    })).then(function () {
      if (FA.pmTagFilter.toLowerCase() === tag.toLowerCase()) FA.pmTagFilter = to === null ? '' : to;
      tgMode = null;
      tgSay(to === null ? 'Tag removed.' : 'Tag renamed.', false);
      renderTgList();
      FA.renderPlayers();
    }).catch(function (err) {
      tgSay('Could not change the tag. ' + (err && err.message ? err.message : ''), true);
      FA.renderPlayers();
    }).then(function () { tgBusy = false; });
  }

  function tgSave(li, tag) {
    var next = li.querySelector('input.tgin').value.trim().replace(/\s+/g, ' ');
    if (!next) { tgSay('Enter a tag.', true); return; }
    if (next.length > 30) { tgSay('A tag can have at most 30 characters.', true); return; }
    if (next === tag) { tgMode = null; renderTgList(); return; }
    changeTag(tag, next);
  }

  if (FA.owner) {
    FA.el('pmTagsEdit').addEventListener('click', openTg);
    FA.el('tgDone').addEventListener('click', closeTg);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && FA.el('tgOverlay').style.display === 'flex') closeTg(); });
    FA.el('tgList').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-tag]');
      if (!li) return;
      var tag = li.getAttribute('data-tag');
      if (e.target.closest('button.tgren')) { tgMode = { tag: tag, kind: 'rename' }; renderTgList(); var box = FA.el('tgList').querySelector('input.tgin'); if (box) { box.focus(); box.select(); } return; }
      if (e.target.closest('button.tgdel')) { tgMode = { tag: tag, kind: 'delete' }; tgSay(TG_NOTE, false); renderTgList(); return; }
      if (e.target.closest('button.tgcancel')) { tgMode = null; tgSay(TG_NOTE, false); renderTgList(); return; }
      if (e.target.closest('button.tgremove')) { changeTag(tag, null); return; }
      if (e.target.closest('button.tgsave')) tgSave(li, tag);
    });
    FA.el('tgList').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var li = e.target.closest('li[data-tag]');
      if (li && e.target.classList.contains('tgin')) tgSave(li, li.getAttribute('data-tag'));
    });
  }

  if (FA.owner) {
    FA.el('pmAdd').addEventListener('click', function () { FA.openPm(null); });
    FA.el('pmList').addEventListener('click', function (e) {
      var rowEl = e.target.closest('li');
      var rowSport = rowEl ? rowEl.getAttribute('data-sport') : null;   // set on a player of another sport
      var trash = e.target.closest('button.pmdel');
      if (trash) { FA.openDeleteDialog(trash.getAttribute('data-id'), rowSport ? 'otherplayer' : 'player', rowSport); return; }
      var b = e.target.closest('button.pmedit');
      if (!b) return;
      var id = b.getAttribute('data-id');
      var found = rowSport ? FA.findOtherPlayer(rowSport, id) : FA.directory.filter(function (d) { return d.id === id; })[0];
      if (found) FA.openPm(found, rowSport);
    });
    FA.el('pmGender').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-g]');
      if (b) FA.setPmGender(b.getAttribute('data-g'));
    });
    FA.el('pmCancel').addEventListener('click', FA.closePm);
    FA.el('pmSave').addEventListener('click', FA.savePm);
    FA.el('pmLink').addEventListener('keydown', function (e) { if (e.key === 'Enter') FA.el('pmTagInput').focus(); });
    FA.el('pmName').addEventListener('keydown', function (e) { if (e.key === 'Enter') FA.el(FA.el('pmLinkWrap').hidden ? 'pmTagInput' : 'pmLink').focus(); });
    // Tags: Enter or a comma enters the one being typed; Backspace in an empty box takes the last one off.
    FA.el('pmTagInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        FA.addPmTag(FA.el('pmTagInput').value);
        FA.el('pmTagInput').value = '';
      } else if (e.key === 'Backspace' && !FA.el('pmTagInput').value && FA.pmTags.length) {
        FA.pmTags.pop();
        FA.renderPmTags();
      }
    });
    FA.el('pmTagInput').addEventListener('blur', function () { FA.addPmTag(FA.el('pmTagInput').value); FA.el('pmTagInput').value = ''; });
    FA.el('pmTagChips').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (!b) return;
      FA.pmTags.splice(parseInt(b.getAttribute('data-i'), 10), 1);
      FA.renderPmTags();
    });
    FA.el('pmTagSuggest').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tag]');
      if (b) FA.addPmTag(b.getAttribute('data-tag'));
    });
  }
})();
