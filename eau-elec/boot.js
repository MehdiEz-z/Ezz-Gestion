export function deactivate() {}

export async function activate() {
  document.getElementById("subtabs").innerHTML = "";
  document.getElementById("main").innerHTML = "";
  document.getElementById("modal-root").innerHTML = "";
}

export function render() {}
