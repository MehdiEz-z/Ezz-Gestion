import { supabaseClient } from "../shared/supabase.js";
import { isAdmin } from "../shared/auth.js";
import { loadWalletData, normalizePaymentMethod } from "../shared/wallet.js";
import { flash, getErrorMessage, money, toISO } from "../shared/utils.js";

export let state = {
  categories: [],
  movements: [],
};

export const ui = {
  subTab: "synthese",
  expanded: new Set(),
  modal: null,
};

export const ACTION_LABELS = {
  borrow: "Prise",
  repay: "Rendu",
  deposit: "Versement",
  withdraw: "Retrait",
};

export const KIND_LABELS = {
  dette: "Dette",
  epargne: "Épargne",
};

export function resetState() {
  state = { categories: [], movements: [] };
  ui.expanded.clear();
  ui.modal = null;
}

function parseDateInput(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export async function fetchStateFromSupabase() {
  const [cats, mov] = await Promise.all([
    supabaseClient.from("debt_categories").select("*").order("name"),
    supabaseClient.from("debt_movements").select("*").order("movement_date", { ascending: false }),
  ]);
  if (cats.error) {
    flash(getErrorMessage(cats.error, "Erreur chargement catégories dettes. Exécutez supabase/dettes.sql."), true);
    state.categories = [];
  } else {
    state.categories = cats.data || [];
  }
  if (mov.error) {
    flash(getErrorMessage(mov.error, "Erreur chargement mouvements dettes."), true);
    state.movements = [];
  } else {
    state.movements = mov.data || [];
  }
  await loadWalletData();
}

export function getCategoriesByKind(kind) {
  return state.categories.filter(c => c.kind === kind).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function getCategory(id) {
  return state.categories.find(c => c.id === id) || null;
}

/** Solde catégorie (dette due ou épargne accumulée). */
export function categoryBalance(categoryId) {
  const cat = getCategory(categoryId);
  if (!cat) return 0;
  return movementsForCategory(categoryId).reduce((sum, m) => {
    const amt = Number(m.amount);
    if (cat.kind === "dette") {
      if (m.action_type === "borrow") return sum + amt;
      if (m.action_type === "repay") return sum - amt;
    } else {
      if (m.action_type === "deposit") return sum + amt;
      if (m.action_type === "withdraw") return sum - amt;
    }
    return sum;
  }, 0);
}

export function movementsForCategory(categoryId) {
  return state.movements
    .filter(m => m.category_id === categoryId)
    .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1));
}

export function totalBalanceByKind(kind) {
  return getCategoriesByKind(kind).reduce((s, c) => s + categoryBalance(c.id), 0);
}

function totalMovementAmountByKindAction(kind, actionType) {
  const ids = new Set(getCategoriesByKind(kind).map(c => c.id));
  return state.movements
    .filter(m => ids.has(m.category_id) && m.action_type === actionType)
    .reduce((s, m) => s + Number(m.amount), 0);
}

export function summarySnapshot() {
  const totalARendre = totalBalanceByKind("dette");
  const totalRendu = totalMovementAmountByKindAction("dette", "repay");
  const totalEmprunte = totalMovementAmountByKindAction("dette", "borrow");
  return {
    totalDette: totalARendre,
    totalARendre,
    totalRendu,
    totalEmprunte,
    totalEpargne: totalBalanceByKind("epargne"),
    categoriesDette: getCategoriesByKind("dette"),
    categoriesEpargne: getCategoriesByKind("epargne"),
  };
}

function categoryNameTaken(name, kind, excludeId = null) {
  const key = name.trim().toLowerCase();
  return state.categories.some(
    c => c.kind === kind && c.id !== excludeId && c.name.toLowerCase() === key,
  );
}

export async function addCategory(name, kind) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Le nom est obligatoire.", true); return false; }
  if (!["dette", "epargne"].includes(kind)) { flash("Type invalide.", true); return false; }
  if (categoryNameTaken(n, kind)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("debt_categories")
    .insert({ name: n, kind }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return false; }
  state.categories.push(data);
  flash("Catégorie ajoutée.");
  return true;
}

