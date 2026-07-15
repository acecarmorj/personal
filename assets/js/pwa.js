(function () {
  "use strict";
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

  const RELOAD_KEY = "profitness-sw-reloaded-20260714-student-soft-v1";

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none"
      });
      await registration.update();

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
        sessionStorage.setItem(RELOAD_KEY, "1");
        location.reload();
      });
    } catch (error) {
      // O sistema continua funcional online quando o navegador bloqueia PWA.
    }
  });
})();
