import { supabaseClient } from "../shared/supabase.js";
import { isAdmin, currentUser } from "../shared/auth.js";
import { flash, getErrorMessage } from "../shared/utils.js";

export let state = {
  projects: [],
  blocks: [],
  sections: [],
  categories: [],
  lines: [],
};

export const ui = {
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = { projects: [], blocks: [], sections: [], categories: [], lines: [] };
  ui.expanded.clear();
  ui.modal = null;
}

const SQL_HINT = "Exécutez supabase/events.sql dans Supabase.";

export async function fetchStateFromSupabase() {
  if (!currentUser) return;
  const [projects, blocks, sections, categories, lines] = await Promise.all([
    supabaseClient.from("event_projects").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("event_blocks").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("event_sections").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("event_categories").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("event_lines").select("*").order("created_at", { ascending: true }),
  ]);
  if (projects.error) {
    flash(getErrorMessage(projects.error, `Erreur chargement événements. ${SQL_HINT}`), true);
    state.projects = [];
  } else state.projects = projects.data || [];

  if (blocks.error) {
    flash(getErrorMessage(blocks.error, `Erreur chargement sections (event_blocks). ${SQL_HINT}`), true);
    state.blocks = [];
  } else state.blocks = blocks.data || [];

  if (sections.error) {
    flash(getErrorMessage(sections.error, `Erreur chargement sous-sections (event_sections). ${SQL_HINT}`), true);
    state.sections = [];
  } else state.sections = sections.data || [];

  if (categories.error) {
    flash(getErrorMessage(categories.error, `Erreur chargement catégories (event_categories). ${SQL_HINT}`), true);
    state.categories = [];
  } else state.categories = categories.data || [];

  if (lines.error) {
    flash(getErrorMessage(lines.error, `Erreur chargement lignes (event_lines). ${SQL_HINT}`), true);
    state.lines = [];
  } else state.lines = lines.data || [];
}

async function reloadAfterWrite() {
  await fetchStateFromSupabase();
}

export function blocksForProject(projectId) {
  return state.blocks.filter(b => b.project_id === projectId);
}

export function sectionsForBlock(blockId) {
  return state.sections.filter(s => s.block_id === blockId);
}

export function categoriesForSection(sectionId) {
  return state.categories.filter(c => c.section_id === sectionId);
}

export function linesForCategory(categoryId) {
  return state.lines.filter(l => l.category_id === categoryId);
}

export function categoryTotal(categoryId) {
  return linesForCategory(categoryId).reduce((s, l) => s + Number(l.amount), 0);
}

export function sectionTotal(sectionId) {
  return categoriesForSection(sectionId).reduce((s, c) => s + categoryTotal(c.id), 0);
}

export function blockTotal(blockId) {
  return sectionsForBlock(blockId).reduce((s, sec) => s + sectionTotal(sec.id), 0);
}

export function projectTotal(projectId) {
  return blocksForProject(projectId).reduce((s, b) => s + blockTotal(b.id), 0);
}

