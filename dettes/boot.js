import { fetchStateFromSupabase, ui } from "./data.js";
import { loadWalletData } from "../shared/wallet.js";
import { render } from "./render.js";
import { setupEvents } from "./events.js";

let eventsReady = false;
let dataLoaded = false;

export function deactivate() {
  ui.modal = null;
}

export function resetModule() {
  dataLoaded = false;
}

export async function activate() {
  if (!eventsReady) {
    setupEvents();
    eventsReady = true;
  }
  if (!dataLoaded) {
    await fetchStateFromSupabase();
    dataLoaded = true;
  } else {
    await loadWalletData();
    await fetchStateFromSupabase();
  }
  render();
}

export { render };
