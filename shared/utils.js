export const APP_START_MONTH = "2026-09";
export const EAU_START_MONTH = "2026-08";
export const TRESORERIE_START_MONTH = APP_START_MONTH;

export function pad(n) { return n < 10 ? "0" + n : "" + n; }
export function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function parseISODate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const r = new Date(d); r.setDate(d.getDate() + n); return r; }

export function getWeekStart(d) {
  const day = d.getDay();
  const diff = (day - 6 + 7) % 7;
  const ws = new Date(d); ws.setDate(d.getDate() - diff); ws.setHours(0, 0, 0, 0);
  return ws;
}

export function getMonthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthChipLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
}

export function formatDateShort(d) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }); }
export function formatDateFull(d) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }

/**
 * Segments hebdo d'un mois civil : samedi→vendredi tronqués en fin de mois ;
 * début de mois partiel (01 → veille du 1er samedi) sauf pour APP_START_MONTH.
 * @returns {{ periodKey: string, start: Date, end: Date, number: number }[]}
 */
export function getMonthWeekSegments(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  firstOfMonth.setHours(0, 0, 0, 0);
  const lastOfMonth = new Date(y, m, 0);
  lastOfMonth.setHours(0, 0, 0, 0);

  const firstSaturday = new Date(firstOfMonth);
  while (firstSaturday.getDay() !== 6) firstSaturday.setDate(firstSaturday.getDate() + 1);

  /** @type {{ periodKey: string, start: Date, end: Date, number: number }[]} */
  const segments = [];

  const pushSegment = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (start.getTime() > end.getTime()) return;
    segments.push({
      periodKey: toISO(start),
      start,
      end,
      number: segments.length + 1,
    });
  };

  if (monthKey !== APP_START_MONTH && firstOfMonth.getTime() < firstSaturday.getTime()) {
    const headEnd = addDays(firstSaturday, -1);
    pushSegment(firstOfMonth, headEnd);
  }

  let sat = new Date(firstSaturday);
  while (sat.getTime() <= lastOfMonth.getTime()) {
    let end = addDays(sat, 6);
    if (end.getTime() > lastOfMonth.getTime()) end = lastOfMonth;
    pushSegment(sat, end);
    sat.setDate(sat.getDate() + 7);
  }

  segments.forEach((s, i) => { s.number = i + 1; });
  return segments;
}

export function weekEndForPeriodKey(periodKey, monthKey = periodKey.slice(0, 7)) {
  const seg = getMonthWeekSegments(monthKey).find(s => s.periodKey === periodKey);
  if (seg) return toISO(seg.end);
  return toISO(addDays(parseISODate(periodKey), 6));
}

export function findWeekSegmentForDate(date, monthKey = getMonthKey(date)) {
  const iso = toISO(date);
  return getMonthWeekSegments(monthKey).find(s => iso >= s.periodKey && iso <= toISO(s.end)) || null;
}

export function findWeekSegmentForToday() {
  return findWeekSegmentForDate(new Date());
}

export function getWeekNumberInMonth(weekStartOrPeriodKey, monthKey) {
  const mk = monthKey || (typeof weekStartOrPeriodKey === "string"
    ? weekStartOrPeriodKey.slice(0, 7)
    : getMonthKey(weekStartOrPeriodKey));
  const periodKey = typeof weekStartOrPeriodKey === "string"
    ? weekStartOrPeriodKey
    : toISO(weekStartOrPeriodKey);
  const seg = getMonthWeekSegments(mk).find(s => s.periodKey === periodKey);
  return seg ? seg.number : 1;
}

/** @deprecated Préférer getMonthWeekSegments */
export function getWeeksOfMonth(monthKey) {
  return getMonthWeekSegments(monthKey).map(s => new Date(s.start));
}

export function activeMonthKey() {
  return getMonthKey(new Date());
}

export function monthsRange(startMonth = APP_START_MONTH) {
  return monthsRangeFrom(startMonth);
}

export function monthsRangeFrom(startMonth) {
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ay, am] = activeMonthKey().split("-").map(Number);
  const end = new Date(ay, am - 1 + 6, 1);
  let d = new Date(sy, sm - 1, 1);
  const list = [];
  while (d <= end) { list.push(getMonthKey(d)); d.setMonth(d.getMonth() + 1); }
  return list;
}

export function previousMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return getMonthKey(d);
}

export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function moneyRound(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/** Arrondi entier pour parts utility (505,86 → 506) */
export function roundShare(n) {
  return Math.round(Number(n) || 0);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function toTitleCase(s) {
  return s.split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function normalizeName(name) {
  return toTitleCase(name.trim());
}

let toastTimer = null;

export function flash(msg, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = isError ? "var(--danger)" : "var(--ink)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 2800);
}

export function getErrorMessage(error, fallback) {
  if (!error) return fallback;
  const msg = error.message || "";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
    return "Connexion impossible. Vérifiez votre réseau ou réessayez plus tard.";
  }
  return msg || fallback;
}

export function renderDateField(name, { value = "", required = true, extraClass = "", placeholder = "Choisir une date" } = {}) {
  const val = value ? ` value="${value}"` : "";
  const req = required ? " required" : "";
  return `
    <div class="date-field">
      <input class="field field-date ${extraClass}" name="${name}" type="date"${req}${val} />
      <span class="date-field-placeholder">${esc(placeholder)}</span>
    </div>`;
}
