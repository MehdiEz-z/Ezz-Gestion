import { supabaseClient } from "../shared/supabase.js";
import { isAdmin } from "../shared/auth.js";
import { loadWalletData, normalizePaymentMethod, PAYMENT_ESPECES } from "../shared/wallet.js";
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
  borrow: "Emprunt",
  repay: "Remboursement",
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

export function getMovement(id) {
  return state.movements.find(m => m.id === id) || null;
}

/** Remboursements / retraits liés à un emprunt ou versement. */
export function linkedOutbounds(inboundId) {
  const inbound = getMovement(inboundId);
  if (!inbound) return [];
  const outbound = inbound.action_type === "borrow" ? "repay"
    : inbound.action_type === "deposit" ? "withdraw" : null;
  if (!outbound) return [];
  return state.movements
    .filter(m => m.category_id === inbound.category_id
      && m.action_type === outbound
      && m.linked_inbound_id === inboundId)
    .sort((a, b) => (a.movement_date < b.movement_date ? -1 : 1));
}

/**
 * Lignes remboursement/retrait à afficher sous un emprunt (liens explicites ou FIFO sans lien).
 * @returns {{ movement: object, amount: number }[]}
 */
export function inboundAppliedOutboundsForDisplay(inboundId) {
  const linked = linkedOutbounds(inboundId);
  if (linked.length > 0) {
    return linked.map(m => ({ movement: m, amount: Number(m.amount) }));
  }

  const mov = getMovement(inboundId);
  if (!mov) return [];
  const cat = getCategory(mov.category_id);
  if (!cat) return [];
  const inboundType = cat.kind === "dette" ? "borrow" : "deposit";
  const outbound = cat.kind === "dette" ? "repay" : "withdraw";
  if (mov.action_type !== inboundType) return [];

  const unlinkedRepays = movementsForCategory(mov.category_id)
    .filter(m => m.action_type === outbound && !m.linked_inbound_id)
    .sort((a, b) => (a.movement_date < b.movement_date ? -1 : 1));
  if (unlinkedRepays.length === 0) return [];

  let repayIdx = 0;
  let repayLeftOnCurrent = Number(unlinkedRepays[0].amount);
  const slices = [];
  const chron = movementsForCategory(mov.category_id).slice().reverse();

  for (const m of chron) {
    if (m.action_type !== inboundType) continue;
    if (linkedOutbounds(m.id).length > 0) continue;

    let cap = Number(m.amount);
    while (cap > 0.001 && repayIdx < unlinkedRepays.length) {
      const take = Math.min(cap, repayLeftOnCurrent);
      if (m.id === inboundId && take > 0.001) {
        slices.push({ movement: unlinkedRepays[repayIdx], amount: take });
      }
      cap -= take;
      repayLeftOnCurrent -= take;
      if (repayLeftOnCurrent <= 0.001) {
        repayIdx += 1;
        repayLeftOnCurrent = repayIdx < unlinkedRepays.length
          ? Number(unlinkedRepays[repayIdx].amount)
          : 0;
      }
    }
  }

  const merged = new Map();
  for (const s of slices) {
    merged.set(s.movement.id, (merged.get(s.movement.id) || 0) + s.amount);
  }
  return [...merged.entries()]
    .map(([id, amount]) => ({ movement: getMovement(id), amount }))
    .filter(x => x.movement && amount > 0.001);
}

/** Lignes affichées dans le détail (emprunts / versements seulement). */
export function detailInboundMovements(categoryId) {
  const cat = getCategory(categoryId);
  if (!cat) return [];
  const inbound = cat.kind === "dette" ? "borrow" : "deposit";
  return movementsForCategory(categoryId).filter(m => m.action_type === inbound);
}

/** Reste non remboursé sur un emprunt/versement (liens explicites, sinon FIFO legacy). */
export function inboundRemainingAmount(movementId) {
  const mov = getMovement(movementId);
  if (!mov) return 0;
  const cat = getCategory(mov.category_id);
  if (!cat) return 0;
  const inbound = cat.kind === "dette" ? "borrow" : "deposit";
  const outbound = cat.kind === "dette" ? "repay" : "withdraw";
  if (mov.action_type !== inbound) return 0;

  const linked = linkedOutbounds(movementId);
  if (linked.length > 0) {
    const paid = linked.reduce((s, m) => s + Number(m.amount), 0);
    return Math.max(0, Number(mov.amount) - paid);
  }

  let outboundLeft = movementsForCategory(mov.category_id)
    .filter(m => m.action_type === outbound && !m.linked_inbound_id)
    .reduce((s, m) => s + Number(m.amount), 0);
  const chron = movementsForCategory(mov.category_id).slice().reverse();
  for (const m of chron) {
    if (m.action_type === inbound) {
      const amt = Number(m.amount);
      const applied = Math.min(amt, outboundLeft);
      outboundLeft -= applied;
      if (m.id === movementId) return Math.max(0, amt - applied);
    }
  }
  return Number(mov.amount);
}

