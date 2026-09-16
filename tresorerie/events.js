import { getActiveModule } from "../shared/router.js";
import { loadWalletData } from "../shared/wallet.js";
import {
  ui, setOpeningBalance, setSalary, addManualExpense,
  addWalletCategory, deleteWalletCategory,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

async function onClick(e) {
  if (getActiveModule() !== "tresorerie") return;

  if (e.target.classList && e.target.classList.contains("overlay")) {
    if (e.target.dataset.overlayClose === "month") {
      ui.monthPanelOpen = false;
      render();
    }
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "set-subtab") { ui.subTab = target.dataset.tab; render(); }
  else if (action === "open-month-panel") { ui.monthPanelOpen = true; render(); }
  else if (action === "close-month-panel") { ui.monthPanelOpen = false; render(); }
  else if (action === "select-month") {
    ui.viewedMonthKey = target.dataset.month;
    ui.monthPanelOpen = false;
    render();
  }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "delete-wallet-category") {
    const ok = await deleteWalletCategory(target.dataset.id);
    if (ok) render();
  }
}

async function onSubmit(e) {
  if (getActiveModule() !== "tresorerie") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();

  if (form.dataset.form === "set-opening") {
    const ok = await setOpeningBalance(ui.viewedMonthKey, form.amount.value);
    if (ok) { await loadWalletData(); render(); }
  }
  else if (form.dataset.form === "set-salary") {
    const ok = await setSalary(form.dataset.monthKey, form.amount.value);
    if (ok) { await loadWalletData(); render(); }
  }
  else if (form.dataset.form === "add-manual-expense") {
    const ok = await addManualExpense(
      form.dataset.monthKey,
      form.category_id.value,
      form.amount.value,
      form.label.value,
    );
    if (ok) { await loadWalletData(); render(); }
  }
  else if (form.dataset.form === "add-wallet-category") {
    const ok = await addWalletCategory(form.name.value);
    if (ok) render();
  }
}
