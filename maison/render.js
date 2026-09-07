import {
  state, ui, isAdmin, categoryHasPurchases,
  categoryTotalForMonth, categoryTotalForWeek,
  purchasesForMonth, purchasesForWeek,
  monthSpentTotal, weekSpentTotal, isPurchaseEditable,
} from "./data.js";
import {
  activeMonthKey, addDays, esc, formatDateFull, formatDateShort,
  getWeekNumberInMonth, getWeekStart, getWeeksOfMonth, monthChipLabel,
  monthLabel, monthsRange, money, parseISODate, toISO,
} from "../shared/utils.js";

export function render() {
  document.getElementById("header-title").textContent =
    ui.subTab === "budget" ? "Gestion achats maison"
      : ui.subTab === "categories" ? "Catégories & lieux"
        : "Enregistrer un achat";
  document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);

  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "budget" ? "active" : ""}" data-action="set-subtab" data-tab="budget">Budget</button>
    <button class="subtab ${ui.subTab === "categories" ? "active" : ""}" data-action="set-subtab" data-tab="categories">Catégories</button>
    <button class="subtab ${ui.subTab === "achats" ? "active" : ""}" data-action="set-subtab" data-tab="achats">Achats</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "budget") main.innerHTML = renderBudgetTab();
  else if (ui.subTab === "categories") main.innerHTML = renderCategoriesTab();
  else main.innerHTML = renderAchatsTab();

  document.getElementById("modal-root").innerHTML =
    ui.monthPanelOpen ? renderMonthPanel() : (ui.modal ? renderModal() : "");
}

function renderBudgetProgress(budget, total, colorVar) {
  const pct = Math.min(100, (total / Number(budget)) * 100);
  const over = total > Number(budget);
  return `
    <div class="progress-row">
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%;background:${over ? "var(--danger)" : colorVar}"></div>
      </div>
    </div>
    ${over ? `<div class="small-label danger">Budget dépassé de ${money(total - Number(budget))} DH</div>` : ""}`;
}

function renderBudgetEditBtn(budgetType, attrs) {
  if (!isAdmin) return "";
  return `<button class="icon-btn edit" data-action="open-edit-budget" data-budget-type="${budgetType}" ${attrs} title="Modifier">✏️</button>`;
}

function renderBudgetTab() {
  return renderMonthAccordion(ui.viewedMonthKey);
}

