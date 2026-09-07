import {
  state, ui, STATUS_LABELS, globalStats, alertDossiers,
  beneficiaryName, beneficiaryDossierCount, dossierSpentTotal, dossierRemainder,
  dossierReimbursedTotal, isDossierEditable, isDossierLocked,
  categoryTotalForDossier, actionsForCategory, facilityLabel, genderLabel,
} from "./data.js";
import { isAdmin } from "../shared/auth.js";
import { esc, formatDateFull, money, parseISODate } from "../shared/utils.js";

export function render() {
  document.getElementById("subtabs").innerHTML = `
    <button class="subtab ${ui.subTab === "synthese" ? "active" : ""}" data-action="set-subtab" data-tab="synthese">Synthèse</button>
    <button class="subtab ${ui.subTab === "referentiel" ? "active" : ""}" data-action="set-subtab" data-tab="referentiel">Référentiel</button>
    <button class="subtab ${ui.subTab === "dossiers" ? "active" : ""}" data-action="set-subtab" data-tab="dossiers">Dossiers</button>`;

  const main = document.getElementById("main");
  if (ui.subTab === "synthese") main.innerHTML = renderSyntheseTab();
  else if (ui.subTab === "referentiel") main.innerHTML = renderReferentielTab();
  else main.innerHTML = renderDossiersTab();

  document.getElementById("modal-root").innerHTML = ui.modal ? renderModal() : "";
}

function renderDualProgress(spent, cnss, ass) {
  const total = spent || 0;
  const reimbursed = cnss + ass;
  if (total <= 0) {
    return `<div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:0"></div></div></div>`;
  }
  const cnssPct = Math.min(100, (cnss / total) * 100);
  const assPct = Math.min(100 - cnssPct, (ass / total) * 100);
  return `
    <div class="progress-row">
      <div class="progress-track progress-dual">
        <div class="progress-seg progress-cnss" style="width:${cnssPct}%"></div>
        <div class="progress-seg progress-ass" style="width:${assPct}%"></div>
      </div>
    </div>
    <div class="progress-legend">
      <span><i class="dot dot-cnss"></i> CNSS ${money(cnss)} DH</span>
      <span><i class="dot dot-ass"></i> Assurance ${money(ass)} DH</span>
      <span class="${reimbursed >= total ? "success" : "danger"}">Reste ${money(Math.max(0, total - reimbursed))} DH</span>
    </div>`;
}

function renderSyntheseTab() {
  const s = globalStats();
  const alerts = alertDossiers();
  const dossierPct = s.totalDossiers > 0 ? (s.rembourseCount / s.totalDossiers) * 100 : 0;

  const alertCard = alerts.length === 0
    ? `<div class="small-label">Aucune alerte.</div>`
    : alerts.map(d => {
      const ben = state.beneficiaries.find(b => b.id === d.beneficiary_id);
      return `<div class="alert-banner" style="margin-bottom:8px">
        ${esc(d.dossier_number || "Sans N°")} — ${ben ? esc(beneficiaryName(ben)) : "—"}
        <div class="small-label" style="color:var(--danger);margin-top:4px">Dépôt CNSS : ${formatDateFull(parseISODate(d.cnss_deposit_date))} · Aucun remboursement</div>
      </div>`;
    }).join("");

  return `
    <div class="stack">
      <div class="card" style="border-color:var(--danger)">
        <div class="card-head">
          <div>
            <div class="card-title" style="color:var(--danger)">Total dépensé</div>
            <span class="badge badge-danger">Charge globale : ${money(s.globalCharge)} DH</span>
          </div>
          <div class="card-preview" style="text-align:right">
            <div style="color:var(--month)">${money(s.totalCnss)} DH</div>
            <div style="color:var(--week);font-size:11px">CNSS</div>
            <div style="color:var(--week);margin-top:4px">${money(s.totalAss)} DH</div>
            <div style="color:var(--week);font-size:11px">Assurance</div>
          </div>
        </div>
        <div class="card-body open">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span class="small-label">${money(s.totalSpent)} DH dépensés</span>
            <span class="small-label">${money(s.totalCnss + s.totalAss)} DH remboursés</span>
          </div>
          ${renderDualProgress(s.totalSpent, s.totalCnss, s.totalAss)}
        </div>
      </div>

      <div class="card" style="border-color:var(--month)">
        <div class="card-head">
          <div>
            <div class="card-title" style="color:var(--month)">Total dossiers</div>
            <span class="badge badge-current">${s.totalDossiers} dossier${s.totalDossiers > 1 ? "s" : ""}</span>
          </div>
          <div class="card-preview" style="text-align:right">
            <div>${s.rembourseCount} remboursé${s.rembourseCount > 1 ? "s" : ""}</div>
            <div style="font-size:11px;color:var(--muted)">${s.pendingCount} en attente</div>
          </div>
        </div>
        <div class="card-body open">
          <div class="progress-row">
            <div class="progress-track">
              <div class="progress-fill" style="width:${dossierPct}%;background:var(--month)"></div>
            </div>
          </div>
          <div class="small-label" style="margin-top:6px">En attente : ${money(s.totalPending)} DH</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" data-action="toggle-card" data-key="alerts">
          <div class="card-title">Alertes (+30 jours sans remboursement)</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${alerts.length} alerte${alerts.length > 1 ? "s" : ""}</div>
            <span class="chevron">${ui.expanded.has("alerts") ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${ui.expanded.has("alerts") ? "open" : ""}">${alertCard}</div>
      </div>
    </div>`;
}

