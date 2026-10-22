// The fees page: player tags and the Player management view.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.tagsOf = tagsOf;
  FA.hasTag = hasTag;
  FA.pmAllRows = pmAllRows;
  FA.findOtherPlayer = findOtherPlayer;
  FA.mergeOtherPlayer = mergeOtherPlayer;
  FA.refreshOtherDirectories = refreshOtherDirectories;
  FA.tagCounts = tagCounts;
  FA.setPmGender = setPmGender;
  FA.tagChip = tagChip;
  FA.renderPlayers = renderPlayers;
  FA.renderPmTags = renderPmTags;
  FA.addPmTag = addPmTag;
  FA.openPm = openPm;
  FA.closePm = closePm;
  FA.savePm = savePm;

  // ---- Player tags ------------------------------------------------------------------------------------
  // A known player can have several tags (free text, e.g. "Innoxoft"); the unique link is still what tells players
  // apart. The tag "Innoxoft" only marks the player's chip (their games count only when paid, like everyone's);
  // the tag "Regular" puts the player in the Regular rows of the calculator.
  FA.FREE_TAG = 'innoxoft';
  FA.MAX_TAGS = 8;

  function tagsOf(d) { return d && d.tags ? d.tags : []; }
  function hasTag(d, tag) {
    return FA.tagsOf(d).some(function (t) { return t.toLowerCase() === tag.toLowerCase(); });
  }

  // Every tag in use with how many players have it, most used first.
  // Every known player of the account that is shown: this sport's, and (a host who runs more than one sport) the other sports' read when
  // Player management or Ranking was opened. { p: the player, sport, here: true for this page's own sport, code: the other page's code }
  function pmAllRows() {
    var rows = FA.directory.map(function (d) { return { p: d, sport: FA.SPORT, here: true }; });
    if (FA.multiSport()) Object.keys(FA.otherDirs).forEach(function (k) {
      FA.otherDirs[k].directory.forEach(function (d) { rows.push({ p: d, sport: k, here: false, code: FA.otherDirs[k].code }); });
    });
    return rows.filter(function (r) { return !FA.pmSport || r.sport === FA.pmSport; });
  }

  function findOtherPlayer(sport, id) {
    var dir = FA.otherDirs[sport] ? FA.otherDirs[sport].directory : [];
    for (var i = 0; i < dir.length; i++) if (dir[i].id === id) return dir[i];
    return null;
  }

  // The answer of a change made to a player of another sport: that sport's list and ranking take it.
  function mergeOtherPlayer(sport, pl) {
    var dir = FA.otherDirs[sport];
    if (!dir || !pl) return;
    dir.directory.forEach(function (d) {
      if (d.id !== pl.id) return;
      ['name', 'link', 'gender', 'tags'].forEach(function (k) { if (pl[k] !== undefined && pl[k] !== null) d[k] = pl[k]; });
    });
    dir.ranking.forEach(function (r) { if (r.id === pl.id) { if (pl.name) r.name = pl.name; if (pl.gender) r.gender = pl.gender; } });
  }

  // Reads the other sports' known players and rankings (when Player management or Ranking is opened) and redraws both views.
  function refreshOtherDirectories() {
    if (!FA.multiSport()) return Promise.resolve();
    var jobs = FA.mySports.filter(function (l) { return l.sport !== FA.SPORT; }).map(function (l) {
      return FA.otherCall({ sport: l.sport, code: l.code }, 'GET', '/directory').then(function (data) {
        FA.otherDirs[l.sport] = { sport: l.sport, code: l.code, directory: data.directory || [], ranking: data.ranking || [] };
      });
    });
    return Promise.all(jobs).catch(function () { }).then(function () { FA.rankSignature = ''; FA.renderRanking(); FA.renderPlayers(); });
  }

  function tagCounts() {
    var counts = {};
    FA.pmAllRows().forEach(function (r) {
      FA.tagsOf(r.p).forEach(function (t) {
        var k = t.toLowerCase();
        counts[k] = counts[k] || { tag: t, count: 0 };
        counts[k].count++;
      });
    });
    return Object.keys(counts).map(function (k) { return counts[k]; })
      .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
  }

  // ---- Player management (owner changes; a master user or guest only looks) -------------------------
  // Search every known player (by name, link or tag), filter by a tag, edit a name, unique link or tags, add a new
  // player. A new player is not put in any session; they can be brought along (or added) when needed.
  var pmEditing = null;     // the known player being edited, or null when adding
  var pmEditingSport = '';  // when that player belongs to another sport of the account: its sport
  FA.pmBusy = false;
  FA.pmTagFilter = '';     // the tag the list is narrowed to, or ''
  FA.pmTags = [];          // the tags in the popup
  var pmGender = 'M';       // the gender in the popup

  function setPmGender(g) {
    pmGender = g === 'F' ? 'F' : 'M';
    Array.prototype.forEach.call(FA.el('pmGender').querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-g') === pmGender;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  FA.PENCIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l.7-3L10.8 3a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L6 12.3 3 13z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  function tagChip(text, className) {
    var chip = document.createElement('span');
    chip.className = 'tagchip' + (className ? ' ' + className : '');
    chip.textContent = text;
    return chip;
  }

  function renderTagFilter() {
    var box = FA.el('pmFilter');
    box.textContent = '';
    var counts = FA.tagCounts();
    box.hidden = !counts.length && !FA.multiSport();
    FA.el('pmHint').hidden = !(FA.owner && counts.length);
    if (FA.el('pmTagsEdit')) FA.el('pmTagsEdit').hidden = !(FA.owner && counts.length);
    // A host who runs more than one sport: the sports are the first chips of the row, made from the account.
    if (FA.multiSport()) FA.sportChoices().forEach(function (c) { box.appendChild(FA.sportChip(c, FA.pmSport === c.key)); });
    counts.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tagfilter' + (FA.owner ? ' drag' : '') + (FA.pmTagFilter.toLowerCase() === c.tag.toLowerCase() ? ' on' : '');
      b.setAttribute('data-tag', c.tag);
      b.textContent = c.tag + ' ' + c.count;
      box.appendChild(b);
    });
  }

  // Player management shows the first PM_PAGE players and adds PM_PAGE more each time "View more" is pressed (a long list is slow to draw).
  var PM_PAGE = 20;
  var pmShown = PM_PAGE;

  function renderPlayers() {
    // A tag that nobody has any more can't stay selected.
    if (FA.pmTagFilter && !FA.tagCounts().some(function (c) { return c.tag.toLowerCase() === FA.pmTagFilter.toLowerCase(); })) FA.pmTagFilter = '';
    renderTagFilter();
    var needle = FA.el('pmSearch').value.trim().toLowerCase();
    var base = FA.pmAllRows();
    var rows = base.slice().sort(function (a, b) { return a.p.name.localeCompare(b.p.name); })
      .filter(function (r) { return FA.playerMatches(r.p, needle) && (!FA.pmTagFilter || FA.hasTag(r.p, FA.pmTagFilter)); });
    var list = FA.el('pmList');
    list.textContent = '';
    var left = Math.max(0, rows.length - pmShown);
    FA.el('pmMore').hidden = left === 0;
    FA.el('pmMore').textContent = 'View more (' + left + ' more)';
    rows.slice(0, pmShown).forEach(function (row) {
      var d = row.p;
      var li = document.createElement('li');
      li.setAttribute('data-id', d.id);
      if (!row.here) li.setAttribute('data-sport', row.sport);
      var who = document.createElement('div');
      who.className = 'pmwho';
      var nm = document.createElement('b');
      nm.textContent = d.name;
      nm.appendChild(FA.genderMark(d.gender));
      if (FA.multiSport()) {
        var spIcon = FeesCore.sportIcon(row.sport);
        spIcon.title = FA.sportName(row.sport);
        nm.insertBefore(spIcon, nm.firstChild);
      }
      var meta = document.createElement('small');
      meta.textContent = d.games + (d.games === 1 ? ' game' : ' games') + ' · ' + (d.lastJoined ? 'Last joined ' + FA.prettyDate(d.lastJoined, true) : 'Not joined yet')
        + (FA.multiSport() ? ' · ' + FA.sportName(row.sport) : '');
      who.appendChild(nm);
      if (d.link) {   // only the host sees the unique links
        var lk = document.createElement('span');
        lk.className = 'pmlk';
        lk.textContent = d.link;
        who.appendChild(lk);
      }
      who.appendChild(meta);
      if (FA.tagsOf(d).length) {
        var chips = document.createElement('span');
        chips.className = 'tagrow';
        FA.tagsOf(d).forEach(function (t) { chips.appendChild(FA.tagChip(t, t.toLowerCase() === FA.FREE_TAG ? 'free' : '')); });
        who.appendChild(chips);
      }
      li.appendChild(who);
      if (FA.owner) {
        var edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'pmedit';
        edit.setAttribute('data-id', d.id);
        edit.setAttribute('aria-label', 'Edit ' + d.name);
        edit.innerHTML = FA.PENCIL;
        li.appendChild(edit);
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'pmdel';
        del.setAttribute('data-id', d.id);
        del.setAttribute('aria-label', 'Delete ' + d.name);
        del.innerHTML = FA.TRASH;
        li.appendChild(del);
      }
      list.appendChild(li);
    });
    var filtered = FA.el('pmSearch').value.trim() || FA.pmTagFilter;
    FA.el('pmCount').className = 'pmcount';
    FA.el('pmCount').textContent = !base.length ? (FA.owner ? 'Your player list starts here. Players you add to a session are saved here with their tags and games played. Tap Add player.' : 'No players yet.')
      : filtered ? rows.length + ' of ' + base.length + ' players'
      : base.length + (base.length === 1 ? ' player' : ' players');
  }

  var pmOverlay = FA.el('pmOverlay');
  function setPmMessage(text, isError) {
    FA.el('pmSub').textContent = text;
    FA.el('pmSub').className = isError ? 'err' : '';
  }

  // The tags shown in the popup: the chips (tap one to take it off) and, below, the tags used by other players
  // that this one doesn't have yet (tap to add).
  function renderPmTags() {
    var chips = FA.el('pmTagChips');
    chips.textContent = '';
    FA.pmTags.forEach(function (t, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tagchip del' + (t.toLowerCase() === FA.FREE_TAG ? ' free' : '');
      chip.setAttribute('data-i', String(i));
      chip.setAttribute('aria-label', 'Remove tag ' + t);
      chip.textContent = t + ' ×';
      chips.appendChild(chip);
    });
    var suggest = FA.el('pmTagSuggest');
    suggest.textContent = '';
    FA.tagCounts().filter(function (c) { return !FA.pmTags.some(function (t) { return t.toLowerCase() === c.tag.toLowerCase(); }); })
      .slice(0, 8)
      .forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tagchip add';
        b.setAttribute('data-tag', c.tag);
        b.textContent = '+ ' + c.tag;
        suggest.appendChild(b);
      });
    FA.el('pmTagInput').disabled = FA.pmTags.length >= FA.MAX_TAGS;
  }

  // Adds what was typed as a tag (ignoring one the player already has).
  function addPmTag(text) {
    var tag = String(text || '').trim().replace(/\s+/g, ' ');
    if (!tag) return;
    if (tag.length > 30) { setPmMessage('A tag can have at most 30 characters.', true); return; }
    if (FA.pmTags.length >= FA.MAX_TAGS) { setPmMessage('A player can have at most ' + FA.MAX_TAGS + ' tags.', true); return; }
    if (!FA.pmTags.some(function (t) { return t.toLowerCase() === tag.toLowerCase(); })) FA.pmTags.push(tag);
    FA.renderPmTags();
  }

  function openPm(player, sport) {
    pmEditing = player;
    pmEditingSport = sport || '';
    FA.el('pmTitle').textContent = player ? 'Edit player' : 'Add player';
    FA.el('pmName').value = player ? player.name : FA.el('pmSearch').value.trim();
    FA.el('pmLink').value = player ? player.link : '';
    FA.el('pmLinkWrap').hidden = !player;   // a new player gets a made-up unique link; the box is only for changing an existing one
    FA.pmTags = player ? FA.tagsOf(player).slice() : [];
    FA.setPmGender(player ? player.gender : 'M');
    FA.el('pmTagInput').value = '';
    FA.renderPmTags();
    setPmMessage(player ? 'Each player needs their own unique link.' : 'The new player gets a unique link automatically.', false);
    pmOverlay.style.display = 'flex';
    FA.el(player || !FA.el('pmName').value || FA.el('pmLinkWrap').hidden ? 'pmName' : 'pmLink').focus();
  }

  function closePm() { pmOverlay.style.display = 'none'; pmEditing = null; pmEditingSport = ''; }

  function savePm() {
    if (FA.pmBusy) return;
    FA.addPmTag(FA.el('pmTagInput').value);   // a tag typed but not yet entered still counts
    FA.el('pmTagInput').value = '';
    var name = FA.el('pmName').value.trim();
    var link = FA.el('pmLink').value.trim();
    if (!name) { setPmMessage('Enter a name.', true); return; }
    if (!link && pmEditing) { setPmMessage('Type the player’s unique link.', true); return; }
    var editing = pmEditing;
    var editSport = pmEditingSport;
    var body = { name: name, link: link, tags: FA.pmTags.slice(), gender: pmGender };
    FA.pmBusy = true;
    setPmMessage('Saving...', false);
    var request = editing
      ? (editSport
          ? FA.otherCall({ sport: editSport, code: FA.otherDirs[editSport].code }, 'POST', '/players/' + encodeURIComponent(editing.id) + '/update', body)
          : FeesCore.api('POST', '/players/' + encodeURIComponent(editing.id) + '/update', body, null))
      : FeesCore.api('POST', '/players/new', body, null);
    request
      .then(function (data) {
        if (editSport) FA.mergeOtherPlayer(editSport, data.player); else FA.applyDirectoryAnswer(data);
        // The same player in the list on screen has the new name (and link and tags, which sit under it).
        if (editing && !editSport) FeesCore.getPeople().forEach(function (p) { if (p.playerId === editing.id) p.name = name; });
        FeesCore.render();
        FA.renderRanking();
        if (!editing) FA.el('pmSearch').value = '';
        FA.renderPlayers();
        FA.closePm();
        // A new gender or a Regular tag changes the quantities of the calculator: the answer carries the new ones (X-Session header).
      })
      .catch(function (err) {
        if (err.status === 409 && err.body && (err.body.message || err.body.Message)) setPmMessage(err.body.message || err.body.Message, true);
        else setPmMessage('Could not save the player. ' + err.message, true);
      })
      .then(function () { FA.pmBusy = false; });
  }

  FeesCore.addPanel('players', { open: function () { pmShown = PM_PAGE; FA.renderPlayers(); FA.refreshDirectory(); FA.refreshOtherDirectories(); } });
  FA.el('pmMore').addEventListener('click', function () { pmShown += PM_PAGE; FA.renderPlayers(); });
  if (!FA.owner) FA.el('pmSearch').placeholder = 'Search name or tag';
  FA.el('pmSearch').addEventListener('input', function () { pmShown = PM_PAGE; FA.renderPlayers(); });
  FA.el('pmFilter').addEventListener('click', function (e) {
    if (FA.tagSuppress) return;
    var sportBtn = e.target.closest('button[data-sport]');
    if (sportBtn) { FA.pmSport = sportBtn.getAttribute('data-sport'); pmShown = PM_PAGE; FA.renderPlayers(); return; }
    var b = e.target.closest('button[data-tag]');
    if (!b) return;
    var tag = b.getAttribute('data-tag');
    FA.pmTagFilter = FA.pmTagFilter.toLowerCase() === tag.toLowerCase() ? '' : tag;
    pmShown = PM_PAGE;
    FA.renderPlayers();
  });
  FA.el('pmAdd').hidden = !FA.owner;
})();
