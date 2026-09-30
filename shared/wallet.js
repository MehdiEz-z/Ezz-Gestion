import { supabaseClient } from "./supabase.js";
import {
  activeMonthKey, flash, getErrorMessage, money, previousMonthKey,
  TRESORERIE_START_MONTH, toISO,
} from "./utils.js";

/** @type {object[]|null} */
let movementsCache = null;
/** @type {object[]|null} */
let categoriesCache = null;

export const PAYMENT_BANQUE = "banque";
export const PAYMENT_ESPECES = "especes";

export const SOURCE_LABELS = {
  opening: "Solde banque",
  salary: "Salaire",
  cnss: "Remboursement CNSS",
  assurance: "Remboursement assurance",
  budget_month: "Budget mensuel",
  budget_week: "Budget hebdo",
  care: "Soin médical",
  elec_pay: "Paiement électricité",
  water_pay: "Paiement eau",
  manual: "Charge manuelle",
  cash_withdraw: "Retrait DAB",
  cash_deposit: "Retrait DAB (espèces)",
  debt_borrow: "Dette",
  debt_repay: "Dette rendu",
  savings_deposit: "Versement épargne",
  savings_withdraw: "Retrait épargne",
};

export function normalizePaymentMethod(value) {
  return value === PAYMENT_ESPECES ? PAYMENT_ESPECES : PAYMENT_BANQUE;
}

export function paymentMethodLabel(method) {
  return normalizePaymentMethod(method) === PAYMENT_ESPECES ? "Espèces" : "Carte";
}

/** Libellé badge / détail : depense → Carte, revenue → Banque. */
export function paymentMethodDisplayLabel(method, flow = "depense") {
  if (normalizePaymentMethod(method) === PAYMENT_ESPECES) return "Espèces";
  return flow === "revenue" ? "Banque" : "Carte";
}

function movementPot(m) {
  if (m.source_type === "cash_deposit") return PAYMENT_ESPECES;
  return normalizePaymentMethod(m.payment_method);
}

export const SYSTEM_EXPENSE_TYPES = [
  "budget_month", "budget_week", "care", "elec_pay", "water_pay",
  "debt_repay", "savings_deposit",
];

export const SYSTEM_REVENUE_TYPES = [
  "salary", "cnss", "assurance",
  "debt_borrow", "savings_withdraw",
];

/** Toujours crédit/débit banque (pas espèces). */
const BANK_ONLY_SOURCE_TYPES = new Set([
  "opening", "salary", "cnss", "assurance",
  "budget_month", "budget_week", "cash_withdraw",
]);

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

export function getWalletCategoriesByDirection(direction) {
  return getUserWalletCategories().filter(c => (c.direction || "depense") === direction);
}

function walletCategoryNameTaken(name, excludeId = null) {
  const key = name.trim().toLowerCase();
  return getUserWalletCategories().some(
    c => c.id !== excludeId && c.name.toLowerCase() === key,
  );
}

function movementsForMonth(monthKey) {
  return getMovements().filter(m => m.month_key === monthKey);
}

function movementByRef(refKey) {
  return getMovements().find(m => m.ref_key === refKey) || null;
}

function sumMovementsForPot(monthKey, pot) {
  return movementsForMonth(monthKey)
    .filter(m => movementPot(m) === pot)
    .reduce((s, m) => s + Number(m.amount), 0);
}

/** Entrée banque du mois (ouverture ou report banque du mois précédent). */
export function carryInBank(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  if (monthKey === TRESORERIE_START_MONTH) {
    const opening = movementByRef(`opening:${monthKey}`);
    return opening ? Number(opening.amount) : 0;
  }
  return closingBankBalance(previousMonthKey(monthKey));
}

/** Solde banque de clôture (report vers le mois suivant). */
export function closingBankBalance(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  return carryInBank(monthKey) + sumMovementsForPot(monthKey, PAYMENT_BANQUE);
}

