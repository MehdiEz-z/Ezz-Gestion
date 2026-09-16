import { supabaseClient } from "./supabase.js";
import { flash, getErrorMessage, money, previousMonthKey, TRESORERIE_START_MONTH, toISO } from "./utils.js";

/** @type {object[]|null} */
let movementsCache = null;
/** @type {object[]|null} */
let categoriesCache = null;

export const SOURCE_LABELS = {
  opening: "Solde banque",
  salary: "Salaire",
  cnss: "Remboursement CNSS",
  assurance: "Remboursement assurance",
  budget_month: "Budget mensuel",
  budget_week: "Budget hebdo",
  care: "Soin dossier",
  elec_pay: "Paiement électricité",
  water_pay: "Paiement eau",
  manual: "Charge manuelle",
};

export function invalidateWalletCache() {
  movementsCache = null;
  categoriesCache = null;
}

export async function loadWalletData() {
  const [mov, cats] = await Promise.all([
    supabaseClient.from("wallet_movements").select("*").order("movement_date", { ascending: true }),
    supabaseClient.from("wallet_categories").select("*").order("name"),
  ]);
  if (mov.error) {
    flash(getErrorMessage(mov.error, "Erreur chargement trésorerie. Exécutez supabase/tresorerie.sql."), true);
    movementsCache = [];
  } else {
    movementsCache = mov.data || [];
  }
  if (cats.error) {
    categoriesCache = [];
  } else {
    categoriesCache = cats.data || [];
  }
  return { movements: movementsCache, categories: categoriesCache };
}

export function getMovements() {
  return movementsCache || [];
}

export function getWalletCategories() {
  return categoriesCache || [];
}

export function getUserWalletCategories() {
  return getWalletCategories().filter(c => !c.is_system);
}

function movementsForMonth(monthKey) {
  return getMovements().filter(m => m.month_key === monthKey);
}

function movementByRef(refKey) {
  return getMovements().find(m => m.ref_key === refKey) || null;
}

function sumMovements(monthKey) {
  return movementsForMonth(monthKey).reduce((s, m) => s + Number(m.amount), 0);
}

/** Solde de clôture d'un mois (report vers le mois suivant). */
export function closingBalance(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  const carry = carryIn(monthKey);
  return carry + sumMovements(monthKey);
}

/** Entrée du mois : solde banque (1er mois) ou report du mois précédent. */
export function carryIn(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  if (monthKey === TRESORERIE_START_MONTH) {
    const opening = movementByRef(`opening:${monthKey}`);
    return opening ? Number(opening.amount) : 0;
  }
  return closingBalance(previousMonthKey(monthKey));
}

/** Solde disponible dans un mois (avant nouvelle sortie). */
export function availableBalance(monthKey) {
  return carryIn(monthKey) + sumMovements(monthKey);
}

export function canAfford(monthKey, amountNeeded, excludeRefKey = null) {
  const need = Number(amountNeeded) || 0;
  if (need <= 0) return true;
  let avail = availableBalance(monthKey);
  if (excludeRefKey) {
    const ex = movementByRef(excludeRefKey);
    if (ex && ex.month_key === monthKey) avail -= Number(ex.amount);
  }
  return avail >= need;
}

function affordMessage(monthKey, amountNeeded, excludeRefKey = null) {
  const need = Number(amountNeeded) || 0;
  let avail = availableBalance(monthKey);
  if (excludeRefKey) {
    const ex = movementByRef(excludeRefKey);
    if (ex && ex.month_key === monthKey) avail -= Number(ex.amount);
  }
  if (avail >= need) return null;
  return `Solde insuffisant : reste ${money(avail)} DH, besoin ${money(need)} DH.`;
}

export async function upsertMovement({
  monthKey,
  amount,
  sourceModule,
  sourceType,
  refKey,
  label,
  categoryId = null,
  movementDate = null,
}) {
  const payload = {
    month_key: monthKey,
    movement_date: movementDate || toISO(new Date()),
    amount: Number(amount),
    source_module: sourceModule,
    source_type: sourceType,
    ref_key: refKey,
    label: label || SOURCE_LABELS[sourceType] || sourceType,
    category_id: categoryId,
  };

  const existing = refKey ? movementByRef(refKey) : null;
  let result;
  if (existing) {
    const { data, error } = await supabaseClient.from("wallet_movements")
      .update(payload).eq("id", existing.id).select().single();
    if (error) { flash(getErrorMessage(error, "Erreur mise à jour trésorerie."), true); return false; }
    result = data;
    const idx = movementsCache.findIndex(m => m.id === existing.id);
    if (idx >= 0) movementsCache[idx] = data;
  } else {
    const { data, error } = await supabaseClient.from("wallet_movements")
      .insert(payload).select().single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement trésorerie."), true); return false; }
    result = data;
    movementsCache.push(data);
  }
  return result;
}

