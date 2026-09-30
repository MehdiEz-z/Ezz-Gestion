import {
  ui, summarySnapshot, getCategoriesByKind, getCategory,
  categoryBalance, movementsForCategory, ACTION_LABELS, KIND_LABELS,
  getMovement, isDebtMovementEditable, inboundRemainingAmount,
  detailInboundMovements, linkedOutbounds,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import { esc, formatDateFull, money, parseISODate } from "../shared/utils.js";

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

function renderSyntheseTab() {
  const s = summarySnapshot();
  const denom = s.totalEmprunte > 0 ? s.totalEmprunte : (s.totalRendu + s.totalARendre);
  const repayPct = denom > 0 ? Math.min(100, (s.totalRendu / denom) * 100) : 0;

  return `
    <div class="stack">
      <div class="card" style="border-color:var(--month)">
        <div class="card-head">
          <div>
            <div class="card-title" style="color:var(--month)">Total Dette</div>
          </div>
          <div class="card-preview" style="text-align:right">
            À rendre : ${money(s.totalARendre)} DH<br>
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
      </div>

      <div class="card" style="border-color:var(--week)">
        <div class="card-head">
          <div class="card-title" style="color:var(--week)">Épargne</div>
          <div class="card-preview">${money(s.totalEpargne)} DH</div>
        </div>
      </div>
    </div>`;
}

function renderCategoryListItem(c, editable) {
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        ${editable && isAdmin ? `<button class="icon-btn edit" data-action="open-edit-debt-category" data-category-id="${c.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderCategoriesTab() {
  const dettes = getCategoriesByKind("dette");
  const epargnes = getCategoriesByKind("epargne");
  const dettesOpen = ui.expanded.has("dettes-cat:dette");
  const epargneOpen = ui.expanded.has("dettes-cat:epargne");

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
      ${isAdmin ? renderExpandableAddCard("dettes-cat:add", "Ajouter une catégorie", addForm) : ""}
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="dettes-cat:dette">
          <div class="card-title" style="color:var(--month)">Catégories Dettes</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${dettes.length} catégorie${dettes.length > 1 ? "s" : ""}</div>
            <span class="chevron">${dettesOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${dettesOpen ? "open" : ""}">
          ${dettes.length === 0
    ? `<div class="small-label">Aucune catégorie dettes.</div>`
    : `<ul class="list">${dettes.map(c => renderCategoryListItem(c, true)).join("")}</ul>`}
        </div>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="dettes-cat:epargne">
          <div class="card-title" style="color:var(--week)">Catégories Épargne</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${epargnes.length} catégorie${epargnes.length > 1 ? "s" : ""}</div>
            <span class="chevron">${epargneOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${epargneOpen ? "open" : ""}">
          ${epargnes.length === 0
    ? `<div class="small-label">Aucune catégorie épargne.</div>`
    : `<ul class="list">${epargnes.map(c => renderCategoryListItem(c, true)).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function renderMouvementCategoryRow(c) {
  const bal = categoryBalance(c.id);
  const isDette = c.kind === "dette";
  return `
    <li class="item-row">
      <div class="item-name">${esc(c.name)}</div>
      <div class="item-amount">${money(bal)} DH</div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="open-debt-detail" data-category-id="${c.id}" title="Détails">🧾</button>
        ${isAdmin ? `<button type="button" class="icon-btn add" data-action="open-debt-action" data-category-id="${c.id}" data-action-type="${isDette ? "borrow" : "deposit"}" title="${isDette ? "Emprunt" : "Versement"}">＋</button>` : ""}
      </div>
    </li>`;
}

function renderMouvementsKindCard(kind) {
  const isDette = kind === "dette";
  const cats = getCategoriesByKind(kind);
  const s = summarySnapshot();
  const total = isDette ? s.totalARendre : s.totalEpargne;
  const previewLabel = isDette ? "À rendre" : "Total";
  const borderColor = isDette ? "var(--month)" : "var(--week)";
  const titleColor = borderColor;
  const key = `dettes-mvt:${kind}`;
  const open = ui.expanded.has(key);
  const emptyMsg = isDette
    ? "Aucune catégorie dettes."
    : "Aucune catégorie épargne.";

  return `
    <div class="card" style="border-color:${borderColor}">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div>
          <div class="card-title" style="color:${titleColor}">${isDette ? "Dettes" : "Épargne"}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview"><span class="small-label">${previewLabel} : ${money(total)} DH</span></div>
          <span class="chevron">${open ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        ${cats.length === 0
    ? `<div class="small-label">${emptyMsg}</div>`
    : `<ul class="list">${cats.map(renderMouvementCategoryRow).join("")}</ul>`}
      </div>
    </div>`;
}

function renderMouvementsTab() {
  return `
    <div class="stack">
      ${renderMouvementsKindCard("dette")}
      ${renderMouvementsKindCard("epargne")}
    </div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "edit-debt-category") return renderEditCategoryModal(m);
  if (m.type === "debt-detail") return renderDetailModal(m);
  if (m.type === "debt-action") return renderActionModal(m);
  if (m.type === "edit-debt-movement") return renderEditMovementModal(m);
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

function renderInboundDetailLine(inbound, c) {
  const rem = inboundRemainingAmount(inbound.id);
  const closed = rem <= 0.001;
  const outbounds = linkedOutbounds(inbound.id);
  const isDette = c.kind === "dette";
  const title = isDette ? "Emprunt" : ACTION_LABELS.deposit;
  const outboundLabel = isDette ? "Remboursement" : ACTION_LABELS.withdraw;
  const returnType = isDette ? "repay" : "withdraw";
  const returnTitle = isDette ? "Retourner" : "Retirer";
  const returnMax = Math.min(rem, categoryBalance(c.id));
  const editable = isAdmin && isDebtMovementEditable(inbound);
  const canReturn = isAdmin && !closed && rem > 0.001 && categoryBalance(c.id) > 0.001;

  const timeline = closed && outbounds.length > 0
    ? `
      <div class="small-label" style="margin-top:6px;line-height:1.6">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">
          <span>${title} : ${formatDateFull(parseISODate(inbound.movement_date))}</span>
          ${renderPaymentBadge(inbound.payment_method, true)}
        </div>
        ${outbounds.map(o => `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px">
          <span>${outboundLabel} : ${formatDateFull(parseISODate(o.movement_date))}</span>
          ${renderPaymentBadge(o.payment_method, isDette ? false : true)}
        </div>`).join("")}
      </div>`
    : `<div class="small-label">${formatDateFull(parseISODate(inbound.movement_date))}${inbound.label ? ` · ${esc(inbound.label)}` : ""}</div>`;

  return `
    <li class="list-item" style="flex-direction:column;align-items:stretch;gap:4px">
      <div class="purchase-detail-row">
        <div>
          <div class="list-item-name">${title} · ${money(inbound.amount)} DH</div>
          ${timeline}
        </div>
        <div class="purchase-detail-trailing">
          ${!closed ? renderPaymentBadge(inbound.payment_method, true) : ""}
          ${(editable || canReturn) ? `
          <div class="purchase-detail-actions">
            ${editable ? `
            <button class="icon-btn edit" data-action="open-edit-debt-movement" data-movement-id="${inbound.id}" title="Modifier">✏️</button>
            <button class="btn-delete" data-action="delete-debt-movement" data-movement-id="${inbound.id}" title="Supprimer">🗑️</button>` : ""}
            ${canReturn ? `<button type="button" class="icon-btn" data-action="open-debt-action" data-category-id="${c.id}" data-action-type="${returnType}" data-linked-inbound-id="${inbound.id}" data-max-amount="${returnMax}" title="${returnTitle}">↩</button>` : ""}
          </div>` : ""}
        </div>
      </div>
    </li>`;
}

function renderDetailMovementLine(row, c) {
  return renderInboundDetailLine(row, c);
}

function renderDetailModal(m) {
  const c = getCategory(m.categoryId);
  if (!c) return "";
  const list = detailInboundMovements(c.id);
  const rows = list.length === 0
    ? `<div class="small-label">Aucun mouvement.</div>`
    : `<ul class="list">${list.map(row => renderDetailMovementLine(row, c)).join("")}</ul>`;
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${esc(c.name)} — ${money(categoryBalance(c.id))} DH <button class="close-btn" data-action="close-modal">✕</button></div>
        ${rows}
      </div>
    </div>`;
}

function renderEditMovementModal(m) {
  const mov = getMovement(m.movementId);
  const c = mov ? getCategory(mov.category_id) : null;
  if (!mov || !c || !isDebtMovementEditable(mov)) return "";
  const flowIn = walletFlowIn(mov.action_type);
  const showPicker = mov.action_type !== "withdraw";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier — ${esc(c.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-debt-movement" data-movement-id="${mov.id}">
          <input class="field" name="amount" type="number" min="0.01" step="0.01" value="${mov.amount}" required />
          <input class="field" name="label" placeholder="Libellé" value="${esc(mov.label || "")}" />
          ${showPicker ? renderPaymentMethodPicker(mov.payment_method, flowIn ? "in" : "out") : `<div class="small-label">Retrait épargne : Espèces uniquement</div>`}
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderActionModal(m) {
  const c = getCategory(m.categoryId);
  if (!c) return "";
  const actionType = m.actionType;
  const titles = {
    borrow: "Emprunt",
    repay: "Remboursement",
    deposit: "Versement épargne",
    withdraw: "Retrait épargne",
  };
  const flowIn = walletFlowIn(actionType);
  const maxBal = categoryBalance(c.id);
  let defaultAmount = "";
  if (m.maxAmount) defaultAmount = m.maxAmount;
  else if ((actionType === "repay" || actionType === "withdraw") && maxBal > 0) defaultAmount = maxBal;
  const showPicker = actionType !== "withdraw";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${titles[actionType] || "Mouvement"} — ${esc(c.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="debt-action" data-category-id="${c.id}" data-action-type="${actionType}"${m.linkedInboundId ? ` data-linked-inbound-id="${m.linkedInboundId}"` : ""}>
          ${m.linkedInboundId ? `<input type="hidden" name="linked_inbound_id" value="${m.linkedInboundId}" />` : ""}
          <input class="field" name="amount" type="number" min="0.01" step="0.01" placeholder="Montant en DH" value="${defaultAmount ? defaultAmount : ""}" required />
          <input class="field" name="label" placeholder="Libellé" />
          ${showPicker ? renderPaymentMethodPicker("banque", flowIn ? "in" : "out") : `<div class="small-label">Retrait : Espèces uniquement<input type="hidden" name="payment_method" value="especes" /></div>`}
          <div class="small-label">Date : aujourd'hui (${formatDateFull(new Date())})</div>
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}