export async function updateCategory(id, name) {
  if (!isAdmin) return false;
  const cat = getCategory(id);
  if (!cat) return false;
  const n = name.trim();
  if (!n) { flash("Le nom est obligatoire.", true); return false; }
  if (categoryNameTaken(n, cat.kind, id)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("debt_categories")
    .update({ name: n }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification."), true); return false; }
  const idx = state.categories.findIndex(c => c.id === id);
  if (idx >= 0) state.categories[idx] = data;
  flash("Catégorie modifiée.");
  return true;
}

export async function deleteCategory(id) {
  if (!isAdmin) return false;
  const cat = getCategory(id);
  if (!cat) return false;
  if (movementsForCategory(id).length > 0) {
    flash("Impossible : des mouvements existent pour cette catégorie.", true);
    return false;
  }
  const { error } = await supabaseClient.from("debt_categories").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression."), true); return false; }
  state.categories = state.categories.filter(c => c.id !== id);
  flash("Catégorie supprimée.");
  return true;
}

async function insertMovementWithWallet(categoryId, actionType, amount, movementDate, paymentMethod, label) {
  if (!isAdmin) return false;
  const cat = getCategory(categoryId);
  if (!cat) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const date = parseDateInput(movementDate) || toISO(new Date());
  const pm = normalizePaymentMethod(paymentMethod);

  if (cat.kind === "dette") {
    if (!["borrow", "repay"].includes(actionType)) {
      flash("Action invalide pour une dette.", true);
      return false;
    }
    if (actionType === "repay" && amt > categoryBalance(categoryId) + 0.001) {
      flash(`Montant trop élevé : reste ${money(categoryBalance(categoryId))} DH à rendre.`, true);
      return false;
    }
  } else {
    if (!["deposit", "withdraw"].includes(actionType)) {
      flash("Action invalide pour l'épargne.", true);
      return false;
    }
    if (actionType === "withdraw" && amt > categoryBalance(categoryId) + 0.001) {
      flash(`Retrait impossible : épargne ${money(categoryBalance(categoryId))} DH.`, true);
      return false;
    }
  }

  const lbl = (label || "").trim();
  const { data, error } = await supabaseClient.from("debt_movements")
    .insert({
      category_id: categoryId,
      action_type: actionType,
      amount: amt,
      movement_date: date,
      payment_method: pm,
      label: lbl,
    })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur enregistrement."), true); return false; }

  await loadWalletData();
  const { syncDebtLedgerWallet } = await import("../shared/wallet.js");
  if (typeof syncDebtLedgerWallet !== "function") {
    flash("Module trésorerie obsolète : déployez shared/wallet.js à jour.", true);
    await supabaseClient.from("debt_movements").delete().eq("id", data.id);
    return false;
  }
  const walletOk = await syncDebtLedgerWallet(data, cat.name);
  if (!walletOk) {
    await supabaseClient.from("debt_movements").delete().eq("id", data.id);
    return false;
  }

  state.movements.unshift(data);
  await loadWalletData();
  flash(`${ACTION_LABELS[actionType] || "Mouvement"} enregistré.`);
  return true;
}

export async function recordBorrow(categoryId, amount, movementDate, paymentMethod, label) {
  return insertMovementWithWallet(categoryId, "borrow", amount, movementDate, paymentMethod, label);
}

export async function recordRepay(categoryId, amount, movementDate, paymentMethod, label) {
  return insertMovementWithWallet(categoryId, "repay", amount, movementDate, paymentMethod, label);
}

export async function recordDeposit(categoryId, amount, movementDate, paymentMethod, label) {
  return insertMovementWithWallet(categoryId, "deposit", amount, movementDate, paymentMethod, label);
}

export async function recordWithdraw(categoryId, amount, movementDate, paymentMethod, label) {
  return insertMovementWithWallet(categoryId, "withdraw", amount, movementDate, paymentMethod, label);
}