/** Solde de clôture banque (alias historique). */
export function closingBalance(monthKey) {
  return closingBankBalance(monthKey);
}

/** Entrée du mois banque (alias historique). */
export function carryIn(monthKey) {
  return carryInBank(monthKey);
}

export function availableBankBalance(monthKey) {
  return closingBankBalance(monthKey);
}

/** Espèces : pas de report d'un mois à l'autre. */
export function availableCashBalance(monthKey) {
  if (monthKey < TRESORERIE_START_MONTH) return 0;
  return sumMovementsForPot(monthKey, PAYMENT_ESPECES);
}

/** Solde banque disponible (alias historique). */
export function availableBalance(monthKey) {
  return availableBankBalance(monthKey);
}

function availableForPot(monthKey, pot, excludeRefKey = null) {
  let avail = pot === PAYMENT_ESPECES
    ? availableCashBalance(monthKey)
    : availableBankBalance(monthKey);
  if (excludeRefKey) {
    const ex = movementByRef(excludeRefKey);
    if (ex && ex.month_key === monthKey && movementPot(ex) === pot) {
      avail -= Number(ex.amount);
    }
  }
  return avail;
}

export function canAfford(monthKey, amountNeeded, excludeRefKey = null, paymentMethod = PAYMENT_BANQUE) {
  const need = Number(amountNeeded) || 0;
  if (need <= 0) return true;
  const pot = normalizePaymentMethod(paymentMethod);
  return availableForPot(monthKey, pot, excludeRefKey) >= need;
}

function affordMessage(monthKey, amountNeeded, excludeRefKey = null, paymentMethod = PAYMENT_BANQUE) {
  const need = Number(amountNeeded) || 0;
  const pot = normalizePaymentMethod(paymentMethod);
  const avail = availableForPot(monthKey, pot, excludeRefKey);
  if (avail >= need) return null;
  const potLabel = pot === PAYMENT_ESPECES ? "espèces" : "banque";
  return `Solde ${potLabel} insuffisant : reste ${money(avail)} DH, besoin ${money(need)} DH.`;
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
  paymentMethod = PAYMENT_BANQUE,
}) {
  let pm = normalizePaymentMethod(paymentMethod);
  if (BANK_ONLY_SOURCE_TYPES.has(sourceType)) pm = PAYMENT_BANQUE;
  const payload = {
    month_key: monthKey,
    movement_date: movementDate || toISO(new Date()),
    amount: Number(amount),
    source_module: sourceModule,
    source_type: sourceType,
    ref_key: refKey,
    label: label || SOURCE_LABELS[sourceType] || sourceType,
    category_id: categoryId,
    payment_method: pm,
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

export async function syncCareAction(action, categoryName) {
  const monthKey = action.action_date.slice(0, 7);
  const refKey = `care:${action.id}`;
  const amt = Number(action.amount);
  const pm = normalizePaymentMethod(action.payment_method);
  const msg = affordMessage(monthKey, amt, refKey, pm);
  if (msg) { flash(msg, true); return false; }
  return !!(await upsertMovement({
    monthKey,
    amount: -amt,
    sourceModule: "maladie",
    sourceType: "care",
    refKey,
    label: categoryName || "Soin",
    movementDate: action.action_date,
    paymentMethod: pm,
  }));
}

export async function removeCareAction(actionId) {
  return deleteMovementByRef(`care:${actionId}`);
}

export async function syncDossierReimbursements(dossier) {
  const monthKey = toISO(new Date()).slice(0, 7);
  const numLabel = dossier.dossier_number ? `N°${dossier.dossier_number}` : "Sans N°";
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
        label: numLabel,
        paymentMethod: PAYMENT_BANQUE,
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
        label: numLabel,
        paymentMethod: PAYMENT_BANQUE,
      });
      if (!r) ok = false;
    }
  } else {
    await deleteMovementByRef(`assurance:${dossier.id}`);
  }

  return ok;
}

