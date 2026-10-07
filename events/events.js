import { getActiveModule } from "../shared/router.js";
import { dismissModal } from "../shared/ui-persist.js";
import {
  ui,
  addProject, updateProject, deleteProject,
  addSection, updateSection, deleteSection,
  addLine, updateLine, deleteLine,
} from "./data.js";
import { render } from "./render.js";

export function setupEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
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
  else if (action === "open-edit-line") {
    ui.modal = { type: "edit-line", lineId: target.dataset.lineId };
    render();
  }
  else if (action === "delete-project") {
    deleteProject(target.dataset.projectId).then(ok => { if (ok) render(); });
  }
  else if (action === "delete-section") {
    deleteSection(target.dataset.sectionId).then(ok => { if (ok) render(); });
  }
  else if (action === "delete-line") {
    deleteLine(target.dataset.lineId).then(ok => { if (ok) render(); });
  }
  else if (action === "close-modal") {
    dismissModal(ui);
    render();
  }
}

async function onSubmit(e) {
  if (getActiveModule() !== "events") return;
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;

  if (type === "add-project") {
    const ok = await addProject(form.name.value);
    if (ok) {
      form.reset();
      ui.expanded.delete("evt:add-project");
    }
    render();
  }
  else if (type === "edit-project") {
    const ok = await updateProject(form.dataset.projectId, form.name.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "add-section") {
    const ok = await addSection(form.dataset.projectId, form.name.value);
    if (ok) {
      form.reset();
      ui.expanded.delete(`evt-proj-sec:${form.dataset.projectId}`);
      ui.expanded.add(`evt-project:${form.dataset.projectId}`);
    }
    render();
  }
  else if (type === "edit-section") {
    const ok = await updateSection(form.dataset.sectionId, form.name.value);
    if (ok) ui.modal = null;
    render();
  }
  else if (type === "add-line") {
    const ok = await addLine(form.dataset.sectionId, form.label.value, form.amount.value);
    if (ok) {
      form.reset();
      ui.expanded.delete(`evt-sec-add:${form.dataset.sectionId}`);
    }
    render();
  }
  else if (type === "edit-line") {
    const ok = await updateLine(form.dataset.lineId, form.label.value, form.amount.value);
    if (ok) ui.modal = null;
    render();
  }
}
