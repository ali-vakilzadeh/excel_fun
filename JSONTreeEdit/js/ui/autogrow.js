/* js/ui/autogrow.js — Single-line textarea that expands on focus (no deps) */
(function (global) {
  "use strict";

  var JTE = global.JTE = global.JTE || {};

  /**
   * Turn a <textarea> into a one-line field that grows to show its full
   * content while focused and collapses again on blur. The full value is also
   * available as a native tooltip while the field is collapsed (hover).
   * Call after creating the element; set .value before or after.
   */
  function enhance(ta) {
    ta.rows = 1;
    ta.wrap = "off";
    ta.spellcheck = false;
    ta.classList.add("jte-autogrow");

    function grow() {
      ta.style.height = "auto";
      var max = Math.round(global.innerHeight * 0.6);
      var h = ta.scrollHeight + 2; // border
      ta.style.overflowY = h > max ? "auto" : "hidden";
      ta.style.height = Math.min(h, max) + "px";
    }

    ta.addEventListener("focus", function () {
      ta.wrap = "soft";
      grow();
    });
    ta.addEventListener("input", function () {
      if (document.activeElement === ta) grow();
    });
    ta.addEventListener("blur", function () {
      ta.wrap = "off";
      ta.style.height = "";
      ta.style.overflowY = "";
      ta.scrollTop = 0;
      ta.title = ta.value;
    });

    // Hover tooltip with the full value (cheap fallback for long text).
    ta.addEventListener("mouseenter", function () {
      if (document.activeElement !== ta) ta.title = ta.value;
    });
    return ta;
  }

  JTE.TextField = { enhance: enhance };
})(window);