export async function syncUtilityPayment({ monthKey, personName, amount, sourceType, refKey, paymentMethod = PAYMENT_BANQUE }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return true;
  const pm = normalizePaymentMethod(paymentMethod);
  const msg = affordMessage(monthKey, amt, refKey, pm);
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
    paymentMethod: pm,
  }));
}

/** Virement interne banque → espèces (retrait DAB). */
export async function addCashWithdrawal(monthKey, amount) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const msg = affordMessage(monthKey, amt, null, PAYMENT_BANQUE);
  if (msg) { flash(msg, true); return false; }
  const xferId = crypto.randomUUID();
  const date = toISO(new Date());
  const bankRef = `cash_xfer:${xferId}:bank`;
  const cashRef = `cash_xfer:${xferId}:cash`;
  const bankOk = await upsertMovement({
    monthKey,
    amount: -amt,
    sourceModule: "tresorerie",
    sourceType: "cash_withdraw",
    refKey: bankRef,
    label: "Retrait DAB",
    movementDate: date,
    paymentMethod: PAYMENT_BANQUE,
  });
  if (!bankOk) return false;
  const cashOk = await upsertMovement({
    monthKey,
    amount: amt,
    sourceModule: "tresorerie",
    sourceType: "cash_deposit",
    refKey: cashRef,
    label: "Retrait DAB",
    movementDate: date,
    paymentMethod: PAYMENT_ESPECES,
  });
  if (!cashOk) {
    await deleteMovementByRef(bankRef);
    return false;
  }
  flash("Retrait DAB enregistré.");
  return true;
}