export async function addProject(name) {
  if (!isAdmin) return null;
  const n = name.trim();
  if (!n) { flash("Nom de l'événement obligatoire.", true); return null; }
  const { data, error } = await supabaseClient.from("event_projects").insert({ name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur création événement."), true); return null; }
  await reloadAfterWrite();
  const created = state.projects.find(p => p.id === data.id) || data;
  flash("Événement créé.");
  return created;
}

export async function updateProject(projectId, name) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Nom obligatoire.", true); return false; }
  const { error } = await supabaseClient.from("event_projects").update({ name: n }).eq("id", projectId);
  if (error) { flash(getErrorMessage(error, "Erreur modification."), true); return false; }
  flash("Événement modifié.");
  await reloadAfterWrite();
  return true;
}

export async function deleteProject(projectId) {
  if (!isAdmin) return false;
  const { error } = await supabaseClient.from("event_projects").delete().eq("id", projectId);
  if (error) { flash(getErrorMessage(error, "Erreur suppression."), true); return false; }
  flash("Événement supprimé.");
  await reloadAfterWrite();
  return true;
}

export async function addBlock(projectId, name) {
  if (!isAdmin) return null;
  const n = name.trim();
  if (!n) { flash("Nom de la section obligatoire.", true); return null; }
  const { data, error } = await supabaseClient.from("event_blocks")
    .insert({ project_id: projectId, name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout section."), true); return null; }
  await reloadAfterWrite();
  const created = state.blocks.find(b => b.id === data.id);
  if (!created) {
    flash(`Section créée mais non retrouvée. ${SQL_HINT}`, true);
    return null;
  }
  flash("Section ajoutée.");
  return created;
}

export async function updateBlock(blockId, name) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Nom obligatoire.", true); return false; }
  const { error } = await supabaseClient.from("event_blocks").update({ name: n }).eq("id", blockId);
  if (error) { flash(getErrorMessage(error, "Erreur modification section."), true); return false; }
  flash("Section modifiée.");
  await reloadAfterWrite();
  return true;
}

export async function deleteBlock(blockId) {
  if (!isAdmin) return false;
  const { error } = await supabaseClient.from("event_blocks").delete().eq("id", blockId);
  if (error) { flash(getErrorMessage(error, "Erreur suppression section."), true); return false; }
  flash("Section supprimée.");
  await reloadAfterWrite();
  return true;
}

export async function addSection(blockId, name) {
  if (!isAdmin) return null;
  const n = name.trim();
  if (!n) { flash("Nom de la sous-section obligatoire.", true); return null; }
  const { data, error } = await supabaseClient.from("event_sections")
    .insert({ block_id: blockId, name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout sous-section."), true); return null; }
  await reloadAfterWrite();
  const created = state.sections.find(s => s.id === data.id);
  if (!created) {
    flash(`Sous-section créée mais non retrouvée. ${SQL_HINT}`, true);
    return null;
  }
  flash("Sous-section ajoutée.");
  return created;
}

export async function updateSection(sectionId, name) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Nom obligatoire.", true); return false; }
  const { error } = await supabaseClient.from("event_sections").update({ name: n }).eq("id", sectionId);
  if (error) { flash(getErrorMessage(error, "Erreur modification sous-section."), true); return false; }
  flash("Sous-section modifiée.");
  await reloadAfterWrite();
  return true;
}

export async function deleteSection(sectionId) {
  if (!isAdmin) return false;
  const { error } = await supabaseClient.from("event_sections").delete().eq("id", sectionId);
  if (error) { flash(getErrorMessage(error, "Erreur suppression sous-section."), true); return false; }
  flash("Sous-section supprimée.");
  await reloadAfterWrite();
  return true;
}

export async function addCategory(sectionId, name) {
  if (!isAdmin) return null;
  const n = name.trim();
  if (!n) { flash("Nom de la catégorie obligatoire.", true); return null; }
  const { data, error } = await supabaseClient.from("event_categories")
    .insert({ section_id: sectionId, name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return null; }
  await reloadAfterWrite();
  const created = state.categories.find(c => c.id === data.id);
  if (!created) {
    flash(`Catégorie créée mais non retrouvée. ${SQL_HINT}`, true);
    return null;
  }
  flash("Catégorie ajoutée.");
  return created;
}

export async function updateCategory(categoryId, name) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Nom obligatoire.", true); return false; }
  const { error } = await supabaseClient.from("event_categories").update({ name: n }).eq("id", categoryId);
  if (error) { flash(getErrorMessage(error, "Erreur modification catégorie."), true); return false; }
  flash("Catégorie modifiée.");
  await reloadAfterWrite();
  return true;
}

export async function deleteCategory(categoryId) {
  if (!isAdmin) return false;
  const { error } = await supabaseClient.from("event_categories").delete().eq("id", categoryId);
  if (error) { flash(getErrorMessage(error, "Erreur suppression catégorie."), true); return false; }
  flash("Catégorie supprimée.");
  await reloadAfterWrite();
  return true;
}

export async function addLine(categoryId, label, amount) {
  if (!isAdmin) return false;
  const lbl = label.trim();
  const amt = Number(amount);
  if (!lbl) { flash("Libellé obligatoire.", true); return false; }
  if (!Number.isFinite(amt) || amt < 0) { flash("Montant invalide.", true); return false; }
  const { data, error } = await supabaseClient.from("event_lines")
    .insert({ category_id: categoryId, label: lbl, amount: amt }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout ligne."), true); return false; }
  await reloadAfterWrite();
  if (!state.lines.some(l => l.id === data.id)) {
    flash(`Ligne créée mais non retrouvée. ${SQL_HINT}`, true);
    return false;
  }
  flash("Ligne ajoutée.");
  return true;
}

export async function updateLine(lineId, label, amount) {
  if (!isAdmin) return false;
  const lbl = label.trim();
  const amt = Number(amount);
  if (!lbl) { flash("Libellé obligatoire.", true); return false; }
  if (!Number.isFinite(amt) || amt < 0) { flash("Montant invalide.", true); return false; }
  const { error } = await supabaseClient.from("event_lines")
    .update({ label: lbl, amount: amt }).eq("id", lineId);
  if (error) { flash(getErrorMessage(error, "Erreur modification ligne."), true); return false; }
  flash("Ligne modifiée.");
  await reloadAfterWrite();
  return true;
}

export async function deleteLine(lineId) {
  if (!isAdmin) return false;
  const { error } = await supabaseClient.from("event_lines").delete().eq("id", lineId);
  if (error) { flash(getErrorMessage(error, "Erreur suppression ligne."), true); return false; }
  flash("Ligne supprimée.");
  await reloadAfterWrite();
  return true;
}

export function getProject(id) {
  return state.projects.find(p => p.id === id) || null;
}

export function getBlock(id) {
  return state.blocks.find(b => b.id === id) || null;
}

export function getSection(id) {
  return state.sections.find(s => s.id === id) || null;
}

export function getCategory(id) {
  return state.categories.find(c => c.id === id) || null;
}

export function getLine(id) {
  return state.lines.find(l => l.id === id) || null;
}

export function blockForSection(sectionId) {
  const sec = getSection(sectionId);
  return sec ? getBlock(sec.block_id) : null;
}

export function projectIdForCategory(categoryId) {
  const cat = getCategory(categoryId);
  if (!cat) return null;
  const sec = getSection(cat.section_id);
  if (!sec) return null;
  const block = getBlock(sec.block_id);
  return block?.project_id ?? null;
}
