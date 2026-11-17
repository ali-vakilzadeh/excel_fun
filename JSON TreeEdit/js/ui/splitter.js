/* js/ui/splitter.js — Resizable left/right pane divider (Pointer Events) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  var STORAGE_KEY = "jte.splitRatio";
  var DEFAULT_RATIO = 0.32;   // tree pane ~32% of width
  var MIN_RATIO = 0.15;
  var MAX_RATIO = 0.75;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function loadRatio() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      var n = raw ? parseFloat(raw) : NaN;
      if (isFinite(n)) return clamp(n, MIN_RATIO, MAX_RATIO);
    } catch (e) { /* localStorage may be blocked on file:// */ }
    return DEFAULT_RATIO;
  }

  function saveRatio(r) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, String(r));
    } catch (e) { /* ignore */ }
  }

  /**
   * Mount the splitter.
   * container — the grid element (e.g. #app)
   * handle    — the divider element (e.g. #splitter)
   * opts: { minRatio, maxRatio, defaultRatio }
   */
  function mount(container, handle, opts) {
    if (!container || !handle) throw new Error("Splitter.mount: container and handle required");
    opts = opts || {};

    var minRatio = opts.minRatio || MIN_RATIO;
    var maxRatio = opts.maxRatio || MAX_RATIO;
    var ratio = loadRatio();

    handle.classList.add("jte-splitter");
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", "Resize panes");
    handle.tabIndex = 0;

    function apply(r) {
      ratio = clamp(r, minRatio, maxRatio);
      // The grid has 3 columns: tree | handle | detail.
      // The handle is fixed at 6px; the tree column takes ratio * remaining.
      container.style.gridTemplateColumns = (ratio * 100) + "% 6px 1fr";
      handle.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      handle.setAttribute("aria-valuemin", String(Math.round(minRatio * 100)));
      handle.setAttribute("aria-valuemax", String(Math.round(maxRatio * 100)));
    }

    apply(ratio);

    var dragging = false;
    var pointerId = null;
    var rect = null;

    function onPointerDown(e) {
      // Left button only.
      if (e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      rect = container.getBoundingClientRect();
      handle.setPointerCapture(pointerId);
      handle.classList.add("jte-splitter-active");
      document.body.classList.add("jte-resizing");
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var x = e.clientX - rect.left;
      apply(x / rect.width);
    }

    function onPointerUp(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      try { handle.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      pointerId = null;
      handle.classList.remove("jte-splitter-active");
      document.body.classList.remove("jte-resizing");
      saveRatio(ratio);
    }

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);

    // Double-click resets.
    handle.addEventListener("dblclick", function () {
      apply(opts.defaultRatio || DEFAULT_RATIO);
      saveRatio(ratio);
    });

    // Keyboard: arrow keys nudge by 2%.
    handle.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 0.05 : 0.02;
      if (e.key === "ArrowLeft")  { e.preventDefault(); apply(ratio - step); saveRatio(ratio); }
      else if (e.key === "ArrowRight") { e.preventDefault(); apply(ratio + step); saveRatio(ratio); }
      else if (e.key === "Home") { e.preventDefault(); apply(minRatio); saveRatio(ratio); }
      else if (e.key === "End")  { e.preventDefault(); apply(maxRatio); saveRatio(ratio); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        apply(opts.defaultRatio || DEFAULT_RATIO);
        saveRatio(ratio);
      }
    });

    // Re-apply on window resize so the ratio stays proportional.
    global.addEventListener("resize", function () { apply(ratio); });

    return {
      setRatio: function (r) { apply(r); saveRatio(ratio); },
      getRatio: function () { return ratio; }
    };
  }

  JTE.Splitter = { mount: mount, DEFAULT_RATIO: DEFAULT_RATIO };
})(window);