import {
  loadWalletData, getUserWalletCategories, monthSummary, hasOpeningBalance, hasSalary,
  setOpeningBalance, setSalary, addManualExpense,
  addWalletCategory, deleteWalletCategory,
} from "../shared/wallet.js";
import { TRESORERIE_START_MONTH } from "../shared/utils.js";
import { isAdmin } from "../shared/auth.js";

export let state = { loaded: false };

export const ui = {
  subTab: "synthese",
  viewedMonthKey: null,
  monthPanelOpen: false,
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = { loaded: false };
}

export async function fetchStateFromSupabase() {
  await loadWalletData();
  state.loaded = true;
}

export {
  setOpeningBalance, setSalary, addManualExpense,
  addWalletCategory, deleteWalletCategory,
  monthSummary, hasOpeningBalance, hasSalary,
  getUserWalletCategories,
};

export { TRESORERIE_START_MONTH };