export function isInboundBlockReadOnly(inboundId) {
  return inboundRemainingAmount(inboundId) <= 0.001;
}

/** Remboursement / retrait éditable dans le bloc d'un emprunt ou versement. */
export function isOutboundEditableInInboundBlock(outboundMov, inboundId) {
  if (!outboundMov || isInboundBlockReadOnly(inboundId)) return false;
  const inbound = getMovement(inboundId);
  if (!inbound) return false;
  const outbound = inbound.action_type === "borrow" ? "repay"
    : inbound.action_type === "deposit" ? "withdraw" : null;
  if (outboundMov.action_type !== outbound) return false;
  if (outboundMov.linked_inbound_id) {
    return outboundMov.linked_inbound_id === inboundId;
  }
  return inboundAppliedOutboundsForDisplay(inboundId)
    .some(r => r.movement.id === outboundMov.id);
}

/** Prise/versement sans retour ; remboursement/retrait tant que le bloc n'est pas soldé. */
export function isDebtMovementEditable(m) {
  if (!m) return false;
  if (m.action_type === "borrow" || m.action_type === "deposit") {
    return inboundAppliedOutboundsForDisplay(m.id).length === 0;
  }
  if (m.action_type === "repay" || m.action_type === "withdraw") {
    if (m.linked_inbound_id) {
      return !isInboundBlockReadOnly(m.linked_inbound_id);
    }
    const cat = getCategory(m.category_id);
    if (!cat) return false;
    const inboundType = cat.kind === "dette" ? "borrow" : "deposit";
    return movementsForCategory(m.category_id)
      .filter(x => x.action_type === inboundType)
      .some(inb => !isInboundBlockReadOnly(inb.id)
        && inboundAppliedOutboundsForDisplay(inb.id).some(r => r.movement.id === m.id));
  }
  return false;
}

