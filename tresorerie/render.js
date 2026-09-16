import {
  ui, monthSummary,
  getWalletCategoriesByDirection, TRESORERIE_START_MONTH,
} from "./data.js";
import { getWalletCategories } from "../shared/wallet.js";
import { isAdmin } from "../shared/auth.js";
import {
  activeMonthKey, esc, monthChipLabel, monthLabel, monthsRangeFrom,
  money, previousMonthKey,
} from "../shared/utils.js";

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = ui.subTab === "categories" ? "none" : "flex";
  document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);
  document.getElementById("header-title").textContent =
    ui.subTab === "synthese" ? "Trésorerie"
      : ui.subTab === "categories" ? "Catégories"
        : "Saisie trésorerie";

  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "synthese" ? "active" : ""}" data-action="set-subtab" data-tab="synthese">Synthèse</button>
    <button class="subtab ${ui.subTab === "categories" ? "active" : ""}" data-action="set-subtab" data-tab="categories">Catégories</button>
    <button class="subtab ${ui.subTab === "saisie" ? "active" : ""}" data-action="set-subtab" data-tab="saisie">Saisie</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "synthese") main.innerHTML = renderSyntheseTab();
  else if (ui.subTab === "categories") main.innerHTML = renderCategoriesTab();
  else main.innerHTML = renderSaisieTab();

  document.getElementById("modal-root").innerHTML =
    ui.monthPanelOpen ? renderMonthPanel() : (ui.modal ? renderModal() : "");
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

