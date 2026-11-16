import { ui, summarySnapshot, getCategoriesByKind, getCategory } from "./data.js";
import { isAdmin } from "../shared/auth.js";
import { esc, money } from "../shared/utils.js";
import { preserveScroll } from "../shared/ui-persist.js";

export function render() {
  preserveScroll(() => {
    document.getElementById("maison-controls").style.display = "none";
    document.getElementById("header-title").textContent = "Dettes & épargne";
    document.getElementById("subtabs").innerHTML = `
      <button type="button" class="subtab ${ui.subTab === "dette" ? "active" : ""}" data-action="set-subtab" data-tab="dette">Dettes</button>
      <button type="button" class="subtab ${ui.subTab === "epargne" ? "active" : ""}" data-action="set-subtab" data-tab="epargne">Épargne</button>`;

    const main = document.getElementById("main");
    const body = ui.subTab === "epargne" ? renderEpargneBlock() : renderDetteBlock();
    main.innerHTML = `<div class="stack">${body}</div>`;
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

function renderDetteSummaryCard() {
  const s = summarySnapshot();
  const denom = s.totalEmprunte > 0 ? s.totalEmprunte : (s.totalRendu + s.resteARendre);
  const repayPct = denom > 0 ? Math.min(100, (s.totalRendu / denom) * 100) : 0;

  return `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head">
        <div class="card-title" style="color:var(--month)">Total Dette</div>
        <div class="card-preview" style="text-align:right">
          Emprunté : ${money(s.totalEmprunte)} DH<br>
          Reste à rendre : ${money(s.resteARendre)} DH<br>
          <span class="small-label success">Rendu : ${money(s.totalRendu)} DH</span>
        </div>
      </div>
      <div class="card-body open">
        <div class="progress-row">
          <div class="progress-track">
            <div class="progress-fill" style="width:${repayPct}%;background:var(--month)"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderCategoryRow(c) {
  const bal = Number(c.solde);
  const inTitle = c.type_bloc === "dette" ? "Emprunt" : "Versement";
  const outTitle = c.type_bloc === "dette" ? "Remboursement" : "Retrait";
  return `
    <li class="item-row">
      <div class="item-name">${esc(c.nom)}</div>
      <div class="item-amount">${money(bal)} DH</div>
      <div class="item-actions">
        ${isAdmin ? `
          <button type="button" class="icon-btn add" data-action="open-debt-amount" data-sign="in" data-category-id="${c.id}" title="${inTitle}">＋</button>
          <button type="button" class="icon-btn" data-action="open-debt-amount" data-sign="out" data-category-id="${c.id}" title="${outTitle}" ${bal <= 0 ? "disabled" : ""}>−</button>
        ` : ""}
      </div>
    </li>`;
}

function renderKindBlock(kind) {
  const isDette = kind === "dette";
  const cats = getCategoriesByKind(kind);
  const s = summarySnapshot();
  const total = isDette ? s.resteARendre : s.totalEpargne;
  const border = isDette ? "var(--month)" : "var(--week)";
  const title = isDette ? "Dettes" : "Épargne";
  const addKey = `dettes-add:${kind}`;

  const addForm = isAdmin ? `
    <form class="form-col" data-form="add-debt-category" data-kind="${kind}">
      <input class="field" name="name" placeholder="Nom de la catégorie" required />
      <button type="submit" class="btn-primary">Ajouter</button>
    </form>` : "";

  const listBlock = cats.length === 0
    ? `<div class="small-label">Aucune catégorie.</div>`
    : `<ul class="list">${cats.map(renderCategoryRow).join("")}</ul>`;

  const summary = isDette
    ? renderDetteSummaryCard()
  : `
    <div class="card" style="border-color:${border}">
      <div class="card-head">
        <div class="card-title" style="color:${border}">${title}</div>
        <div class="card-preview">${money(total)} DH</div>
      </div>
    </div>`;

  return `
    ${summary}
    ${isAdmin ? renderExpandableAddCard(addKey, "Ajouter une catégorie", addForm) : ""}
    <div class="card" style="border-color:${border}">
      <div class="card-head">
        <div class="card-title" style="color:${border}">${isDette ? "Catégories dettes" : "Catégories épargne"}</div>
        <div class="card-preview">${cats.length} catégorie${cats.length > 1 ? "s" : ""}</div>
      </div>
      <div class="card-body open">${listBlock}</div>
    </div>`;
}

function renderDetteBlock() {
  return renderKindBlock("dette");
}

function renderEpargneBlock() {
  return renderKindBlock("epargne");
}

function renderModal() {
  const m = ui.modal;
  if (m.type !== "debt-amount") return "";
  const c = getCategory(m.categoryId);
  if (!c) return "";
  const isIn = m.sign === "in";
  const actionLabel = c.type_bloc === "dette"
    ? (isIn ? "Emprunt" : "Remboursement")
    : (isIn ? "Versement" : "Retrait");

  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${esc(c.nom)} <button type="button" class="close-btn" data-action="close-modal">✕</button></div>
        <p class="small-label" style="margin-bottom:12px">${actionLabel}</p>
        <form class="form-col" data-form="debt-amount" data-category-id="${c.id}" data-sign="${m.sign}">
          <input class="field" name="amount" type="number" min="0.01" step="0.01" placeholder="Montant" required autofocus />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}
