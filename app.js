import { initAuth } from "./shared/auth.js";
import { initNav, bootActiveModule } from "./shared/router.js";
import { resetState as resetMaisonState } from "./maison/data.js";
import { resetState as resetMaladieState } from "./maladie/data.js";

initNav();

initAuth({
  onSignedOut: async () => {
    resetMaisonState();
    resetMaladieState();
    const maison = await import("./maison/boot.js");
    const maladie = await import("./maladie/boot.js");
    maison.resetModule();
    maladie.resetModule();
    document.getElementById("main").innerHTML = "";
    document.getElementById("subtabs").innerHTML = "";
  },
  onAuthenticated: async () => {
    await bootActiveModule();
  },
});