function renderWalletCategoryRow(c) {
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-wallet-category" data-category-id="${c.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type !== "edit-wallet-category") return "";
  const cat = getWalletCategories().find(c => c.id === m.categoryId);
  if (!cat || cat.is_system) return "";
  const dir = cat.direction || "depense";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier catégorie <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-wallet-category" data-category-id="${cat.id}">
          <input class="field" name="name" value="${esc(cat.name)}" required />
          <div class="segment-row">
            <button type="button" class="segment ${dir === "depense" ? "active-month" : ""}" data-action="pick-wallet-direction" data-value="depense">Dépense</button>
            <button type="button" class="segment ${dir === "revenue" ? "active-week" : ""}" data-action="pick-wallet-direction" data-value="revenue">Revenu</button>
          </div>
          <input type="hidden" name="direction" value="${dir}" />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderKvRow(label, value, bold = false) {
  return `
    <div class="utility-kv-row${bold ? " utility-kv-row-bold" : ""}">
      <span>${label}</span>
      <span>${value}</span>
    </div>`;
}

function renderSetupBlock(s, mk) {
  if (!isAdmin) return "";
  if (s.needsOpeningSetup) {
    return `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
        <div class="small-label" style="margin-bottom:8px">Première utilisation : indique le solde réel de ta banque aujourd'hui.</div>
        <form class="inline-form" data-form="set-opening">
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Solde actuel en DH" required />
          <button type="submit" class="btn-small" style="background:var(--danger)">Fixer</button>
        </form>
      </div>`;
  }
  if (s.needsSalarySetup) {
    return `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
        <div class="small-label" style="margin-bottom:8px">Saisis le salaire de ${monthLabel(mk)} (non modifiable après validation).</div>
        <form class="inline-form" data-form="set-salary" data-month-key="${mk}">
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Salaire en DH" required />
          <button type="submit" class="btn-small" style="background:var(--month)">Fixer</button>
        </form>
      </div>`;
  }
  return "";
}

function renderSyntheseTab() {
  const mk = ui.viewedMonthKey;
  const s = monthSummary(mk);
  const prevKey = previousMonthKey(mk);
  const open = ui.expanded.has("treasury-synth:" + mk);
  const canExpand = !s.needsOpeningSetup && !s.needsSalarySetup;

  const soldePrevLabel = s.isFirst
    ? "Solde actuel"
    : `Solde ${monthLabel(prevKey)}`;

  const recap = canExpand ? `
    <div class="utility-recap-block">
      ${renderSetupBlock(s, mk)}
      <div class="utility-recap-section-title">Ressources</div>
      ${renderKvRow(`Salaire ${monthLabel(mk)}`, `${money(s.salary)} DH`)}
      ${renderKvRow(soldePrevLabel, `${money(s.soldePrev)} DH`)}
      ${renderKvRow("Total", `${money(s.totalResources)} DH`, true)}
      <hr class="utility-recap-sep" />
      <div class="utility-recap-section-title">Dépenses</div>
      ${renderKvRow("Budget (mensuel + hebdos)", `${money(s.budget)} DH`)}
      ${renderKvRow("Dépense Maladie", `${money(s.maladie)} DH`)}
      ${renderKvRow("Eau et électricité", `${money(s.utilities)} DH`)}
      ${renderKvRow("Autres charges", `${money(s.autres)} DH`)}
      ${renderKvRow("Total Dépense", `${money(s.totalExpenses)} DH`, true)}
      <hr class="utility-recap-sep" />
      <div class="utility-recap-section-title">Entrées complémentaires</div>
      ${renderKvRow("Remboursement (CNSS + assurance)", `${money(s.reimbursements)} DH`)}
      ${renderKvRow("Autre source de revenu", `${money(s.otherIncome)} DH`)}
      ${renderKvRow("Total", `${money(s.totalIncomes)} DH`, true)}
      <hr class="utility-recap-sep" />
      ${renderKvRow("Solde disponible", `${money(s.soldeDisponible)} DH`, true)}
    </div>` : `
    <div class="card-body-inner">
      ${renderSetupBlock(s, mk)}
      ${!s.needsOpeningSetup && !s.needsSalarySetup ? "" : `<div class="small-label">Complète la saisie ci-dessus pour afficher le récapitulatif.</div>`}
    </div>`;

  return `
    <div class="stack">
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="${canExpand ? "toggle-card" : ""}" data-key="treasury-synth:${mk}">
          <div>
            <div class="card-title" style="color:var(--month)">Trésorerie</div>
            <div class="card-range">${monthLabel(mk)}</div>
            ${mk === activeMonthKey() ? `<span class="badge badge-current">Mois en cours</span>` : `<span class="badge badge-past">Consultation</span>`}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">
              <span class="small-label">Salaire : ${money(s.salary)} DH</span><br>
              <span class="small-label success">Solde : ${money(s.soldeDisponible)} DH</span>
            </div>
            ${canExpand ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
          </div>
        </div>
        <div class="card-body ${canExpand && open ? "open" : canExpand ? "" : "open"}">${recap}</div>
      </div>
    </div>`;
}

function renderCategoriesTab() {
  const depense = getWalletCategoriesByDirection("depense");
  const revenue = getWalletCategoriesByDirection("revenue");
  const depenseOpen = ui.expanded.has("wallet-cats:depense");
  const revenueOpen = ui.expanded.has("wallet-cats:revenue");

  const addCatForm = isAdmin ? `
    <form class="form-col" data-form="add-wallet-category">
      <input class="field" name="name" placeholder="Nom de la catégorie" required />
      <div class="segment-row">
        <button type="button" class="segment active-month" data-action="pick-wallet-direction" data-value="depense">Dépense</button>
        <button type="button" class="segment" data-action="pick-wallet-direction" data-value="revenue">Revenu</button>
      </div>
      <input type="hidden" name="direction" value="depense" />
      <button type="submit" class="btn-primary">Ajouter la catégorie</button>
    </form>` : "";

  return `
    <div class="stack">
      ${isAdmin ? renderExpandableAddCard("wallet-cats:add", "Ajouter une catégorie", addCatForm) : ""}
      <div class="card" style="border-color:var(--danger)">
        <div class="card-head" data-action="toggle-card" data-key="wallet-cats:depense">
          <div class="card-title" style="color:var(--danger)">Catégories dépense</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${depense.length} catégorie${depense.length > 1 ? "s" : ""}</div>
            <span class="chevron">${depenseOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${depenseOpen ? "open" : ""}">
          ${depense.length === 0 ? `<div class="small-label">Aucune catégorie dépense.</div>` : `<ul class="list">${depense.map(renderWalletCategoryRow).join("")}</ul>`}
        </div>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="wallet-cats:revenue">
          <div class="card-title" style="color:var(--week)">Catégories revenu</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${revenue.length} catégorie${revenue.length > 1 ? "s" : ""}</div>
            <span class="chevron">${revenueOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${revenueOpen ? "open" : ""}">
          ${revenue.length === 0 ? `<div class="small-label">Aucune catégorie revenu.</div>` : `<ul class="list">${revenue.map(renderWalletCategoryRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function renderSaisieTab() {
  return `
    <div class="stack">
      <div class="card">
        <div class="card-body open">
          <div class="small-label">Phase 2 : saisie des charges manuelles et autres sources de revenu.</div>
          <div class="small-label" style="margin-top:8px">Pour l'instant, configure le mois depuis l'onglet <strong>Synthèse</strong>.</div>
        </div>
      </div>
    </div>`;
}

function renderMonthPanel() {
  const active = activeMonthKey();
  const months = monthsRangeFrom(TRESORERIE_START_MONTH);
  return `
    <div class="overlay" data-overlay-close="month">
      <div class="sheet">
        <div class="sheet-title">Choisir un mois <button class="close-btn" data-action="close-month-panel">✕</button></div>
        <div class="chip-row">
          ${months.map(mk => {
    const isFuture = mk > active;
    const isActive = mk === active;
    const isSelected = mk === ui.viewedMonthKey && !isActive;
    const cls = isFuture ? "chip is-disabled" : isActive ? "chip is-active" : isSelected ? "chip is-selected" : "chip";
    return `<button class="${cls}" ${isFuture ? "" : `data-action="select-month" data-month="${mk}"`}>${monthChipLabel(mk)}</button>`;
  }).join("")}
        </div>
      </div>
    </div>`;
}
