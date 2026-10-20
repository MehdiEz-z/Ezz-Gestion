import {
  state, ui,
  monthSpentTotal, weekSpentTotal, achatsRecap,
  isPeriodClosed, getPeriodState, weekSpendingStats, canAddPeriodConsumption,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import {
  activeMonthKey, esc, formatDateFull, formatDateShort,
  getDisplayWeekSegments, findDisplayWeekSegmentForDate, monthChipLabel,
  monthLabel, monthsRange, money, toISO,
} from "../shared/utils.js";
import { preserveScroll } from "../shared/ui-persist.js";

function weekSegmentStatus(seg, monthKey, isActiveMonth) {
  if (!isActiveMonth) return "past";
  const todayDisplay = findDisplayWeekSegmentForDate(new Date(), monthKey);
  if (!todayDisplay) return "past";
  if (seg.periodKey === todayDisplay.periodKey) return "current";
  if (seg.periodKey < todayDisplay.periodKey) return "past";
  return "future";
}

function renderWeekConsumedLabel(stats) {
  if (stats.budgetAmount == null) {
    return `<span class="small-label">Consommé : ${money(stats.consumed)} DH</span>`;
  }
  if (stats.reportPart > 0) {
    return `<span class="small-label">Consommé : ${money(stats.budgetPart)} DH + <span class="danger">${money(stats.reportPart)} DH</span></span>`;
  }
  return `<span class="small-label">Consommé : ${money(stats.consumed)} DH</span>`;
}

function renderWeekPreview(monthKey, seg, status) {
  const isActiveWeek = status === "current";
  const stats = weekSpendingStats(monthKey, seg.periodKey, {
    isActiveWeek,
    weekNumber: seg.number,
  });
  if (stats.budgetAmount == null) return "Budget non défini";
  const remCls = stats.reste > 0 ? "success" : "danger";
  let html = renderWeekConsumedLabel(stats);
  html += `<br><span class="small-label ${remCls}">Reste : ${money(stats.reste)} DH</span>`;
  if (stats.showReportLine) {
    html += `<br><span class="small-label">Report : ${money(stats.reportRemaining)} DH</span>`;
  }
  return html;
}

export function render() {
  preserveScroll(() => {
    const controls = document.getElementById("maison-controls");
    if (controls) controls.style.display = "flex";

    document.getElementById("header-title").textContent = "Gestion course";
    document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);
    document.getElementById("subtabs").innerHTML = "";

    document.getElementById("main").innerHTML = renderGestionTab(ui.viewedMonthKey);
    document.getElementById("modal-root").innerHTML =
      ui.monthPanelOpen ? renderMonthPanel() : (ui.modal ? renderModal() : "");
  });
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

function renderBudgetProgressRow(budget, total, colorVar, editBtnHtml) {
  return `
    <div class="progress-edit-row">
      <div class="progress-edit-track">${renderBudgetProgress(budget, total, colorVar)}</div>
      ${editBtnHtml || ""}
    </div>`;
}

function renderBudgetEditBtn(budgetType, attrs) {
  if (!isAdmin) return "";
  return `<button type="button" class="icon-btn edit" data-action="open-edit-budget" data-budget-type="${budgetType}" ${attrs} title="Modifier">✏️</button>`;
}

function closedBanner(type, periodKey) {
  const closedAt = getPeriodState(type, periodKey).closed_at;
  if (!closedAt) return "";
  const d = formatDateFull(new Date(closedAt));
  return `<div class="small-label" style="margin-top:8px">🔒 Période clôturée le ${d} — lecture seule</div>`;
}

function renderConsumptionForm(type, periodKey, canAdd) {
  if (!canAdd) return "";
  return `
    <form class="inline-form" style="margin-top:12px" data-form="add-consumption" data-period-type="${type}" data-period-key="${esc(periodKey)}">
      <input class="field" name="amount" type="number" min="0.01" step="0.01" placeholder="Montant (DH)" required />
      <button type="submit" class="btn-small" style="background:${type === "mensuel" ? "var(--month)" : "var(--week)"}">Ajouter</button>
    </form>`;
}

function renderCloseBtn(type, periodKey, show) {
  if (!show || !isAdmin) return "";
  return `
    <button type="button" class="btn-secondary" style="margin-top:12px;width:100%" data-action="open-close-period" data-period-type="${type}" data-period-key="${esc(periodKey)}">Clôturer la période</button>`;
}

function renderGestionTab(monthKey) {
  const isActiveMonth = monthKey === activeMonthKey();
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthTotal = monthSpentTotal(monthKey);
  const monthClosed = isPeriodClosed("mensuel", monthKey);
  const monthKeyStr = "month:" + monthKey;
  const monthOpen = ui.expanded.has(monthKeyStr) || monthBudget === undefined;
  const canEditMonthBudget = isActiveMonth && !monthClosed && monthBudget !== undefined;
  const canAddMonth = isActiveMonth && !monthClosed && monthBudget != null && canAddPeriodConsumption("mensuel", monthKey);
  const canCloseMonth = isActiveMonth && !monthClosed && monthBudget != null;

  const monthCard = `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head" data-action="toggle-card" data-key="${monthKeyStr}">
        <div>
          <div class="card-title" style="color:var(--month)">Budget mensuel</div>
          <div class="card-range">${monthLabel(monthKey)}</div>
          <span class="badge ${isActiveMonth ? "badge-current" : "badge-past"}">${isActiveMonth ? "Mois en cours" : "Consultation"}</span>
          ${monthClosed ? `<span class="badge badge-past">Clôturé</span>` : ""}
          ${monthBudget !== undefined && monthTotal > Number(monthBudget) ? `<span class="badge badge-danger">Dépassé</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${monthBudget !== undefined ? money(monthBudget) + " DH<br><span class=\"small-label\">Consommé : " + money(monthTotal) + " DH</span>" : "budget non défini"}</div>
          <span class="chevron">${monthOpen ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${monthOpen ? "open" : ""}">
        ${monthBudget === undefined ? (
    isActiveMonth && !monthClosed ? `
          <form class="inline-form" data-form="set-month-budget">
            <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
            <button type="submit" class="btn-small" style="background:var(--month)">Fixer</button>
          </form>` : `<div class="small-label">Budget non défini pour ce mois.</div>`
  ) : `
          ${renderBudgetProgressRow(monthBudget, monthTotal, "var(--month)", canEditMonthBudget ? renderBudgetEditBtn("month", `data-month-key="${monthKey}"`) : "")}
          ${closedBanner("mensuel", monthKey)}
          ${renderConsumptionForm("mensuel", monthKey, canAddMonth)}
          ${renderCloseBtn("mensuel", monthKey, canCloseMonth)}
        `}
      </div>
    </div>`;

  const weekCards = getDisplayWeekSegments(monthKey).map(seg => {
    const isoWs = seg.periodKey;
    const isoWe = toISO(seg.end);
    const n = seg.number;
    const status = weekSegmentStatus(seg, monthKey, isActiveMonth);
    const closed = isPeriodClosed("hebdo", isoWs);
    const budget = state.weeklyBudgets[isoWs];
    const total = weekSpentTotal(isoWs, isoWe);
    const key = "week:" + isoWs;
    const canToggle = status !== "future";
    const open = canToggle && (budget === undefined ? ui.expanded.has(key) : true);
    const canEditWeek = status === "current" && budget !== undefined && !closed;
    const stats = weekSpendingStats(monthKey, isoWs, {
      isActiveWeek: status === "current",
      weekNumber: n,
    });
    const canAddWeek = isActiveMonth && status !== "future" && !closed && budget != null
      && canAddPeriodConsumption("hebdo", isoWs);
    const canCloseWeek = isActiveMonth && status !== "future" && !closed && budget != null;

    return `
      <div class="card ${status === "future" ? "disabled" : ""}" style="border-color:var(--week)">
        <div class="card-head" data-action="${canToggle ? "toggle-card" : ""}" data-key="${key}">
          <div>
            <div class="card-title" style="color:var(--week)">Semaine ${n}</div>
            <div class="card-range">${formatDateShort(seg.start)} → ${formatDateShort(seg.end)}</div>
            <span class="badge ${status === "current" ? "badge-current" : status === "past" ? "badge-past" : "badge-future"}">${status === "current" ? "Semaine active" : status === "past" ? "Consultation" : "Verrouillée"}</span>
            ${closed ? `<span class="badge badge-past">Clôturé</span>` : ""}
            ${budget !== undefined && stats.plafond > 0 && total > stats.plafond ? `<span class="badge badge-danger">Dépassé</span>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${status === "future" ? "" : (budget !== undefined ? renderWeekPreview(monthKey, seg, status) : "budget non défini")}</div>
            ${canToggle ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
          </div>
        </div>
        <div class="card-body ${open && status !== "future" ? "open" : ""}">
          ${status === "future" ? "" : budget === undefined ? (
      status === "current" && !closed ? `
            <form class="inline-form" data-form="set-week-budget" data-week-start="${isoWs}">
              <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
              <button type="submit" class="btn-small" style="background:var(--week)">Fixer</button>
            </form>` : `<div class="small-label">Budget non défini pour cette semaine.</div>`
    ) : `
            ${renderBudgetProgressRow(budget, total, "var(--week)", canEditWeek ? renderBudgetEditBtn("week", `data-week-start="${isoWs}"`) : "")}
            ${closedBanner("hebdo", isoWs)}
            ${renderConsumptionForm("hebdo", isoWs, canAddWeek)}
            ${!canAddWeek && isActiveMonth && status !== "future" && !closed && budget != null && !stats.canAddConsumption
      ? `<div class="small-label" style="margin-top:8px">Plafond atteint — clôturez la semaine ou ajustez le budget.</div>` : ""}
            ${renderCloseBtn("hebdo", isoWs, canCloseWeek)}
          `}
        </div>
      </div>`;
  }).join("");

  return `<div class="stack">${monthCard}${weekCards}${renderAchatsRecapCard(monthKey)}</div>`;
}

function renderUtilityKvRow(label, value, bold = false, hint = "") {
  return `
    <div class="utility-kv-row${bold ? " utility-kv-row-bold" : ""}">
      <span>${label}${hint ? `<br><span class="small-label">${esc(hint)}</span>` : ""}</span>
      <span>${value}</span>
    </div>`;
}

function renderAchatsRecapCard(monthKey) {
  const key = "achat-recap:" + monthKey;
  const open = ui.expanded.has(key);
  const r = achatsRecap(monthKey);

  return `
    <div class="card">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">Récapitulatif</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        <div class="utility-recap-block">
          <div class="utility-recap-section-title">Gain Mensuel</div>
          ${renderUtilityKvRow("Consommation", `${money(r.monthConso)} DH`)}
          ${renderUtilityKvRow("Gain", `${money(r.monthGain)} DH`)}
          <hr class="utility-recap-sep" />
          <div class="utility-recap-section-title">Gain Semaines</div>
          ${renderUtilityKvRow("Consommation", `${money(r.weekConso)} DH`)}
          ${renderUtilityKvRow("Gain", `${money(r.weekGain)} DH`, false, "Cumul restes − report consommé")}
          <hr class="utility-recap-sep" />
          ${renderUtilityKvRow("Total Consommation", `${money(r.totalConso)} DH`, true)}
          ${renderUtilityKvRow("Total Gain", `${money(r.totalGain)} DH`, true)}
        </div>
      </div>
    </div>`;
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
  if (m.type === "confirm-close") return renderConfirmCloseModal(m);
  if (m.type === "edit-budget") return renderEditBudgetModal(m);
  return "";
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

function renderConfirmCloseModal(m) {
  const label = m.periodType === "mensuel" ? "ce mois" : "cette semaine";
  return `
    <div class="overlay" data-overlay-close="modal">
      <div class="sheet">
        <div class="sheet-title">Clôturer la période</div>
        <p class="confirm-text">Après clôture, <strong>aucune modification</strong> ne sera possible sur ${label} (budget, consommation). Confirmer ?</p>
        <div class="btn-row">
          <button type="button" class="btn-primary" data-action="confirm-close-period" data-period-type="${m.periodType}" data-period-key="${esc(m.periodKey)}">Clôturer</button>
          <button type="button" class="btn-secondary" data-action="close-modal">Annuler</button>
        </div>
      </div>
    </div>`;
}
