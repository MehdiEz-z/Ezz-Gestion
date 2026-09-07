import { supabaseClient } from "../shared/supabase.js";
import { isAdmin, currentUser } from "../shared/auth.js";
import { flash, getErrorMessage, normalizeName, toISO, getWeekStart, activeMonthKey, money } from "../shared/utils.js";

export let state = { categories: [], places: [], purchases: [], monthlyBudgets: {}, weeklyBudgets: {} };

export const ui = {
  subTab: "budget",
  viewedMonthKey: null,
  monthPanelOpen: false,
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = { categories: [], places: [], purchases: [], monthlyBudgets: {}, weeklyBudgets: {} };
}

export async function fetchStateFromSupabase() {
  if (!currentUser) return;
  const [cats, places, purch, mBudgets, wBudgets] = await Promise.all([
    supabaseClient.from("categories").select("*"),
    supabaseClient.from("places").select("*"),
    supabaseClient.from("purchases").select("*").order("date", { ascending: false }),
    supabaseClient.from("monthly_budgets").select("*"),
    supabaseClient.from("weekly_budgets").select("*"),
  ]);

  if (cats.error) { flash(getErrorMessage(cats.error, "Erreur chargement catégories."), true); return; }
  if (places.error) { flash(getErrorMessage(places.error, "Erreur chargement lieux."), true); return; }
  if (purch.error) { flash(getErrorMessage(purch.error, "Erreur chargement achats."), true); return; }

  state.categories = cats.data || [];
  state.places = places.data || [];
  state.purchases = purch.data || [];
  state.monthlyBudgets = {};
  if (mBudgets.data) mBudgets.data.forEach(b => { state.monthlyBudgets[b.month_key] = b.amount; });
  state.weeklyBudgets = {};
  if (wBudgets.data) wBudgets.data.forEach(b => { state.weeklyBudgets[b.week_start] = b.amount; });
}

export function categoryTotalForMonth(categoryId, type, monthKey) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date.slice(0, 7) === monthKey)
    .reduce((s, p) => s + Number(p.price), 0);
}

export function categoryTotalForWeek(categoryId, type, isoWs, isoWe) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date >= isoWs && p.date <= isoWe)
    .reduce((s, p) => s + Number(p.price), 0);
}

