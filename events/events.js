import { getActiveModule } from "../shared/router.js";
import { dismissModal } from "../shared/ui-persist.js";
import {
  ui,
  addProject, updateProject, deleteProject,
  addSection, updateSection, deleteSection,
  addLine, updateLine, deleteLine,
  getSection, getLine,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
}

function modalReturnTo() {
  const m = ui.modal;
  if (!m) return null;
  if (m.type === "category-detail") return { type: "category-detail", sectionId: m.sectionId };
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
    const prev = ui.modal?.type === "category-detail"
      ? { type: "category-detail", sectionId: ui.modal.sectionId }
      : null;
    ui.modal = { type: "edit-section", sectionId: target.dataset.sectionId, returnTo: prev };
    render();
  }
  else if (action === "open-edit-line") {
    const prev = ui.modal?.type === "category-detail"
      ? { type: "category-detail", sectionId: ui.modal.sectionId }
      : (ui.modal?.returnTo ?? null);
    ui.modal = { type: "edit-line", lineId: target.dataset.lineId, returnTo: prev };
    render();
  }
  else if (action === "open-category-detail") {
    ui.modal = { type: "category-detail", sectionId: target.dataset.sectionId };
    render();
  }
  else if (action === "open-add-line") {
    ui.modal = { type: "add-line", sectionId: target.dataset.sectionId };
    render();
  }
  else if (action === "open-delete-confirm") {
    const prev = modalReturnTo();
    ui.modal = {
      type: "confirm-delete",
      entity: target.dataset.entity,
      id: target.dataset.id,
      label: target.dataset.label,
      returnTo: prev,
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

async function handleConfirmDelete(entity, id) {
  const returnTo = ui.modal?.returnTo;
  let ok = false;
  if (entity === "project") ok = await deleteProject(id);
  else if (entity === "category") ok = await deleteSection(id);
  else if (entity === "line") ok = await deleteLine(id);

  if (!ok) return;

  if (entity === "line" && returnTo?.type === "category-detail") {
    const section = getSection(returnTo.sectionId);
    if (section) ui.modal = returnTo;
    else ui.modal = null;
  } else if (entity === "category" && returnTo?.type === "category-detail" && returnTo.sectionId === id) {
    ui.modal = null;
  } else if (entity === "project") {
    ui.modal = null;
  } else {
    ui.modal = returnTo ?? null;
  }
  render();
}

async function handleConfirmSave(entity, id) {
  const m = ui.modal;
  if (!m || m.type !== "confirm-save" || !m.payload) return;

  let ok = false;
  if (entity === "project") ok = await updateProject(id, m.payload.name);
  else if (entity === "category") ok = await updateSection(id, m.payload.name);
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
      ui.expanded.add(`evt-proj-cat:${created.id}`);
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
      ui.expanded.delete(`evt-proj-cat:${projectId}`);
      ui.expanded.add(`evt-project:${projectId}`);
    }
    render();
  }
  else if (type === "edit-section") {
    const sectionId = form.dataset.sectionId;
    const prev = ui.modal?.returnTo ?? null;
    ui.modal = {
      type: "confirm-save",
      entity: "category",
      id: sectionId,
      payload: { name: form.name.value.trim() },
      returnTo: { type: "edit-section", sectionId, draft: { name: form.name.value }, returnTo: prev },
    };
    render();
  }
  else if (type === "add-line") {
    const sectionId = form.dataset.sectionId;
    const ok = await addLine(sectionId, form.label.value, form.amount.value);
    if (ok) {
      form.reset();
      ui.modal = { type: "category-detail", sectionId };
    }
    render();
  }
  else if (type === "edit-line") {
    const lineId = form.dataset.lineId;
    const line = getLine(lineId);
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
