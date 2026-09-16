import {
  ui, monthSummary, hasOpeningBalance, hasSalary,
  getUserWalletCategories, TRESORERIE_START_MONTH,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import {
  activeMonthKey, esc, monthChipLabel, monthLabel, monthsRangeFrom,
  money,
} from "../shared/utils.js";

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = "flex";
  document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);
  document.getElementById("header-title").textContent =
    ui.subTab === "synthese" ? "Trésorerie"
      : ui.subTab === "categories" ? "Catégories charges"
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
    ui.monthPanelOpen ? renderMonthPanel() : "";
}

function renderKvRow(label, value, bold = false, success = false) {
  const cls = bold ? " utility-kv-row-bold" : success ? " success" : "";
  return `
    <div class="utility-kv-row${bold ? " utility-kv-row-bold" : ""}">
      <span>${label}</span>
      <span class="${success ? "small-label success" : ""}">${value}</span>
    </div>`;
}

function renderSyntheseTab() {
  const mk = ui.viewedMonthKey;
  const s = monthSummary(mk);

  const movementLines = s.lines.map(l => {
    const sign = l.amount >= 0 ? "+" : "−";
    const abs = money(Math.abs(l.amount));
    const success = l.amount > 0;
    return renderKvRow(l.label, `${sign} ${abs} DH`, false, success);
  }).join("");

  return `
    <div class="stack">
      <div class="card" style="border-color:var(--month)">
        <div class="card-head">
          <div>
            <div class="card-title" style="color:var(--month)">Trésorerie</div>
            <div class="card-range">${monthLabel(mk)}</div>
            ${mk === activeMonthKey() ? `<span class="badge badge-current">Mois en cours</span>` : `<span class="badge badge-past">Consultation</span>`}
          </div>
          <div class="card-preview"><span class="small-label success">Solde : ${money(s.balance)} DH</span></div>
        </div>
        <div class="card-body open">
          <div class="utility-recap-block">
            ${movementLines || `<div class="small-label">Aucun mouvement ce mois.</div>`}
            <hr class="utility-recap-sep" />
            ${renderKvRow("Solde disponible", `${money(s.balance)} DH`, true)}
          </div>
        </div>
      </div>
    </div>`;
}

function renderCategoriesTab() {
  const cats = getUserWalletCategories();
  const open = ui.expanded.has("wallet-cats");
  const addForm = isAdmin ? `
    <form class="inline-form" data-form="add-wallet-category">
      <input class="field" name="name" placeholder="Nom (ex. Gasoil, Café…)" required />
      <button type="submit" class="btn-small" style="background:var(--month)">Ajouter</button>
    </form>` : "";

  return `
    <div class="stack">
      ${isAdmin ? `
        <div class="card card-add">
          <div class="card-head" data-action="toggle-card" data-key="wallet-cats-add">
            <div class="card-title">Ajouter une catégorie</div>
            <span class="chevron">${ui.expanded.has("wallet-cats-add") ? "▲" : "▼"}</span>
          </div>
          <div class="card-body ${ui.expanded.has("wallet-cats-add") ? "open" : ""}">${addForm}</div>
        </div>` : ""}
      <div class="card">
        <div class="card-head" data-action="toggle-card" data-key="wallet-cats">
          <div class="card-title">Charges hors Course</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${cats.length} catégorie${cats.length > 1 ? "s" : ""}</div>
            <span class="chevron">${open ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${open ? "open" : ""}">
          ${cats.length === 0 ? `<div class="small-label">Aucune catégorie. Ajoute Gasoil, Café, etc.</div>` : `
            <ul class="list">${cats.map(c => `
              <li class="list-item">
                <div class="list-item-name">${esc(c.name)}</div>
                ${isAdmin ? `<button class="btn-delete" data-action="delete-wallet-category" data-id="${c.id}" title="Supprimer">🗑️</button>` : ""}
              </li>`).join("")}</ul>`}
          <div class="small-label" style="margin-top:10px">Les entrées système (salaire, budgets, soins, remboursements…) sont créées automatiquement.</div>
        </div>
      </div>
    </div>`;
}

function renderSaisieTab() {
  const mk = ui.viewedMonthKey;
  const isFirst = mk === TRESORERIE_START_MONTH;
  const cats = getUserWalletCategories();

  const openingBlock = isFirst && isAdmin && !hasOpeningBalance() ? `
    <div class="card" style="border-color:var(--danger)">
      <div class="card-head"><div class="card-title" style="color:var(--danger)">Solde banque actuel</div></div>
      <div class="card-body open">
        <div class="small-label" style="margin-bottom:10px">Première utilisation : saisis le solde réel de ta banque aujourd'hui.</div>
        <form class="inline-form" data-form="set-opening">
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Solde en DH" required />
          <button type="submit" class="btn-small" style="background:var(--danger)">Enregistrer</button>
        </form>
      </div>
    </div>` : "";

  const salaryBlock = isAdmin ? `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head"><div class="card-title" style="color:var(--month)">Salaire du mois</div></div>
      <div class="card-body open">
        ${hasSalary(mk) ? `<div class="small-label success" style="margin-bottom:10px">Salaire déjà enregistré pour ce mois.</div>` : ""}
        <form class="inline-form" data-form="set-salary" data-month-key="${mk}">
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Salaire en DH" required />
          <button type="submit" class="btn-small" style="background:var(--month)">${hasSalary(mk) ? "Modifier" : "Enregistrer"}</button>
        </form>
      </div>
    </div>` : "";

  const manualBlock = isAdmin && cats.length > 0 ? `
    <div class="card">
      <div class="card-head"><div class="card-title">Charge manuelle</div></div>
      <div class="card-body open">
        <form class="form-col" data-form="add-manual-expense" data-month-key="${mk}">
          <select class="field" name="category_id" required>
            <option value="" disabled selected hidden>Choisir une catégorie…</option>
            ${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
          </select>
          <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Montant en DH" required />
          <input class="field" name="label" placeholder="Libellé (optionnel)" />
          <button type="submit" class="btn-primary">Enregistrer la charge</button>
        </form>
      </div>
    </div>` : isAdmin ? `<div class="small-label">Crée des catégories (Gasoil, Café…) dans l'onglet Catégories.</div>` : "";

  return `<div class="stack">${openingBlock}${salaryBlock}${manualBlock}</div>`;
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
