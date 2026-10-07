import {
  ui, state,
  blocksForProject, sectionsForBlock, categoriesForSection, linesForCategory,
  categoryTotal, sectionTotal, blockTotal, projectTotal,
  getProject, getBlock, getSection, getCategory, getLine,
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

function renderExpandableAddCard(key, title, bodyHtml, extraClass = "") {
  const open = ui.expanded.has(key);
  return `
    <div class="card card-add ${extraClass}">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">${title}</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">${bodyHtml}</div>
    </div>`;
}

function renderCategoryRow(category) {
  const total = categoryTotal(category.id);
  return `
    <li class="item-row">
      <div class="item-name">${esc(category.name)}</div>
      <div class="item-amount">${money(total)} DH</div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="open-category-detail" data-category-id="${category.id}" title="Détails">🧾</button>
        ${isAdmin ? `<button type="button" class="icon-btn add" data-action="open-add-line" data-category-id="${category.id}" title="Ajouter">＋</button>` : ""}
      </div>
    </li>`;
}

function renderSubsectionBlock(section) {
  const subKey = `evt-sub:${section.id}`;
  const subOpen = ui.expanded.has(subKey);
  const categories = categoriesForSection(section.id);
  const total = sectionTotal(section.id);
  const addCatKey = `evt-sub-cat:${section.id}`;
  const addCatOpen = ui.expanded.has(addCatKey);

  const addCategoryCard = isAdmin ? renderExpandableAddCard(
    addCatKey,
    "＋ Catégorie",
    `<form class="form-col" data-form="add-category" data-section-id="${section.id}">
      <input class="field" name="name" placeholder="Catégorie" required />
      <button type="submit" class="btn-small" style="background:var(--week)">Ajouter la catégorie</button>
    </form>`,
  ) : "";

  return `
    <div class="card" style="margin-top:10px;border-color:var(--week)">
      <div class="card-head" data-action="toggle-card" data-key="${subKey}">
        <div>
          <div class="card-title" style="color:var(--week);font-size:14px">${esc(section.name)}</div>
          <div class="small-label">Sous-section</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="small-label"><strong>${money(total)} DH</strong></span>
          ${isAdmin ? `
          <button type="button" class="icon-btn edit" data-action="open-edit-subsection" data-section-id="${section.id}" title="Modifier">✏️</button>
          <button type="button" class="btn-delete" data-action="open-delete-confirm" data-entity="subsection" data-id="${section.id}" data-label="${esc(section.name)}" title="Supprimer">🗑️</button>` : ""}
          <span class="chevron">${subOpen ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${subOpen ? "open" : ""}">
        ${categories.length === 0
    ? `<div class="small-label">Aucune catégorie.</div>`
    : `<ul class="list">${categories.map(renderCategoryRow).join("")}</ul>`}
        ${addCategoryCard}
      </div>
    </div>`;
}

function renderBlockCard(block) {
  const blockKey = `evt-block:${block.id}`;
  const blockOpen = ui.expanded.has(blockKey);
  const subsections = sectionsForBlock(block.id);
  const total = blockTotal(block.id);
  const addSubKey = `evt-block-sub:${block.id}`;
  const addSubOpen = ui.expanded.has(addSubKey);

  const addSubCard = isAdmin ? `
    <div class="card card-add" style="margin-top:10px">
      <div class="card-head" data-action="toggle-card" data-key="${addSubKey}">
        <div class="card-title">＋ Sous-section</div>
        <span class="chevron">${addSubOpen ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${addSubOpen ? "open" : ""}">
        <form class="form-col" data-form="add-subsection" data-block-id="${block.id}">
          <input class="field" name="name" placeholder="Électricité, Eau, Bucheron…" required />
          <button type="submit" class="btn-primary">Ajouter la sous-section</button>
        </form>
      </div>
    </div>` : "";

  return `
    <div class="card" style="margin-top:12px;border-color:var(--month)">
      <div class="card-head" data-action="toggle-card" data-key="${blockKey}">
        <div>
          <div class="card-title" style="color:var(--month)">${esc(block.name)}</div>
          <div class="small-label">Section</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="small-label"><strong>${money(total)} DH</strong></span>
          ${isAdmin ? `
          <button type="button" class="icon-btn edit" data-action="open-edit-block" data-block-id="${block.id}" title="Modifier">✏️</button>
          <button type="button" class="btn-delete" data-action="open-delete-confirm" data-entity="block" data-id="${block.id}" data-label="${esc(block.name)}" title="Supprimer">🗑️</button>` : ""}
          <span class="chevron">${blockOpen ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${blockOpen ? "open" : ""}">
        ${subsections.length === 0
    ? `<div class="small-label">Aucune sous-section.</div>`
    : subsections.map(renderSubsectionBlock).join("")}
        ${addSubCard}
      </div>
    </div>`;
}

function renderProjectCard(project) {
  const key = `evt-project:${project.id}`;
  const open = ui.expanded.has(key);
  const blocks = blocksForProject(project.id);
  const total = projectTotal(project.id);
  const addBlockKey = `evt-proj-block:${project.id}`;
  const addBlockOpen = ui.expanded.has(addBlockKey);

  const addBlockCard = isAdmin ? `
    <div class="card card-add" style="margin-top:12px">
      <div class="card-head" data-action="toggle-card" data-key="${addBlockKey}">
        <div class="card-title">＋ Section</div>
        <span class="chevron">${addBlockOpen ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${addBlockOpen ? "open" : ""}">
        <form class="form-col" data-form="add-block" data-project-id="${project.id}">
          <input class="field" name="name" placeholder="Travaux, Réception…" required />
          <button type="submit" class="btn-primary">Ajouter la section</button>
        </form>
      </div>
    </div>` : "";

  return `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div>
          <div class="card-title" style="color:var(--month)">${esc(project.name)}</div>
          <div class="small-label">Événement</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview"><strong>${money(total)} DH</strong></div>
          ${isAdmin ? `
          <button type="button" class="icon-btn edit" data-action="open-edit-project" data-project-id="${project.id}" title="Modifier">✏️</button>
          <button type="button" class="btn-delete" data-action="open-delete-confirm" data-entity="project" data-id="${project.id}" data-label="${esc(project.name)}" title="Supprimer">🗑️</button>` : ""}
          <span class="chevron">${open ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        ${blocks.length === 0
    ? `<div class="small-label">Aucune section.</div>`
    : blocks.map(renderBlockCard).join("")}
        ${addBlockCard}
      </div>
    </div>`;
}

function renderListTab() {
  const addForm = isAdmin ? renderExpandableAddCard("evt:add-project", "Ajouter un événement", `
    <form class="form-col" data-form="add-project">
      <input class="field" name="name" placeholder="Nom événement" required />
      <button type="submit" class="btn-primary">Créer</button>
    </form>`) : "";

  const list = state.projects.length === 0
    ? `<div class="small-label">Aucun événement.</div>`
    : `<div class="stack">${state.projects.map(renderProjectCard).join("")}</div>`;

  return `<div class="stack">${addForm}${list}</div>`;
}

function renderConfirmDeleteModal(m) {
  const labels = {
    project: "l'événement",
    block: "la section",
    subsection: "la sous-section",
    category: "la catégorie",
    line: "la ligne",
  };
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Confirmer la suppression <button class="close-btn" data-action="close-modal">✕</button></div>
        <p class="confirm-text">Voulez-vous vraiment supprimer ${labels[m.entity] || "cet élément"} <strong>${esc(m.label)}</strong> ? Cette action est irréversible.</p>
        <div class="btn-row">
          <button type="button" class="btn-danger" data-action="confirm-delete" data-entity="${m.entity}" data-id="${m.id}">Supprimer</button>
          <button type="button" class="btn-secondary" data-action="close-modal">Annuler</button>
        </div>
      </div>
    </div>`;
}

function renderConfirmSaveModal(m) {
  const labels = {
    project: "l'événement",
    block: "la section",
    subsection: "la sous-section",
    category: "la catégorie",
    line: "la ligne",
  };
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Confirmer la modification <button class="close-btn" data-action="close-modal">✕</button></div>
        <p class="confirm-text">Enregistrer les modifications pour ${labels[m.entity] || "cet élément"} ?</p>
        <div class="btn-row">
          <button type="button" class="btn-primary" data-action="confirm-save" data-entity="${m.entity}" data-id="${m.id}">Enregistrer</button>
          <button type="button" class="btn-secondary" data-action="close-modal">Annuler</button>
        </div>
      </div>
    </div>`;
}

function renderCategoryDetailModal(m) {
  const category = getCategory(m.categoryId);
  if (!category) return "";
  const lines = linesForCategory(category.id);
  const total = categoryTotal(category.id);
  const section = getSection(category.section_id);
  const block = section ? getBlock(section.block_id) : null;
  const project = block ? getProject(block.project_id) : null;

  const lineRows = lines.length === 0
    ? `<div class="small-label">Aucune ligne.</div>`
    : `<ul class="list">${lines.map(line => `
      <li class="list-item">
        <div class="list-item-name">${esc(line.label)}</div>
        <div class="list-item-right">
          <span class="small-label">${money(line.amount)} DH</span>
          ${isAdmin ? `
          <button type="button" class="icon-btn edit" data-action="open-edit-line" data-line-id="${line.id}" title="Modifier">✏️</button>
          <button type="button" class="btn-delete" data-action="open-delete-confirm" data-entity="line" data-id="${line.id}" data-label="${esc(line.label)}" title="Supprimer">🗑️</button>` : ""}
        </div>
      </li>`).join("")}</ul>`;

  const path = [project?.name, block?.name, section?.name].filter(Boolean).map(n => esc(n)).join(" · ");

  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${esc(category.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
        ${path ? `<div class="small-label">${path}</div>` : ""}
        <div class="small-label">Total : <strong>${money(total)} DH</strong></div>
        ${isAdmin ? `
        <div class="btn-row" style="margin:12px 0">
          <button type="button" class="icon-btn edit" data-action="open-edit-category" data-category-id="${category.id}" title="Renommer">✏️ Catégorie</button>
          <button type="button" class="btn-delete" data-action="open-delete-confirm" data-entity="category" data-id="${category.id}" data-label="${esc(category.name)}" title="Supprimer">🗑️</button>
        </div>` : ""}
        <div style="margin-top:12px">${lineRows}</div>
      </div>
    </div>`;
}

function renderAddLineModal(m) {
  const category = getCategory(m.categoryId);
  if (!category) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Ajouter une ligne · ${esc(category.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="add-line" data-category-id="${category.id}">
          <input class="field" name="label" placeholder="Libellé" required />
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Montant" required />
          <button type="submit" class="btn-primary">Ajouter</button>
        </form>
      </div>
    </div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "confirm-delete") return renderConfirmDeleteModal(m);
  if (m.type === "confirm-save") return renderConfirmSaveModal(m);
  if (m.type === "category-detail") return renderCategoryDetailModal(m);
  if (m.type === "add-line") return renderAddLineModal(m);

  if (m.type === "edit-project") {
    const p = getProject(m.projectId);
    if (!p) return "";
    const name = m.draft?.name ?? p.name;
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier l'événement <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-project" data-project-id="${p.id}">
            <input class="field" name="name" value="${esc(name)}" placeholder="Nom événement" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  if (m.type === "edit-block") {
    const b = getBlock(m.blockId);
    if (!b) return "";
    const name = m.draft?.name ?? b.name;
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la section <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-block" data-block-id="${b.id}">
            <input class="field" name="name" value="${esc(name)}" placeholder="Section" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  if (m.type === "edit-subsection") {
    const s = getSection(m.sectionId);
    if (!s) return "";
    const name = m.draft?.name ?? s.name;
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la sous-section <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-subsection" data-section-id="${s.id}">
            <input class="field" name="name" value="${esc(name)}" placeholder="Sous-section" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  if (m.type === "edit-category") {
    const c = getCategory(m.categoryId);
    if (!c) return "";
    const name = m.draft?.name ?? c.name;
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la catégorie <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-category" data-category-id="${c.id}">
            <input class="field" name="name" value="${esc(name)}" placeholder="Catégorie" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  if (m.type === "edit-line") {
    const line = getLine(m.lineId);
    if (!line) return "";
    const label = m.draft?.label ?? line.label;
    const amount = m.draft?.amount ?? line.amount;
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la ligne <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-line" data-line-id="${line.id}">
            <input class="field" name="label" value="${esc(label)}" placeholder="Libellé" required />
            <input class="field" name="amount" type="number" min="0" step="0.01" value="${amount}" placeholder="Montant" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  return "";
}
