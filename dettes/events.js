import { getActiveModule } from "../shared/router.js";
import { dismissModal } from "../shared/ui-persist.js";
import { ui, addCategory, applyCategoryAmount } from "./data.js";
import { render } from "./render.js";
import { guardFormSubmit } from "../shared/submit-busy.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

async function onClick(e) {
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

  if (action === "toggle-card") {
    const key = target.dataset.key;
    if (ui.expanded.has(key)) ui.expanded.delete(key);
    else ui.expanded.add(key);
    render();
  }
  else if (action === "open-debt-amount") {
    if (target.disabled) return;
    ui.modal = {
      type: "debt-amount",
      categoryId: target.dataset.categoryId,
      sign: target.dataset.sign,
    };
    render();
  }
  else if (action === "close-modal") {
    dismissModal(ui);
    render();
  }
}

async function onSubmit(e) {
  if (getActiveModule() !== "dettes") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();

  await guardFormSubmit(form, async () => {
    if (form.dataset.form === "add-debt-category") {
      const ok = await addCategory(form.name.value, form.dataset.kind);
      if (ok) form.reset();
      render();
    }
    else if (form.dataset.form === "debt-amount") {
      const ok = await applyCategoryAmount(
        form.dataset.categoryId,
        form.dataset.sign,
        form.amount.value,
      );
      if (ok) {
        ui.modal = null;
        render();
      }
    }
  });
}
