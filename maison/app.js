import { supabaseClient } from "../shared/supabase.js";
import { flash, getErrorMessage, activeMonthKey } from "../shared/utils.js";
import {
  ui, resetState, updateAccessRights,
  fetchStateFromSupabase, getFakeEmail,
} from "./data.js";
import * as data from "./data.js";
import { render } from "./render.js";
import { setupEvents } from "./events.js";

if (!ui.viewedMonthKey) ui.viewedMonthKey = activeMonthKey();

async function showApp() {
  await fetchStateFromSupabase();
  document.getElementById("auth-overlay").style.display = "none";
  document.getElementById("change-pwd-overlay").style.display = "none";
  document.getElementById("logout-btn").style.display = "block";
  render();
}

async function handleSession(user) {
  data.currentUser = user;
  updateAccessRights();
  const mustChange = user.user_metadata && user.user_metadata.must_change_password;
  if (mustChange) {
    document.getElementById("auth-overlay").style.display = "none";
    document.getElementById("change-pwd-overlay").style.display = "flex";
  } else {
    await showApp();
  }
}

async function initApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await handleSession(session.user);

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN") await handleSession(session.user);
    else if (event === "SIGNED_OUT") {
      data.currentUser = null;
      updateAccessRights();
      resetState();
      document.getElementById("auth-overlay").style.display = "flex";
      document.getElementById("change-pwd-overlay").style.display = "none";
      document.getElementById("logout-btn").style.display = "none";
    }
  });
}

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("auth-username").value;
  const email = getFakeEmail(username);
  const password = document.getElementById("auth-password").value;
  const msgEl = document.getElementById("auth-msg");
  msgEl.textContent = "Connexion en cours...";
  const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    msgEl.textContent = getErrorMessage(error, "Nom d'utilisateur ou mot de passe incorrect.");
  } else if (authData.session?.user) {
    msgEl.textContent = "";
    try {
      await handleSession(authData.session.user);
    } catch (err) {
      msgEl.textContent = getErrorMessage(err, "Erreur lors de la connexion.");
    }
  } else {
    msgEl.textContent = "Connexion impossible. Réessayez.";
  }
});

document.getElementById("change-pwd-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPwd = document.getElementById("new-pwd").value;
  const confirmPwd = document.getElementById("confirm-pwd").value;
  const msgEl = document.getElementById("change-pwd-msg");
  if (newPwd !== confirmPwd) {
    msgEl.textContent = "Les mots de passe ne correspondent pas.";
    return;
  }
  msgEl.textContent = "Mise à jour en cours...";
  const { error } = await supabaseClient.auth.updateUser({
    password: newPwd,
    data: { must_change_password: false },
  });
  if (error) {
    msgEl.textContent = getErrorMessage(error, "Erreur lors du changement de mot de passe.");
  } else {
    const { data: { user } } = await supabaseClient.auth.getUser();
    data.currentUser = user;
    flash("Mot de passe modifié ! Bienvenue 🎉");
    await showApp();
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

document.getElementById("back-to-login-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  document.getElementById("change-pwd-overlay").style.display = "none";
  document.getElementById("auth-overlay").style.display = "flex";
  document.getElementById("auth-username").value = "";
  document.getElementById("auth-password").value = "";
  document.getElementById("auth-msg").textContent = "";
});

setupEvents();
initApp();
