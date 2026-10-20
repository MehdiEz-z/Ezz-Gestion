import { getActiveModule } from "../shared/router.js";
import { dismissModal, saveSubTab } from "../shared/ui-persist.js";
import {
  ui,
  setMonthBudget, setWeekBudget,
  addPeriodConsumption, closePeriod,
} from "./data.js";
import { render } from "./render.js";
import { guardAction, guardFormSubmit } from "../shared/submit-busy.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

async function onClick(e) {
  if (getActiveModule() !== "maison") return;
  if (e.target.classList && e.target.classList.contains("overlay")) {
    const type = e.target.dataset.overlayClose;
    if (type === "month") ui.monthPanelOpen = false;
    else if (type === "modal") dismissModal(ui);
    render();
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "open-month-panel") { ui.monthPanelOpen = true; render(); }
  else if (action === "close-month-panel") { ui.monthPanelOpen = false; render(); }
  else if (action === "select-month") {
    ui.viewedMonthKey = target.dataset.month;
    ui.monthPanelOpen = false;
    ui.subTab = "gestion";
    saveSubTab("maison", ui.subTab);
    render();
  }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "open-edit-budget") {
    if (target.dataset.budgetType === "month") {
      ui.modal = { type: "edit-budget", budgetType: "month", monthKey: target.dataset.monthKey };
    } else {
      ui.modal = { type: "edit-budget", budgetType: "week", weekStart: target.dataset.weekStart };
    }
    render();
  }
  else if (action === "open-close-period") {
    ui.modal = {
      type: "confirm-close",
      periodType: target.dataset.periodType,
      periodKey: target.dataset.periodKey,
    };
    render();
  }
  else if (action === "confirm-close-period") {
    await guardAction(target, async () => {
      const ok = await closePeriod(target.dataset.periodType, target.dataset.periodKey);
      if (ok) ui.modal = null;
      render();
    });
  }
  else if (action === "close-modal") { dismissModal(ui); render(); }
}

async function onSubmit(e) {
  if (getActiveModule() !== "maison") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();

  await guardFormSubmit(form, async () => {
    const type = form.dataset.form;

    if (type === "set-month-budget") {
      const n = parseFloat(form.amount.value);
      if (!isNaN(n) && n >= 0) await setMonthBudget(ui.viewedMonthKey, n);
      render();
    }
    else if (type === "set-week-budget") {
      const n = parseFloat(form.amount.value);
      if (!isNaN(n) && n >= 0) await setWeekBudget(form.dataset.weekStart, n);
      render();
    }
    else if (type === "edit-budget") {
      const n = parseFloat(form.amount.value);
      if (isNaN(n) || n < 0) return;
      let ok;
      if (form.dataset.budgetType === "month") ok = await setMonthBudget(form.dataset.monthKey, n);
      else ok = await setWeekBudget(form.dataset.weekStart, n);
      if (ok) ui.modal = null;
      render();
    }
    else if (type === "add-consumption") {
      const n = parseFloat(form.amount.value);
      if (isNaN(n) || n <= 0) return;
      const ok = await addPeriodConsumption(form.dataset.periodType, form.dataset.periodKey, n);
      if (ok) form.reset();
      render();
    }
  });
}
