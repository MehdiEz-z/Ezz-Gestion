import { getActiveModule } from "../shared/router.js";
import { dismissModal, saveSubTab } from "../shared/ui-persist.js";
import { loadWalletData } from "../shared/wallet.js";
import {
  ui,
  addCategory, updateCategory, deleteCategory,
  recordBorrow, recordRepay, recordDeposit, recordWithdraw,
  updateDebtMovement, deleteDebtMovement, getMovement,
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
      dismissModal(ui);
      render();
    }
    return;
  }

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "set-subtab") {
    ui.subTab = target.dataset.tab;
    saveSubTab("dettes", ui.subTab);
    render();
  }
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
  else if (action === "open-debt-detail") {
    ui.modal = { type: "debt-detail", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-debt-action") {
    const prev = ui.modal?.type === "debt-detail" ? { ...ui.modal } : null;
    ui.modal = {
      type: "debt-action",
      categoryId: target.dataset.categoryId,
      actionType: target.dataset.actionType,
      maxAmount: target.dataset.maxAmount ? Number(target.dataset.maxAmount) : null,
      linkedInboundId: target.dataset.linkedInboundId || null,
      returnTo: prev,
    };
    render();
  }
  else if (action === "open-edit-debt-movement") {
    const prev = ui.modal?.type === "debt-detail" ? { ...ui.modal } : null;
    ui.modal = {
      type: "edit-debt-movement",
      movementId: target.dataset.movementId,
      returnTo: prev,
    };
    render();
  }
  else if (action === "delete-debt-movement") {
    const movId = target.dataset.movementId;
    const mov = getMovement(movId);
    const detailCat = ui.modal?.type === "debt-detail" ? ui.modal.categoryId : mov?.category_id;
    deleteDebtMovement(movId).then(async ok => {
      if (ok) {
        await loadWalletData();
        ui.modal = detailCat ? { type: "debt-detail", categoryId: detailCat } : null;
      }
      render();
    });
  }
  else if (action === "delete-debt-category") {
    deleteCategory(target.dataset.categoryId).then(ok => {
      if (ok) ui.modal = null;
      render();
    });
  }
  else if (action === "close-modal") { dismissModal(ui); render(); }
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
    const linkedInboundId = form.dataset.linkedInboundId
      || form.linked_inbound_id?.value
      || null;
    const pm = form.payment_method?.value || "banque";
    let ok = false;
    if (actionType === "borrow") ok = await recordBorrow(categoryId, form.amount.value, pm, form.label?.value);
    else if (actionType === "repay") {
      ok = await recordRepay(categoryId, form.amount.value, pm, form.label?.value, linkedInboundId);
    }
    else if (actionType === "deposit") ok = await recordDeposit(categoryId, form.amount.value, pm, form.label?.value);
    else if (actionType === "withdraw") {
      ok = await recordWithdraw(categoryId, form.amount.value, pm, form.label?.value, linkedInboundId);
    }
    if (ok) {
      await loadWalletData();
      ui.modal = { type: "debt-detail", categoryId };
    }
    render();
  }
  else if (form.dataset.form === "edit-debt-movement") {
    const pm = form.payment_method?.value || "banque";
    const ok = await updateDebtMovement(
      form.dataset.movementId,
      form.amount.value,
      pm,
      form.label?.value,
    );
    if (ok) {
      await loadWalletData();
      const returnTo = ui.modal?.returnTo;
      const mov = getMovement(form.dataset.movementId);
      ui.modal = returnTo || (mov ? { type: "debt-detail", categoryId: mov.category_id } : null);
    }
    render();
  }
}
