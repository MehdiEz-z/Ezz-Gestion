import { supabaseClient } from "../shared/supabase.js";
import { isAdmin } from "../shared/auth.js";
import { flash, getErrorMessage, money } from "../shared/utils.js";

const STATS_SCOPE = "global";

export let state = {
  categories: [],
  stats: { total_borrowed_dette: 0, total_repaid_dette: 0 },
};

export const ui = {
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = {
    categories: [],
    stats: { total_borrowed_dette: 0, total_repaid_dette: 0 },
  };
  ui.expanded.clear();
  ui.modal = null;
}

export async function fetchStateFromSupabase() {
  const [cats, stats] = await Promise.all([
    supabaseClient.from("debt_categories").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("debt_stats").select("*").eq("scope", STATS_SCOPE).maybeSingle(),
  ]);
  if (cats.error) {
    flash(getErrorMessage(cats.error, "Erreur chargement dettes. Exécutez supabase/dettes.sql."), true);
    state.categories = [];
  } else {
    state.categories = cats.data || [];
  }
  if (stats.error) {
    flash(getErrorMessage(stats.error, "Erreur chargement stats dettes."), true);
    state.stats = { total_borrowed_dette: 0, total_repaid_dette: 0 };
  } else if (stats.data) {
    state.stats = {
      total_borrowed_dette: Number(stats.data.total_borrowed_dette) || 0,
      total_repaid_dette: Number(stats.data.total_repaid_dette) || 0,
    };
  }
}

export function getCategoriesByKind(kind) {
  return state.categories
    .filter(c => c.kind === kind)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function getCategory(id) {
  return state.categories.find(c => c.id === id) || null;
}

export function categoryBalance(categoryId) {
  const cat = getCategory(categoryId);
  return cat ? Number(cat.balance) || 0 : 0;
}

export function totalBalanceByKind(kind) {
  return getCategoriesByKind(kind).reduce((s, c) => s + Number(c.balance), 0);
}

export function summarySnapshot() {
  const totalARendre = totalBalanceByKind("dette");
  const totalRendu = state.stats.total_repaid_dette;
  const totalEmprunte = state.stats.total_borrowed_dette;
  return {
    totalARendre,
    totalRendu,
    totalEmprunte,
    totalEpargne: totalBalanceByKind("epargne"),
  };
}

function categoryNameTaken(name, kind) {
  const key = name.trim().toLowerCase();
  return state.categories.some(c => c.kind === kind && c.name.toLowerCase() === key);
}

async function updateStats(updates) {
  const now = new Date().toISOString();
  const row = {
    scope: STATS_SCOPE,
    total_borrowed_dette: updates.total_borrowed_dette ?? state.stats.total_borrowed_dette,
    total_repaid_dette: updates.total_repaid_dette ?? state.stats.total_repaid_dette,
    updated_at: now,
  };
  const { error } = await supabaseClient.from("debt_stats")
    .upsert(row, { onConflict: "scope" });
  if (error) {
    flash(getErrorMessage(error, "Erreur mise à jour stats."), true);
    return false;
  }
  state.stats.total_borrowed_dette = row.total_borrowed_dette;
  state.stats.total_repaid_dette = row.total_repaid_dette;
  return true;
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
    .insert({ name: n, kind, balance: 0 })
    .select()
    .single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return false; }
  state.categories.push(data);
  flash("Catégorie ajoutée.");
  return true;
}

/**
 * @param {"in"|"out"} sign — in: emprunt / versement, out: remboursement / retrait
 */
export async function applyCategoryAmount(categoryId, sign, amount) {
  if (!isAdmin) return false;
  const cat = getCategory(categoryId);
  if (!cat) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    flash("Montant invalide.", true);
    return false;
  }
  const balance = Number(cat.balance);
  const now = new Date().toISOString();

  if (sign === "in") {
    const newBalance = balance + amt;
    const { data, error } = await supabaseClient.from("debt_categories")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", categoryId)
      .select()
      .single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement."), true); return false; }
    const idx = state.categories.findIndex(c => c.id === categoryId);
    if (idx >= 0) state.categories[idx] = data;

    if (cat.kind === "dette") {
      const ok = await updateStats({
        total_borrowed_dette: state.stats.total_borrowed_dette + amt,
      });
      if (!ok) return false;
    }
    flash(cat.kind === "dette" ? "Emprunt enregistré." : "Versement enregistré.");
    return true;
  }

  if (amt > balance + 0.001) {
    const msg = cat.kind === "dette"
      ? `Le montant dépasse le reste à rendre (${money(balance)} DH).`
      : `Le montant dépasse l'épargne disponible (${money(balance)} DH).`;
    flash(msg, true);
    return false;
  }

  const newBalance = balance - amt;
  if (newBalance <= 0.001) {
    const { error } = await supabaseClient.from("debt_categories").delete().eq("id", categoryId);
    if (error) { flash(getErrorMessage(error, "Erreur suppression catégorie."), true); return false; }
    state.categories = state.categories.filter(c => c.id !== categoryId);
  } else {
    const { data, error } = await supabaseClient.from("debt_categories")
      .update({ balance: newBalance, updated_at: now })
      .eq("id", categoryId)
      .select()
      .single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement."), true); return false; }
    const idx = state.categories.findIndex(c => c.id === categoryId);
    if (idx >= 0) state.categories[idx] = data;
  }

  if (cat.kind === "dette") {
    const ok = await updateStats({
      total_repaid_dette: state.stats.total_repaid_dette + amt,
    });
    if (!ok) return false;
  }
  flash(cat.kind === "dette" ? "Remboursement enregistré." : "Retrait enregistré.");
  return true;
}
