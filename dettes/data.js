import { supabaseClient } from "../shared/supabase.js";
import { isAdmin } from "../shared/auth.js";
import { flash, getErrorMessage, money } from "../shared/utils.js";

const SYNTHESE_CLE = "global";

export let state = {
  categories: [],
  synthese: { cumul_emprunts: 0, cumul_remboursements: 0 },
};

export const ui = {
  subTab: "dette",
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = {
    categories: [],
    synthese: { cumul_emprunts: 0, cumul_remboursements: 0 },
  };
  ui.expanded.clear();
  ui.modal = null;
}

export async function fetchStateFromSupabase() {
  const [cats, synthese] = await Promise.all([
    supabaseClient.from("dette_categorie").select("*").order("date_creation", { ascending: true }),
    supabaseClient.from("dette_synthese_globale").select("*").eq("cle", SYNTHESE_CLE).maybeSingle(),
  ]);
  if (cats.error) {
    flash(getErrorMessage(cats.error, "Erreur chargement dettes. Exécutez supabase/dettes.sql."), true);
    state.categories = [];
  } else {
    state.categories = cats.data || [];
  }
  if (synthese.error) {
    flash(getErrorMessage(synthese.error, "Erreur chargement synthèse dettes."), true);
    state.synthese = { cumul_emprunts: 0, cumul_remboursements: 0 };
  } else if (synthese.data) {
    state.synthese = {
      cumul_emprunts: Number(synthese.data.cumul_emprunts) || 0,
      cumul_remboursements: Number(synthese.data.cumul_remboursements) || 0,
    };
  }
}

/** @param {"dette"|"epargne"} typeBloc */
export function getCategoriesByKind(typeBloc) {
  return state.categories
    .filter(c => c.type_bloc === typeBloc)
    .sort((a, b) => new Date(a.date_creation) - new Date(b.date_creation));
}

export function getCategory(id) {
  return state.categories.find(c => c.id === id) || null;
}

export function categoryBalance(categoryId) {
  const cat = getCategory(categoryId);
  return cat ? Number(cat.solde) || 0 : 0;
}

/** @param {"dette"|"epargne"} typeBloc */
export function totalBalanceByKind(typeBloc) {
  return getCategoriesByKind(typeBloc).reduce((s, c) => s + Number(c.solde), 0);
}

export function summarySnapshot() {
  const totalARendre = totalBalanceByKind("dette");
  const totalRendu = state.synthese.cumul_remboursements;
  const totalEmprunte = state.synthese.cumul_emprunts;
  return {
    totalARendre,
    totalRendu,
    totalEmprunte,
    totalEpargne: totalBalanceByKind("epargne"),
  };
}

function categoryNameTaken(nom, typeBloc) {
  const key = nom.trim().toLowerCase();
  return state.categories.some(c => c.type_bloc === typeBloc && c.nom.toLowerCase() === key);
}

async function updateSynthese(updates) {
  const now = new Date().toISOString();
  const row = {
    cle: SYNTHESE_CLE,
    cumul_emprunts: updates.cumul_emprunts ?? state.synthese.cumul_emprunts,
    cumul_remboursements: updates.cumul_remboursements ?? state.synthese.cumul_remboursements,
    date_modification: now,
  };
  const { error } = await supabaseClient.from("dette_synthese_globale")
    .upsert(row, { onConflict: "cle" });
  if (error) {
    flash(getErrorMessage(error, "Erreur mise à jour synthèse."), true);
    return false;
  }
  state.synthese.cumul_emprunts = row.cumul_emprunts;
  state.synthese.cumul_remboursements = row.cumul_remboursements;
  return true;
}

export async function addCategory(nom, typeBloc) {
  if (!isAdmin) return false;
  const n = nom.trim();
  if (!n) { flash("Le nom est obligatoire.", true); return false; }
  if (!["dette", "epargne"].includes(typeBloc)) { flash("Type invalide.", true); return false; }
  if (categoryNameTaken(n, typeBloc)) {
    flash("Cette catégorie existe déjà.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("dette_categorie")
    .insert({ nom: n, type_bloc: typeBloc, solde: 0 })
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
  const solde = Number(cat.solde);
  const now = new Date().toISOString();

  if (sign === "in") {
    const newSolde = solde + amt;
    const { data, error } = await supabaseClient.from("dette_categorie")
      .update({ solde: newSolde, date_modification: now })
      .eq("id", categoryId)
      .select()
      .single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement."), true); return false; }
    const idx = state.categories.findIndex(c => c.id === categoryId);
    if (idx >= 0) state.categories[idx] = data;

    if (cat.type_bloc === "dette") {
      const ok = await updateSynthese({
        cumul_emprunts: state.synthese.cumul_emprunts + amt,
      });
      if (!ok) return false;
    }
    flash(cat.type_bloc === "dette" ? "Emprunt enregistré." : "Versement enregistré.");
    return true;
  }

  if (amt > solde + 0.001) {
    const msg = cat.type_bloc === "dette"
      ? `Le montant dépasse le reste à rendre (${money(solde)} DH).`
      : `Le montant dépasse l'épargne disponible (${money(solde)} DH).`;
    flash(msg, true);
    return false;
  }

  const newSolde = solde - amt;
  if (newSolde <= 0.001) {
    const { error } = await supabaseClient.from("dette_categorie").delete().eq("id", categoryId);
    if (error) { flash(getErrorMessage(error, "Erreur suppression catégorie."), true); return false; }
    state.categories = state.categories.filter(c => c.id !== categoryId);
  } else {
    const { data, error } = await supabaseClient.from("dette_categorie")
      .update({ solde: newSolde, date_modification: now })
      .eq("id", categoryId)
      .select()
      .single();
    if (error) { flash(getErrorMessage(error, "Erreur enregistrement."), true); return false; }
    const idx = state.categories.findIndex(c => c.id === categoryId);
    if (idx >= 0) state.categories[idx] = data;
  }

  if (cat.type_bloc === "dette") {
    const ok = await updateSynthese({
      cumul_remboursements: state.synthese.cumul_remboursements + amt,
    });
    if (!ok) return false;
  }
  flash(cat.type_bloc === "dette" ? "Remboursement enregistré." : "Retrait enregistré.");
  return true;
}