export function purchasesForMonth(categoryId, type, monthKey) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date.slice(0, 7) === monthKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function purchasesForWeek(categoryId, type, isoWs, isoWe) {
  return state.purchases
    .filter(p => p.category_id === categoryId && p.type === type && p.date >= isoWs && p.date <= isoWe)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function monthSpentTotal(monthKey) {
  return state.categories
    .filter(c => c.type === "mensuel")
    .reduce((s, c) => s + categoryTotalForMonth(c.id, "mensuel", monthKey), 0);
}

export function weekSpentTotal(isoWs, isoWe) {
  return state.categories
    .filter(c => c.type === "hebdo")
    .reduce((s, c) => s + categoryTotalForWeek(c.id, "hebdo", isoWs, isoWe), 0);
}

export function categoryHasPurchases(categoryId) {
  return state.purchases.some(p => p.category_id === categoryId);
}

export function placeHasPurchases(placeId) {
  return state.purchases.some(p => p.place_id === placeId);
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

export function categoryNameTaken(name, type, excludeId = null) {
  const key = nameKey(name);
  return state.categories.some(c => c.id !== excludeId && c.name.toLowerCase() === key);
}

export function categoryNameInOtherType(name, type, excludeId = null) {
  const key = nameKey(name);
  return state.categories.some(c => c.id !== excludeId && c.type !== type && c.name.toLowerCase() === key);
}

export function placeNameTaken(name, excludeId = null) {
  const key = nameKey(name);
  return state.places.some(p => p.id !== excludeId && p.name.toLowerCase() === key);
}

export function isPurchaseEditable(purchase) {
  if (purchase.type === "mensuel") return purchase.date.slice(0, 7) === activeMonthKey();
  const ws = toISO(getWeekStart(new Date()));
  const we = toISO(new Date(getWeekStart(new Date()).getTime() + 6 * 86400000));
  return purchase.date >= ws && purchase.date <= we;
}

export async function setMonthBudget(monthKey, amount) {
  if (!isAdmin) return false;
  const consumed = monthSpentTotal(monthKey);
  if (amount < consumed) {
    flash(`Impossible : le budget (${money(amount)} DH) est inférieur au total déjà consommé (${money(consumed)} DH).`, true);
    return false;
  }
  const { error } = await supabaseClient.from("monthly_budgets").upsert({ month_key: monthKey, amount });
  if (error) { flash(getErrorMessage(error, "Erreur lors de la mise à jour du budget mensuel."), true); return false; }
  state.monthlyBudgets[monthKey] = amount;
  flash("Budget mensuel enregistré.");
  return true;
}

export async function setWeekBudget(isoWeekStart, amount) {
  if (!isAdmin) return false;
  const isoWe = toISO(new Date(new Date(isoWeekStart).getTime() + 6 * 86400000));
  const consumed = weekSpentTotal(isoWeekStart, isoWe);
  if (amount < consumed) {
    flash(`Impossible : le budget (${money(amount)} DH) est inférieur au total déjà consommé (${money(consumed)} DH).`, true);
    return false;
  }
  const { error } = await supabaseClient.from("weekly_budgets").upsert({ week_start: isoWeekStart, amount });
  if (error) { flash(getErrorMessage(error, "Erreur lors de la mise à jour du budget hebdo."), true); return false; }
  state.weeklyBudgets[isoWeekStart] = amount;
  flash("Budget hebdo enregistré.");
  return true;
}

export async function addCategory(name, type) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (categoryNameTaken(n, type)) { flash("Cette catégorie existe déjà.", true); return false; }
  if (categoryNameInOtherType(n, type)) { flash("Ce nom existe déjà dans l'autre type (hebdo/mensuel).", true); return false; }
  const { data, error } = await supabaseClient.from("categories").insert({ name: n, type }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'ajout de la catégorie."), true); return false; }
  state.categories.push(data);
  flash("Catégorie ajoutée.");
  return true;
}

export async function updateCategory(id, name, type) {
  if (!isAdmin) return false;
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom de la catégorie est obligatoire.", true); return false; }
  if (categoryNameTaken(n, type, id)) { flash("Cette catégorie existe déjà.", true); return false; }
  if (categoryNameInOtherType(n, type, id)) { flash("Ce nom existe déjà dans l'autre type (hebdo/mensuel).", true); return false; }
  if (type !== cat.type && categoryHasPurchases(id)) {
    flash("Impossible : cette catégorie a déjà des achats. Le type ne peut pas être modifié.", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("categories").update({ name: n, type }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de la modification de la catégorie."), true); return false; }
  const idx = state.categories.findIndex(c => c.id === id);
  if (idx >= 0) state.categories[idx] = data;
  flash("Catégorie modifiée.");
  return true;
}

export async function deleteCategory(id) {
  if (!isAdmin) return false;
  if (categoryHasPurchases(id)) {
    flash("Impossible : des achats sont liés à cette catégorie.", true);
    return false;
  }
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur lors de la suppression de la catégorie."), true); return false; }
  state.categories = state.categories.filter(c => c.id !== id);
  flash("Catégorie supprimée.");
  return true;
}

export async function addPlace(name) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom du lieu est obligatoire.", true); return false; }
  if (placeNameTaken(n)) { flash("Ce lieu existe déjà.", true); return false; }
  const { data, error } = await supabaseClient.from("places").insert({ name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'ajout du lieu."), true); return false; }
  state.places.push(data);
  flash("Lieu ajouté.");
  return true;
}

export async function updatePlace(id, name) {
  if (!isAdmin) return false;
  const n = normalizeName(name);
  if (!n) { flash("Le nom du lieu est obligatoire.", true); return false; }
  if (placeNameTaken(n, id)) { flash("Ce lieu existe déjà.", true); return false; }
  const { data, error } = await supabaseClient.from("places").update({ name: n }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de la modification du lieu."), true); return false; }
  const idx = state.places.findIndex(p => p.id === id);
  if (idx >= 0) state.places[idx] = data;
  flash("Lieu modifié.");
  return true;
}

export async function deletePlace(id) {
  if (!isAdmin) return false;
  if (placeHasPurchases(id)) {
    flash("Impossible : des achats sont liés à ce lieu.", true);
    return false;
  }
  const { error } = await supabaseClient.from("places").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur lors de la suppression du lieu."), true); return false; }
  state.places = state.places.filter(p => p.id !== id);
  flash("Lieu supprimé.");
  return true;
}

export async function addPurchase({ categoryId, type, place_id, price }) {
  if (!isAdmin) return false;
  const date = toISO(new Date());
  const { data, error } = await supabaseClient.from("purchases")
    .insert({ category_id: categoryId, place_id, price, date, type }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de l'enregistrement de l'achat."), true); return false; }
  state.purchases.unshift(data);
  checkBudgetAlert(type, date);
  flash("Achat enregistré.");
  return true;
}

export async function updatePurchase(id, { price, place_id }) {
  if (!isAdmin) return false;
  const purchase = state.purchases.find(p => p.id === id);
  if (!purchase) return false;
  if (!isPurchaseEditable(purchase)) {
    flash("Cet achat ne peut pas être modifié (période passée).", true);
    return false;
  }
  const { data, error } = await supabaseClient.from("purchases")
    .update({ price, place_id }).eq("id", id).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur lors de la modification de l'achat."), true); return false; }
  const idx = state.purchases.findIndex(p => p.id === id);
  if (idx >= 0) state.purchases[idx] = data;
  checkBudgetAlert(data.type, data.date);
  flash("Achat modifié.");
  return true;
}

export async function deletePurchase(id) {
  if (!isAdmin) return false;
  const purchase = state.purchases.find(p => p.id === id);
  if (!purchase) return false;
  if (!isPurchaseEditable(purchase)) {
    flash("Cet achat ne peut pas être supprimé (période passée).", true);
    return false;
  }
  const { error } = await supabaseClient.from("purchases").delete().eq("id", id);
  if (error) { flash(getErrorMessage(error, "Erreur lors de la suppression de l'achat."), true); return false; }
  state.purchases = state.purchases.filter(p => p.id !== id);
  flash("Achat supprimé.");
  return true;
}

function checkBudgetAlert(type, date) {
  if (type === "mensuel") {
    const mk = date.slice(0, 7);
    const budget = Number(state.monthlyBudgets[mk]);
    if (!budget) return;
    if (monthSpentTotal(mk) > budget) flash("Alerte : budget mensuel dépassé !", true);
  } else {
    const ws = toISO(getWeekStart(new Date(date)));
    const budget = Number(state.weeklyBudgets[ws]);
    if (!budget) return;
    const we = toISO(new Date(new Date(ws).getTime() + 6 * 86400000));
    if (weekSpentTotal(ws, we) > budget) flash("Alerte : budget hebdo dépassé !", true);
  }
}
