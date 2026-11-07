(function () {
  const themeMeta = document.querySelector('meta[name="theme-color"]:not([media])');
  const colorQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

  function updateThemeColor() {
    if (!themeMeta) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const color = rootStyle.getPropertyValue("--bg").trim();
    if (color) themeMeta.setAttribute("content", color);
  }

  updateThemeColor();
  colorQuery?.addEventListener?.("change", updateThemeColor);
  new MutationObserver(updateThemeColor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const isDesktopShell = Boolean(window.dailyTrack);
  const isHttp = location.protocol === "http:" || location.protocol === "https:";

  if (!isHttp || isDesktopShell || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
})();