function renderMonthAccordion(monthKey) {
  const isActiveMonth = monthKey === activeMonthKey();
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthTotal = monthSpentTotal(monthKey);
  const monthKeyStr = "month:" + monthKey;
  const monthOpen = ui.expanded.has(monthKeyStr);
  const canEditMonth = isActiveMonth && monthBudget !== undefined;

  const monthCard = `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="${monthBudget === undefined ? "toggle-card" : ""}" data-key="${monthKeyStr}">
        <div>
          <div class="card-title" style="color:var(--month)">Budget mensuel</div>
          <div class="card-range">${monthLabel(monthKey)}</div>
          <span class="badge ${isActiveMonth ? "badge-current" : "badge-past"}">${isActiveMonth ? "Mois en cours" : "Consultation"}</span>
          ${monthBudget !== undefined && monthTotal > Number(monthBudget) ? `<span class="badge badge-danger">Dépassé</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${monthBudget !== undefined ? money(monthBudget) + " DH<br>" + money(monthTotal) + " DH consommé" : "budget non défini"}</div>
          ${monthBudget === undefined ? `<span class="chevron">${monthOpen ? "▲" : "▼"}</span>` : ""}
        </div>
      </div>
      <div class="card-body ${monthBudget !== undefined || monthOpen ? "open" : ""}">
        ${monthBudget === undefined ? (
    isActiveMonth ? `
          <form class="inline-form" data-form="set-month-budget">
            <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
            <button type="submit" class="btn-small" style="background:var(--month)">Fixer</button>
          </form>` : `<div class="small-label">Budget non défini pour ce mois.</div>`
  ) : `
          ${renderBudgetProgress(monthBudget, monthTotal, "var(--month)")}
          ${canEditMonth ? `<div style="display:flex;justify-content:flex-end;margin-top:8px">${renderBudgetEditBtn("month", `data-month-key="${monthKey}"`)}</div>` : ""}
        `}
      </div>
    </div>`;

  const weeks = getWeeksOfMonth(monthKey);
  const todayWeekISO = toISO(getWeekStart(new Date()));

  const weekCards = weeks.map(wStart => {
    const isoWs = toISO(wStart), isoWe = toISO(addDays(wStart, 6));
    const n = getWeekNumberInMonth(wStart);
    let status;
    if (!isActiveMonth) status = "past";
    else if (isoWs === todayWeekISO) status = "current";
    else if (isoWs < todayWeekISO) status = "past";
    else status = "future";

    const budget = state.weeklyBudgets[isoWs];
    const total = weekSpentTotal(isoWs, isoWe);
    const key = "week:" + isoWs;
    const canToggle = status !== "future" && budget === undefined;
    const open = budget !== undefined ? status !== "future" : (canToggle && ui.expanded.has(key));
    const canEditWeek = status === "current" && budget !== undefined;

    return `
      <div class="card ${status === "future" ? "disabled" : ""}" style="border-color:var(--week)">
        <div class="card-head" data-action="${canToggle ? "toggle-card" : ""}" data-key="${key}">
          <div>
            <div class="card-title" style="color:var(--week)">Semaine ${n}</div>
            <div class="card-range">${formatDateShort(wStart)} → ${formatDateShort(addDays(wStart, 6))}</div>
            <span class="badge ${status === "current" ? "badge-current" : status === "past" ? "badge-past" : "badge-future"}">${status === "current" ? "Semaine active" : status === "past" ? "Consultation" : "Verrouillée"}</span>
            ${budget !== undefined && total > Number(budget) ? `<span class="badge badge-danger">Dépassé</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${budget !== undefined ? money(budget) + " DH<br>" + money(total) + " DH consommé" : "budget non défini"}</div>
            ${canToggle ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
          </div>
        </div>
        <div class="card-body ${open ? "open" : ""}">
          ${budget === undefined ? (
      status === "current" ? `
            <form class="inline-form" data-form="set-week-budget" data-week-start="${isoWs}">
              <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
              <button type="submit" class="btn-small" style="background:var(--week)">Fixer</button>
            </form>` : `<div class="small-label">Budget non défini pour cette semaine.</div>`
    ) : `
            ${renderBudgetProgress(budget, total, "var(--week)")}
            ${canEditWeek ? `<div style="display:flex;justify-content:flex-end;margin-top:8px">${renderBudgetEditBtn("week", `data-week-start="${isoWs}"`)}</div>` : ""}
          `}
        </div>
      </div>`;
  }).join("");

  return `<div class="stack">${monthCard}${weekCards}</div>`;
}

function renderRemainingLabel(budget, spent) {
  const remaining = Number(budget) - spent;
  const cls = remaining < 0 ? "danger" : "success";
  return `<div class="small-label ${cls}">Reste : ${money(remaining)} DH</div>`;
}

function renderItemRow(cat, type, editable, ctx) {
  const total = type === "mensuel"
    ? categoryTotalForMonth(cat.id, type, ctx.monthKey)
    : categoryTotalForWeek(cat.id, type, ctx.weekStart, toISO(addDays(parseISODate(ctx.weekStart), 6)));
  const ctxAttr = type === "mensuel" ? `data-month-key="${ctx.monthKey}"` : `data-week-start="${ctx.weekStart}"`;
  return `
    <li class="item-row">
      <div class="item-name">${esc(cat.name)}</div>
      <div class="item-amount">${money(total)} DH</div>
      <div class="item-actions">
        <button class="icon-btn" ${total === 0 ? "disabled" : ""} data-action="open-details" data-category-id="${cat.id}" data-type="${type}" ${ctxAttr} title="Détails">🧾</button>
        ${editable ? `<button class="icon-btn add" data-action="open-add-purchase" data-category-id="${cat.id}" data-type="${type}" ${ctxAttr} title="Ajouter">＋</button>` : ""}
      </div>
    </li>`;
}

function renderCategoryRow(c) {
  const canDelete = !categoryHasPurchases(c.id);
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        <button class="icon-btn edit" data-action="open-edit-category" data-category-id="${c.id}" title="Modifier">✏️</button>
        ${canDelete ? `<button class="btn-delete" data-action="open-delete-confirm" data-entity="category" data-id="${c.id}" data-label="${esc(c.name)}" title="Supprimer">🗑️</button>` : ""}
      </div>
    </li>`;
}

function renderPlaceRow(p) {
  const canDelete = !state.purchases.some(x => x.place_id === p.id);
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(p.name)}</div>
      <div class="list-item-right">
        <button class="icon-btn edit" data-action="open-edit-place" data-place-id="${p.id}" title="Modifier">✏️</button>
        ${canDelete ? `<button class="btn-delete" data-action="open-delete-confirm" data-entity="place" data-id="${p.id}" data-label="${esc(p.name)}" title="Supprimer">🗑️</button>` : ""}
      </div>
    </li>`;
}

