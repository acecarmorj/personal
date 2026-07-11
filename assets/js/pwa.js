(function () {
  "use strict";
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
      // O aplicativo continua funcional online quando o navegador bloqueia PWA.
    });
  });
})();
