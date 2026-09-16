import {
  loadWalletData, getUserWalletCategories, getWalletCategoriesByDirection,
  monthSummary, hasOpeningBalance, hasSalary,
  setOpeningBalance, setSalary,
  addManualExpense, addManualRevenue, updateManualMovement, deleteManualMovement,
  addWalletCategory, updateWalletCategory,
  SOURCE_LABELS, SYSTEM_EXPENSE_TYPES, SYSTEM_REVENUE_TYPES,
  movementsForSystemType, totalForSystemType,
  manualMovementsForCategory, totalForManualCategory,
  saisieDepenseTotal, saisieRevenueTotal, isManualMovementEditable,
} from "../shared/wallet.js";
import { TRESORERIE_START_MONTH } from "../shared/utils.js";

export let state = { loaded: false };

export const ui = {
  subTab: "synthese",
  viewedMonthKey: null,
  monthPanelOpen: false,
  expanded: new Set(),
  modal: null,
  /** @type {Record<string, string[]>} */
  saisiePinned: {},
};

export function resetState() {
  state = { loaded: false };
  ui.saisiePinned = {};
}

export async function fetchStateFromSupabase() {
  await loadWalletData();
  state.loaded = true;
}

function saisiePinKey(monthKey, direction) {
  return `${monthKey}:${direction}`;
}

export function isSaisieCategoryPinned(monthKey, direction, categoryId) {
  return (ui.saisiePinned[saisiePinKey(monthKey, direction)] || []).includes(categoryId);
}

export function pinSaisieCategory(monthKey, direction, categoryId) {
  const key = saisiePinKey(monthKey, direction);
  if (!ui.saisiePinned[key]) ui.saisiePinned[key] = [];
  if (!ui.saisiePinned[key].includes(categoryId)) ui.saisiePinned[key].push(categoryId);
}

export function unpinSaisieCategory(monthKey, direction, categoryId) {
  const key = saisiePinKey(monthKey, direction);
  ui.saisiePinned[key] = (ui.saisiePinned[key] || []).filter(id => id !== categoryId);
}

export function isCategoryActiveInSaisie(cat, monthKey, direction) {
  return totalForManualCategory(monthKey, cat.id) > 0
    || isSaisieCategoryPinned(monthKey, direction, cat.id);
}

export function getAvailableSaisieCategories(monthKey, direction) {
  return getWalletCategoriesByDirection(direction)
    .filter(c => !isCategoryActiveInSaisie(c, monthKey, direction));
}

/** @returns {{ kind: "system", sourceType: string, name: string, total: number }[]} */
export function getSaisieSystemRows(monthKey, direction) {
  const types = direction === "depense" ? SYSTEM_EXPENSE_TYPES : SYSTEM_REVENUE_TYPES;
  return types
    .map(sourceType => ({
      kind: "system",
      sourceType,
      name: SOURCE_LABELS[sourceType] || sourceType,
      total: totalForSystemType(monthKey, sourceType),
    }))
    .filter(r => r.total > 0);
}

/** @returns {{ kind: "manual", categoryId: string, name: string, total: number }[]} */
export function getSaisieManualRows(monthKey, direction) {
  return getWalletCategoriesByDirection(direction)
    .filter(c => isCategoryActiveInSaisie(c, monthKey, direction))
    .map(c => ({
      kind: "manual",
      categoryId: c.id,
      name: c.name,
      total: totalForManualCategory(monthKey, c.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function getSaisieDisplayRows(monthKey, direction) {
  return [...getSaisieSystemRows(monthKey, direction), ...getSaisieManualRows(monthKey, direction)];
}

export {
  setOpeningBalance, setSalary,
  addManualExpense, addManualRevenue, updateManualMovement, deleteManualMovement,
  addWalletCategory, updateWalletCategory,
  monthSummary, hasOpeningBalance, hasSalary,
  getUserWalletCategories, getWalletCategoriesByDirection,
  movementsForSystemType, manualMovementsForCategory,
  saisieDepenseTotal, saisieRevenueTotal, isManualMovementEditable,
  SOURCE_LABELS,
};

export { TRESORERIE_START_MONTH };