export async function deleteMovementByRef(refKey) {
  const existing = movementByRef(refKey);
  if (!existing) return true;
  const { error } = await supabaseClient.from("wallet_movements").delete().eq("id", existing.id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression mouvement."), true); return false; }
  movementsCache = movementsCache.filter(m => m.id !== existing.id);
  return true;
}

export async function setOpeningBalance(monthKey, amount) {
  if (monthKey !== TRESORERIE_START_MONTH) {
    flash("Le solde actuel ne se saisit que pour le premier mois.", true);
    return false;
  }
  if (hasOpeningBalance()) {
    flash("Le solde actuel est déjà fixé et ne peut plus être modifié.", true);
    return false;
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) { flash("Montant invalide.", true); return false; }
  const ok = await upsertMovement({
    monthKey,
    amount: n,
    sourceModule: "tresorerie",
    sourceType: "opening",
    refKey: `opening:${monthKey}`,
    label: "Solde actuel",
  });
  if (ok) flash("Solde actuel enregistré.");
  return !!ok;
}

export async function setSalary(monthKey, amount) {
  if (monthKey === TRESORERIE_START_MONTH) {
    flash("Le salaire se saisit à partir du mois suivant.", true);
    return false;
  }
  if (hasSalary(monthKey)) {
    flash("Le salaire de ce mois est déjà fixé et ne peut plus être modifié.", true);
    return false;
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) { flash("Salaire invalide.", true); return false; }
  const refKey = `salary:${monthKey}`;
  const ok = await upsertMovement({
    monthKey,
    amount: n,
    sourceModule: "tresorerie",
    sourceType: "salary",
    refKey,
    label: "Salaire",
  });
  if (ok) flash("Salaire enregistré.");
  return !!ok;
}

export async function syncMonthBudget(monthKey, newAmount, oldAmount = 0) {
  const refKey = `budget_month:${monthKey}`;
  const next = Number(newAmount) || 0;
  const prev = Number(oldAmount) || 0;
  const delta = next - prev;
  if (delta > 0) {
    const msg = affordMessage(monthKey, delta, refKey);
    if (msg) { flash(msg, true); return false; }
  }
  if (next === 0) return deleteMovementByRef(refKey);
  return !!(await upsertMovement({
    monthKey,
    amount: -next,
    sourceModule: "maison",
    sourceType: "budget_month",
    refKey,
    label: "Budget mensuel Course",
  }));
}

export async function syncWeekBudget(isoWeekStart, monthKey, newAmount, oldAmount = 0) {
  const refKey = `budget_week:${isoWeekStart}`;
  const next = Number(newAmount) || 0;
  const prev = Number(oldAmount) || 0;
  const delta = next - prev;
  if (delta > 0) {
    const msg = affordMessage(monthKey, delta, refKey);
    if (msg) { flash(msg, true); return false; }
  }
  if (next === 0) return deleteMovementByRef(refKey);
  return !!(await upsertMovement({
    monthKey,
    amount: -next,
    sourceModule: "maison",
    sourceType: "budget_week",
    refKey,
    label: "Budget hebdo Course",
  }));
}

export async function syncCareAction(action, dossierLabel) {
  const monthKey = action.action_date.slice(0, 7);
  const refKey = `care:${action.id}`;
  const amt = Number(action.amount);
  const msg = affordMessage(monthKey, amt, refKey);
  if (msg) { flash(msg, true); return false; }
  return !!(await upsertMovement({
    monthKey,
    amount: -amt,
    sourceModule: "maladie",
    sourceType: "care",
    refKey,
    label: `Soin — ${dossierLabel}`,
    movementDate: action.action_date,
  }));
}

export async function removeCareAction(actionId) {
  return deleteMovementByRef(`care:${actionId}`);
}

export async function syncDossierReimbursements(dossier) {
  const monthKey = toISO(new Date()).slice(0, 7);
  const num = dossier.dossier_number || "Sans N°";
  let ok = true;

  if (dossier.cnss_received != null && dossier.cnss_received !== "") {
    const amt = Number(dossier.cnss_received);
    if (Number.isFinite(amt) && amt >= 0) {
      const r = await upsertMovement({
        monthKey,
        amount: amt,
        sourceModule: "maladie",
        sourceType: "cnss",
        refKey: `cnss:${dossier.id}`,
        label: `Remboursement CNSS — ${num}`,
      });
      if (!r) ok = false;
    }
  } else {
    await deleteMovementByRef(`cnss:${dossier.id}`);
  }

  if (dossier.assurance_received != null && dossier.assurance_received !== "") {
    const amt = Number(dossier.assurance_received);
    if (Number.isFinite(amt) && amt >= 0) {
      const r = await upsertMovement({
        monthKey,
        amount: amt,
        sourceModule: "maladie",
        sourceType: "assurance",
        refKey: `assurance:${dossier.id}`,
        label: `Remboursement assurance — ${num}`,
      });
      if (!r) ok = false;
    }
  } else {
    await deleteMovementByRef(`assurance:${dossier.id}`);
  }

  return ok;
}

export async function syncUtilityPayment({ monthKey, personName, amount, sourceType, refKey }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return true;
  const msg = affordMessage(monthKey, amt, refKey);
  if (msg) { flash(msg, true); return false; }
  const label = sourceType === "elec_pay"
    ? `Électricité — ${personName}`
    : `Eau — ${personName}`;
  return !!(await upsertMovement({
    monthKey,
    amount: -amt,
    sourceModule: "eau-elec",
    sourceType,
    refKey,
    label,
  }));
}

export async function addManualExpense(monthKey, categoryId, amount, label) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const msg = affordMessage(monthKey, amt);
  if (msg) { flash(msg, true); return false; }
  const cat = getWalletCategories().find(c => c.id === categoryId);
  if (!cat || cat.is_system) { flash("Catégorie invalide.", true); return false; }
  const { data, error } = await supabaseClient.from("wallet_movements")
    .insert({
      month_key: monthKey,
      movement_date: toISO(new Date()),
      amount: -amt,
      source_module: "tresorerie",
      source_type: "manual",
      category_id: categoryId,
      label: label || cat.name,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur saisie charge."), true); return false; }
  movementsCache.push(data);
  flash("Charge enregistrée.");
  return true;
}

export async function addWalletCategory(name) {
  const n = name.trim();
  if (!n) { flash("Nom obligatoire.", true); return false; }
  if (getWalletCategories().some(c => c.name.toLowerCase() === n.toLowerCase())) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("wallet_categories")
    .insert({ name: n, is_system: false }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return false; }
  categoriesCache.push(data);
  flash("Catégorie ajoutée.");
  return true;
}

export async function deleteWalletCategory(id) {
  const cat = getWalletCategories().find(c => c.id === id);
  if (!cat || cat.is_system) return false;
  const used = getMovements().some(m => m.category_id === id);
  if (used) { flash("Impossible : des charges utilisent cette catégorie.", true); return false; }
  const { error } = await supabaseClient.from("wallet_categories").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression catégorie."), true); return false; }
  categoriesCache = categoriesCache.filter(c => c.id !== id);
  flash("Catégorie supprimée.");
  return true;
}

function sumByTypes(monthKey, types, positiveOnly = false) {
  return movementsForMonth(monthKey)
    .filter(m => types.includes(m.source_type) && (!positiveOnly || Number(m.amount) > 0))
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

/** Synthèse structurée en 3 blocs + solde disponible. */
export function monthSummary(monthKey) {
  const isFirst = monthKey === TRESORERIE_START_MONTH;
  const salaryMov = movementByRef(`salary:${monthKey}`);
  const salary = salaryMov ? Number(salaryMov.amount) : 0;
  const soldePrev = isFirst ? carryIn(monthKey) : carryIn(monthKey);

  const budget = sumByTypes(monthKey, ["budget_month", "budget_week"]);
  const maladie = sumByTypes(monthKey, ["care"]);
  const utilities = sumByTypes(monthKey, ["elec_pay", "water_pay"]);
  const autres = sumByTypes(monthKey, ["manual"]);
  const reimbursements = sumByTypes(monthKey, ["cnss", "assurance"], true);
  const otherIncome = 0;

  const totalResources = salary + soldePrev;
  const totalExpenses = budget + maladie + utilities + autres;
  const totalIncomes = reimbursements + otherIncome;
  const soldeDisponible = totalResources - totalExpenses + totalIncomes;

  return {
    isFirst,
    prevKey,
    salary,
    soldePrev,
    totalResources,
    budget,
    maladie,
    utilities,
    autres,
    totalExpenses,
    reimbursements,
    otherIncome,
    totalIncomes,
    soldeDisponible,
    needsOpeningSetup: isFirst && !hasOpeningBalance(),
    needsSalarySetup: !isFirst && !hasSalary(monthKey),
  };
}

export function hasOpeningBalance() {
  return !!movementByRef(`opening:${TRESORERIE_START_MONTH}`);
}

export function hasSalary(monthKey) {
  return !!movementByRef(`salary:${monthKey}`);
}

export async function getAppOwnerPerson() {
  const { data, error } = await supabaseClient.from("utility_persons")
    .select("*").eq("is_app_owner", true).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function setAppOwner(personId) {
  await supabaseClient.from("utility_persons").update({ is_app_owner: false }).eq("is_app_owner", true);
  const { error } = await supabaseClient.from("utility_persons")
    .update({ is_app_owner: true }).eq("id", personId);
  if (error) { flash(getErrorMessage(error, "Erreur propriétaire."), true); return false; }
  flash("Propriétaire enregistré.");
  return true;
}
