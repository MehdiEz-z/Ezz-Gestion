import {
  state, ui,
  personName, getBill, elecReading, waterShare,
  getPrevMeter, isFirstEauMonth, calcElecConso,
  monthElecStats, monthWaterStats, personRecap, personGlobalSummary,
  monthElecStatus, monthWaterStatus, recapBadge,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import {
  activeMonthKey, esc, EAU_START_MONTH, monthChipLabel, monthLabel,
  monthsRangeFrom, moneyRound, previousMonthKey,
} from "../shared/utils.js";

function renderDualProgress(paid, total, paidElec, paidWater) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const elecPct = total > 0 ? Math.min(100, (paidElec / total) * 100) : 0;
  const waterPct = total > 0 ? Math.min(100 - elecPct, (paidWater / total) * 100) : 0;
  return `
    <div class="progress-row">
      <div class="progress-track progress-dual">
        <div class="progress-seg progress-cnss" style="width:${elecPct}%"></div>
        <div class="progress-seg progress-ass" style="width:${waterPct}%"></div>
      </div>
    </div>
    <div class="progress-legend">
      <span><i class="dot dot-cnss"></i> Électricité ${moneyRound(paidElec)} DH</span>
      <span><i class="dot dot-ass"></i> Eau ${moneyRound(paidWater)} DH</span>
    </div>`;
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

function renderPersonSummaryCard(p) {
  const s = personGlobalSummary(p.id);
  return `
    <div class="card" style="border-color:var(--month)">
      <div class="card-head">
        <div>
          <div class="card-title" style="color:var(--month)">Charge à payer</div>
          <span class="badge badge-current">${esc(personName(p))}</span>
        </div>
        <div class="card-preview" style="text-align:right">
          <div><span class="small-label">Électricité</span> ${moneyRound(s.totalElec)} DH</div>
          <div><span class="small-label">Eau</span> ${moneyRound(s.totalWater)} DH</div>
        </div>
      </div>
      <div class="card-body open">
        ${renderDualProgress(s.paidTotal, s.grandTotal, s.paidElec, s.paidWater)}
      </div>
    </div>`;
}

function renderSyntheseTab() {
  if (state.persons.length === 0) {
    return `<div class="small-label">Ajoutez des personnes dans le Référentiel.</div>`;
  }
  return `<div class="stack">${state.persons.map(renderPersonSummaryCard).join("")}</div>`;
}

function renderPersonRow(p) {
  return `
    <li class="list-item">
      <div>
        <div class="list-item-name">${esc(personName(p))}</div>
        <div class="small-label">${esc(p.phone || "—")}</div>
      </div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-person" data-person-id="${p.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderReferentielTab() {
  const listOpen = ui.expanded.has("ref:persons");
  const addForm = `
    <form class="form-col" data-form="add-person">
      <input class="field" name="first_name" placeholder="Prénom" required />
      <input class="field" name="last_name" placeholder="Nom" required />
      <input class="field" name="phone" placeholder="Numéro de téléphone" />
      <button type="submit" class="btn-primary">Ajouter la personne</button>
    </form>`;

  return `
    <div class="stack">
      ${isAdmin ? renderExpandableAddCard("ref:add-person", "Ajouter une personne", addForm) : ""}
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="ref:persons">
          <div class="card-title" style="color:var(--month)">Personnes</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.persons.length} personne${state.persons.length > 1 ? "s" : ""}</div>
            <span class="chevron">${listOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${listOpen ? "open" : ""}">
          ${state.persons.length === 0
            ? `<div class="small-label">Aucune personne.</div>`
            : `<ul class="list">${state.persons.map(renderPersonRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function meterPeriodLabels(monthKey) {
  const prevKey = isFirstEauMonth(monthKey) ? previousMonthKey(monthKey) : previousMonthKey(monthKey);
  return {
    prev: monthLabel(prevKey),
    curr: monthLabel(monthKey),
  };
}

function renderElecPersonBlock(monthKey, p, bill) {
  const reading = bill ? elecReading(bill.id, p.id) : null;
  const isPaid = !!(reading && reading.paid_at);
  const prev = reading ? Number(reading.prev_meter) : getPrevMeter(monthKey, p.id);
  const curr = reading ? Number(reading.curr_meter) : null;
  const conso = prev != null && curr != null ? calcElecConso(prev, curr) : null;
  const share = reading ? Number(reading.share_amount) : null;
  const canEdit = isAdmin && !isPaid;
  const labels = meterPeriodLabels(monthKey);
  const periodLine = conso != null
    ? `${labels.prev} — ${labels.curr} — Conso ${conso} kWh`
    : `${labels.prev} — ${labels.curr} — Conso —`;

  if (isPaid) {
    return `
      <div class="reimb-block" style="border-color:var(--month)">
        <div class="reimb-title" style="color:var(--month)">${esc(personName(p))}</div>
        <div class="small-label">${periodLine}</div>
        <div class="small-label"><strong>Part : ${share != null ? moneyRound(share) + " DH" : "—"}</strong></div>
        <span class="badge badge-current" style="margin-top:6px">Payé</span>
      </div>`;
  }

  if (!canEdit) {
    return `
      <div class="reimb-block" style="border-color:var(--month)">
        <div class="reimb-title" style="color:var(--month)">${esc(personName(p))}</div>
        <div class="small-label">${periodLine}</div>
        <div class="small-label"><strong>Part : ${share != null ? moneyRound(share) + " DH" : "—"}</strong></div>
      </div>`;
  }

  const showPrevInput = isFirstEauMonth(monthKey);
  const meterForm = `
    <form class="inline-form utility-meter-row" data-form="save-elec-meters" data-month-key="${monthKey}" data-person-id="${p.id}">
      ${showPrevInput ? `<input class="field" name="prev_meter" type="number" min="0" step="1" placeholder="${esc(labels.prev)}" value="${prev != null ? prev : ""}" required />` : ""}
      <input class="field" name="curr_meter" type="number" min="0" step="1" placeholder="${esc(labels.curr)}" value="${curr != null ? curr : ""}" required />
      <button type="submit" class="btn-small" style="background:var(--month);white-space:nowrap">Enregistrer</button>
    </form>`;

  return `
    <div class="reimb-block" style="border-color:var(--month)">
      <div class="reimb-title" style="color:var(--month)">${esc(personName(p))}</div>
      ${!showPrevInput && prev != null ? `<div class="small-label">${labels.prev} : ${prev} kWh</div>` : ""}
      ${meterForm}
      ${share != null ? `<div class="small-label" style="margin-top:6px">${periodLine}</div><div class="small-label"><strong>Part : ${moneyRound(share)} DH</strong></div>` : ""}
      ${reading && share != null ? `
        <button type="button" class="btn-small" style="background:var(--month);margin-top:6px;width:100%" data-action="pay-elec" data-month-key="${monthKey}" data-person-id="${p.id}">Payer</button>` : ""}
    </div>`;
}

function renderWaterPersonBlock(monthKey, p, bill) {
  const shareRow = bill ? waterShare(bill.id, p.id) : null;
  const isPaid = !!(shareRow && shareRow.paid_at);
  const share = shareRow ? Number(shareRow.share_amount) : null;
  const canEdit = isAdmin && !isPaid;

  if (isPaid) {
    return `
      <div class="reimb-block" style="border-color:var(--week)">
        <div class="reimb-title" style="color:var(--week)">${esc(personName(p))}</div>
        <div class="small-label"><strong>Part : ${share != null ? moneyRound(share) + " DH" : "—"}</strong></div>
        <span class="badge badge-current" style="margin-top:6px">Payé</span>
      </div>`;
  }

  if (!canEdit) {
    return `
      <div class="reimb-block" style="border-color:var(--week)">
        <div class="reimb-title" style="color:var(--week)">${esc(personName(p))}</div>
        <div class="small-label"><strong>Part : ${share != null ? moneyRound(share) + " DH" : "—"}</strong></div>
      </div>`;
  }

  return `
    <div class="reimb-block" style="border-color:var(--week)">
      <div class="reimb-title" style="color:var(--week)">${esc(personName(p))}</div>
      ${share != null ? `<div class="small-label"><strong>Part : ${moneyRound(share)} DH</strong></div>` : `<div class="small-label">Part : —</div>`}
      ${shareRow && share != null ? `
        <button type="button" class="btn-small" style="background:var(--week);margin-top:6px;width:100%" data-action="pay-water" data-month-key="${monthKey}" data-person-id="${p.id}">Payer</button>` : ""}
    </div>`;
}

function renderUtilityCardHead(title, colorVar, monthKey, stats, status, open) {
  const payLine = stats.hasData ? `À payer : ${moneyRound(stats.toPay)} DH` : "—";
  return `
    <div class="card-head" data-action="toggle-card" data-key="${open.key}">
      <div style="flex:1;min-width:0">
        <div class="card-title" style="color:${colorVar}">${title}</div>
        <div class="utility-card-row">
          <span class="card-range">${payLine}</span>
          <span class="card-range">${monthLabel(monthKey)}</span>
          <span class="badge ${status.cls}">${status.label}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span class="chevron">${open.isOpen ? "▲" : "▼"}</span>
      </div>
    </div>`;
}

function renderElecCard(monthKey) {
  const key = "elec:" + monthKey;
  const open = ui.expanded.has(key);
  const bill = getBill(monthKey);
  const stats = monthElecStats(monthKey);
  const status = monthElecStatus(monthKey);
  const editable = isAdmin;

  const openBody = state.persons.length === 0
    ? `<div class="small-label">Ajoutez des personnes dans le Référentiel.</div>`
    : `
      <form class="inline-form" data-form="save-elec-bill" data-month-key="${monthKey}" style="margin-bottom:12px">
        <input class="field" name="bill_total" type="number" min="0" step="0.01" placeholder="Facture" value="${bill?.elec_bill_total != null ? bill.elec_bill_total : ""}" ${editable ? "" : "disabled"} required />
        ${editable ? `<button type="submit" class="btn-small" style="background:var(--month);white-space:nowrap">Enregistrer</button>` : ""}
      </form>
      <div class="reimb-grid">
        ${state.persons.map(p => renderElecPersonBlock(monthKey, p, bill)).join("")}
      </div>`;

  return `
    <div class="card" style="border-color:var(--month)">
      ${renderUtilityCardHead("Électricité", "var(--month)", monthKey, stats, status, { key, isOpen: open })}
      <div class="card-body ${open ? "open" : ""}">${openBody}</div>
    </div>`;
}

function renderWaterCard(monthKey) {
  const key = "water:" + monthKey;
  const open = ui.expanded.has(key);
  const bill = getBill(monthKey);
  const stats = monthWaterStats(monthKey);
  const status = monthWaterStatus(monthKey);
  const editable = isAdmin;

  const openBody = state.persons.length === 0
    ? `<div class="small-label">Ajoutez des personnes dans le Référentiel.</div>`
    : `
      <form class="inline-form" data-form="save-water-bill" data-month-key="${monthKey}" style="margin-bottom:12px">
        <input class="field" name="bill_total" type="number" min="0" step="0.01" placeholder="Facture" value="${bill?.water_bill_total != null ? bill.water_bill_total : ""}" ${editable ? "" : "disabled"} required />
        ${editable ? `<button type="submit" class="btn-small" style="background:var(--week);white-space:nowrap">Enregistrer</button>` : ""}
      </form>
      <div class="reimb-grid">
        ${state.persons.map(p => renderWaterPersonBlock(monthKey, p, bill)).join("")}
      </div>`;

  return `
    <div class="card" style="border-color:var(--week)">
      ${renderUtilityCardHead("Eau", "var(--week)", monthKey, stats, status, { key, isOpen: open })}
      <div class="card-body ${open ? "open" : ""}">${openBody}</div>
    </div>`;
}

function renderRecapCard(monthKey) {
  const key = "recap:" + monthKey;
  const open = ui.expanded.has(key);

  const rows = state.persons.map(p => {
    const r = personRecap(monthKey, p.id);
    const badge = recapBadge(r);
    return `
      <li class="list-item utility-recap-row">
        <div>
          <div class="list-item-name">${esc(personName(p))}</div>
          <div class="small-label">Électricité ${moneyRound(r.elec)} DH</div>
          <div class="small-label">Eau ${moneyRound(r.water)} DH</div>
          <div class="small-label"><strong>Total ${moneyRound(r.total)} DH</strong></div>
        </div>
        <span class="badge ${badge.cls}">${badge.label}</span>
      </li>`;
  }).join("");

  return `
    <div class="card">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div class="card-title">Récapitulatif</div>
        <span class="chevron">${open ? "▲" : "▼"}</span>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        ${state.persons.length === 0
          ? `<div class="small-label">Aucune personne.</div>`
          : `<ul class="list">${rows}</ul>`}
      </div>
    </div>`;
}

function renderFacturesTab() {
  const mk = ui.viewedMonthKey;
  return `
    <div class="stack">
      ${renderElecCard(mk)}
      ${renderWaterCard(mk)}
      ${renderRecapCard(mk)}
    </div>`;
}

function renderMonthPanel() {
  const active = activeMonthKey();
  const months = monthsRangeFrom(EAU_START_MONTH);
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
  if (m.type === "edit-person") {
    const p = state.persons.find(x => x.id === m.personId);
    if (!p) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet">
          <div class="sheet-title">Modifier la personne <button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-person" data-person-id="${p.id}">
            <input class="field" name="first_name" placeholder="Prénom" value="${esc(p.first_name)}" required />
            <input class="field" name="last_name" placeholder="Nom" value="${esc(p.last_name)}" required />
            <input class="field" name="phone" placeholder="Numéro de téléphone" value="${esc(p.phone || "")}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }
  return "";
}

export function render() {
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = ui.subTab === "factures" ? "flex" : "none";

  if (ui.subTab === "factures" && ui.viewedMonthKey) {
    document.getElementById("month-btn-label").textContent = monthChipLabel(ui.viewedMonthKey);
  }

  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "synthese" ? "active" : ""}" data-action="set-subtab" data-tab="synthese">Synthèse</button>
    <button class="subtab ${ui.subTab === "referentiel" ? "active" : ""}" data-action="set-subtab" data-tab="referentiel">Référentiel</button>
    <button class="subtab ${ui.subTab === "factures" ? "active" : ""}" data-action="set-subtab" data-tab="factures">Factures</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "synthese") main.innerHTML = renderSyntheseTab();
  else if (ui.subTab === "referentiel") main.innerHTML = renderReferentielTab();
  else main.innerHTML = renderFacturesTab();

  document.getElementById("modal-root").innerHTML =
    ui.monthPanelOpen ? renderMonthPanel() : (ui.modal ? renderModal() : "");
}
