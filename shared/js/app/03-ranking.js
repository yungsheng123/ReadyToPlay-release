// The fees page: the leaderboard (ranking) view.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.initialsOf = initialsOf;
  FA.sportChoices = sportChoices;
  FA.sportChip = sportChip;
  FA.renderRanking = renderRanking;

  // Leaderboard (its own view in the header menu): most participated players, a podium for the top 3 (1st in the middle) and a list for 4th to 10th.
  // The bars grow and the numbers count up when the ranking appears or changes.
  var CROWN = '<svg class="rk-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  var MEDALS = [
    { bg: '#FAC775', fg: '#412402', ring: '#EF9F27' },   // gold
    { bg: '#D3D1C7', fg: '#2C2C2A', ring: '#B4B2A9' },   // silver
    { bg: '#F5C4B3', fg: '#4A1B0C', ring: '#D85A30' }    // bronze
  ];
  var PODIUM_HEIGHTS = [84, 60, 44];
  FA.rankSignature = '';

  // The first letter or digit of a word, whole (a name that starts with an emoji or a symbol, such as a flower, would otherwise give half
  // of it, which shows as a blank). A word with no letter or digit at all gives its first character.
  function firstLetter(word) {
    var chars = Array.from(word);
    for (var i = 0; i < chars.length; i++) if (/[\p{L}\p{N}]/u.test(chars[i])) return chars[i].toUpperCase();
    return chars[0] || '';
  }
  function initialsOf(name) {
    var words = String(name).trim().split(/\s+/).filter(Boolean).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); });
    if (!words.length) words = String(name).trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(firstLetter).join('');
  }

  function countUp() {
    var counters = FA.el('rankBox').querySelectorAll('[data-count]');
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    Array.prototype.forEach.call(counters, function (node) {
      var to = parseInt(node.getAttribute('data-count'), 10);
      if (still) { node.textContent = String(to); return; }
      var start = null;
      function step(t) {
        if (start === null) start = t;
        var k = Math.min(1, (t - start) / 900);
        node.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      }
      node.textContent = '0';
      setTimeout(function () { requestAnimationFrame(step); }, 350);
      // Whatever happens to the animation (a hidden tab pauses it), the final number ends up shown.
      setTimeout(function () { node.textContent = String(to); }, 1500);
    });
  }

  function podiumSpot(p, place, order) {
    var cell = document.createElement('div');
    cell.className = 'rk-pc';
    if (!p) return cell;
    var m = MEDALS[place];
    var av = document.createElement('div');
    av.className = 'rk-av' + (place === 0 ? ' big' : '');
    av.style.background = m.bg;
    av.style.color = m.fg;
    av.style.boxShadow = '0 0 0 2.5px ' + m.ring;
    av.style.animationDelay = (0.15 + order * 0.12) + 's';
    if (place === 0) av.insertAdjacentHTML('beforeend', CROWN);
    av.appendChild(document.createTextNode(FA.initialsOf(p.name)));
    var name = document.createElement('div');
    name.className = 'rk-nm';
    name.textContent = p.name;
    if (p.sport && FA.multiSport() && !FA.rankSport) name.insertBefore(FeesCore.sportIcon(p.sport), name.firstChild);
    var link = document.createElement('div');
    link.className = 'rk-lk';
    link.textContent = p.link || '';
    var ped = document.createElement('div');
    ped.className = 'rk-ped';
    ped.style.height = PODIUM_HEIGHTS[place] + 'px';
    ped.style.background = m.bg;
    ped.style.color = m.fg;
    ped.style.animationDelay = (0.3 + order * 0.12) + 's';
    var n = document.createElement('span');
    n.className = 'n';
    n.setAttribute('data-count', String(p.games));
    n.textContent = String(p.games);
    var gm = document.createElement('span');
    gm.className = 'gm';
    gm.textContent = p.games === 1 ? 'game' : 'games';
    ped.appendChild(n);
    ped.appendChild(gm);
    cell.appendChild(av);
    cell.appendChild(name);
    if (p.link) cell.appendChild(link);   // only the host is sent the unique links
    cell.appendChild(ped);
    return cell;
  }

  function withSport(r, sport) {
    var o = {};
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
    o.sport = sport;
    return o;
  }

  // Who the ranking shows: this sport's top players, or (a host who runs more than one sport) the sport chosen with the chips, or every
  // sport's top players together, most games first, each with its sport's icon.
  function rankingRows() {
    var mine = FA.ranking.map(function (r) { return withSport(r, FA.SPORT); });
    if (!FA.multiSport()) return mine;
    var by = {};
    by[FA.SPORT] = mine;
    Object.keys(FA.otherDirs).forEach(function (k) { by[k] = (FA.otherDirs[k].ranking || []).map(function (r) { return withSport(r, k); }); });
    if (FA.rankSport) return by[FA.rankSport] || [];
    var all = [];
    Object.keys(by).forEach(function (k) { all = all.concat(by[k]); });
    all.sort(function (a, b) { return b.games - a.games || a.name.localeCompare(b.name); });
    return all.slice(0, 10);
  }

  // The sport chips ("All sports" and one per sport the host runs), made from the account itself.
  function sportChoices() {
    return [{ key: '', name: 'All sports' }].concat(FA.mySports.map(function (l) { return { key: l.sport, name: FA.sportName(l.sport) }; }));
  }
  function sportChip(choice, on) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tagfilter' + (on ? ' on' : '');
    b.setAttribute('data-sport', choice.key);
    if (choice.key) b.appendChild(FeesCore.sportIcon(choice.key));
    b.appendChild(document.createTextNode(choice.name));
    return b;
  }
  function renderRankFilter() {
    var box = FA.el('rankFilter');
    box.textContent = '';
    box.hidden = !FA.multiSport();
    if (box.hidden) return;
    FA.sportChoices().forEach(function (c) { box.appendChild(FA.sportChip(c, FA.rankSport === c.key)); });
  }

  function renderRanking() {
    renderRankFilter();
    var rows = rankingRows();
    FA.el('rankBox').hidden = !rows.length && !FA.multiSport();
    var card = FA.el('rankBox').querySelector('.rk-card');
    if (card) card.hidden = !rows.length;   // with nobody to show there is no card (the chips and the message are enough)
    FA.el('rankEmpty').hidden = rows.length > 0;
    // Nothing to redraw (and no animation to repeat) while the ranking is the same.
    var signature = JSON.stringify(rows) + '|' + FA.rankSport;
    if (signature === FA.rankSignature) return;
    FA.rankSignature = signature;

    var pod = FA.el('rankPodium');
    pod.textContent = '';
    [1, 0, 2].forEach(function (place, order) { pod.appendChild(podiumSpot(rows[place], place, order)); });

    var list = FA.el('rankList');
    list.textContent = '';
    var most = rows.length ? rows[0].games : 1;
    rows.slice(3).forEach(function (p, k) {
      var i = k + 3;
      var li = document.createElement('li');
      li.style.animationDelay = (0.1 + i * 0.07) + 's';
      var no = document.createElement('span');
      no.className = 'no';
      no.textContent = String(i + 1);
      var body = document.createElement('div');
      body.className = 'body';
      var line = document.createElement('div');
      line.className = 'line';
      var name = document.createElement('b');
      name.textContent = p.name;
      if (p.sport && FA.multiSport() && !FA.rankSport) name.insertBefore(FeesCore.sportIcon(p.sport), name.firstChild);
      var games = document.createElement('span');
      var count = document.createElement('b');
      count.setAttribute('data-count', String(p.games));
      count.textContent = String(p.games);
      games.appendChild(count);
      games.appendChild(document.createTextNode(p.games === 1 ? ' game' : ' games'));
      line.appendChild(name);
      line.appendChild(games);
      var bar = document.createElement('span');
      bar.className = 'bar';
      var fill = document.createElement('i');
      fill.style.width = Math.round(p.games * 100 / most) + '%';
      fill.style.animationDelay = (0.25 + i * 0.07) + 's';
      bar.appendChild(fill);
      body.appendChild(line);
      body.appendChild(bar);
      if (p.link) {   // only the host is sent the unique links
        var link = document.createElement('span');
        link.className = 'lk';
        link.textContent = p.link;
        body.appendChild(link);
      }
      li.appendChild(no);
      li.appendChild(body);
      list.appendChild(li);
    });
    countUp();
  }
})();
