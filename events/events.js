import { getActiveModule } from "../shared/router.js";
import { dismissModal } from "../shared/ui-persist.js";
import {
  ui,
  addProject, updateProject, deleteProject,
  addSection, updateSection, deleteSection,
  addCategory, updateCategory, deleteCategory,
  addLine, updateLine, deleteLine,
  getCategory, getLine,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

function modalReturnTo() {
  const m = ui.modal;
  if (!m) return null;
  if (m.type === "category-detail") {
    return { type: "category-detail", categoryId: m.categoryId };
  }
  return m.returnTo ? { ...m.returnTo } : null;
}

function onClick(e) {
  if (getActiveModule() !== "events") return;

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
  else if (action === "open-edit-project") {
    ui.modal = { type: "edit-project", projectId: target.dataset.projectId };
    render();
  }
  else if (action === "open-edit-section") {
    ui.modal = { type: "edit-section", sectionId: target.dataset.sectionId };
    render();
  }
  else if (action === "open-edit-category") {
    const prev = ui.modal?.type === "category-detail"
      ? { type: "category-detail", categoryId: ui.modal.categoryId }
      : null;
    ui.modal = { type: "edit-category", categoryId: target.dataset.categoryId, returnTo: prev };
    render();
  }
  else if (action === "open-edit-line") {
    const prev = ui.modal?.type === "category-detail"
      ? { type: "category-detail", categoryId: ui.modal.categoryId }
      : (ui.modal?.returnTo ?? null);
    ui.modal = { type: "edit-line", lineId: target.dataset.lineId, returnTo: prev };
    render();
  }
  else if (action === "open-category-detail") {
    ui.modal = { type: "category-detail", categoryId: target.dataset.categoryId };
    render();
  }
  else if (action === "open-add-line") {
    const prev = ui.modal?.type === "category-detail"
      ? { type: "category-detail", categoryId: ui.modal.categoryId }
      : null;
    ui.modal = { type: "add-line", categoryId: target.dataset.categoryId, returnTo: prev };
    render();
  }
  else if (action === "open-delete-confirm") {
    ui.modal = {
      type: "confirm-delete",
      entity: target.dataset.entity,
      id: target.dataset.id,
      label: target.dataset.label,
      returnTo: modalReturnTo(),
    };
    render();
  }
  else if (action === "confirm-delete") {
    handleConfirmDelete(target.dataset.entity, target.dataset.id);
  }
  else if (action === "confirm-save") {
    handleConfirmSave(target.dataset.entity, target.dataset.id);
  }
  else if (action === "close-modal") {
    dismissModal(ui);
    render();
  }
}

function afterAddLine(categoryId) {
  ui.modal = { type: "category-detail", categoryId };
}

async function handleConfirmDelete(entity, id) {
  const returnTo = ui.modal?.returnTo;
  let ok = false;
  if (entity === "project") ok = await deleteProject(id);
  else if (entity === "section") ok = await deleteSection(id);
  else if (entity === "category") ok = await deleteCategory(id);
  else if (entity === "line") ok = await deleteLine(id);

  if (!ok) return;

  if (entity === "line" && returnTo?.type === "category-detail") {
    ui.modal = getCategory(returnTo.categoryId) ? returnTo : null;
  } else if (entity === "category" && returnTo?.type === "category-detail" && returnTo.categoryId === id) {
    ui.modal = null;
  } else {
    ui.modal = null;
  }
  render();
}

async function handleConfirmSave(entity, id) {
  const m = ui.modal;
  if (!m || m.type !== "confirm-save" || !m.payload) return;

  let ok = false;
  if (entity === "project") ok = await updateProject(id, m.payload.name);
  else if (entity === "section") ok = await updateSection(id, m.payload.name);
  else if (entity === "category") ok = await updateCategory(id, m.payload.name);
  else if (entity === "line") ok = await updateLine(id, m.payload.label, m.payload.amount);

  if (!ok) return;

  const returnTo = m.returnTo;
  if (entity === "line" || entity === "category") {
    const detail = returnTo?.returnTo;
    ui.modal = detail?.type === "category-detail" ? detail : null;
  } else {
    ui.modal = null;
  }
  render();
}

async function onSubmit(e) {
  if (getActiveModule() !== "events") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;

  if (type === "add-project") {
    const created = await addProject(form.name.value);
    if (created) {
      form.reset();
      ui.expanded.delete("evt:add-project");
      ui.expanded.add(`evt-project:${created.id}`);
      ui.expanded.add(`evt-proj-sec:${created.id}`);
    }
    render();
  }
  else if (type === "edit-project") {
    const projectId = form.dataset.projectId;
    ui.modal = {
      type: "confirm-save",
      entity: "project",
      id: projectId,
      payload: { name: form.name.value.trim() },
      returnTo: { type: "edit-project", projectId, draft: { name: form.name.value } },
    };
    render();
  }
  else if (type === "add-section") {
    const projectId = form.dataset.projectId;
    const created = await addSection(projectId, form.name.value);
    if (created) {
      form.reset();
      ui.expanded.delete(`evt-proj-sec:${projectId}`);
      ui.expanded.add(`evt-project:${projectId}`);
      ui.expanded.add(`evt-section:${created.id}`);
    }
    render();
  }
  else if (type === "edit-section") {
    const sectionId = form.dataset.sectionId;
    ui.modal = {
      type: "confirm-save",
      entity: "section",
      id: sectionId,
      payload: { name: form.name.value.trim() },
      returnTo: { type: "edit-section", sectionId, draft: { name: form.name.value } },
    };
    render();
  }
  else if (type === "add-category") {
    const sectionId = form.dataset.sectionId;
    const created = await addCategory(sectionId, form.name.value);
    if (created) {
      form.reset();
      ui.expanded.add(`evt-section:${sectionId}`);
    }
    render();
  }
  else if (type === "edit-category") {
    const categoryId = form.dataset.categoryId;
    const prev = ui.modal?.returnTo ?? null;
    ui.modal = {
      type: "confirm-save",
      entity: "category",
      id: categoryId,
      payload: { name: form.name.value.trim() },
      returnTo: { type: "edit-category", categoryId, draft: { name: form.name.value }, returnTo: prev },
    };
    render();
  }
  else if (type === "add-line") {
    const categoryId = form.dataset.categoryId;
    const ok = await addLine(categoryId, form.label.value, form.amount.value);
    if (ok) {
      form.reset();
      afterAddLine(categoryId);
    }
    render();
  }
  else if (type === "edit-line") {
    const lineId = form.dataset.lineId;
    const prev = ui.modal?.returnTo ?? null;
    ui.modal = {
      type: "confirm-save",
      entity: "line",
      id: lineId,
      payload: { label: form.label.value.trim(), amount: form.amount.value },
      returnTo: {
        type: "edit-line",
        lineId,
        draft: { label: form.label.value, amount: form.amount.value },
        returnTo: prev,
      },
    };
    render();
  }
}
