// The fees page: the calculator of each session (prices, quantities, saving, Fixed Rate and AA).
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.centsValue = centsValue;
  FA.qtyValue = qtyValue;
  FA.boxCents = boxCents;
  FA.boxQty = boxQty;
  FA.showCalc = showCalc;
  FA.recalc = recalc;
  FA.saveNow = saveNow;
  FA.flush = flush;
  FA.openCalc = openCalc;
  FA.closeCalc = closeCalc;

  // ---- Calculator ---------------------------------------------------------------------------------
  // Every session has its own calculator, the same on every sport: four earning rows (Social Female, Social Male, Regular Female, Regular Male:
  // a price and a quantity each), then the cost: Court, and for badminton Shuttlecock, bought by the tube (the cost of one is the tube price
  // divided by 12, rounded up to the cent). The four quantities fill themselves from who has paid (the server counts them whenever the
  // list or a player changes); every box can still be typed over. A new session starts with the host's last prices.
  var calcOverlay = FA.el('calcOverlay');
  var calcStatus = FA.el('calcStatus');
  // [field of the session, id of the box]
  var PRICE_FIELDS = [['socialFPrice', 'cpSF'], ['socialMPrice', 'cpSM'], ['adhocFPrice', 'cpAF'], ['adhocMPrice', 'cpAM'], ['courtPrice', 'cpCourt'], ['tubePrice', 'cTube']];
  var QTY_FIELDS = [['socialFQty', 'cqSF'], ['socialMQty', 'cqSM'], ['adhocFQty', 'cqAF'], ['adhocMQty', 'cqAM'], ['courtQty', 'cqCourt'], ['shuttleQty', 'cqShuttle']];
  FA.calcInputs = [];   // the boxes this page has (badminton also has the shuttlecock ones)
  PRICE_FIELDS.concat(QTY_FIELDS).forEach(function (f) { if (FA.el(f[1])) FA.calcInputs.push(FA.el(f[1])); });
  var shareBox = FA.el('cShare');   // "Cost + profit share" (a host that has those rows)
  FA.payRows = false;
  FA.saveTimer = null;
  FA.pending = null;     // boxes waiting to be saved: { id, body }

  // What is in a box: whole cents for a price, a whole number for a quantity, null when blank.
  function centsValue(input) { return input.value && input.value !== '.' && input.value !== '####' ? Math.round(parseFloat(input.value) * 100) : null; }
  function qtyValue(input) { return input.value && input.value !== '####' ? parseInt(input.value, 10) : null; }
  function boxCents(cents) { return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2); }
  function boxQty(n) { return n === null || n === undefined ? '' : String(n); }

  // The numbers as the host typed them. The boxes only show them: in an AA session that would lose money the boxes show the merged counts and
  // the raised Social prices instead (see viewOf), and these stay what was typed, so they come back when the loss is gone.
  var baseCalc = {};
  var BOX_FIELD = {};   // id of a box -> [field of the session, 'price' or 'qty']
  PRICE_FIELDS.forEach(function (f) { BOX_FIELD[f[1]] = [f[0], 'price']; });
  QTY_FIELDS.forEach(function (f) { BOX_FIELD[f[1]] = [f[0], 'qty']; });
  var DERIVED_BOXES = ['cpSF', 'cpSM', 'cqSF', 'cqSM'];   // the boxes an adjusted AA session fills itself
  var MODE_NAMES = { fixed: 'Fixed Rate', aa: 'AA' };

  function readCalc() {
    var c = {};
    PRICE_FIELDS.concat(QTY_FIELDS).forEach(function (f) { c[f[0]] = baseCalc[f[0]] === undefined ? null : baseCalc[f[0]]; });
    c.share = FA.payRows && shareBox ? (parseInt(shareBox.value, 10) || 100) : null;
    c.calcMode = baseCalc.calcMode || null;
    c.countAll = !!baseCalc.calcMode && !!baseCalc.countAll;
    return c;
  }

  // Puts a session's numbers in the calculator (all blank when there is no session).
  function showCalc(s) {
    baseCalc = {};
    PRICE_FIELDS.concat(QTY_FIELDS).forEach(function (f) { baseCalc[f[0]] = s && s[f[0]] !== undefined ? s[f[0]] : null; });
    baseCalc.calcMode = s && s.calcMode ? s.calcMode : null;
    baseCalc.countAll = !!(s && s.countAll);
    if (shareBox) shareBox.value = String(s && s.share ? s.share : 100);
    if (FA.guest()) FA.calcInputs.forEach(function (input) { input.value = '####'; });
    FA.calcInputs.forEach(function (input) { input.readOnly = FeesCore.isReadOnly(); });
    if (shareBox) shareBox.disabled = FeesCore.isReadOnly();
    FA.el('cMode').hidden = FA.guest();
    FA.recalc();
  }

  function setStatus(text, isError) {
    calcStatus.textContent = text;
    calcStatus.className = isError ? 'err' : '';
  }

  function setText(id, text) { if (FA.el(id)) FA.el(id).textContent = text; }

  function recalc() {
    // A guest is never sent an amount, so every box and total is a hash.
    if (FA.guest()) {
      ['ctSF', 'ctSM', 'ctAF', 'ctAM', 'ctCourt', 'ctShuttle', 'cEarn', 'cCost', 'cProfit', 'cPayAmt', 'cPlayers', 'cShuttleUnit', 'cTubeEach'].forEach(function (id) { setText(id, FA.HASH); });
      FA.el('cRes').className = 'pos';
      return;
    }
    var c = baseCalc;
    var money = FeesCore.money;   // the calculator always shows its figures, whatever the Hide button says
    var v = FA.viewOf(c);
    var unit = FA.shuttleUnit(c.tubePrice);
    var court = (c.courtPrice || 0) * (c.courtQty || 0);
    var shuttle = unit * (c.shuttleQty || 0);
    var cost = v.cost;
    var profit = v.profit;
    // The boxes show the numbers (an adjusted AA session: the merged counts and the raised Social prices); the one being typed in is left alone.
    var focus = document.activeElement;
    PRICE_FIELDS.forEach(function (f) {
      var box = FA.el(f[1]);
      if (!box || box === focus) return;
      box.value = FA.boxCents(v.adjusted && (f[0] === 'socialFPrice' || f[0] === 'socialMPrice') ? v[f[0]] : c[f[0]]);
    });
    QTY_FIELDS.forEach(function (f) {
      var box = FA.el(f[1]);
      if (!box || box === focus) return;
      box.value = FA.boxQty(v.adjusted && (f[0] === 'socialFQty' || f[0] === 'socialMQty') ? v[f[0]] : c[f[0]]);
    });
    FA.calcInputs.forEach(function (input) { input.readOnly = FeesCore.isReadOnly() || (v.adjusted && DERIVED_BOXES.indexOf(input.id) !== -1); });
    setText('ctSF', money(v.socialFPrice * v.socialFQty));
    setText('ctSM', money(v.socialMPrice * v.socialMQty));
    setText('ctAF', money(v.adhocFPrice * v.adhocFQty));
    setText('ctAM', money(v.adhocMPrice * v.adhocMQty));
    setText('ctCourt', money(court));
    setText('ctShuttle', money(shuttle));
    setText('cShuttleUnit', money(unit));
    setText('cTubeEach', money(unit) + ' each');
    setText('cPlayers', String(v.socialFQty + v.socialMQty + v.adhocFQty + v.adhocMQty));
    setText('cEarn', money(v.earning));
    setText('cCost', money(cost));
    setText('cProfit', money(profit));
    FA.el('cRes').className = profit < 0 ? 'neg' : 'pos';
    if (FA.payRows && shareBox) setText('cPayAmt', money(cost + Math.round(profit * (parseInt(shareBox.value, 10) || 100) / 100)));
    // The calculation type: which button is on, what the calculator shows for it, and a line saying what is going on.
    var mode = c.calcMode || '';
    FA.el('calcSheet').classList.toggle('adj', v.adjusted);
    FA.el('calcSheet').classList.toggle('mode-fixed', mode === 'fixed');
    FA.el('cUnpaidWrap').hidden = !mode;   // under Fixed Rate and AA alike
    FA.el('cUnpaid').value = c.countAll ? 'all' : 'paid';
    FA.el('cUnpaid').disabled = FeesCore.isReadOnly();
    var qtyNote = document.querySelector('#calcSheet .cnote');
    if (qtyNote) qtyNote.textContent = (mode && c.countAll)
      ? 'The quantities fill from every player in the session, paid or not, by gender. A player tagged Regular goes in the Regular rows. You can still change them.'
      : 'The quantities fill from the players who have paid, by gender. A player tagged Regular goes in the Regular rows. You can still change them.';
    Array.prototype.forEach.call(FA.el('cMode').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false');
      b.disabled = FeesCore.isReadOnly();
    });
    setText('cModeNote', mode === 'fixed' ? 'Fixed Rate: the prices stay as you set them, whatever the profit or loss.' + (c.countAll ? ' Players who have not paid yet count too.' : '')
      : mode === 'aa' ? (v.adjusted
        ? 'AA: the cost is split between everybody, counted as Social. Both Social prices ' + (v.raised > 0 ? 'went up by RM ' + (v.raised * FA.AA_STEP / 100).toFixed(2) + ' to cover the cost' : v.raised < 0 ? 'came down by RM ' + (-v.raised * FA.AA_STEP / 100).toFixed(2) + ' and still cover the cost' : 'stay as you set them, which just covers the cost') + '. To set your own prices, choose Fixed Rate.'
        : 'AA: the cost is split between everybody as Social, and the Social prices move by RM 0.50 to just cover it. Nobody is in the session yet.')
      : 'Choose a calculation type. Until then the profit is earning minus cost.');
    if (mode === 'aa' && c.countAll) FA.el('cModeNote').textContent += ' Players who have not paid yet count too.';
  }

  // Saves the waiting boxes (if any), one request after another so they can't arrive out of order.
  // Resolves true when nothing is left unsaved. quiet = true is the background save while typing; any
  // other save locks the page until it is done.
  var inflight = Promise.resolve(true);
  function saveNow(quiet) {
    FA.saveTimer = null;
    if (!FA.pending) return inflight;
    var job = FA.pending;
    FA.pending = null;
    setStatus('Saving...', false);
    inflight = inflight.then(function () { return send(job, quiet); });
    return inflight;
  }

  function send(job, quiet) {
    return FeesCore.api('POST', '/session-calc', job.body, job.id, quiet)
      .then(function () {
        setStatus('Saved', false);
        return true;
      })
      .catch(function () {
        if (!FA.pending) FA.pending = job;
        setStatus('Could not save. Check your connection.', true);
        return false;
      });
  }

  // Saves anything waiting and anything still on its way, with the page locked until that is done.
  function flush() {
    if (FA.saveTimer) clearTimeout(FA.saveTimer);
    return FeesCore.busyWhile(FA.saveNow(false));
  }

  function onCalcInput() {
    FA.recalc();
    var cur = FA.current();
    if (!cur) return;
    var c = readCalc();
    Object.keys(c).forEach(function (k) { cur[k] = c[k]; });
    cur.profit = FA.profitOf(cur);
    FA.renderBalance();
    FA.renderHistory();
    FA.pending = { id: cur.id, body: c };
    if (FA.saveTimer) clearTimeout(FA.saveTimer);
    FA.saveTimer = setTimeout(function () { FA.saveNow(true); }, 600);
  }

  FA.calcInputs.forEach(function (input) {
    FeesCore.bindNumberInput(input, function () {
      var f = BOX_FIELD[input.id];
      baseCalc[f[0]] = f[1] === 'price' ? FA.centsValue(input) : FA.qtyValue(input);
      onCalcInput();
    }, FA.recalc);
  });
  // "Contain [paid / all] players" (Fixed Rate and AA): "all" counts everybody in the session instead of only those who have paid (the default).
  function allCounted() { return !!baseCalc.calcMode && !!baseCalc.countAll; }
  function applyCounts() {
    var n = countsFromList(allCounted());
    baseCalc.socialFQty = n.socialFQty; baseCalc.socialMQty = n.socialMQty; baseCalc.adhocFQty = n.adhocFQty; baseCalc.adhocMQty = n.adhocMQty;
  }
  FA.el('cUnpaid').addEventListener('change', function () {
    if (FeesCore.isReadOnly() || !FA.current()) { FA.recalc(); return; }
    baseCalc.countAll = FA.el('cUnpaid').value === 'all';
    applyCounts();
    onCalcInput();
  });
  // Fixed Rate / AA: saved with the session, and carried on to the sessions made after it.
  FA.el('cMode').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (!b || FeesCore.isReadOnly() || !FA.current()) return;
    var before = allCounted();
    baseCalc.calcMode = b.getAttribute('data-mode');
    if (before !== allCounted()) applyCounts();
    onCalcInput();
  });
  if (shareBox) {
    [100, 50, 30].forEach(function (pct) {
      var option = document.createElement('option');
      option.value = String(pct);
      option.textContent = pct + '%';
      shareBox.appendChild(option);
    });
    shareBox.addEventListener('change', onCalcInput);
  }

  function openCalc() {
    setStatus(FeesCore.isReadOnly() ? 'View only' : '', false);
    calcOverlay.style.display = 'flex';
  }

  // The calculator only closes once its numbers are saved; if saving fails it stays open with the reason.
  function closeCalc() {
    if (calcOverlay.style.display !== 'flex') return;
    FA.flush().then(function (ok) {
      if (ok) calcOverlay.style.display = 'none';
    });
  }

  FA.el('btnCalcClose').addEventListener('click', FA.closeCalc);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') FA.closeCalc(); });

  // The quantities the players who have paid add up to (the server counts the same way): Female or Male as saved, Regular when tagged Regular (an older tag "Adhoc" counts too).
  function countsFromList(everyone) {   // everyone: a Fixed Rate session that contains unpaid players
    var adhoc = {};   // the "Regular" players (the quantities and prices of that row are called adhoc inside)
    FA.directory.forEach(function (d) { if (FA.hasTag(d, 'regular') || FA.hasTag(d, 'adhoc')) adhoc[d.id] = true; });
    var n = { socialFQty: 0, socialMQty: 0, adhocFQty: 0, adhocMQty: 0 };
    FeesCore.getPeople().forEach(function (p) {
      if (!p.paid && !everyone) return;
      var kind = p.playerId && adhoc[p.playerId] ? 'adhoc' : 'social';
      n[kind + (p.gender === 'F' ? 'F' : 'M') + 'Qty']++;
    });
    return n;
  }

  // Reset puts back the starting prices, counts the four quantities from who has paid again and empties the rest.
  FA.el('btnCalcReset').addEventListener('click', function () {
    var d = (FA.SPORTINFO && FA.SPORTINFO.calc) || FA.DEFAULTS[FA.SPORT] || FA.DEFAULTS.pickleball;
    var n = countsFromList(allCounted());
    FA.showCalc({
      socialFPrice: d.socialFPrice, socialMPrice: d.socialMPrice, adhocFPrice: d.adhocFPrice, adhocMPrice: d.adhocMPrice,
      socialFQty: n.socialFQty, socialMQty: n.socialMQty, adhocFQty: n.adhocFQty, adhocMQty: n.adhocMQty,
      courtPrice: d.courtPrice, courtQty: d.courtQty, tubePrice: d.tubePrice, shuttleQty: null, share: 100, calcMode: baseCalc.calcMode, countAll: baseCalc.countAll
    });
    onCalcInput();
  });
})();