async function resyncWalletForEntry(entry, categoryName) {
  const { syncDebtLedgerWallet, removeDebtLedgerWallet } = await import("../shared/wallet.js");
  await removeDebtLedgerWallet(entry.id);
  await loadWalletData();
  return syncDebtLedgerWallet(entry, categoryName);
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

async function insertMovementWithWallet(categoryId, actionType, amount, paymentMethod, label, linkedInboundId = null) {
  if (!isAdmin) return false;
  const cat = getCategory(categoryId);
  if (!cat) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }
  const date = toISO(new Date());
  let pm = normalizePaymentMethod(paymentMethod);
  if (actionType === "withdraw") pm = PAYMENT_ESPECES;

  if (cat.kind === "dette") {
    if (!["borrow", "repay"].includes(actionType)) {
      flash("Action invalide pour une dette.", true);
      return false;
    }
    if (actionType === "repay" && amt > categoryBalance(categoryId) + 0.001) {
      flash(`Montant trop élevé : reste ${money(categoryBalance(categoryId))} DH à rendre.`, true);
      return false;
    }
    if (actionType === "repay" && linkedInboundId) {
      const rem = inboundRemainingAmount(linkedInboundId);
      if (amt > rem + 0.001) {
        flash(`Montant trop élevé : reste ${money(rem)} DH sur cet emprunt.`, true);
        return false;
      }
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
    if (actionType === "withdraw" && linkedInboundId) {
      const rem = inboundRemainingAmount(linkedInboundId);
      if (amt > rem + 0.001) {
        flash(`Montant trop élevé : reste ${money(rem)} DH sur ce versement.`, true);
        return false;
      }
    }
  }

  if (linkedInboundId) {
    const parent = getMovement(linkedInboundId);
    if (!parent || parent.category_id !== categoryId) {
      flash("Emprunt ou versement lié invalide.", true);
      return false;
    }
  }

  const lbl = (label || "").trim();
  const row = {
    category_id: categoryId,
    action_type: actionType,
    amount: amt,
    movement_date: date,
    payment_method: pm,
    label: lbl,
  };
  if (linkedInboundId) row.linked_inbound_id = linkedInboundId;

  const { data, error } = await supabaseClient.from("debt_movements")
    .insert(row)
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

export async function updateDebtMovement(id, amount, paymentMethod, label) {
  if (!isAdmin) return false;
  const mov = getMovement(id);
  if (!mov || !isDebtMovementEditable(mov)) {
    flash("Mouvement non modifiable.", true);
    return false;
  }
  const cat = getCategory(mov.category_id);
  if (!cat) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { flash("Montant invalide.", true); return false; }

  if (mov.action_type === "repay" || mov.action_type === "withdraw") {
    const oldAmt = Number(mov.amount);
    if (mov.linked_inbound_id) {
      const rem = inboundRemainingAmount(mov.linked_inbound_id);
      const maxOnInbound = rem + oldAmt;
      if (amt > maxOnInbound + 0.001) {
        flash(`Montant trop élevé : max ${money(maxOnInbound)} DH sur cet emprunt.`, true);
        return false;
      }
    }
    if (mov.action_type === "repay") {
      const maxCat = categoryBalance(mov.category_id) + oldAmt;
      if (amt > maxCat + 0.001) {
        flash(`Montant trop élevé : max ${money(maxCat)} DH pour cette catégorie.`, true);
        return false;
      }
    } else if (mov.action_type === "withdraw") {
      const cat = getCategory(mov.category_id);
      if (cat) {
        const maxCat = categoryBalance(mov.category_id) + oldAmt;
        if (amt > maxCat + 0.001) {
          flash(`Montant trop élevé : max ${money(maxCat)} DH.`, true);
          return false;
        }
      }
    }
  } else {
    const rem = inboundRemainingAmount(id);
    const minAllowed = Number(mov.amount) - rem;
    if (amt < minAllowed - 0.001) {
      flash(`Montant minimum : ${money(minAllowed)} DH (déjà rendu).`, true);
      return false;
    }
  }

  let pm = normalizePaymentMethod(paymentMethod);
  if (mov.action_type === "withdraw") pm = PAYMENT_ESPECES;
  const lbl = (label || "").trim();
  const { data, error } = await supabaseClient.from("debt_movements")
    .update({ amount: amt, payment_method: pm, label: lbl })
    .eq("id", id)
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur modification."), true); return false; }
  const walletOk = await resyncWalletForEntry(data, cat.name);
  if (!walletOk) {
    await supabaseClient.from("debt_movements").update({
      amount: mov.amount,
      payment_method: mov.payment_method,
      label: mov.label,
    }).eq("id", id);
    return false;
  }
  const idx = state.movements.findIndex(m => m.id === id);
  if (idx >= 0) state.movements[idx] = data;
  await loadWalletData();
  flash("Mouvement modifié.");
  return true;
}

export async function deleteDebtMovement(id) {
  if (!isAdmin) return false;
  const mov = getMovement(id);
  if (!mov || !isDebtMovementEditable(mov)) {
    flash("Mouvement non supprimable.", true);
    return false;
  }
  if (mov.action_type === "borrow" || mov.action_type === "deposit") {
    if (inboundAppliedOutboundsForDisplay(id).length > 0) {
      flash("Supprime d'abord les remboursements ou retraits liés.", true);
      return false;
    }
  }
  const { removeDebtLedgerWallet } = await import("../shared/wallet.js");
  await removeDebtLedgerWallet(id);
  const { error } = await supabaseClient.from("debt_movements").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur suppression."), true); return false; }
  state.movements = state.movements.filter(m => m.id !== id);
  await loadWalletData();
  flash("Mouvement supprimé.");
  return true;
}

export async function recordBorrow(categoryId, amount, paymentMethod, label) {
  return insertMovementWithWallet(categoryId, "borrow", amount, paymentMethod, label);
}

export async function recordRepay(categoryId, amount, paymentMethod, label, linkedInboundId = null) {
  return insertMovementWithWallet(categoryId, "repay", amount, paymentMethod, label, linkedInboundId);
}

export async function recordDeposit(categoryId, amount, paymentMethod, label) {
  return insertMovementWithWallet(categoryId, "deposit", amount, paymentMethod, label);
}

export async function recordWithdraw(categoryId, amount, paymentMethod, label, linkedInboundId = null) {
  return insertMovementWithWallet(categoryId, "withdraw", amount, paymentMethod, label, linkedInboundId);
}