export async function addManualExpense(monthKey, categoryId, amount, label, paymentMethod = PAYMENT_BANQUE) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const cat = getWalletCategories().find(c => c.id === categoryId);
  if (!cat || cat.is_system) { flash("Catégorie invalide.", true); return false; }
  if ((cat.direction || "depense") !== "depense") {
    flash("Cette catégorie n'est pas une dépense.", true);
    return false;
  }
  const lbl = label?.trim();
  if (!lbl) { flash("Le libellé est obligatoire.", true); return false; }
  const pm = normalizePaymentMethod(paymentMethod);
  const msg = affordMessage(monthKey, amt, null, pm);
  if (msg) { flash(msg, true); return false; }
  const { data, error } = await supabaseClient.from("wallet_movements")
    .insert({
      month_key: monthKey,
      movement_date: toISO(new Date()),
      amount: -amt,
      source_module: "tresorerie",
      source_type: "manual",
      category_id: categoryId,
      label: lbl,
      payment_method: pm,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur saisie charge."), true); return false; }
  movementsCache.push(data);
  flash("Dépense enregistrée.");
  return true;
}

export async function addManualRevenue(monthKey, categoryId, amount, label, paymentMethod = PAYMENT_BANQUE) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const cat = getWalletCategories().find(c => c.id === categoryId);
  if (!cat || cat.is_system) { flash("Catégorie invalide.", true); return false; }
  if ((cat.direction || "depense") !== "revenue") {
    flash("Cette catégorie n'est pas un revenu.", true);
    return false;
  }
  const lbl = label?.trim();
  if (!lbl) { flash("Le libellé est obligatoire.", true); return false; }
  const pm = normalizePaymentMethod(paymentMethod);
  const { data, error } = await supabaseClient.from("wallet_movements")
    .insert({
      month_key: monthKey,
      movement_date: toISO(new Date()),
      amount: amt,
      source_module: "tresorerie",
      source_type: "manual",
      category_id: categoryId,
      label: lbl,
      payment_method: pm,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur saisie revenu."), true); return false; }
  movementsCache.push(data);
  flash("Revenu enregistré.");
  return true;
}

export async function updateManualMovement(id, amount, label, paymentMethod = null) {
  const mov = getMovements().find(m => m.id === id);
  if (!mov || mov.source_type !== "manual") return false;
  if (!isManualMovementEditable(mov)) {
    flash("Ce mouvement ne peut pas être modifié (mois passé).", true);
    return false;
  }
  const cat = manualCategoryForMovement(mov);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const direction = cat?.direction || (Number(mov.amount) < 0 ? "depense" : "revenue");
  const pm = normalizePaymentMethod(paymentMethod ?? mov.payment_method);
  if (direction === "depense") {
    let avail = availableForPot(mov.month_key, pm);
    if (movementPot(mov) === pm) avail -= Number(mov.amount);
    if (avail < amt) {
      const potLabel = pm === PAYMENT_ESPECES ? "espèces" : "banque";
      flash(`Solde ${potLabel} insuffisant : reste ${money(avail)} DH, besoin ${money(amt)} DH.`, true);
      return false;
    }
  }
  const lbl = label?.trim();
  if (!lbl) { flash("Le libellé est obligatoire.", true); return false; }
  const nextAmount = direction === "depense" ? -amt : amt;
  const updatePayload = { amount: nextAmount, label: lbl, payment_method: pm };
  const { data, error } = await supabaseClient.from("wallet_movements")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur modification."), true); return false; }
  const idx = movementsCache.findIndex(m => m.id === id);
  if (idx >= 0) movementsCache[idx] = data;
  flash("Mouvement modifié.");
  return true;
}

export async function deleteManualMovement(id) {
  const mov = getMovements().find(m => m.id === id);
  if (!mov || mov.source_type !== "manual") return false;
  if (!isManualMovementEditable(mov)) {
    flash("Ce mouvement ne peut pas être supprimé (mois passé).", true);
    return false;
  }
  const { error } = await supabaseClient.from("wallet_movements").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression."), true); return false; }
  movementsCache = movementsCache.filter(m => m.id !== id);
  flash("Mouvement supprimé.");
  return true;
}

export async function addWalletCategory(name, direction) {
  const n = name.trim();
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (!["depense", "revenue"].includes(direction)) {
    flash("Type de catégorie invalide.", true);
    return false;
  }
  if (walletCategoryNameTaken(n)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("wallet_categories")
    .insert({ name: n, is_system: false, direction }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return false; }
  categoriesCache.push(data);
  flash("Catégorie ajoutée.");
  return true;
}

export async function updateWalletCategory(id, name, direction) {
  const cat = getUserWalletCategories().find(c => c.id === id);
  if (!cat) return false;
  const n = name.trim();
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (!["depense", "revenue"].includes(direction)) {
    flash("Type de catégorie invalide.", true);
    return false;
  }
  if (walletCategoryNameTaken(n, id)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("wallet_categories")
    .update({ name: n, direction }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification catégorie."), true); return false; }
  const idx = categoriesCache.findIndex(c => c.id === id);
  if (idx >= 0) categoriesCache[idx] = data;
  flash("Catégorie modifiée.");
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

export function sumManualByDirection(monthKey, direction) {
  return movementsForMonth(monthKey)
    .filter(m => {
      if (m.source_type !== "manual") return false;
      const cat = getWalletCategories().find(c => c.id === m.category_id);
      return cat && (cat.direction || "depense") === direction;
    })
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

export function movementsForSystemType(monthKey, sourceType) {
  return movementsForMonth(monthKey)
    .filter(m => m.source_type === sourceType)
    .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1));
}

export function totalForSystemType(monthKey, sourceType) {
  return movementsForSystemType(monthKey, sourceType)
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

export function manualMovementsForCategory(monthKey, categoryId) {
  return movementsForMonth(monthKey)
    .filter(m => m.source_type === "manual" && m.category_id === categoryId)
    .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1));
}

export function totalForManualCategory(monthKey, categoryId) {
  return manualMovementsForCategory(monthKey, categoryId)
    .reduce((s, m) => s + Math.abs(Number(m.amount)), 0);
}

export function saisieDepenseTotal(monthKey) {
  return SYSTEM_EXPENSE_TYPES.reduce(
    (s, t) => s + totalForSystemType(monthKey, t), 0,
  ) + sumManualByDirection(monthKey, "depense");
}

export function saisieRevenueTotal(monthKey) {
  return SYSTEM_REVENUE_TYPES.reduce(
    (s, t) => s + totalForSystemType(monthKey, t), 0,
  ) + sumManualByDirection(monthKey, "revenue");
}

export function isManualMovementEditable(movement) {
  return movement?.source_type === "manual"
    && movement.month_key === activeMonthKey();
}

function manualCategoryForMovement(movement) {
  return getWalletCategories().find(c => c.id === movement.category_id) || null;
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
  const detteRendu = totalForSystemType(monthKey, "debt_repay");
  const epargneVerse = totalForSystemType(monthKey, "savings_deposit");
  const manualDepense = sumManualByDirection(monthKey, "depense");
  const autres = manualDepense;
  const reimbursements = sumByTypes(monthKey, ["cnss", "assurance"], true);
  const dettePrise = totalForSystemType(monthKey, "debt_borrow");
  const epargneRetrait = totalForSystemType(monthKey, "savings_withdraw");
  const manualRevenue = sumManualByDirection(monthKey, "revenue");
  const otherIncome = manualRevenue;

  const totalResources = salary + soldePrev;
  const totalExpenses = budget + maladie + utilities + manualDepense + detteRendu + epargneVerse;
  const totalIncomes = reimbursements + manualRevenue + dettePrise + epargneRetrait;
  const soldeBanque = availableBankBalance(monthKey);
  const soldeEspeces = availableCashBalance(monthKey);

  return {
    isFirst,
    salary,
    soldePrev,
    totalResources,
    budget,
    maladie,
    utilities,
    autres,
    detteRendu,
    epargneVerse,
    totalExpenses,
    reimbursements,
    otherIncome,
    dettePrise,
    epargneRetrait,
    totalIncomes,
    soldeBanque,
    soldeEspeces,
    soldeDisponible: soldeBanque,
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

const DEBT_WALLET_OUT = new Set(["repay", "deposit"]);

/** Sync trésorerie pour une ligne dettes/épargne (ref debt:{id}). */
export async function syncDebtLedgerWallet(entry, categoryName) {
  const monthKey = entry.movement_date.slice(0, 7);
  const refKey = `debt:${entry.id}`;
  const amt = Number(entry.amount);
  const pm = normalizePaymentMethod(entry.payment_method);
  const cat = categoryName || "Dette";
  let amount;
  let sourceType;
  let walletLabel;

  switch (entry.action_type) {
    case "borrow":
      amount = amt;
      sourceType = "debt_borrow";
      walletLabel = `Emprunt — ${cat}`;
      break;
    case "repay":
      amount = -amt;
      sourceType = "debt_repay";
      walletLabel = `Remboursement — ${cat}`;
      break;
    case "deposit":
      amount = -amt;
      sourceType = "savings_deposit";
      walletLabel = `Versement épargne — ${cat}`;
      break;
    case "withdraw":
      amount = amt;
      sourceType = "savings_withdraw";
      walletLabel = `Retrait épargne — ${cat}`;
      break;
    default:
      return false;
  }

  if (entry.label?.trim()) walletLabel = `${walletLabel} · ${entry.label.trim()}`;

  if (DEBT_WALLET_OUT.has(entry.action_type)) {
    const msg = affordMessage(monthKey, amt, refKey, pm);
    if (msg) { flash(msg, true); return false; }
  }

  return !!(await upsertMovement({
    monthKey,
    amount,
    sourceModule: "dettes",
    sourceType,
    refKey,
    label: walletLabel,
    movementDate: entry.movement_date,
    paymentMethod: pm,
  }));
}

export async function removeDebtLedgerWallet(entryId) {
  return deleteMovementByRef(`debt:${entryId}`);
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
