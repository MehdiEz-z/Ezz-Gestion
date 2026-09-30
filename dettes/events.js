import { getActiveModule } from "../shared/router.js";
import { loadWalletData } from "../shared/wallet.js";
import {
  ui,
  addCategory, updateCategory, deleteCategory,
  recordBorrow, recordRepay, recordDeposit, recordWithdraw,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

function onClick(e) {
  if (getActiveModule() !== "dettes") return;

  if (e.target.classList && e.target.classList.contains("overlay")) {
    if (e.target.dataset.overlayClose === "modal") {
      ui.modal = null;
      render();
    }
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "set-subtab") { ui.subTab = target.dataset.tab; render(); }
  else if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "pick-debt-kind") {
    const form = target.closest("form");
    if (!form) return;
    form.querySelectorAll("[data-action='pick-debt-kind']").forEach(b => {
      b.classList.remove("active-month", "active-week");
    });
    target.classList.add(target.dataset.value === "epargne" ? "active-week" : "active-month");
    form.querySelector("[name='kind']").value = target.dataset.value;
  }
  else if (action === "pick-payment-method") {
    const form = target.closest("form");
    if (!form) return;
    form.querySelectorAll("[data-action='pick-payment-method']").forEach(b => {
      b.classList.remove("active-month", "active-week");
    });
    target.classList.add(target.dataset.value === "especes" ? "active-week" : "active-month");
    const hidden = form.querySelector("[name='payment_method']");
    if (hidden) hidden.value = target.dataset.value;
  }
  else if (action === "open-edit-debt-category") {
    ui.modal = { type: "edit-debt-category", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-debt-history") {
    ui.modal = { type: "debt-history", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-debt-action") {
    ui.modal = {
      type: "debt-action",
      categoryId: target.dataset.categoryId,
      actionType: target.dataset.actionType,
    };
    render();
  }
  else if (action === "delete-debt-category") {
    deleteCategory(target.dataset.categoryId).then(ok => {
      if (ok) ui.modal = null;
      render();
    });
  }
  else if (action === "close-modal") { ui.modal = null; render(); }
}

async function onSubmit(e) {
  if (getActiveModule() !== "dettes") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();

  if (form.dataset.form === "add-debt-category") {
    const ok = await addCategory(form.name.value, form.kind.value);
    if (ok) form.reset();
    render();
  }
  else if (form.dataset.form === "edit-debt-category") {
    const ok = await updateCategory(form.dataset.categoryId, form.name.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (form.dataset.form === "debt-action") {
    const { categoryId, actionType } = form.dataset;
    const pm = form.payment_method?.value;
    const payload = [
      categoryId,
      form.amount.value,
      form.movement_date.value,
      pm,
      form.label?.value,
    ];
    let ok = false;
    if (actionType === "borrow") ok = await recordBorrow(...payload);
    else if (actionType === "repay") ok = await recordRepay(...payload);
    else if (actionType === "deposit") ok = await recordDeposit(...payload);
    else if (actionType === "withdraw") ok = await recordWithdraw(...payload);
    if (ok) {
      ui.modal = null;
      await loadWalletData();
    }
    render();
  }
}
