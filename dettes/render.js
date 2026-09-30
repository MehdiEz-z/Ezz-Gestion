import {
  ui, summarySnapshot, getCategoriesByKind, getCategory,
  categoryBalance, movementsForCategory, ACTION_LABELS, KIND_LABELS,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import { esc, formatDateFull, money, parseISODate, renderDateField, toISO } from "../shared/utils.js";

export function render() {
  document.getElementById("maison-controls").style.display = "none";
  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "synthese" ? "active" : ""}" data-action="set-subtab" data-tab="synthese">Synthèse</button>
    <button class="subtab ${ui.subTab === "categories" ? "active" : ""}" data-action="set-subtab" data-tab="categories">Catégories</button>
    <button class="subtab ${ui.subTab === "mouvements" ? "active" : ""}" data-action="set-subtab" data-tab="mouvements">Mouvements</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "synthese") main.innerHTML = renderSyntheseTab();
  else if (ui.subTab === "categories") main.innerHTML = renderCategoriesTab();
  else main.innerHTML = renderMouvementsTab();

  document.getElementById("modal-root").innerHTML = ui.modal ? renderModal() : "";
}

function renderPaymentMethodPicker(selected, flow) {
  const pm = selected === "especes" ? "especes" : "banque";
  const bankLabel = flow === "in" ? "Banque" : "Carte";
  return `
    <div class="small-label">Compte</div>
    <div class="segment-row">
      <button type="button" class="segment ${pm === "banque" ? "active-month" : ""}" data-action="pick-payment-method" data-value="banque">${bankLabel}</button>
      <button type="button" class="segment ${pm === "especes" ? "active-week" : ""}" data-action="pick-payment-method" data-value="especes">Espèces</button>
    </div>
    <input type="hidden" name="payment_method" value="${pm}" />`;
}

function renderPaymentBadge(paymentMethod, flowIn) {
  const pm = paymentMethod === "especes" ? "especes" : "banque";
  const cls = pm === "especes" ? "badge badge-pay-especes" : "badge badge-pay-carte";
  const label = pm === "especes" ? "Espèces" : (flowIn ? "Banque" : "Carte");
  return `<span class="${cls}">${label}</span>`;
}

function walletFlowIn(actionType) {
  return actionType === "borrow" || actionType === "withdraw";
}

function renderKvRow(label, value, bold = false) {
  return `
    <div class="utility-kv-row${bold ? " utility-kv-row-bold" : ""}">
      <span>${label}</span>
      <span>${value}</span>
    </div>`;
}

function renderSyntheseTab() {
  const s = summarySnapshot();
  return `
    <div class="stack">
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="dettes-synth:dette">
          <div>
            <div class="card-title" style="color:var(--month)">Dettes à rendre</div>
            <div class="card-preview">${money(s.totalDette)} DH</div>
          </div>
          <span class="chevron">${ui.expanded.has("dettes-synth:dette") ? "▲" : "▼"}</span>
        </div>
        <div class="card-body ${ui.expanded.has("dettes-synth:dette") ? "open" : ""}">
          ${s.categoriesDette.length === 0
    ? `<div class="small-label">Aucune catégorie dette.</div>`
    : s.categoriesDette.map(c => renderKvRow(esc(c.name), `${money(categoryBalance(c.id))} DH`)).join("")}
        </div>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="dettes-synth:epargne">
          <div>
            <div class="card-title" style="color:var(--week)">Épargne</div>
            <div class="card-preview">${money(s.totalEpargne)} DH</div>
          </div>
          <span class="chevron">${ui.expanded.has("dettes-synth:epargne") ? "▲" : "▼"}</span>
        </div>
        <div class="card-body ${ui.expanded.has("dettes-synth:epargne") ? "open" : ""}">
          ${s.categoriesEpargne.length === 0
    ? `<div class="small-label">Aucune catégorie épargne.</div>`
    : s.categoriesEpargne.map(c => renderKvRow(esc(c.name), `${money(categoryBalance(c.id))} DH`)).join("")}
        </div>
      </div>
    </div>`;
}

