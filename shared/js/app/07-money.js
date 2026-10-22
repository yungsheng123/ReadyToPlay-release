// The fees page: show a session on the page, deposits and withdrawals, and the quantities that follow who has paid.
// (Part of the fees page script (fees.html and guest.html): the files share the namespace window.FeesApp; see fees.html for the order they load in.)
(function () {
  var FA = window.FeesApp = window.FeesApp || {};
  // What other files use from this one:
  FA.makeCurrent = makeCurrent;
  FA.backToLatest = backToLatest;
  FA.closeTx = closeTx;
  FA.refreshState = refreshState;
  FA.applySessionCounts = applySessionCounts;

  // ---- Make a session in the history the current one (owner) ---------------------------------------
  FA.switching = false;

  function makeCurrent(id) {
    if (FA.switching || id === FA.currentId) return;
    FA.switching = true;
    FeesCore.clearError();
    // What was typed in the calculator is saved first, because the page is redrawn from the server's answer.
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The calculator numbers could not be saved first');
        return FeesCore.api('POST', '/sessions/' + encodeURIComponent(id) + '/select', undefined, null);
      })
      .then(function (data) {
        FA.applyAnswer(data);
        window.scrollTo(0, 0);
      })
      .catch(function (err) { FeesCore.showError('Could not switch session. ' + err.message); })
      .then(function () { FA.switching = false; });
  }

  // The picked session is dropped: the most recently created one is on the page again.
  function backToLatest() {
    if (FA.switching) return;
    FA.switching = true;
    FeesCore.clearError();
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The calculator numbers could not be saved first');
        return FeesCore.api('POST', '/sessions/show-latest', undefined, null);
      })
      .then(function (data) {
        FA.applyAnswer(data);
        window.scrollTo(0, 0);
      })
      .catch(function (err) { FeesCore.showError('Could not switch session. ' + err.message); })
      .then(function () { FA.switching = false; });
  }

  // ---- Deposit and withdraw -----------------------------------------------------------------------
  var txOverlay = FA.el('txOverlay');
  var txSub = FA.el('txSub');
  var txAmount = FA.el('txAmount');
  var txRemark = FA.el('txRemark');
  var txType = 'deposit';
  var txSaving = false;
  FeesCore.bindNumberInput(txAmount);

  function setTxMessage(text, isError) {
    txSub.textContent = text;
    txSub.className = isError ? 'err' : '';
  }

  function openTx(type) {
    txType = type;
    FA.el('txTitle').textContent = type === 'deposit' ? 'Deposit' : 'Withdraw';
    FA.el('btnTxConfirm').textContent = type === 'deposit' ? 'Deposit' : 'Withdraw';
    setTxMessage(type === 'deposit' ? 'Add money to the total balance.' : 'Take money out of the total balance.', false);
    txAmount.value = '';
    txRemark.value = '';
    txOverlay.style.display = 'flex';
    txAmount.focus();
  }

  function closeTx() { txOverlay.style.display = 'none'; }

  function confirmTx() {
    if (txSaving) return;
    var cents = FA.centsValue(txAmount);
    var remark = txRemark.value.trim();
    if (!cents || cents < 1) { setTxMessage('Enter an amount.', true); return; }
    if (cents > 9999999) { setTxMessage('That amount is too large.', true); return; }
    if (!remark) { setTxMessage('Enter a remark.', true); return; }
    txSaving = true;
    setTxMessage('Saving...', false);
    // The calculator's numbers are saved first, because the page is redrawn from the server's answer.
    FA.flush()
      .then(function (ok) {
        if (!ok) throw new Error('The calculator numbers could not be saved first');
        return FeesCore.api('POST', '/ledger', { type: txType, amount: cents, remark: remark }, null);
      })
      .then(function (data) {
        FA.closeTx();
        FeesCore.clearError();
        FA.applyAnswer(data);
      })
      .catch(function (err) { setTxMessage('Could not save. ' + err.message, true); })
      .then(function () { txSaving = false; });
  }

  FA.el('btnDeposit').addEventListener('click', function () { openTx('deposit'); });
  FA.el('btnWithdraw').addEventListener('click', function () { openTx('withdraw'); });
  FA.el('btnTxCancel').addEventListener('click', FA.closeTx);
  FA.el('btnTxConfirm').addEventListener('click', confirmTx);
  txAmount.addEventListener('keydown', function (e) { if (e.key === 'Enter') txRemark.focus(); });
  txRemark.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmTx(); });

  // ---- The quantities follow who has paid --------------------------------------------------------------
  // The server counts them whenever the list or a player changes. After a change the page reads the sessions again (a moment later, once
  // nothing of the calculator is waiting to be saved) and shows the new numbers, profit, balance and ranking.
  // The page no longer reads everything again after each tap. Two small things replace it: (1) the answer of a change that moved the
  // quantities carries the session's new quantities and profit (X-Session header, applied by applySessionCounts below); (2) the ranking and
  // the player list (games played) are only read again, with the small /directory call, when one of their views is opened.
  FA.directoryStale = false;
  function refreshState() {
    if (FA.guest()) return;
    FA.directoryStale = true;
  }

  function applySessionCounts(s) {
    if (FA.guest() || !s) return;
    for (var i = 0; i < FA.sessions.length; i++) {
      if (FA.sessions[i].id !== s.id) continue;
      if (FA.pending || FA.saveTimer) return;   // the calculator has numbers waiting to be saved: they win
      var target = FA.sessions[i];
      ['socialFQty', 'socialMQty', 'adhocFQty', 'adhocMQty', 'profit'].forEach(function (k) { target[k] = s[k]; });
      var typing = document.activeElement && FA.calcInputs.indexOf(document.activeElement) !== -1;
      if (target.id === FA.currentId && !typing) FA.showCalc(target);
      FA.renderBalance();
      FA.renderHistory();
      return;
    }
  }
})();