function renderBeneficiaryRow(b) {
  const count = beneficiaryDossierCount(b.id);
  return `
    <li class="list-item">
      <div>
        <div class="list-item-name">${esc(beneficiaryName(b))}</div>
        <div class="small-label">${formatDateFull(parseISODate(b.birth_date))} · ${genderLabel(b.gender)} · ${count} dossier${count > 1 ? "s" : ""}</div>
      </div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-beneficiary" data-beneficiary-id="${b.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderDoctorRow(d) {
  return `
    <li class="list-item">
      <div>
        <div class="list-item-name">${esc(d.name)}</div>
        <div class="small-label">${facilityLabel(d.facility_type)} · ${esc(d.specialty)} · ${esc(d.phone)}</div>
      </div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-doctor" data-doctor-id="${d.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderCareCategoryRow(c) {
  return `
    <li class="list-item">
      <div class="list-item-name">${esc(c.name)}</div>
      <div class="list-item-right">
        ${isAdmin ? `<button class="icon-btn edit" data-action="open-edit-care-category" data-category-id="${c.id}" title="Modifier">✏️</button>` : ""}
      </div>
    </li>`;
}

function renderReferentielTab() {
  const famOpen = ui.expanded.has("ref:famille");
  const docOpen = ui.expanded.has("ref:doctors");
  const catOpen = ui.expanded.has("ref:care-cats");

  return `
    <div class="stack">
      <div class="card">
        <div style="padding:16px 16px 4px" class="card-title">Ajouter un membre de famille</div>
        <div style="padding:0 16px 16px">
          <form class="form-col" data-form="add-beneficiary">
            <input class="field" name="first_name" placeholder="Prénom" required />
            <input class="field" name="last_name" placeholder="Nom" required />
            <input class="field" name="birth_date" placeholder="Date de naissance (AAAA-MM-JJ)" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <div class="segment-row">
              <button type="button" class="segment active-week" data-action="pick-gender" data-value="M">Homme</button>
              <button type="button" class="segment" data-action="pick-gender" data-value="F">Femme</button>
            </div>
            <input type="hidden" name="gender" value="M" />
            <button type="submit" class="btn-primary">Ajouter le membre</button>
          </form>
        </div>
      </div>
      <div class="card" style="border-color:var(--week)">
        <div class="card-head" data-action="toggle-card" data-key="ref:famille">
          <div class="card-title" style="color:var(--week)">Famille</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.beneficiaries.length} membre${state.beneficiaries.length > 1 ? "s" : ""}</div>
            <span class="chevron">${famOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${famOpen ? "open" : ""}">
          ${state.beneficiaries.length === 0 ? `<div class="small-label">Aucun membre.</div>` : `<ul class="list">${state.beneficiaries.map(renderBeneficiaryRow).join("")}</ul>`}
        </div>
      </div>

      <div class="card">
        <div style="padding:16px 16px 4px" class="card-title">Ajouter un médecin</div>
        <div style="padding:0 16px 16px">
          <form class="form-col" data-form="add-doctor">
            <input class="field" name="name" placeholder="Nom du médecin" required />
            <div class="segment-row">
              <button type="button" class="segment active-week" data-action="pick-facility" data-value="cabinet">Cabinet</button>
              <button type="button" class="segment" data-action="pick-facility" data-value="clinique">Clinique</button>
              <button type="button" class="segment" data-action="pick-facility" data-value="hopital">Hôpital</button>
            </div>
            <input type="hidden" name="facility_type" value="cabinet" />
            <input class="field" name="phone" placeholder="Numéro de téléphone" />
            <input class="field" name="specialty" placeholder="Nature (Chirurgien, Dentiste, Anesthésiste…)" required />
            <button type="submit" class="btn-primary">Ajouter le médecin</button>
          </form>
        </div>
      </div>
      <div class="card" style="border-color:var(--month)">
        <div class="card-head" data-action="toggle-card" data-key="ref:doctors">
          <div class="card-title" style="color:var(--month)">Médecins</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.doctors.length} médecin${state.doctors.length > 1 ? "s" : ""}</div>
            <span class="chevron">${docOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${docOpen ? "open" : ""}">
          ${state.doctors.length === 0 ? `<div class="small-label">Aucun médecin.</div>` : `<ul class="list">${state.doctors.map(renderDoctorRow).join("")}</ul>`}
        </div>
      </div>

      <div class="card">
        <div style="padding:16px 16px 4px" class="card-title">Ajouter une catégorie de soin</div>
        <div style="padding:0 16px 16px">
          <form class="inline-form" data-form="add-care-category">
            <input class="field" name="name" placeholder="Consultation, Pharmacie, IRM…" required />
            <button type="submit" class="btn-small" style="background:var(--ink)">Ajouter</button>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head" data-action="toggle-card" data-key="ref:care-cats">
          <div class="card-title">Catégories de soins</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="card-preview">${state.careCategories.length} catégorie${state.careCategories.length > 1 ? "s" : ""}</div>
            <span class="chevron">${catOpen ? "▲" : "▼"}</span>
          </div>
        </div>
        <div class="card-body ${catOpen ? "open" : ""}">
          ${state.careCategories.length === 0 ? `<div class="small-label">Aucune catégorie.</div>` : `<ul class="list">${state.careCategories.map(renderCareCategoryRow).join("")}</ul>`}
        </div>
      </div>
    </div>`;
}

function statusBadgeClass(status) {
  if (status === "rembourse") return "badge-current";
  if (status === "partiellement_rembourse") return "badge-danger";
  if (status === "initie") return "badge-past";
  return "badge-current";
}

function renderDossierCard(d) {
  const key = "dossier:" + d.id;
  const open = ui.expanded.has(key);
  const ben = state.beneficiaries.find(b => b.id === d.beneficiary_id);
  const spent = dossierSpentTotal(d.id);
  const remainder = dossierRemainder(d);
  const editable = isDossierEditable(d);
  const remCls = remainder > 0 ? "danger" : "success";

  const categoriesHtml = state.careCategories.length === 0
    ? `<div class="small-label">Créez des catégories de soins dans Référentiel.</div>`
    : `<ul class="list">${state.careCategories.map(cat => {
      const total = categoryTotalForDossier(cat.id, d.id);
      return `
        <li class="item-row">
          <div class="item-name">${esc(cat.name)}</div>
          <div class="item-amount">${money(total)} DH</div>
          <div class="item-actions">
            <button class="icon-btn" ${total === 0 ? "disabled" : ""} data-action="open-action-details" data-dossier-id="${d.id}" data-category-id="${cat.id}" title="Détails">🧾</button>
            ${editable ? `<button class="icon-btn add" data-action="open-add-action" data-dossier-id="${d.id}" data-category-id="${cat.id}" title="Ajouter">＋</button>` : ""}
          </div>
        </li>`;
    }).join("")}</ul>`;

  const reimbHtml = `
    <div class="reimb-grid">
      <div class="reimb-block" style="border-color:var(--month)">
        <div class="reimb-title" style="color:var(--month)">CNSS</div>
        ${editable ? `
          <form class="form-col" data-form="update-reimb" data-dossier-id="${d.id}" data-block="cnss">
            <input class="field" name="expected" type="number" min="0" step="0.01" placeholder="Montant attendu" value="${d.cnss_expected != null ? d.cnss_expected : ""}" />
            <input class="field" name="received" type="number" min="0" step="0.01" placeholder="Montant remboursé" value="${d.cnss_received != null ? d.cnss_received : ""}" />
            <button type="submit" class="btn-small" style="background:var(--month)">Enregistrer CNSS</button>
          </form>` : `
          <div class="small-label">Attendu : ${d.cnss_expected != null ? money(d.cnss_expected) + " DH" : "—"}</div>
          <div class="small-label">Reçu : ${d.cnss_received != null ? money(d.cnss_received) + " DH" : "—"}</div>`}
      </div>
      <div class="reimb-block" style="border-color:var(--week)">
        <div class="reimb-title" style="color:var(--week)">Assurance</div>
        ${editable ? `
          <form class="form-col" data-form="update-reimb" data-dossier-id="${d.id}" data-block="assurance">
            <input class="field" name="expected" type="number" min="0" step="0.01" placeholder="Montant attendu" value="${d.assurance_expected != null ? d.assurance_expected : ""}" />
            <input class="field" name="received" type="number" min="0" step="0.01" placeholder="Montant remboursé" value="${d.assurance_received != null ? d.assurance_received : ""}" />
            <button type="submit" class="btn-small" style="background:var(--week)">Enregistrer Assurance</button>
          </form>` : `
          <div class="small-label">Attendu : ${d.assurance_expected != null ? money(d.assurance_expected) + " DH" : "—"}</div>
          <div class="small-label">Reçu : ${d.assurance_received != null ? money(d.assurance_received) + " DH" : "—"}</div>`}
      </div>
    </div>`;

  const assignNumHtml = editable && !d.dossier_number ? `
    <form class="inline-form" data-form="assign-dossier-number" data-dossier-id="${d.id}" style="margin-bottom:12px">
      <input class="field" name="dossier_number" placeholder="N° dossier CNSS" required />
      <button type="submit" class="btn-small" style="background:var(--month)">Attribuer N°</button>
    </form>` : "";

  const doctor = state.doctors.find(doc => doc.id === d.doctor_id);

  return `
    <div class="card ${isDossierLocked(d) ? "disabled" : ""}" style="border-color:var(--month)">
      <div class="card-head" data-action="toggle-card" data-key="${key}">
        <div>
          <div class="card-title" style="color:var(--month)">N° ${esc(d.dossier_number || "—")}</div>
          <div class="card-range">Dépôt CNSS ${d.cnss_deposit_date ? formatDateFull(parseISODate(d.cnss_deposit_date)) : "—"}</div>
          <div class="card-range">${ben ? esc(beneficiaryName(ben)) : "—"}</div>
          <span class="badge ${statusBadgeClass(d.status)}">${STATUS_LABELS[d.status] || d.status}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-preview">${money(spent)} DH<br><span class="small-label ${remCls}">Reste : ${money(remainder)} DH</span></div>
          <span class="chevron">${open ? "▲" : "▼"}</span>
        </div>
      </div>
      <div class="card-body ${open ? "open" : ""}">
        <div style="margin-bottom:10px">
          <div class="small-label"><strong>Médecin :</strong> ${doctor ? esc(doctor.name) : "—"}</div>
          <div class="small-label"><strong>Consultation :</strong> ${formatDateFull(parseISODate(d.consultation_date))}</div>
        </div>
        ${assignNumHtml}
        ${reimbHtml}
        <div class="card-title" style="margin:16px 0 8px;font-size:14px">Soins par catégorie</div>
        ${categoriesHtml}
      </div>
    </div>`;
}

function renderDossiersTab() {
  const initBtn = isAdmin
    ? `<button class="btn-primary" style="width:100%;margin-bottom:12px" data-action="open-init-dossier">＋ Initier un dossier</button>`
    : "";

  return `
    <div class="stack">
      ${initBtn}
      ${state.dossiers.length === 0
    ? `<div class="small-label">Aucun dossier.</div>`
    : state.dossiers.map(renderDossierCard).join("")}
    </div>`;
}

function renderModal() {
  const m = ui.modal;
  if (m.type === "init-dossier") {
    const benOpts = state.beneficiaries.map(b =>
      `<option value="${b.id}">${esc(beneficiaryName(b))}</option>`).join("");
    const docOpts = state.doctors.map(d =>
      `<option value="${d.id}">${esc(d.name)} — ${facilityLabel(d.facility_type)}</option>`).join("");
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Initier un dossier<button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="init-dossier">
            <label class="small-label">Bénéficiaire</label>
            <select class="field" name="beneficiary_id" required>${benOpts || '<option value="">Aucun membre</option>'}</select>
            <label class="small-label">Médecin</label>
            <select class="field" name="doctor_id" required>${docOpts || '<option value="">Aucun médecin</option>'}</select>
            <label class="small-label">Date consultation</label>
            <input class="field" name="consultation_date" placeholder="AAAA-MM-JJ" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <label class="small-label">Date dépôt CNSS</label>
            <input class="field" name="cnss_deposit_date" placeholder="AAAA-MM-JJ" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <label class="small-label">Date envoi assurance</label>
            <input class="field" name="assurance_sent_date" placeholder="AAAA-MM-JJ" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "edit-beneficiary") {
    const b = state.beneficiaries.find(x => x.id === m.beneficiaryId);
    if (!b) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Modifier membre<button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-beneficiary" data-beneficiary-id="${b.id}">
            <input class="field" name="first_name" value="${esc(b.first_name)}" required />
            <input class="field" name="last_name" value="${esc(b.last_name)}" required />
            <input class="field" name="birth_date" value="${b.birth_date}" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <div class="segment-row">
              <button type="button" class="segment ${b.gender === "M" ? "active-week" : ""}" data-action="pick-gender" data-value="M">Homme</button>
              <button type="button" class="segment ${b.gender === "F" ? "active-week" : ""}" data-action="pick-gender" data-value="F">Femme</button>
            </div>
            <input type="hidden" name="gender" value="${b.gender}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "edit-doctor") {
    const d = state.doctors.find(x => x.id === m.doctorId);
    if (!d) return "";
    const types = ["cabinet", "clinique", "hopital"];
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Modifier médecin<button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-doctor" data-doctor-id="${d.id}">
            <input class="field" name="name" value="${esc(d.name)}" required />
            <div class="segment-row">
              ${types.map(t => `<button type="button" class="segment ${d.facility_type === t ? "active-week" : ""}" data-action="pick-facility" data-value="${t}">${facilityLabel(t)}</button>`).join("")}
            </div>
            <input type="hidden" name="facility_type" value="${d.facility_type}" />
            <input class="field" name="phone" value="${esc(d.phone || "")}" />
            <input class="field" name="specialty" value="${esc(d.specialty || "")}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "edit-care-category") {
    const c = state.careCategories.find(x => x.id === m.categoryId);
    if (!c) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Modifier catégorie<button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-care-category" data-category-id="${c.id}">
            <input class="field" name="name" value="${esc(c.name)}" required />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "add-action") {
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Ajouter une action<button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="add-action" data-dossier-id="${m.dossierId}" data-category-id="${m.categoryId}">
            <input class="field" name="price" type="number" min="0" step="0.01" placeholder="Prix en DH" required />
            <input class="field" name="place" placeholder="Lieu" required />
            <input class="field" name="action_date" placeholder="Date d'action (AAAA-MM-JJ)" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "action-details") {
    const actions = actionsForCategory(m.dossierId, m.categoryId);
    const cat = state.careCategories.find(c => c.id === m.categoryId);
    const d = state.dossiers.find(x => x.id === m.dossierId);
    const editable = d && isDossierEditable(d);
    const rows = actions.length === 0
      ? `<div class="small-label">Aucune action.</div>`
      : actions.map(a => `
        <div class="purchase-detail-row">
          <div>
            <div style="font-weight:600">${money(a.amount)} DH</div>
            <div class="small-label">${esc(a.place)} · ${formatDateFull(parseISODate(a.action_date))}</div>
          </div>
          ${editable ? `<div class="purchase-detail-actions">
            <button class="icon-btn edit" data-action="open-edit-action" data-action-id="${a.id}" title="Modifier">✏️</button>
            <button class="btn-delete" data-action="open-delete-action" data-action-id="${a.id}" title="Supprimer">🗑️</button>
          </div>` : ""}
        </div>`).join("");
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">${cat ? esc(cat.name) : "Détails"}<button class="close-btn" data-action="close-modal">✕</button></div>
          ${rows}
        </div>
      </div>`;
  }

  if (m.type === "edit-action") {
    const a = state.careActions.find(x => x.id === m.actionId);
    if (!a) return "";
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Modifier action<button class="close-btn" data-action="close-modal">✕</button></div>
          <form class="form-col" data-form="edit-action" data-action-id="${a.id}">
            <input class="field" name="price" type="number" min="0" step="0.01" value="${a.amount}" required />
            <input class="field" name="place" value="${esc(a.place)}" required />
            <input class="field" name="action_date" value="${a.action_date}" required pattern="\\d{4}-\\d{2}-\\d{2}" />
            <button type="submit" class="btn-primary">Enregistrer</button>
          </form>
        </div>
      </div>`;
  }

  if (m.type === "confirm-delete-action") {
    return `
      <div class="overlay" data-overlay-close="modal">
        <div class="sheet" onclick="event.stopPropagation()">
          <div class="sheet-title">Supprimer<button class="close-btn" data-action="close-modal">✕</button></div>
          <p class="confirm-text">Supprimer cette action de soin ?</p>
          <div class="btn-row">
            <button class="btn-primary" style="background:var(--danger)" data-action="confirm-delete-action" data-action-id="${m.actionId}">Supprimer</button>
            <button class="btn-primary" data-action="close-modal">Annuler</button>
          </div>
        </div>
      </div>`;
  }

  return "";
}
