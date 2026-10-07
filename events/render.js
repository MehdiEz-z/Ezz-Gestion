import {
  ui, state,
  sectionsForProject, linesForSection, sectionTotal, projectTotal,
  getProject, getSection, getLine,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import { esc, money } from "../shared/utils.js";
import { preserveScroll } from "../shared/ui-persist.js";

export function render() {
  preserveScroll(() => {
    document.getElementById("maison-controls").style.display = "none";
    document.getElementById("subtabs").innerHTML = "";
    document.getElementById("header-title").textContent = "Événements";
    document.getElementById("main").innerHTML = renderListTab();
    document.getElementById("modal-root").innerHTML = ui.modal ? renderModal() : "";
  });
}

function renderExpandableAddCard(key, title, bodyHtml) {
  const open = ui.expanded.has(key);
  return `
    <div class="card card-add">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">${title}</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">${bodyHtml}</div>
    </div>`;
}

function renderLineRow(line) {
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(line.label)}</div>
      <div class="list-item-right">
        <span class="small-label">${money(line.amount)} DH</span>
        ${isAdmin ? `
        <button class="icon-btn edit" data-action="open-edit-line" data-line-id="${line.id}" title="Modifier">✏️</button>
        <button class="btn-delete" data-action="delete-line" data-line-id="${line.id}" title="Supprimer">🗑️</button>` : ""}
      </div>
    </li>`;
}

function renderSectionBlock(section) {
  const secKey = `evt-section:${section.id}`;
  const secOpen = ui.expanded.has(secKey);
  const lines = linesForSection(section.id);
  const total = sectionTotal(section.id);
  const addLineForm = isAdmin ? `
    <form class="form-col" data-form="add-line" data-section-id="${section.id}" style="margin-top:10px">
      <input class="field" name="label" required />
      <input class="field" name="amount" type="number" min="0" step="0.01" required />
      <button type="submit" class="btn-small" style="background:var(--week)">Ajouter une ligne</button>
    </form>` : "";

  return `
    <div class="card" style="margin-top:10px;border-color:var(--week)">
      <div class="card-head" data-action="toggle-card" data-key="${secKey}">
        <div class="card-title" style="color:var(--week);font-size:14px">${esc(section.name)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="small-label"><strong>${money(total)} DH</strong></span>
          ${isAdmin ? `
          <button type="button" class="icon-btn edit" data-action="open-edit-section" data-section-id="${section.id}" title="Modifier">✏️</button>
          <button type="button" class="btn-delete" data-action="delete-section" data-section-id="${section.id}" title="Supprimer">🗑️</button>` : ""}
          <span class="chevron">${secOpen ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${secOpen ? "open" : ""}">
        ${lines.length === 0
    ? `<div class="small-label">Aucune ligne.</div>`
    : `<ul class="list">${lines.map(renderLineRow).join("")}</ul>`}
        ${addLineForm}
      </div>
    </div>`;
}

function renderProjectCard(project) {
  const key = `evt-project:${project.id}`;
  const open = ui.expanded.has(key);
  const sections = sectionsForProject(project.id);
  const total = projectTotal(project.id);
  const addSecKey = `evt-proj-sec:${project.id}`;
  const addSecOpen = ui.expanded.has(addSecKey);
  const addSectionCard = isAdmin ? `
    <div class="card card-add" style="margin-top:12px">
      <div class="card-head" data-action="toggle-card" data-key="${addSecKey}">
        <div class="card-title">＋ Bloc</div>
        <span class="chevron">${addSecOpen ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${addSecOpen ? "open" : ""}">
        <form class="form-col" data-form="add-section" data-project-id="${project.id}">
          <input class="field" name="name" required />
          <button type="submit" class="btn-primary">Ajouter le bloc</button>
        </form>
      </div>
    </div>` : "";

  return `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div>
          <div class="card-title" style="color:var(--month)">${esc(project.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview"><strong>${money(total)} DH</strong></div>
          ${isAdmin ? `
          <button type="button" class="icon-btn edit" data-action="open-edit-project" data-project-id="${project.id}" title="Modifier">✏️</button>
          <button type="button" class="btn-delete" data-action="delete-project" data-project-id="${project.id}" title="Supprimer">🗑️</button>` : ""}
          <span class="chevron">${open ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        ${sections.length === 0 && !isAdmin
    ? `<div class="small-label">Aucun bloc.</div>`
    : sections.map(s => renderSectionBlock(s)).join("")}
        ${addSectionCard}
      </div>
    </div>`;
}

function renderListTab() {
  const addForm = isAdmin ? renderExpandableAddCard("evt:add-project", "Ajouter un événement", `
    <form class="form-col" data-form="add-project">
      <input class="field" name="name" required />
      <button type="submit" class="btn-primary">Créer</button>
    </form>`) : "";

  const list = state.projects.length === 0
    ? `<div class="small-label">Aucun événement.</div>`
    : `<div class="stack">${state.projects.map(renderProjectCard).join("")}</div>`;

  return `<div class="stack">${addForm}${list}</div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "edit-project") {
    const p = getProject(m.projectId);
    if (!p) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier l'événement <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-project" data-project-id="${p.id}">
            <input class="field" name="name" value="${esc(p.name)}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  if (m.type === "edit-section") {
    const s = getSection(m.sectionId);
    if (!s) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier le bloc <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-section" data-section-id="${s.id}">
            <input class="field" name="name" value="${esc(s.name)}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  if (m.type === "edit-line") {
    const line = getLine(m.lineId);
    if (!line) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la ligne <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-line" data-line-id="${line.id}">
            <input class="field" name="label" value="${esc(line.label)}" required />
            <input class="field" name="amount" type="number" min="0" step="0.01" value="${line.amount}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  return "";
}
