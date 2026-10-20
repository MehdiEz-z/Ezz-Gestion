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

function lastDayOfMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0);
}

function isPeriodEndReached(endDate) {
  return toISO(new Date()) >= toISO(endDate);
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
  const pct = budget > 0 ? Math.min(100, (total / Number(budget)) * 100) : 0;
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
    <form class="inline-form" data-form="add-consumption" data-period-type="${type}" data-period-key="${esc(periodKey)}">
      <input class="field" name="amount" type="number" min="0.01" step="0.01" placeholder="Montant" required />
      <button type="submit" class="btn-small" style="background:${type === "mensuel" ? "var(--month)" : "var(--week)"}">Ajouter</button>
    </form>`;
}

function renderCloseBtn(type, periodKey, show) {
  if (!show || !isAdmin) return "";
  return `
    <button type="button" class="btn-secondary" style="margin-top:12px;width:100%" data-action="open-close-period" data-period-type="${type}" data-period-key="${esc(periodKey)}">Clôturer la période</button>`;
}

function renderBadges(extra) {
  return extra.filter(Boolean).join(" ");
}

function renderPeriodHead({
  title, titleColor, periodLabel, budget, consumed, consumedExtra,
  badges, progressHtml, toggleKey, canToggle,
}) {
  const open = ui.expanded.has(toggleKey);
  const hasBudget = budget != null;
  return `
    <div class="card-head" ${canToggle ? `data-action="toggle-card" data-key="${toggleKey}"` : ""}>
      <div class="course-period-head">
        <div class="course-period-title-row">
          <div class="card-title" style="color:${titleColor}">${title}</div>
          ${hasBudget ? `<div class="course-period-budget">${money(budget)} DH</div>` : ""}
        </div>
        <div class="card-range">${periodLabel}</div>
        <div class="course-period-status">
          ${renderBadges(badges)}
          ${hasBudget ? `<span class="small-label">Consommé : ${consumed}${consumedExtra || ""}</span>` : ""}
        </div>
        ${hasBudget ? progressHtml : `<div class="small-label">Budget non défini</div>`}
      </div>
      ${canToggle ? `<span class="chevron">${open ? "▲" : "▼"}</span>` : ""}
    </div>`;
}

function renderGestionTab(monthKey) {
  const isActiveMonth = monthKey === activeMonthKey();
  const monthBudget = state.monthlyBudgets[monthKey];
  const monthTotal = monthSpentTotal(monthKey);
  const monthClosed = isPeriodClosed("mensuel", monthKey);
  const monthKeyStr = "month:" + monthKey;
  const monthOpen = ui.expanded.has(monthKeyStr);
  const monthBodyOpen = monthBudget === undefined ? true : monthOpen;
  const canEditMonthBudget = isActiveMonth && !monthClosed && monthBudget !== undefined;
  const canAddMonth = isActiveMonth && !monthClosed && monthBudget != null && canAddPeriodConsumption("mensuel", monthKey);
  const canCloseMonth = !monthClosed && monthBudget != null
    && isPeriodEndReached(lastDayOfMonthKey(monthKey));
  const monthCanToggle = monthBudget !== undefined;

  const monthHead = renderPeriodHead({
    title: "Budget mensuel",
    titleColor: "var(--month)",
    periodLabel: monthLabel(monthKey),
    budget: monthBudget,
    consumed: `${money(monthTotal)} DH`,
    consumedExtra: "",
    badges: [
      `<span class="badge ${isActiveMonth ? "badge-current" : "badge-past"}">${isActiveMonth ? "Mois en cours" : "Consultation"}</span>`,
      monthClosed ? `<span class="badge badge-past">Clôturé</span>` : "",
      monthBudget !== undefined && monthTotal > Number(monthBudget) ? `<span class="badge badge-danger">Dépassé</span>` : "",
    ],
    progressHtml: monthBudget !== undefined
      ? renderBudgetProgressRow(monthBudget, monthTotal, "var(--month)", canEditMonthBudget ? renderBudgetEditBtn("month", `data-month-key="${monthKey}"`) : "")
      : "",
    toggleKey: monthKeyStr,
    canToggle: monthCanToggle,
  });

  const monthCard = `
    <div class="card" style="border-color:var(--month)">
      ${monthHead}
      <div class="card-body ${monthBodyOpen ? "open" : ""}">
        ${monthBudget === undefined ? (
    isActiveMonth && !monthClosed ? `
          <form class="inline-form" data-form="set-month-budget">
            <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
            <button type="submit" class="btn-small" style="background:var(--month)">Fixer</button>
          </form>` : `<div class="small-label">Budget non défini pour ce mois.</div>`
  ) : `
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
    const canToggle = status !== "future" && budget !== undefined;
    const open = ui.expanded.has(key);
    const weekBodyOpen = budget === undefined
      ? (status === "current" && !closed)
      : (open && status !== "future");
    const canEditWeek = status === "current" && budget !== undefined && !closed;
    const stats = weekSpendingStats(monthKey, isoWs, {
      isActiveWeek: status === "current",
      weekNumber: n,
    });
    const canAddWeek = isActiveMonth && status !== "future" && !closed && budget != null
      && canAddPeriodConsumption("hebdo", isoWs);
    const canCloseWeek = !closed && budget != null && status !== "future"
      && isPeriodEndReached(seg.end);

    let consumedLabel = `${money(total)} DH`;
    if (stats.budgetAmount != null && stats.reportPart > 0) {
      consumedLabel = `${money(stats.budgetPart)} DH + <span class="danger">${money(stats.reportPart)} DH</span>`;
    }

    const weekHead = status === "future" ? `
      <div class="card-head">
        <div class="course-period-head">
          <div class="course-period-title-row">
            <div class="card-title" style="color:var(--week)">Semaine ${n}</div>
          </div>
          <div class="card-range">${formatDateShort(seg.start)} → ${formatDateShort(seg.end)}</div>
          <span class="badge badge-future">Verrouillée</span>
        </div>
      </div>` : renderPeriodHead({
      title: `Semaine ${n}`,
      titleColor: "var(--week)",
      periodLabel: `${formatDateShort(seg.start)} → ${formatDateShort(seg.end)}`,
      budget,
      consumed: consumedLabel,
      consumedExtra: "",
      badges: [
        `<span class="badge ${status === "current" ? "badge-current" : "badge-past"}">${status === "current" ? "Semaine active" : "Consultation"}</span>`,
        closed ? `<span class="badge badge-past">Clôturé</span>` : "",
        budget !== undefined && stats.plafond > 0 && total > stats.plafond ? `<span class="badge badge-danger">Dépassé</span>` : "",
      ],
      progressHtml: budget !== undefined
        ? renderBudgetProgressRow(budget, total, "var(--week)", canEditWeek ? renderBudgetEditBtn("week", `data-week-start="${isoWs}"`) : "")
        : "",
      toggleKey: key,
      canToggle,
    });

    return `
      <div class="card ${status === "future" ? "disabled" : ""}" style="border-color:var(--week)">
        ${weekHead}
        <div class="card-body ${weekBodyOpen ? "open" : ""}">
          ${status === "future" ? "" : budget === undefined ? (
      status === "current" && !closed ? `
            <form class="inline-form" data-form="set-week-budget" data-week-start="${isoWs}">
              <input class="field" name="amount" type="number" min="0" step="0.01" placeholder="Définir le budget en DH" required />
              <button type="submit" class="btn-small" style="background:var(--week)">Fixer</button>
            </form>` : `<div class="small-label">Budget non défini pour cette semaine.</div>`
    ) : `
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
