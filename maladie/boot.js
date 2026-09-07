import { ui, fetchStateFromSupabase } from "./data.js";
import { render } from "./render.js";
import { setupEvents } from "./events.js";

let eventsReady = false;

export function deactivate() {
  ui.modal = null;
}

export async function activate() {
  if (!eventsReady) {
    setupEvents();
    eventsReady = true;
  }
  await fetchStateFromSupabase();
  render();
}

export { render };
