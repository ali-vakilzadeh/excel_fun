/* js/ui/toast.js — Lightweight toast notifications (classic script, no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  var containerEl = null;
  var MAX_VISIBLE = 4;

  var ICONS = {
    info:    "\u2139",  // ℹ
    success: "\u2714",  // ✔
    warn:    "\u26A0",  // ⚠
    error:   "\u2716"   // ✖
  };

  function ensureContainer() {
    if (containerEl && document.body.contains(containerEl)) return containerEl;
    containerEl = document.getElementById("toast-container");
    if (!containerEl) {
      containerEl = document.createElement("div");
      containerEl.id = "toast-container";
      containerEl.className = "jte-toast-container";
      containerEl.setAttribute("aria-live", "polite");
      containerEl.setAttribute("aria-atomic", "false");
      document.body.appendChild(containerEl);
    }
    return containerEl;
  }

  /**
   * Show a toast.
   * opts: { type: "info"|"success"|"warn"|"error", message, timeout: ms (0 = sticky) }
   * Returns a dismiss function.
   */
  function show(opts) {
    opts = opts || {};
    var type = opts.type || "info";
    var timeout = opts.timeout === undefined ? (type === "error" ? 0 : 4000) : opts.timeout;
    var message = String(opts.message || "");

    var host = ensureContainer();

    // Cap visible toasts: dismiss oldest if over budget.
    var existing = host.querySelectorAll(".jte-toast");
    if (existing.length >= MAX_VISIBLE) {
      dismissEl(existing[0]);
    }

    var el = document.createElement("div");
    el.className = "jte-toast jte-toast-" + type;
    el.setAttribute("role", type === "error" ? "alert" : "status");

    var icon = document.createElement("span");
    icon.className = "jte-toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ICONS[type] || ICONS.info;
    el.appendChild(icon);

    var body = document.createElement("span");
    body.className = "jte-toast-message";
    body.textContent = message;
    el.appendChild(body);

    var close = document.createElement("button");
    close.type = "button";
    close.className = "jte-toast-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "\u2715"; // ✕
    close.addEventListener("click", function () { dismissEl(el); });
    el.appendChild(close);

    host.appendChild(el);

    // Animate in on next frame so transition applies.
    requestAnimationFrame(function () { el.classList.add("jte-toast-visible"); });

    var timer = null;
    if (timeout > 0) {
      timer = setTimeout(function () { dismissEl(el); }, timeout);
    }

    function dismiss() { dismissEl(el); }
    el.__jteDismiss = function () {
      if (timer) clearTimeout(timer);
      dismiss();
    };
    return dismiss;
  }

  function dismissEl(el) {
    if (!el || !el.parentNode) return;
    if (el.__jteDismiss) el.__jteDismiss();
    el.classList.remove("jte-toast-visible");
    el.classList.add("jte-toast-leaving");
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 200);
  }

  // Convenience wrappers
  function info(msg, timeout)    { return show({ type: "info",    message: msg, timeout: timeout }); }
  function success(msg, timeout) { return show({ type: "success", message: msg, timeout: timeout }); }
  function warn(msg, timeout)    { return show({ type: "warn",    message: msg, timeout: timeout }); }
  function error(msg, timeout)   { return show({ type: "error",   message: msg, timeout: timeout }); }

  // Subscribe to load events so the rest of the app never wires them.
  function wireStateEvents() {
    JTE.State.on("load:error", function (p) {
      var e = p.error || {};
      var where = e.line ? " (line " + e.line + (e.column ? ", column " + e.column : "") + ")" : "";
      error("Load failed: " + (e.message || "unknown error") + where);
    });
    JTE.State.on("load:warnings", function (p) {
      var n = (p.problems && p.problems.length) || 0;
      if (n) warn(n + " warning(s): " + p.problems[0] + (n > 1 ? " …" : ""), 6000);
    });
    JTE.State.on("document:loaded", function (p) {
      success("Loaded " + (p.fileName || "document") + ".");
    });
    JTE.State.on("document:cleared", function () {
      info("Document closed.");
    });
    JTE.State.on("dirty:changed", function (p) {
      // Optional: no toast for dirty state; the toolbar shows an indicator.
      void p;
    });
  }

  JTE.Toast = {
    show: show,
    info: info,
    success: success,
    warn: warn,
    error: error,
    dismissAll: function () {
      var host = ensureContainer();
      host.querySelectorAll(".jte-toast").forEach(dismissEl);
    },
    wireStateEvents: wireStateEvents
  };
})(window);