function renderCategoriesTab() {
  const hebdo = state.categories.filter(c => c.type === "hebdo");
  const mensuel = state.categories.filter(c => c.type === "mensuel");
  const hebdoOpen = ui.expanded.has("cats:hebdo");
  const mensuelOpen = ui.expanded.has("cats:mensuel");
  const placesOpen = ui.expanded.has("places:list");

  return `
    <div class="stack">
      <div class="card">
        <div style="padding:16px 16px 4px" class="card-title">Ajouter une catégorie</div>
        <div style="padding:0 16px 16px">
          <form class="form-col" data-form="add-category">
            <input class="field" name="name" placeholder="Nom de la catégorie" required />
            <div class="segment-row">
              <button type="button" class="segment active-week" data-action="pick-cat-type" data-value="hebdo">Hebdo</button>
              <button type="button" class="segment" data-action="pick-cat-type" data-value="mensuel">Mensuel</button>
            </div>
            <input type="hidden" name="type" value="hebdo" />
            <button type="submit" class="btn-primary">Ajouter la catégorie</button>
          </form>
        </div>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="cats:hebdo">
          <div class="card-title" style="color:var(--week)">Catégories hebdo</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${hebdo.length} catégorie${hebdo.length > 1 ? "s" : ""}</div>
            <span class="chevron">${hebdoOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${hebdoOpen ? "open" : ""}">
          ${hebdo.length === 0 ? `<div class="small-label">Aucune catégorie hebdo.</div>` : `<ul class="list">${hebdo.map(renderCategoryRow).join("")}</ul>`}
        </div>
      </div>
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="cats:mensuel">
          <div class="card-title" style="color:var(--month)">Catégories mensuelles</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${mensuel.length} catégorie${mensuel.length > 1 ? "s" : ""}</div>
            <span class="chevron">${mensuelOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${mensuelOpen ? "open" : ""}">
          ${mensuel.length === 0 ? `<div class="small-label">Aucune catégorie mensuelle.</div>` : `<ul class="list">${mensuel.map(renderCategoryRow).join("")}</ul>`}
        </div>
      </div>
      <div class="card">
        <div style="padding:16px 16px 4px" class="card-title">Ajouter un lieu</div>
        <div style="padding:0 16px 16px">
          <form class="inline-form" data-form="add-place">
            <input class="field" name="name" placeholder="Nouveau lieu" required />
            <button type="submit" class="btn-small" style="background:var(--ink)">Ajouter</button>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head" data-action="toggle-card" data-key="places:list">
          <div class="card-title">Lieux d'achat</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.places.length} lieu${state.places.length > 1 ? "x" : ""}</div>
            <span class="chevron">${placesOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${placesOpen ? "open" : ""}">
          ${state.places.length === 0 ? `<div class="small-label">Aucun lieu créé.</div>` : `<ul class="list">${state.places.map(renderPlaceRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function renderAchatsTab() {
  const monthKey = activeMonthKey();
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthTotal = monthSpentTotal(monthKey);
  const monthKeyStr = "achat-month:" + monthKey;
  const monthOpen = monthBudget !== undefined && ui.expanded.has(monthKeyStr);
  const mensuelCats = state.categories.filter(c => c.type === "mensuel");
  const monthOver = monthBudget !== undefined && monthTotal > Number(monthBudget);

  const monthCard = `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="${monthBudget !== undefined ? "toggle-card" : ""}" data-key="${monthKeyStr}">
        <div>
          <div class="card-title" style="color:var(--month)">Achat Mensuel</div>
          <div class="card-range">${monthLabel(monthKey)}</div>
          <span class="badge badge-current">Mois en cours</span>
          ${monthOver ? `<span class="badge badge-danger">Dépassé</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${monthBudget !== undefined ? money(monthTotal) + " DH consommé" : "Budget non défini"}</div>
          ${monthBudget !== undefined ? `<span class="chevron">${monthOpen ? "▲" : "▼"}</span>` : ""}
        </div>
      </div>
      ${monthBudget === undefined ? `
        <div style="padding:0 16px 16px" class="small-label">Définis d'abord le budget de ce mois dans l'onglet Budget.</div>
      ` : `
        <div class="card-body ${monthOpen ? "open" : ""}">
          ${renderRemainingLabel(monthBudget, monthTotal)}
          ${monthOver ? `<div class="alert-banner">Budget mensuel dépassé !</div>` : ""}
          ${mensuelCats.length === 0 ? `<div class="small-label">Aucune catégorie mensuelle créée.</div>` : `
            <ul class="list">${mensuelCats.map(c => renderItemRow(c, "mensuel", true, { monthKey })).join("")}</ul>`}
        </div>
      `}
    </div>`;

  const weeks = getWeeksOfMonth(monthKey);
  const todayWeekISO = toISO(getWeekStart(new Date()));
  const hebdoCats = state.categories.filter(c => c.type === "hebdo");

  const weekCards = weeks.map(wStart => {
    const isoWs = toISO(wStart), isoWe = toISO(addDays(wStart, 6));
    const n = getWeekNumberInMonth(wStart);
    let status;
    if (isoWs === todayWeekISO) status = "current";
    else if (isoWs < todayWeekISO) status = "past";
    else status = "future";

    const budget = state.weeklyBudgets[isoWs];
    const total = weekSpentTotal(isoWs, isoWe);
    const key = "achat-week:" + isoWs;
    const canExpand = status !== "future" && budget !== undefined;
    const open = canExpand && ui.expanded.has(key);
    const weekOver = budget !== undefined && total > Number(budget);

    return `
      <div class="card ${status === "future" ? "disabled" : ""}" style="border-color:var(--week)">
        <div class="card-head" data-action="${canExpand ? "toggle-card" : ""}" data-key="${key}">
          <div>
            <div class="card-title" style="color:var(--week)">Achat Semaine ${n}</div>
            <div class="card-range">${formatDateShort(wStart)} → ${formatDateShort(addDays(wStart, 6))}</div>
            <span class="badge ${status === "current" ? "badge-current" : status === "past" ? "badge-past" : "badge-future"}">${status === "current" ? "Semaine active" : status === "past" ? "Consultation" : "Verrouillée"}</span>
            ${weekOver ? `<span class="badge badge-danger">Dépassé</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${status === "future" ? "" : budget !== undefined ? money(total) + " DH consommé" : "Budget non défini"}</div>
            ${canExpand ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
          </div>
        </div>
        ${status !== "future" && budget === undefined ? `
          <div style="padding:0 16px 16px" class="small-label">Définis d'abord le budget de cette semaine dans l'onglet Budget.</div>
        ` : status !== "future" ? `
          <div class="card-body ${open ? "open" : ""}">
            ${renderRemainingLabel(budget, total)}
            ${weekOver ? `<div class="alert-banner">Budget hebdo dépassé !</div>` : ""}
            ${hebdoCats.length === 0 ? `<div class="small-label">Aucune catégorie hebdo créée.</div>` : `
              <ul class="list">${hebdoCats.map(c => renderItemRow(c, "hebdo", status === "current", { weekStart: isoWs })).join("")}</ul>`}
          </div>
        ` : ""}
      </div>`;
  }).join("");

  return `<div class="stack">${monthCard}${weekCards}</div>`;
}

function renderMonthPanel() {
  const active = activeMonthKey();
  const months = monthsRange();
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

function renderModal() {
  const m = ui.modal;
  if (m.type === "confirm-delete") return renderConfirmDeleteModal(m);
  if (m.type === "edit-budget") return renderEditBudgetModal(m);
  if (m.type === "edit-category") return renderEditCategoryModal(m);
  if (m.type === "edit-place") return renderEditPlaceModal(m);
  if (m.type === "edit-purchase") return renderEditPurchaseModal(m);

  const cat = state.categories.find(c => c.id === m.categoryId);
  if (!cat) return "";

  if (m.type === "add") {
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">${esc(cat.name)} <button class="close-btn" data-action="close-modal">✕</button></div>
          ${state.places.length === 0 ? `<div class="small-label">Ajoute d'abord un lieu d'achat dans l'onglet Catégories.</div>` : `
            <form class="form-col" data-form="add-purchase" data-category-id="${cat.id}">
              <input class="field" name="price" type="number" min="0" step="0.01" placeholder="Prix en DH" required />
              <select class="field" name="place" required>
                <option value="">Choisir un lieu…</option>
                ${state.places.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
              </select>
              <div class="small-label">Date : aujourd'hui (${formatDateFull(new Date())})</div>
              <button type="submit" class="btn-primary">Enregistrer</button>
            </form>`}
        </div>
      </div>`;
  }

  const list = m.periodType === "mensuel"
    ? purchasesForMonth(cat.id, "mensuel", m.monthKey)
    : purchasesForWeek(cat.id, "hebdo", m.weekStart, toISO(addDays(parseISODate(m.weekStart), 6)));
  const total = list.reduce((s, p) => s + Number(p.price), 0);

  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${esc(cat.name)} — ${money(total)} DH <button class="close-btn" data-action="close-modal">✕</button></div>
        <ul class="list">
          ${list.map(p => {
    const placeName = esc(state.places.find(pl => pl.id === p.place_id)?.name || "Inconnu");
    const editable = m.editable && isPurchaseEditable(p);
    return `
            <li class="list-item" style="flex-direction:column;align-items:stretch;gap:4px">
              <div class="purchase-detail-row">
                <div>
                  <div class="list-item-name">${money(p.price)} DH — ${placeName}</div>
                  <div class="small-label">${formatDateFull(parseISODate(p.date))}</div>
                </div>
                ${editable ? `
                <div class="purchase-detail-actions">
                  <button class="icon-btn edit" data-action="open-edit-purchase" data-purchase-id="${p.id}" title="Modifier">✏️</button>
                  <button class="btn-delete" data-action="open-delete-confirm" data-entity="purchase" data-id="${p.id}" data-label="${money(p.price)} DH" title="Supprimer">🗑️</button>
                </div>` : ""}
              </div>
            </li>`;
  }).join("")}
        </ul>
      </div>
    </div>`;
}

function renderEditBudgetModal(m) {
  const isMonth = m.budgetType === "month";
  const current = isMonth ? state.monthlyBudgets[m.monthKey] : state.weeklyBudgets[m.weekStart];
  const title = isMonth ? "Modifier budget mensuel" : "Modifier budget hebdo";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">${title} <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-budget" data-budget-type="${m.budgetType}" ${isMonth ? `data-month-key="${m.monthKey}"` : `data-week-start="${m.weekStart}"`}>
          <input class="field" name="amount" type="number" min="0" step="0.01" value="${current}" placeholder="Budget en DH" required />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderEditCategoryModal(m) {
  const cat = state.categories.find(c => c.id === m.categoryId);
  if (!cat) return "";
  const hasPurchases = categoryHasPurchases(cat.id);
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier catégorie <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-category" data-category-id="${cat.id}">
          <input class="field" name="name" value="${esc(cat.name)}" required />
          <div class="segment-row">
            <button type="button" class="segment ${cat.type === "hebdo" ? "active-week" : ""} ${hasPurchases && cat.type !== "hebdo" ? "disabled" : ""}" data-action="pick-cat-type" data-value="hebdo" ${hasPurchases && cat.type !== "hebdo" ? "disabled" : ""}>Hebdo</button>
            <button type="button" class="segment ${cat.type === "mensuel" ? "active-month" : ""} ${hasPurchases && cat.type !== "mensuel" ? "disabled" : ""}" data-action="pick-cat-type" data-value="mensuel" ${hasPurchases && cat.type !== "mensuel" ? "disabled" : ""}>Mensuel</button>
          </div>
          <input type="hidden" name="type" value="${cat.type}" />
          ${hasPurchases ? `<div class="small-label">Le type ne peut pas être modifié : des achats existent.</div>` : ""}
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderEditPlaceModal(m) {
  const place = state.places.find(p => p.id === m.placeId);
  if (!place) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier lieu <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-place" data-place-id="${place.id}">
          <input class="field" name="name" value="${esc(place.name)}" required />
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderEditPurchaseModal(m) {
  const p = state.purchases.find(x => x.id === m.purchaseId);
  if (!p) return "";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Modifier achat <button class="close-btn" data-action="close-modal">✕</button></div>
        <form class="form-col" data-form="edit-purchase" data-purchase-id="${p.id}">
          <input class="field" name="price" type="number" min="0" step="0.01" value="${p.price}" required />
          <select class="field" name="place" required>
            ${state.places.map(pl => `<option value="${pl.id}" ${pl.id === p.place_id ? "selected" : ""}>${esc(pl.name)}</option>`).join("")}
          </select>
          <div class="small-label">Date : ${formatDateFull(parseISODate(p.date))}</div>
          <button type="submit" class="btn-primary">Enregistrer</button>
        </form>
      </div>
    </div>`;
}

function renderConfirmDeleteModal(m) {
  const labels = { purchase: "cet achat", category: "cette catégorie", place: "ce lieu" };
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Confirmer la suppression</div>
        <p class="confirm-text">Voulez-vous vraiment supprimer ${labels[m.entity] || "cet élément"} <strong>${esc(m.label)}</strong> ? Cette action est irréversible.</p>
        <div class="btn-row">
          <button type="button" class="btn-danger" data-action="confirm-delete" data-entity="${m.entity}" data-id="${m.id}">Supprimer</button>
          <button type="button" class="btn-secondary" data-action="close-modal">Annuler</button>
        </div>
      </div>
    </div>`;
}
