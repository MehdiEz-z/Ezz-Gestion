/** sessionStorage keys and helpers for sub-tabs, modal stack, scroll, eau-élec owner pay */

export function subTabStorageKey(moduleId) {
  return `ezz-subtab-${moduleId}`;
}

export function loadSubTab(moduleId, defaultTab) {
  const stored = sessionStorage.getItem(subTabStorageKey(moduleId));
  return stored || defaultTab;
}

export function saveSubTab(moduleId, tab) {
  if (tab) sessionStorage.setItem(subTabStorageKey(moduleId), tab);
}

/** Close top modal sheet; return to detail when returnTo is set. */
export function dismissModal(ui) {
  ui.modal = ui.modal?.returnTo ?? null;
}

export function preserveScroll(renderFn) {
  const main = document.getElementById("main");
  const mainScroll = main?.scrollTop ?? 0;
  const chipScrolls = [...document.querySelectorAll(".period-cat-scroll")].map((el, i) => ({
    i,
    left: el.scrollLeft,
  }));
  renderFn();
  requestAnimationFrame(() => {
    if (main) main.scrollTop = mainScroll;
    const next = document.querySelectorAll(".period-cat-scroll");
    chipScrolls.forEach(({ i, left }) => {
      if (next[i]) next[i].scrollLeft = left;
    });
  });
}

const OWNER_UTIL_PM_KEY = "ezz-util-owner-pm";

export function getOwnerUtilityPaymentMethod() {
  const v = sessionStorage.getItem(OWNER_UTIL_PM_KEY);
  if (v === "especes" || v === "banque") return v;
  return null;
}

export function setOwnerUtilityPaymentMethod(pm) {
  sessionStorage.setItem(OWNER_UTIL_PM_KEY, pm === "especes" ? "especes" : "banque");
}
