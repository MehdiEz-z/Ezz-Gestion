import { supabaseClient } from "../shared/supabase.js";
import { isAdmin, currentUser } from "../shared/auth.js";
import { flash, getErrorMessage } from "../shared/utils.js";

export let state = {
  projects: [],
  sections: [],
  lines: [],
};

export const ui = {
  expanded: new Set(),
  modal: null,
};

export function resetState() {
  state = { projects: [], sections: [], lines: [] };
  ui.expanded.clear();
  ui.modal = null;
}

export async function fetchStateFromSupabase() {
  if (!currentUser) return;
  const [projects, sections, lines] = await Promise.all([
    supabaseClient.from("event_projects").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("event_sections").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("event_lines").select("*").order("created_at", { ascending: true }),
  ]);
  if (projects.error) {
    flash(getErrorMessage(projects.error, "Erreur chargement événements. Exécutez supabase/events.sql."), true);
    state.projects = [];
  } else {
    state.projects = projects.data || [];
  }
  if (sections.error) {
    flash(getErrorMessage(sections.error, "Erreur chargement sections (table event_sections / supabase/events.sql)."), true);
    state.sections = [];
  } else {
    state.sections = sections.data || [];
  }
  if (lines.error) {
    flash(getErrorMessage(lines.error, "Erreur chargement lignes (table event_lines / supabase/events.sql)."), true);
    state.lines = [];
  } else {
    state.lines = lines.data || [];
  }
}

async function reloadAfterWrite() {
  await fetchStateFromSupabase();
}

export function sectionsForProject(projectId) {
  return state.sections.filter(s => s.project_id === projectId);
}

export function linesForSection(sectionId) {
  return state.lines.filter(l => l.section_id === sectionId);
}

export function sectionTotal(sectionId) {
  return linesForSection(sectionId).reduce((s, l) => s + Number(l.amount), 0);
}

export function projectTotal(projectId) {
  return sectionsForProject(projectId).reduce((s, sec) => s + sectionTotal(sec.id), 0);
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
  const { data, error } = await supabaseClient.from("event_projects")
    .update({ name: n }).eq("id", projectId).select().single();
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

export async function addSection(projectId, name) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Nom de la catégorie obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("event_sections")
    .insert({ project_id: projectId, name: n }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout catégorie."), true); return null; }
  await reloadAfterWrite();
  const created = state.sections.find(s => s.id === data.id);
  if (!created) {
    flash("Catégorie créée mais non retrouvée après enregistrement. Exécutez supabase/events.sql (event_sections).", true);
    return null;
  }
  flash("Catégorie ajoutée.");
  return created;
}

export async function updateSection(sectionId, name) {
  if (!isAdmin) return false;
  const n = name.trim();
  if (!n) { flash("Nom obligatoire.", true); return false; }
  const { data, error } = await supabaseClient.from("event_sections")
    .update({ name: n }).eq("id", sectionId).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur modification catégorie."), true); return false; }
  flash("Catégorie modifiée.");
  await reloadAfterWrite();
  return true;
}

export async function deleteSection(sectionId) {
  if (!isAdmin) return false;
  const { error } = await supabaseClient.from("event_sections").delete().eq("id", sectionId);
  if (error) { flash(getErrorMessage(error, "Erreur suppression catégorie."), true); return false; }
  flash("Catégorie supprimée.");
  await reloadAfterWrite();
  return true;
}

export async function addLine(sectionId, label, amount) {
  if (!isAdmin) return false;
  const lbl = label.trim();
  const amt = Number(amount);
  if (!lbl) { flash("Libellé obligatoire.", true); return false; }
  if (!Number.isFinite(amt) || amt < 0) { flash("Montant invalide.", true); return false; }
  const { data, error } = await supabaseClient.from("event_lines")
    .insert({ section_id: sectionId, label: lbl, amount: amt }).select().single();
  if (error) { flash(getErrorMessage(error, "Erreur ajout ligne."), true); return false; }
  await reloadAfterWrite();
  if (!state.lines.some(l => l.id === data.id)) {
    flash("Ligne créée mais non retrouvée après enregistrement. Exécutez supabase/events.sql (event_lines).", true);
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
  const { data, error } = await supabaseClient.from("event_lines")
    .update({ label: lbl, amount: amt }).eq("id", lineId).select().single();
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

export function getSection(id) {
  return state.sections.find(s => s.id === id) || null;
}

export function getLine(id) {
  return state.lines.find(l => l.id === id) || null;
}
