import { initAuth } from "./shared/auth.js";
import { initNav, bootActiveModule } from "./shared/router.js";
import { resetState as resetMaisonState } from "./maison/data.js";
import { resetState as resetMaladieState } from "./maladie/data.js";
import { resetState as resetEauState } from "./eau-elec/data.js";

initNav();

initAuth({
  onSignedOut: async () => {
    resetMaisonState();
    resetMaladieState();
    resetEauState();
    const maison = await import("./maison/boot.js");
    const maladie = await import("./maladie/boot.js");
    const eauElec = await import("./eau-elec/boot.js");
    maison.resetModule();
    maladie.resetModule();
    eauElec.resetModule();
    document.getElementById("main").innerHTML = "";
    document.getElementById("subtabs").innerHTML = "";
  },
  onAuthenticated: async () => {
    await bootActiveModule();
  },
});
