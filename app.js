import { initAuth } from "./shared/auth.js";
import { initNav, bootActiveModule } from "./shared/router.js";
import { resetState as resetMaisonState } from "./maison/data.js";
import { resetState as resetMaladieState } from "./maladie/data.js";

initNav();

initAuth({
  onSignedOut: () => {
    resetMaisonState();
    resetMaladieState();
    document.getElementById("main").innerHTML = "";
    document.getElementById("subtabs").innerHTML = "";
  },
  onAuthenticated: async () => {
    await bootActiveModule();
  },
});
