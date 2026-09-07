export function deactivate() {}

export async function activate() {
  document.getElementById("subtabs").innerHTML = "";
  document.getElementById("main").innerHTML = `
    <div class="stack">
      <div class="card" style="text-align:center;padding:32px 16px">
        <div style="font-size:40px;margin-bottom:12px">⚡</div>
        <div class="card-title">Eau &amp; Électricité</div>
        <p class="small-label" style="margin-top:8px">Module en cours de développement.</p>
      </div>
    </div>`;
  document.getElementById("modal-root").innerHTML = "";
}

export function render() {}