function renderCategoryListItem(c, editable) {
  const bal = categoryBalance(c.id);
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        <span class="small-label">${money(bal)} DH</span>
        ${editable && isAdmin ? `<button class="icon-btn edit" data-action="open-edit-debt-category" data-category-id="${c.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderCategoriesTab() {
  const dettes = getCategoriesByKind("dette");
  const epargnes = getCategoriesByKind("epargne");
  const addForm = isAdmin ? `
    <form class="form-col" data-form="add-debt-category">
      <input class="field" name="name" placeholder="Nom de la catégorie" required />
      <div class="segment-row">
        <button type="button" class="segment active-month" data-action="pick-debt-kind" data-value="dette">Dette</button>
        <button type="button" class="segment" data-action="pick-debt-kind" data-value="epargne">Épargne</button>
      </div>
      <input type="hidden" name="kind" value="dette" />
      <button type="submit" class="btn-primary">Ajouter</button>
    </form>` : "";

  return `
    <div class="stack">
      ${isAdmin ? `
      <div class="card card-add">
        <div class="card-head" data-action="toggle-card" data-key="dettes-cat:add">
          <div class="card-title">Ajouter une catégorie</div>
          <span class="chevron">${ui.expanded.has("dettes-cat:add") ? "▲" : "▼"}</span>
        </div>
        <div class="card-body ${ui.expanded.has("dettes-cat:add") ? "open" : ""}">${addForm}</div>
      </div>` : ""}
      <div class="card" style="border-color:var(--month)">
        <div class="card-title" style="padding:14px 14px 0;color:var(--month)">Dettes</div>
        <ul class="list">${dettes.length ? dettes.map(c => renderCategoryListItem(c, true)).join("") : `<li class="list-item"><div class="small-label">Aucune.</div></li>`}</ul>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-title" style="padding:14px 14px 0;color:var(--week)">Épargne</div>
        <ul class="list">${epargnes.length ? epargnes.map(c => renderCategoryListItem(c, true)).join("") : `<li class="list-item"><div class="small-label">Aucune.</div></li>`}</ul>
      </div>
    </div>`;
}

function renderMouvementCategoryRow(c) {
  const bal = categoryBalance(c.id);
  const isDette = c.kind === "dette";
  const color = isDette ? "var(--month)" : "var(--week)";
  return `
    <li class="item-row">
      <div class="item-name">${esc(c.name)}</div>
      <div class="item-amount">${money(bal)} DH</div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="open-debt-history" data-category-id="${c.id}" title="Historique">🧾</button>
        ${isAdmin ? `
        <button type="button" class="icon-btn add" data-action="open-debt-action" data-category-id="${c.id}" data-action-type="${isDette ? "borrow" : "deposit"}" title="${isDette ? "Prise" : "Versement"}">＋</button>
        ${bal > 0 ? `<button type="button" class="btn-small" style="background:${color};padding:4px 8px;font-size:11px" data-action="open-debt-action" data-category-id="${c.id}" data-action-type="${isDette ? "repay" : "withdraw"}">${isDette ? "Rendu" : "Retrait"}</button>` : ""}
        ` : ""}
      </div>
    </li>`;
}

function renderMouvementsTab() {
  const dettes = getCategoriesByKind("dette");
  const epargnes = getCategoriesByKind("epargne");
  return `
    <div class="stack">
      <div class="card" style="border-color:var(--month)">
        <div class="card-title" style="padding:14px;color:var(--month)">Dettes</div>
        ${dettes.length === 0
    ? `<div class="small-label" style="padding:0 14px 14px">Crée une catégorie dette.</div>`
    : `<ul class="list">${dettes.map(renderMouvementCategoryRow).join("")}</ul>`}
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-title" style="padding:14px;color:var(--week)">Épargne</div>
        ${epargnes.length === 0
    ? `<div class="small-label" style="padding:0 14px 14px">Crée une catégorie épargne.</div>`
    : `<ul class="list">${epargnes.map(renderMouvementCategoryRow).join("")}</ul>`}
      </div>
    </div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "edit-debt-category") return renderEditCategoryModal(m);
  if (m.type === "debt-history") return renderHistoryModal(m);
  if (m.type === "debt-action") return renderActionModal(m);
  return "";
}

function renderEditCategoryModal(m) {
  const c = getCategory(m.categoryId);
  if (!c) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier catégorie <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-debt-category" data-category-id="${c.id}">
          <input class="field" name="name" value="${esc(c.name)}" required />
          <div class="small-label">Type : ${KIND_LABELS[c.kind]}</div>
          <button type="submit" class="btn-primary">Enregistrer</button>
          ${movementsForCategory(c.id).length === 0 ? `
          <button type="button" class="btn-danger" data-action="delete-debt-category" data-category-id="${c.id}">Supprimer</button>` : ""}
        </form>
      </div>
    </div>`;
}

function renderHistoryModal(m) {
  const c = getCategory(m.categoryId);
  if (!c) return "";
  const list = movementsForCategory(c.id);
  const rows = list.length === 0
    ? `<div class="small-label">Aucun mouvement.</div>`
    : list.map(row => {
      const flowIn = walletFlowIn(row.action_type);
      return `
        <div class="purchase-detail-row" style="margin-bottom:10px">
          <div>
            <div style="font-weight:600">${ACTION_LABELS[row.action_type] || row.action_type} · ${money(row.amount)} DH</div>
            <div class="small-label">${formatDateFull(parseISODate(row.movement_date))}${row.label ? ` · ${esc(row.label)}` : ""}</div>
          </div>
          <div class="purchase-detail-trailing">${renderPaymentBadge(row.payment_method, flowIn)}</div>
        </div>`;
    }).join("");
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${esc(c.name)} — ${money(categoryBalance(c.id))} DH <button class="close-btn" data-action="close-modal">✕</button></div>
        ${rows}
      </div>
    </div>`;
}

function renderActionModal(m) {
  const c = getCategory(m.categoryId);
  if (!c) return "";
  const actionType = m.actionType;
  const titles = {
    borrow: "Prise (emprunt)",
    repay: "Rendu (remboursement)",
    deposit: "Versement épargne",
    withdraw: "Retrait épargne",
  };
  const flowIn = walletFlowIn(actionType);
  const maxBal = categoryBalance(c.id);
  const defaultAmount = (actionType === "repay" || actionType === "withdraw") && maxBal > 0
    ? maxBal
    : "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${titles[actionType] || "Mouvement"} — ${esc(c.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="debt-action" data-category-id="${c.id}" data-action-type="${actionType}">
          <input class="field" name="amount" type="number" min="0.01" step="0.01" placeholder="Montant en DH" value="${defaultAmount ? defaultAmount : ""}" required />
          <input class="field" name="label" placeholder="Libellé (optionnel)" />
          ${renderDateField("movement_date", { value: toISO(new Date()), placeholder: "Date" })}
          ${renderPaymentMethodPicker("banque", flowIn ? "in" : "out")}
          ${(actionType === "repay" || actionType === "withdraw") && maxBal > 0
    ? `<div class="small-label">Solde disponible : ${money(maxBal)} DH</div>` : ""}
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}
