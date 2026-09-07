import { flash } from "./utils.js";

const MODULE_META = {
  maison: { title: "Gestion achats maison", maisonControls: true },
  maladie: { title: "Dossier maladie", maisonControls: false },
  eau: { title: "Eau & Électricité", maisonControls: false },
};

const LOADERS = {
  maison: () => import("../maison/boot.js"),
  maladie: () => import("../maladie/boot.js"),
  eau: () => import("../eau/boot.js"),
};

let activeModule = null;
let activeBoot = null;

export function getActiveModule() {
  return activeModule;
}

export function getStoredModule() {
  return sessionStorage.getItem("ezz-module") || "maison";
}

function updateNavUI(id) {
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.module === id);
  });
}

function updateHeaderUI(id) {
  const meta = MODULE_META[id] || MODULE_META.maison;
  document.getElementById("header-title").textContent = meta.title;
  const controls = document.getElementById("maison-controls");
  if (controls) controls.style.display = meta.maisonControls ? "flex" : "none";
  document.body.classList.remove("module-maison", "module-maladie", "module-eau");
  document.body.classList.add("module-" + id);
}

export async function switchModule(id) {
  if (!LOADERS[id]) return;
  if (activeModule === id && activeBoot) {
    activeBoot.render();
    return;
  }

  const main = document.getElementById("main");
  main.classList.add("is-switching");

  if (activeBoot?.deactivate) activeBoot.deactivate();

  activeModule = id;
  sessionStorage.setItem("ezz-module", id);
  updateNavUI(id);
  updateHeaderUI(id);

  const mod = await LOADERS[id]();
  activeBoot = mod;
  await mod.activate();
  requestAnimationFrame(() => main.classList.remove("is-switching"));
}

export function initNav() {
  const nav = document.getElementById("bottom-nav");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-module]");
    if (!btn || btn.classList.contains("disabled")) return;
    switchModule(btn.dataset.module);
  });
}

export async function bootActiveModule() {
  await switchModule(getStoredModule());
}
