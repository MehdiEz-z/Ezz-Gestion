/** Global guard against double submit / double click during async writes */

export const BUSY_SAVE = "Enregistrement…";
export const BUSY_DELETE = "Suppression…";

let inFlight = false;

export function isSubmitBusy() {
  return inFlight;
}

export async function runBusy(fn) {
  if (inFlight) return undefined;
  inFlight = true;
  try {
    return await fn();
  } finally {
    inFlight = false;
  }
}

export function setFormBusy(form, busy, busyText = BUSY_SAVE) {
  if (!form) return;
  form.querySelectorAll('button[type="submit"]').forEach(btn => {
    if (busy) {
      if (!btn.dataset.busyOriginal) btn.dataset.busyOriginal = btn.textContent;
      btn.disabled = true;
      btn.classList.add("is-busy");
      btn.textContent = busyText;
    } else {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      if (btn.dataset.busyOriginal) {
        btn.textContent = btn.dataset.busyOriginal;
        delete btn.dataset.busyOriginal;
      }
    }
  });
  form.querySelectorAll("input, select, textarea, button").forEach(el => {
    if (el.type === "submit") return;
    if (busy) {
      if (el.dataset.busyWasDisabled === undefined) {
        el.dataset.busyWasDisabled = el.disabled ? "1" : "0";
      }
      el.disabled = true;
    } else if (el.dataset.busyWasDisabled !== undefined) {
      el.disabled = el.dataset.busyWasDisabled === "1";
      delete el.dataset.busyWasDisabled;
    }
  });
}

export function setButtonBusy(btn, busy, busyText = BUSY_SAVE) {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.busyOriginal) btn.dataset.busyOriginal = btn.textContent;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.textContent = busyText;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (btn.dataset.busyOriginal) {
      btn.textContent = btn.dataset.busyOriginal;
      delete btn.dataset.busyOriginal;
    }
  }
}

export async function guardFormSubmit(form, fn, busyText = BUSY_SAVE) {
  if (isSubmitBusy()) return undefined;
  return runBusy(async () => {
    setFormBusy(form, true, busyText);
    try {
      return await fn();
    } finally {
      setFormBusy(form, false);
    }
  });
}

export async function guardAction(btn, fn, busyText = BUSY_SAVE) {
  if (isSubmitBusy()) return undefined;
  return runBusy(async () => {
    setButtonBusy(btn, true, busyText);
    try {
      return await fn();
    } finally {
      setButtonBusy(btn, false);
    }
  });
}
