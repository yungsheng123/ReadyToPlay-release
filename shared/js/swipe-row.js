// SwipeRow: a row of chips or buttons that is swiped sideways on a touch screen, made usable with a mouse too.
// With a mouse the row has no scrollbar to grab, so it gets three ways to move: the mouse wheel (up and down turn it sideways, as long as the row
// has somewhere to go; at either end the wheel scrolls the page again), dragging it with the mouse, and a small arrow button at each end that shows
// when there is more in that direction (only on a device with a mouse: touch screens just swipe).
//   SwipeRow.attach(rowElement)                    wheel, drag and arrow buttons (the row is put in a wrapper that carries the buttons)
//   SwipeRow.attach(rowElement, { arrows: false }) wheel and drag only (a row that has its own buttons)
// Loaded first (see fees.html), so every script can use it.
window.SwipeRow = (function () {
  var CHEVRON_L = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEVRON_R = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function navButton(side, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'swipenav ' + side;
    b.hidden = true;
    b.tabIndex = -1;   // (a keyboard user tabs through the chips themselves)
    b.setAttribute('aria-label', label);
    b.innerHTML = side === 'prev' ? CHEVRON_L : CHEVRON_R;
    return b;
  }

  function attach(el, opts) {
    if (!el || el.swipeRowDone) return;
    el.swipeRowDone = true;
    var arrows = !opts || opts.arrows !== false;

    // The wheel: up and down move the row sideways while it can still move that way.
    el.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;   // (a sideways wheel or trackpad already works)
      var max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;   // at an end: the page scrolls as usual
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    // Dragging with the mouse (a finger already swipes). A drag is not a click on the chip it started on.
    var start = null, dragged = false, hold = false;
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      start = { x: e.clientX, left: el.scrollLeft };
      dragged = false;
    });
    document.addEventListener('pointermove', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x;
      if (!dragged && Math.abs(dx) < 5) return;
      dragged = true;
      el.classList.add('dragging');
      el.scrollLeft = start.left - dx;
    });
    function end() {
      if (!start) return;
      start = null;
      el.classList.remove('dragging');
      if (dragged) { hold = true; setTimeout(function () { hold = false; }, 60); }
    }
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    el.addEventListener('click', function (e) { if (hold) { e.stopPropagation(); e.preventDefault(); } }, true);

    if (!arrows) return;
    // The arrow buttons, in a wrapper around the row.
    var wrap = document.createElement('div');
    wrap.className = 'swipewrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    var prev = navButton('prev', 'Show earlier');
    var next = navButton('next', 'Show more');
    wrap.appendChild(prev);
    wrap.appendChild(next);
    function update() {
      var max = el.scrollWidth - el.clientWidth;
      prev.hidden = !(el.scrollLeft > 2);
      next.hidden = !(max > 2 && el.scrollLeft < max - 2);
    }
    function go(dir) { el.scrollBy({ left: dir * Math.max(80, el.clientWidth * 0.7), behavior: 'smooth' }); }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    el.addEventListener('scroll', update, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(update).observe(el); else window.addEventListener('resize', update);
    if (window.MutationObserver) new MutationObserver(update).observe(el, { childList: true, subtree: true, characterData: true });   // (chips are redrawn)
    update();
  }

  return { attach: attach };
})();
