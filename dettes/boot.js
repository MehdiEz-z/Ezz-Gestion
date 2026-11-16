import { loadSubTab } from "../shared/ui-persist.js";
import { fetchStateFromSupabase, ui } from "./data.js";
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
    await fetchStateFromSupabase();
  }
  ui.subTab = loadSubTab("dettes", ui.subTab);
  if (ui.subTab !== "dette" && ui.subTab !== "epargne") ui.subTab = "dette";
  render();
}

export { render };
