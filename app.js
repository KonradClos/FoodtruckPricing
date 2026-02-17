// app.js
import { loadData, saveData, createEmptyData, STORAGE_KEY } from "./data.js";
import { calcCostResult, calcPriceFromTargetDbPct, calcProductResult } from "./engine.js";

let data = loadData();
const $ = (id) => document.getElementById(id);

/* Top */
const statusEl = $("status");
const btnExport = $("btnExport");
const fileImport = $("fileImport");
const btnReset = $("btnReset");

/* NEW CSV */
const btnExportIngredientsCsv = $("btnExportIngredientsCsv");
const btnExportRecipesCsv = $("btnExportRecipesCsv");
const fileImportCsv = $("fileImportCsv");

/* Tabs */
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll("[data-panel]"));

/* Zutaten */
const ingTbody = $("ingTbody");
const ingEmpty = $("ingEmpty");
const ingSearch = $("ingSearch");
const btnAddIngredient = $("btnAddIngredient");

/* Zutaten Modal */
const modal = $("modal");
const modalForm = $("modalForm");
const modalTitle = $("modalTitle");
const modalError = $("modalError");
const btnDelete = $("btnDelete");
const fName = $("fName");
const fUnit = $("fUnit");
const fPrice = $("fPrice");
const fSupplier = $("fSupplier");
const fNotes = $("fNotes");
let modalMode = "add";
let editingId = null;

/* Fixkosten */
const btnAddFixedCustom = $("btnAddFixedCustom");
const fixedCustomTbody = $("fixedCustomTbody");
const openDaysPerMonthEl = $("openDaysPerMonth");
const expectedPortionsPerOpenDayEl = $("expectedPortionsPerOpenDay");
const overrideMonthlyPortionsEl = $("overrideMonthlyPortions");
const computedMonthlyPortionsEl = $("computedMonthlyPortions");
const fc_rent = $("fc_rent");
const fc_insurance = $("fc_insurance");
const fc_phoneInternet = $("fc_phoneInternet");
const fc_equipmentLeasing = $("fc_equipmentLeasing");
const fc_accounting = $("fc_accounting");
const fc_other = $("fc_other");
const fixedMonthlyTotalEl = $("fixedMonthlyTotal");
const fixedPerPortionEl = $("fixedPerPortion");
const costsWarn = $("costsWarn");

/* Rezepte */
const recSearch = $("recSearch");
const btnAddRecipe = $("btnAddRecipe");
const recTbody = $("recTbody");
const recEmpty = $("recEmpty");

/* NEW: Recipes view */
const recipeViewMode = $("recipeViewMode");
const recipesTableWrap = $("recipesTableWrap");
const recipeCards = $("recipeCards");

/* Rezept Modal */
const recModal = $("recModal");
const recForm = $("recForm");
const recTitle = $("recTitle");
const recError = $("recError");
const btnRecDelete = $("btnRecDelete");
const rName = $("rName");
const rVat = $("rVat");
const rLoss = $("rLoss");
const rPackSet = $("rPackSet");
const rTargetDB = $("rTargetDB");
const btnAddRecIng = $("btnAddRecIng");
const recIngTbody = $("recIngTbody");
let recModalMode = "add";
let editingRecId = null;

/* Kalkulation */
const calcRecipeSelect = $("calcRecipeSelect");
const btnCalcRefresh = $("btnCalcRefresh");
const calcMode = $("calcMode");
const calcDbPctInput = $("calcDbPctInput");
const calcDbPctWrap = $("calcDbPctWrap");
const calcTargetEuroWrap = $("calcTargetEuroWrap");

const calcCostIngredients = $("calcCostIngredients");
const calcCostPackaging = $("calcCostPackaging");
const calcCostFixed = $("calcCostFixed");
const calcCostTotal = $("calcCostTotal");

const calcTargetDB = $("calcTargetDB");
const calcVat = $("calcVat");
const calcGrossRounded = $("calcGrossRounded");
const calcNetImplied = $("calcNetImplied");

const calcDbEuro = $("calcDbEuro");
const calcDbPct = $("calcDbPct");
const calcErrors = $("calcErrors");

/* Markt & Verkauf */
const calcMarketGross = $("calcMarketGross");
const calcSellGross = $("calcSellGross");
const calcDiffMin = $("calcDiffMin");
const calcDiffMarket = $("calcDiffMarket");
const calcSellNet = $("calcSellNet");
const calcSellDb = $("calcSellDb");

/* utils */
function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 9)}${Date.now().toString(16).slice(-4)}`;
}

// accepts: "3706", "3.706", "3,706", "3.706,50", "15," (while typing)
function normalizeNumber(input) {
  const raw = String(input ?? "").trim();
  if (raw === "") return NaN;

  let s = raw.replace(/\s/g, "");

  // allow intermediate typing like "15," or "," -> NaN is ok
  if (s === "," || s === "." || s.endsWith(",") || s.endsWith(".")) return NaN;

  // "3.706,50" => "3706.50"
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/\./g, "");

  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

function normalizeInt(input) {
  const s = String(input ?? "").trim().replace(/\s/g, "");
  if (s === "") return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatEuro(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function formatEuroSigned(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  return (n >= 0 ? "+" : "−") + abs;
}
function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
}
function sumObjectValues(obj) {
  return Object.values(obj || {}).reduce((a, v) => a + (Number(v) || 0), 0);
}
function getVatLabel(vatCategory) {
  return vatCategory === "drink" ? "Drink (19%)" : "Food (7%)";
}

/* =========================
   CSV helpers (semicolon)
   - robust enough for Excel exports
   - supports quoted fields "..."
   ========================= */

function parseCsvSemicolon(text) {
  const s = String(text ?? "");
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { // escaped quote
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ";") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\r") continue;

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  // last field
  row.push(cur);
  rows.push(row);

  // drop empty trailing lines
  while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === "")) rows.pop();

  if (rows.length === 0) return { headers: [], items: [] };

  const headers = rows[0].map((h) => String(h).trim());
  const items = rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").toString().trim();
    });
    return obj;
  });
  return { headers, items };
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(";") || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function downloadCsv(filename, rows) {
  const content = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** MIGRATION: old ingredient baseUnit g->kg, ml->l (price adjusted) */
function migrateIngredientBaseUnits() {
  const ings = data?.catalog?.ingredients || [];
  for (const ing of ings) {
    const u = (ing.baseUnit || "").toLowerCase();
    if (u === "g") {
      const p = Number(ing.pricePerBaseUnit) || 0;
      ing.baseUnit = "kg";
      ing.pricePerBaseUnit = p * 1000;
    } else if (u === "ml") {
      const p = Number(ing.pricePerBaseUnit) || 0;
      ing.baseUnit = "l";
      ing.pricePerBaseUnit = p * 1000;
    } else if (u === "stk") {
      ing.baseUnit = "pc";
    }
  }
}

function ensureDataShape() {
  if (!data.settings) data.settings = {};
  if (!data.settings.rounding) data.settings.rounding = { mode: "ceil", step: 0.10 };
  if (!data.settings.vatRates) data.settings.vatRates = { food: 0.07, drink: 0.19 };
  if (!data.settings.defaults) data.settings.defaults = { vatCategory: "food", packagingSetId: "pack_default", lossPercent: 0.02 };

  if (!data.settings.calc) data.settings.calc = { mode: "euro", targetDbPct: 0.25 };
  if (!data.settings.calc.mode) data.settings.calc.mode = "euro";
  if (data.settings.calc.targetDbPct == null) data.settings.calc.targetDbPct = 0.25;

  if (!data.catalog) data.catalog = { ingredients: [], packagingItems: [], packagingSets: [] };
  if (!Array.isArray(data.catalog.ingredients)) data.catalog.ingredients = [];
  if (!Array.isArray(data.catalog.packagingItems)) data.catalog.packagingItems = [];
  if (!Array.isArray(data.catalog.packagingSets)) data.catalog.packagingSets = [];
  if (!data.catalog.packagingSets.find((x) => x.id === "pack_default")) {
    data.catalog.packagingSets.push({ id: "pack_default", name: "Standard To-Go", items: [] });
  }

  if (!data.products) data.products = { recipes: [], items: [] };
  if (!Array.isArray(data.products.recipes)) data.products.recipes = [];
  if (!Array.isArray(data.products.items)) data.products.items = [];

  // ensure pricing object per recipe incl. market/sell fields
  for (const r of data.products.recipes) {
    if (!r.pricing) r.pricing = {};
    if (r.pricing.marketGross == null) r.pricing.marketGross = null;
    if (r.pricing.sellGross == null) r.pricing.sellGross = null;
  }

  if (!data.costModel) {
    data.costModel = {
      fixedCostsMonthly: { standard: {}, custom: [] },
      volumeAssumptions: { openDaysPerMonth: 12, expectedPortionsPerOpenDay: 80, overrideExpectedPortionsPerMonth: null }
    };
  }
  if (!data.costModel.fixedCostsMonthly) data.costModel.fixedCostsMonthly = { standard: {}, custom: [] };
  if (!data.costModel.fixedCostsMonthly.standard) data.costModel.fixedCostsMonthly.standard = {};
  if (!Array.isArray(data.costModel.fixedCostsMonthly.custom)) data.costModel.fixedCostsMonthly.custom = [];
  if (!data.costModel.volumeAssumptions) {
    data.costModel.volumeAssumptions = { openDaysPerMonth: 12, expectedPortionsPerOpenDay: 80, overrideExpectedPortionsPerOpenDay: null };
  }

  migrateIngredientBaseUnits();
  saveData(data);
}

/* tabs */
function setTab(name) {
  tabButtons.forEach((b) => b.classList.toggle("isActive", b.dataset.tab === name));
  panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
}

function renderStatus() {
  ensureDataShape();
  statusEl.textContent = JSON.stringify(
    {
      schemaVersion: data.meta?.schemaVersion,
      lastSavedISO: data.meta?.lastSavedISO,
      ingredients: data.catalog.ingredients.length,
      recipes: data.products.recipes.length
    },
    null,
    2
  );
}

/* ========== Zutaten ========== */
function getFilteredIngredients() {
  const q = (ingSearch?.value || "").trim().toLowerCase();
  const list = data.catalog.ingredients || [];
  if (!q) return list;
  return list.filter((x) => (x.name || "").toLowerCase().includes(q) || (x.supplier || "").toLowerCase().includes(q));
}
function renderIngredients() {
  const listAll = data.catalog.ingredients || [];
  const list = getFilteredIngredients();
  if (ingEmpty) ingEmpty.style.display = (listAll.length === 0) ? "block" : "none";
  ingTbody.innerHTML = "";
  for (const ing of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ing.name)}</td>
      <td>${escapeHtml(ing.baseUnit)}</td>
      <td>${formatEuro(ing.pricePerBaseUnit).replace(" €","")}</td>
      <td>${escapeHtml(ing.supplier || "")}</td>
      <td class="actions"><button class="btn" data-action="edit" data-id="${ing.id}">Bearbeiten</button></td>
    `;
    ingTbody.appendChild(tr);
  }
}
function showModalError(text) {
  modalError.textContent = text;
  modalError.classList.remove("hidden");
}
function openIngredientModalAdd() {
  modalMode = "add"; editingId = null;
  modalTitle.textContent = "Zutat hinzufügen";
  btnDelete.classList.add("hidden");
  modalError.classList.add("hidden"); modalError.textContent = "";
  fName.value = ""; fUnit.value = "kg"; fPrice.value = ""; fSupplier.value = ""; fNotes.value = "";
  modal.showModal(); fName.focus();
}
function openIngredientModalEdit(id) {
  const ing = data.catalog.ingredients.find((x) => x.id === id);
  if (!ing) return;
  modalMode = "edit"; editingId = id;
  modalTitle.textContent = "Zutat bearbeiten";
  btnDelete.classList.remove("hidden");
  modalError.classList.add("hidden"); modalError.textContent = "";
  fName.value = ing.name ?? "";
  fUnit.value = ing.baseUnit ?? "kg";
  fPrice.value = (ing.pricePerBaseUnit ?? "").toString().replace(".", ",");
  fSupplier.value = ing.supplier ?? "";
  fNotes.value = ing.notes ?? "";
  modal.showModal(); fName.focus();
}
function saveIngredientFromModal() {
  const name = (fName.value || "").trim();
  const baseUnit = (fUnit.value || "").trim();
  const price = normalizeNumber(fPrice.value);
  const supplier = (fSupplier.value || "").trim();
  const notes = (fNotes.value || "").trim();
  if (!name) return showModalError("Name ist erforderlich.");
  if (!baseUnit) return showModalError("Einheit ist erforderlich.");
  if (!Number.isFinite(price) || price < 0) return showModalError("Preis muss eine Zahl ≥ 0 sein.");

  if (modalMode === "add") {
    data.catalog.ingredients.push({ id: uid("ing"), name, baseUnit, pricePerBaseUnit: price, supplier, notes });
  } else {
    const idx = data.catalog.ingredients.findIndex((x) => x.id === editingId);
    if (idx >= 0) data.catalog.ingredients[idx] = { ...data.catalog.ingredients[idx], name, baseUnit, pricePerBaseUnit: price, supplier, notes };
  }
  saveData(data); renderStatus(); renderIngredients(); renderRecipes(); renderCalcOptions(); renderCalc();
}
function deleteIngredientFromModal() {
  if (!editingId) return;
  data.catalog.ingredients = data.catalog.ingredients.filter((x) => x.id !== editingId);
  saveData(data); renderStatus(); renderIngredients(); renderRecipes(); renderCalcOptions(); renderCalc();
}

/* ========== Fixkosten ========== */
function readFixedStandardFromInputs() {
  const std = data.costModel.fixedCostsMonthly.standard;
  std.rent = Number.isFinite(normalizeNumber(fc_rent.value)) ? normalizeNumber(fc_rent.value) : 0;
  std.insurance = Number.isFinite(normalizeNumber(fc_insurance.value)) ? normalizeNumber(fc_insurance.value) : 0;
  std.phoneInternet = Number.isFinite(normalizeNumber(fc_phoneInternet.value)) ? normalizeNumber(fc_phoneInternet.value) : 0;
  std.equipmentLeasing = Number.isFinite(normalizeNumber(fc_equipmentLeasing.value)) ? normalizeNumber(fc_equipmentLeasing.value) : 0;
  std.accounting = Number.isFinite(normalizeNumber(fc_accounting.value)) ? normalizeNumber(fc_accounting.value) : 0;
  std.other = Number.isFinite(normalizeNumber(fc_other.value)) ? normalizeNumber(fc_other.value) : 0;
}
function writeFixedStandardToInputs() {
  const std = data.costModel.fixedCostsMonthly.standard || {};
  fc_rent.value = std.rent ? String(std.rent).replace(".", ",") : "";
  fc_insurance.value = std.insurance ? String(std.insurance).replace(".", ",") : "";
  fc_phoneInternet.value = std.phoneInternet ? String(std.phoneInternet).replace(".", ",") : "";
  fc_equipmentLeasing.value = std.equipmentLeasing ? String(std.equipmentLeasing).replace(".", ",") : "";
  fc_accounting.value = std.accounting ? String(std.accounting).replace(".", ",") : "";
  fc_other.value = std.other ? String(std.other).replace(".", ",") : "";
}
function readVolumeAssumptionsFromInputs() {
  const vol = data.costModel.volumeAssumptions;
  const openDays = normalizeInt(openDaysPerMonthEl.value);
  const perDay = normalizeInt(expectedPortionsPerOpenDayEl.value);
  const override = normalizeInt(overrideMonthlyPortionsEl.value);
  if (openDays != null) vol.openDaysPerMonth = openDays;
  if (perDay != null) vol.expectedPortionsPerOpenDay = perDay;
  vol.overrideExpectedPortionsPerMonth = (overrideMonthlyPortionsEl.value.trim() === "") ? null : override;
}
function writeVolumeAssumptionsToInputs() {
  const vol = data.costModel.volumeAssumptions || {};
  openDaysPerMonthEl.value = (vol.openDaysPerMonth ?? "").toString();
  expectedPortionsPerOpenDayEl.value = (vol.expectedPortionsPerOpenDay ?? "").toString();
  overrideMonthlyPortionsEl.value = (vol.overrideExpectedPortionsPerMonth ?? "").toString().replace("null", "");
}
function calcMonthlyPortions() {
  const vol = data.costModel.volumeAssumptions || {};
  const override = vol.overrideExpectedPortionsPerMonth;
  if (Number.isFinite(Number(override)) && Number(override) > 0) return Number(override);
  const openDays = Number(vol.openDaysPerMonth);
  const perDay = Number(vol.expectedPortionsPerOpenDay);
  if (Number.isFinite(openDays) && openDays > 0 && Number.isFinite(perDay) && perDay > 0) return openDays * perDay;
  return 0;
}
function calcFixedTotalsLocal() {
  const fixed = data.costModel.fixedCostsMonthly || {};
  const stdTotal = sumObjectValues(fixed.standard);
  const customTotal = (fixed.custom || []).reduce((a, x) => a + (Number(x?.amount) || 0), 0);
  const monthlyTotal = stdTotal + customTotal;
  const monthlyPortions = calcMonthlyPortions();
  const perPortion = monthlyPortions > 0 ? monthlyTotal / monthlyPortions : 0;
  return { monthlyTotal, monthlyPortions, perPortion };
}
function renderFixedCustomTable() {
  const rows = data.costModel.fixedCostsMonthly.custom || [];
  fixedCustomTbody.innerHTML = "";
  for (const row of rows) {
    const amountVal = (row.amount ?? "");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="input" data-fc="label" data-id="${row.id}" value="${escapeHtml(row.label || "")}" placeholder="z.B. IHK" /></td>
      <td><input class="input" data-fc="amount" data-id="${row.id}" inputmode="decimal" value="${escapeHtml(String(amountVal).replace(".", ","))}" placeholder="0,00" /></td>
      <td class="actions"><button class="btn btnDanger" data-fc="remove" data-id="${row.id}">Entfernen</button></td>
    `;
    fixedCustomTbody.appendChild(tr);
  }
}
function renderCostsSummary() {
  const { monthlyTotal, monthlyPortions, perPortion } = calcFixedTotalsLocal();
  computedMonthlyPortionsEl.textContent = monthlyPortions > 0 ? `${monthlyPortions}` : "—";
  fixedMonthlyTotalEl.textContent = formatEuro(monthlyTotal);
  fixedPerPortionEl.textContent = (monthlyPortions > 0) ? formatEuro(perPortion) : "—";
  if (monthlyPortions <= 0) {
    costsWarn.textContent = "Bitte Monatsportionen korrekt setzen (Öffnungstage & Portionen/Tag oder Override).";
    costsWarn.classList.remove("hidden");
  } else {
    costsWarn.classList.add("hidden");
    costsWarn.textContent = "";
  }
}
function addFixedCustomRow() {
  data.costModel.fixedCostsMonthly.custom.push({ id: uid("fc"), label: "", amount: 0 });
  saveData(data); renderStatus(); renderFixedCustomTable(); renderCostsSummary(); renderCalc();
}

/* FIX: Komma tippen erlauben -> erst bei blur normalisieren */
function handleFixedCustomInput(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  const id = t.dataset.id; const field = t.dataset.fc;
  if (!id || !field) return;
  const row = data.costModel.fixedCostsMonthly.custom.find((x) => x.id === id);
  if (!row) return;

  if (field === "label") {
    row.label = t.value;
    saveData(data); renderStatus();
    return;
  }

  if (field === "amount") {
    // live: nur raw speichern (string), NICHT rechnen
    row._amountRaw = t.value;
    saveData(data);
  }
}
function handleFixedCustomBlur(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  const id = t.dataset.id; const field = t.dataset.fc;
  if (!id || !field) return;
  const row = data.costModel.fixedCostsMonthly.custom.find((x) => x.id === id);
  if (!row) return;

  if (field === "amount") {
    const v = normalizeNumber(t.value);
    row.amount = Number.isFinite(v) ? v : 0;
    delete row._amountRaw;
    saveData(data); renderStatus(); renderCostsSummary(); renderCalc();
    // format back
    t.value = row.amount ? String(row.amount).replace(".", ",") : "";
  }
}
function handleFixedCustomClick(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.fc === "remove") {
    const id = t.dataset.id;
    data.costModel.fixedCostsMonthly.custom = data.costModel.fixedCostsMonthly.custom.filter((x) => x.id !== id);
    saveData(data); renderStatus(); renderFixedCustomTable(); renderCostsSummary(); renderCalc();
  }
}

/* Standard Fixkostenfelder: live erlauben, aber rechnen bei blur */
function handleCostsStdInputRaw() {
  // hier speichern wir NICHT, damit tippen sauber bleibt
}
function handleCostsStdBlur() {
  readVolumeAssumptionsFromInputs();
  readFixedStandardFromInputs();
  saveData(data); renderStatus(); renderCostsSummary(); renderCalc();

  // format zurück
  writeFixedStandardToInputs();
  writeVolumeAssumptionsToInputs();
}

/* ========== Rezepte (1 Portion) ========== */
function getFilteredRecipes() {
  const q = (recSearch?.value || "").trim().toLowerCase();
  const list = data.products.recipes || [];
  if (!q) return list;
  return list.filter((r) => (r.name || "").toLowerCase().includes(q));
}
function ingredientOptionsHtml(selectedId) {
  const ings = data.catalog.ingredients || [];
  if (ings.length === 0) return `<option value="">(Keine Zutaten – zuerst Zutaten anlegen)</option>`;
  return [
    `<option value="">— wählen —</option>`,
    ...ings.map((ing) => {
      const sel = ing.id === selectedId ? "selected" : "";
      const label = `${escapeHtml(ing.name)} (${escapeHtml(ing.baseUnit)})`;
      return `<option value="${ing.id}" ${sel}>${label}</option>`;
    })
  ].join("");
}
function makeUnitSelectHtml(selectedUnit) {
  const units = ["g", "ml", "pc"];
  return units.map((u) => `<option value="${u}" ${u === selectedUnit ? "selected" : ""}>${u}</option>`).join("");
}
function makeRecIngRow(ingredientId = "", qty = "", unit = "g") {
  const tr = document.createElement("tr");
  const qtyVal = qty === "" || qty == null ? "" : String(qty).replace(".", ",");
  tr.innerHTML = `
    <td><select class="input" data-rig="ing">${ingredientOptionsHtml(ingredientId)}</select></td>
    <td><input class="input" data-rig="qty" inputmode="decimal" placeholder="z.B. 180" value="${escapeHtml(qtyVal)}" /></td>
    <td><select class="input" data-rig="unit">${makeUnitSelectHtml(unit)}</select></td>
    <td class="actions"><button class="btn btnDanger" data-rig="remove" formnovalidate>Entfernen</button></td>
  `;
  return tr;
}
function addRecIngredientLine() { recIngTbody.appendChild(makeRecIngRow("", "", "g")); }
function fillPackagingSetOptions(selectedId) {
  const sets = data.catalog.packagingSets || [];
  rPackSet.innerHTML = "";
  for (const s of sets) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name || s.id;
    if (s.id === selectedId) opt.selected = true;
    rPackSet.appendChild(opt);
  }
  if (!rPackSet.value && sets.length > 0) rPackSet.value = sets[0].id;
}

function renderRecipeCards(list) {
  if (!recipeCards) return;
  recipeCards.innerHTML = "";
  for (const r of list) {
    const div = document.createElement("div");
    div.className = "recipeCard";
    const target = r?.pricing?.targetDBEuro;
    div.innerHTML = `
      <h4>${escapeHtml(r.name)}</h4>
      <div class="recipeMeta">${escapeHtml(getVatLabel(r.vatCategory))}</div>
      <div class="recipeMeta">Ziel-Überschuss: ${
        (Number.isFinite(Number(target)) && Number(target) > 0) ? escapeHtml(formatEuro(target)) : "—"
      }</div>
      <button class="btn" data-rec="edit" data-id="${r.id}">Bearbeiten</button>
    `;
    recipeCards.appendChild(div);
  }
}

function syncRecipeViewModeUI() {
  const mode = recipeViewMode?.value || "table";
  if (mode === "cards") {
    recipesTableWrap?.classList.add("hidden");
    recipeCards?.classList.remove("hidden");
  } else {
    recipesTableWrap?.classList.remove("hidden");
    recipeCards?.classList.add("hidden");
  }
}

function renderRecipes() {
  const listAll = data.products.recipes || [];
  const list = getFilteredRecipes();
  recEmpty.style.display = (listAll.length === 0) ? "block" : "none";

  recTbody.innerHTML = "";
  for (const r of list) {
    const tr = document.createElement("tr");
    const target = r?.pricing?.targetDBEuro;
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(getVatLabel(r.vatCategory))}</td>
      <td>${(Number.isFinite(Number(target)) && Number(target) > 0) ? formatEuro(target).replace(" €","") : "—"}</td>
      <td class="actions"><button class="btn" data-rec="edit" data-id="${r.id}">Bearbeiten</button></td>
    `;
    recTbody.appendChild(tr);
  }

  renderRecipeCards(list);
  syncRecipeViewModeUI();

  renderCalcOptions();
  renderCalc();
}

function showRecError(text) {
  recError.textContent = text;
  recError.classList.remove("hidden");
}

function openRecipeModalAdd() {
  recModalMode = "add"; editingRecId = null;
  recTitle.textContent = "Rezept hinzufügen (1 Portion)";
  btnRecDelete.classList.add("hidden");
  recError.classList.add("hidden"); recError.textContent = "";
  rName.value = ""; rVat.value = "food";
  rLoss.value = "";
  fillPackagingSetOptions("pack_default");
  rTargetDB.value = "";
  recIngTbody.innerHTML = ""; addRecIngredientLine();
  recModal.showModal(); rName.focus();
}

function openRecipeModalEdit(id) {
  const r = data.products.recipes.find((x) => x.id === id);
  if (!r) return;
  recModalMode = "edit"; editingRecId = id;
  recTitle.textContent = "Rezept bearbeiten (1 Portion)";
  btnRecDelete.classList.remove("hidden");
  recError.classList.add("hidden"); recError.textContent = "";
  rName.value = r.name ?? "";
  rVat.value = r.vatCategory ?? "food";
  const lossPct = r.lossPercent != null ? (Number(r.lossPercent) * 100) : "";
  rLoss.value = lossPct !== "" ? String(lossPct).replace(".", ",") : "";
  fillPackagingSetOptions(r.packagingSetId ?? "pack_default");
  rTargetDB.value = r?.pricing?.targetDBEuro != null ? String(r.pricing.targetDBEuro).replace(".", ",") : "";

  recIngTbody.innerHTML = "";
  for (const line of (r.ingredients || [])) recIngTbody.appendChild(makeRecIngRow(line.ingredientId, line.qty, line.unit));
  if ((r.ingredients || []).length === 0) addRecIngredientLine();

  recModal.showModal(); rName.focus();
}

function readRecipeFromModal() {
  const name = (rName.value || "").trim();
  const vatCategory = (rVat.value || "food").trim();
  if (!name) return { ok: false, error: "Name ist erforderlich." };

  // target € optional
  let targetEuro = null;
  const tRaw = String(rTargetDB.value || "").trim();
  if (tRaw !== "") {
    const t = normalizeNumber(tRaw);
    if (!Number.isFinite(t) || t <= 0) return { ok: false, error: "Ziel-Überschuss (€) muss leer sein oder > 0." };
    targetEuro = t;
  }

  let lossPercent = null;
  const lpRaw = String(rLoss.value || "").trim();
  if (lpRaw !== "") {
    const lp = normalizeNumber(lpRaw);
    if (!Number.isFinite(lp) || lp < 0) return { ok: false, error: "Schwund/Verlust % muss ≥ 0 sein." };
    lossPercent = lp / 100;
  }

  const packSetId = (rPackSet.value || "pack_default").trim();

  const ingredients = [];
  const rows = Array.from(recIngTbody.querySelectorAll("tr"));
  for (const tr of rows) {
    const sel = tr.querySelector('select[data-rig="ing"]');
    const qtyEl = tr.querySelector('input[data-rig="qty"]');
    const unitEl = tr.querySelector('select[data-rig="unit"]');

    const ingId = (sel?.value || "").trim();
    const qtyStr = (qtyEl?.value || "").trim();
    const unit = (unitEl?.value || "g").trim();

    if (!ingId && !qtyStr) continue;
    if (!ingId) return { ok: false, error: "Eine Zutatenzeile hat keine Zutat ausgewählt." };

    const qty = normalizeNumber(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Eine Zutatenzeile hat eine ungültige Menge." };

    ingredients.push({ ingredientId: ingId, qty, unit });
  }
  if (ingredients.length === 0) return { ok: false, error: "Mindestens 1 Zutat hinzufügen." };

  return {
    ok: true,
    recipe: {
      name,
      vatCategory,
      lossPercent: lossPercent != null ? lossPercent : undefined,
      packagingSetId: packSetId,
      pricing: { targetDBEuro: targetEuro }, // market/sell bleibt
      ingredients,
      notes: ""
    }
  };
}

function saveRecipeFromModal() {
  const parsed = readRecipeFromModal();
  if (!parsed.ok) return showRecError(parsed.error);

  if (recModalMode === "add") {
    data.products.recipes.push({
      id: uid("rec"),
      ...parsed.recipe,
      pricing: { ...(parsed.recipe.pricing || {}), marketGross: null, sellGross: null }
    });
  } else {
    const idx = data.products.recipes.findIndex((x) => x.id === editingRecId);
    if (idx >= 0) {
      const prev = data.products.recipes[idx];
      const mergedPricing = { ...(prev.pricing || {}), ...(parsed.recipe.pricing || {}) };
      if (mergedPricing.marketGross == null) mergedPricing.marketGross = prev?.pricing?.marketGross ?? null;
      if (mergedPricing.sellGross == null) mergedPricing.sellGross = prev?.pricing?.sellGross ?? null;
      data.products.recipes[idx] = { ...prev, ...parsed.recipe, id: editingRecId, pricing: mergedPricing };
    }
  }

  saveData(data); renderStatus(); renderRecipes();
}

function deleteRecipeFromModal() {
  if (!editingRecId) return;
  data.products.recipes = data.products.recipes.filter((x) => x.id !== editingRecId);
  saveData(data); renderStatus(); renderRecipes();
}

/* ========== Kalkulation ========== */
function setCalcError(text) {
  if (!text) { calcErrors.classList.add("hidden"); calcErrors.textContent = ""; }
  else { calcErrors.textContent = text; calcErrors.classList.remove("hidden"); }
}
function renderCalcOptions() {
  const list = data.products.recipes || [];
  calcRecipeSelect.innerHTML = "";
  if (list.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "(Keine Rezepte – zuerst Rezepte anlegen)";
    calcRecipeSelect.appendChild(opt);
    calcRecipeSelect.disabled = true;
    return;
  }
  calcRecipeSelect.disabled = false;
  const current = calcRecipeSelect.value;
  for (const r of list) {
    const opt = document.createElement("option");
    opt.value = r.id; opt.textContent = r.name;
    calcRecipeSelect.appendChild(opt);
  }
  if (current && list.some((r) => r.id === current)) calcRecipeSelect.value = current;
  else calcRecipeSelect.value = list[0].id;
}

function syncCalcModeUI() {
  const mode = data.settings.calc.mode;
  if (mode === "pct") {
    calcDbPctWrap.classList.remove("hidden");
    calcTargetEuroWrap.classList.add("hidden");
  } else {
    calcDbPctWrap.classList.add("hidden");
    calcTargetEuroWrap.classList.remove("hidden");
  }
}

function setMarketSellInputsFromRecipe(recipe) {
  const mg = recipe?.pricing?.marketGross;
  const sg = recipe?.pricing?.sellGross;

  // allow raw string in storage too (during typing)
  const mgText = (mg == null) ? "" : String(mg);
  const sgText = (sg == null) ? "" : String(sg);

  calcMarketGross.value = mgText.replace(".", ",");
  calcSellGross.value = sgText.replace(".", ",");
}

function clearMarketSellOutputs() {
  calcDiffMin.textContent = "—";
  calcDiffMarket.textContent = "—";
  calcSellNet.textContent = "—";
  calcSellDb.textContent = "—";
}

function getSelectedRecipe() {
  const id = calcRecipeSelect.value;
  return (data.products.recipes || []).find((x) => x.id === id) || null;
}

function renderCalc() {
  const fields = [
    calcCostIngredients, calcCostPackaging, calcCostFixed, calcCostTotal,
    calcTargetDB, calcVat, calcGrossRounded, calcNetImplied,
    calcDbEuro, calcDbPct
  ];
  for (const el of fields) el.textContent = "—";
  setCalcError("");
  clearMarketSellOutputs();

  const r = getSelectedRecipe();
  if (!r) return setCalcError("Bitte ein Rezept auswählen.");

  const costRes = calcCostResult(data, "recipe", r, "de");
  if (!costRes.ok) return setCalcError((costRes.errors || []).join(" "));
  const out = costRes.result;

  calcCostIngredients.textContent = formatEuro(out.costs.baseCost);
  calcCostPackaging.textContent = formatEuro(out.costs.packaging);
  calcCostFixed.textContent = formatEuro(out.costs.fixed);
  calcCostTotal.textContent = formatEuro(out.costs.totalCostPerPortion);
  calcVat.textContent = `${getVatLabel(out.vatCategory)} (${Math.round(out.vatRate * 100)}%)`;

  const mode = data.settings.calc.mode;

  let minGross = NaN;

  if (mode === "pct") {
    const pct = Number(data.settings.calc.targetDbPct);
    const price = calcPriceFromTargetDbPct({
      costPerPortion: out.costs.totalCostPerPortion,
      targetDbPct: pct,
      vatRate: out.vatRate,
      roundingStep: data?.settings?.rounding?.step ?? 0.10,
      lang: "de"
    });
    if (!price.ok) return setCalcError(price.error);

    calcTargetDB.textContent = formatPct(pct);
    calcGrossRounded.textContent = formatEuro(price.grossRounded);
    calcNetImplied.textContent = formatEuro(price.netImplied);

    const dbEuroMin = price.netImplied - out.costs.totalCostPerPortion;
    const dbPctMin = price.netImplied > 0 ? dbEuroMin / price.netImplied : 0;
    calcDbEuro.textContent = formatEuro(dbEuroMin);
    calcDbPct.textContent = formatPct(dbPctMin);

    minGross = price.grossRounded;
  } else {
    // € mode requires targetDBEuro present
    const resEuro = calcProductResult(data, "recipe", r, "de");
    if (!resEuro.ok) return setCalcError((resEuro.errors || []).join(" "));
    const p = resEuro.result.pricing;

    calcTargetDB.textContent = formatEuro(p.targetEuro);
    calcGrossRounded.textContent = formatEuro(p.grossRounded);
    calcNetImplied.textContent = formatEuro(p.netImplied);

    calcDbEuro.textContent = formatEuro(p.dbEuro);
    calcDbPct.textContent = formatPct(p.dbPct);

    minGross = p.grossRounded;
  }

  // market/sell compare
  const marketGross = Number(r?.pricing?.marketGross);
  const sellGross = Number(r?.pricing?.sellGross);

  if (Number.isFinite(sellGross) && sellGross > 0) {
    const sellNetV = sellGross / (1 + out.vatRate);
    const dbEuroSell = sellNetV - out.costs.totalCostPerPortion;
    const dbPctSell = sellNetV > 0 ? dbEuroSell / sellNetV : 0;

    calcSellNet.textContent = formatEuro(sellNetV);
    calcSellDb.textContent = `${formatEuro(dbEuroSell)}  |  ${formatPct(dbPctSell)}`;

    if (Number.isFinite(minGross)) calcDiffMin.textContent = formatEuroSigned(sellGross - minGross);
    if (Number.isFinite(marketGross) && marketGross > 0) calcDiffMarket.textContent = formatEuroSigned(sellGross - marketGross);
    else calcDiffMarket.textContent = "—";
  }
}

/* ========== Events ========== */
tabButtons.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

// Zutaten
btnAddIngredient?.addEventListener("click", openIngredientModalAdd);
ingSearch?.addEventListener("input", renderIngredients);
ingTbody.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.action === "edit") openIngredientModalEdit(t.dataset.id);
});
modalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const action = e.submitter?.value || "save";
  if (action === "save") saveIngredientFromModal();
  if (action === "delete") deleteIngredientFromModal();
  modal.close();
});

// Fixkosten custom
btnAddFixedCustom?.addEventListener("click", addFixedCustomRow);
fixedCustomTbody?.addEventListener("input", handleFixedCustomInput);
fixedCustomTbody?.addEventListener("blur", handleFixedCustomBlur, true);
fixedCustomTbody?.addEventListener("click", handleFixedCustomClick);

// Fixkosten standard + volumes: input nur tippen, blur rechnen
openDaysPerMonthEl?.addEventListener("input", handleCostsStdInputRaw);
expectedPortionsPerOpenDayEl?.addEventListener("input", handleCostsStdInputRaw);
overrideMonthlyPortionsEl?.addEventListener("input", handleCostsStdInputRaw);
fc_rent?.addEventListener("input", handleCostsStdInputRaw);
fc_insurance?.addEventListener("input", handleCostsStdInputRaw);
fc_phoneInternet?.addEventListener("input", handleCostsStdInputRaw);
fc_equipmentLeasing?.addEventListener("input", handleCostsStdInputRaw);
fc_accounting?.addEventListener("input", handleCostsStdInputRaw);
fc_other?.addEventListener("input", handleCostsStdInputRaw);

openDaysPerMonthEl?.addEventListener("blur", handleCostsStdBlur);
expectedPortionsPerOpenDayEl?.addEventListener("blur", handleCostsStdBlur);
overrideMonthlyPortionsEl?.addEventListener("blur", handleCostsStdBlur);
fc_rent?.addEventListener("blur", handleCostsStdBlur);
fc_insurance?.addEventListener("blur", handleCostsStdBlur);
fc_phoneInternet?.addEventListener("blur", handleCostsStdBlur);
fc_equipmentLeasing?.addEventListener("blur", handleCostsStdBlur);
fc_accounting?.addEventListener("blur", handleCostsStdBlur);
fc_other?.addEventListener("blur", handleCostsStdBlur);

// Rezepte
btnAddRecipe?.addEventListener("click", openRecipeModalAdd);
recSearch?.addEventListener("input", renderRecipes);

recipeViewMode?.addEventListener("change", () => {
  syncRecipeViewModeUI();
});

recTbody.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.rec === "edit") openRecipeModalEdit(t.dataset.id);
});
recipeCards?.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.rec === "edit") openRecipeModalEdit(t.dataset.id);
});

btnAddRecIng?.addEventListener("click", (e) => { e.preventDefault(); addRecIngredientLine(); });
recIngTbody.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.rig === "remove") {
    e.preventDefault();
    const tr = t.closest("tr");
    if (tr) tr.remove();
  }
});
recForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const action = e.submitter?.value || "save";
  if (action === "save") saveRecipeFromModal();
  if (action === "delete") deleteRecipeFromModal();
  recModal.close();
});

// Kalkulation
calcRecipeSelect?.addEventListener("change", () => {
  const r = getSelectedRecipe();
  if (r) setMarketSellInputsFromRecipe(r);
  renderCalc();
});
btnCalcRefresh?.addEventListener("click", renderCalc);

// mode switch (safe)
calcMode?.addEventListener("change", () => {
  data.settings.calc.mode = calcMode.value;
  saveData(data);
  syncCalcModeUI();
  renderCalc();
});

// DB%: input tippen erlauben, normalisieren bei blur
calcDbPctInput?.addEventListener("input", () => {
  // nur tippen, NICHT rechnen
});
calcDbPctInput?.addEventListener("blur", () => {
  const v = normalizeNumber(calcDbPctInput.value);
  if (Number.isFinite(v) && v > 0 && v < 100) {
    data.settings.calc.targetDbPct = v / 100;
    saveData(data);
    // format back
    calcDbPctInput.value = String(v).replace(".", ",");
    renderCalc();
  }
});

// Markt/Verkauf: input => RAW speichern (damit Komma bleibt), blur => normalisieren + rechnen
function updateRecipePricingField(field, rawValue) {
  const r = getSelectedRecipe();
  if (!r) return;
  if (!r.pricing) r.pricing = {};

  const raw = String(rawValue ?? "");
  const v = normalizeNumber(raw);

  if (raw.trim() === "") r.pricing[field] = null;
  else r.pricing[field] = (Number.isFinite(v) && v > 0) ? v : null;

  saveData(data);
  renderCalc();
}

calcMarketGross?.addEventListener("input", () => {
  const r = getSelectedRecipe();
  if (!r) return;
  if (!r.pricing) r.pricing = {};
  r.pricing.marketGross = calcMarketGross.value; // RAW string during typing
  saveData(data);
});
calcMarketGross?.addEventListener("blur", () => {
  updateRecipePricingField("marketGross", calcMarketGross.value);
  // format back if valid
  const r = getSelectedRecipe();
  const v = Number(r?.pricing?.marketGross);
  calcMarketGross.value = (Number.isFinite(v) && v > 0) ? String(v).replace(".", ",") : "";
});

calcSellGross?.addEventListener("input", () => {
  const r = getSelectedRecipe();
  if (!r) return;
  if (!r.pricing) r.pricing = {};
  r.pricing.sellGross = calcSellGross.value; // RAW string during typing
  saveData(data);
});
calcSellGross?.addEventListener("blur", () => {
  updateRecipePricingField("sellGross", calcSellGross.value);
  const r = getSelectedRecipe();
  const v = Number(r?.pricing?.sellGross);
  calcSellGross.value = (Number.isFinite(v) && v > 0) ? String(v).replace(".", ",") : "";
});

// Export/Import/Reset JSON
btnExport?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "foodtruck-pricing.json";
  a.click();
  URL.revokeObjectURL(url);
});
fileImport?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const txt = await file.text();
  data = JSON.parse(txt);
  saveData(data);
  initFromData();
  fileImport.value = "";
});
btnReset?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  data = createEmptyData();
  saveData(data);
  initFromData();
});

/* =========================
   CSV Export / Import
   ========================= */

btnExportIngredientsCsv?.addEventListener("click", () => {
  const rows = [
    ["ID_Zutat","Name","Food/Drink","BaseUnit","Preis_pro_BaseUnit_EUR","Vendor","Notizen"]
  ];

  for (const ing of (data.catalog.ingredients || [])) {
    rows.push([
      ing.id || "",
      ing.name || "",
      "", // Food/Drink currently recipe-level; keep column for your Excel convenience
      (ing.baseUnit || "kg"),
      (Number(ing.pricePerBaseUnit) || 0).toString().replace(".", ","),
      ing.supplier || "",
      ing.notes || ""
    ]);
  }

  downloadCsv("ingredients.csv", rows);
});

btnExportRecipesCsv?.addEventListener("click", () => {
  const rows = [
    ["Recipe_ID","Recipe_Name","VatCategory","LossPct","PackagingSetId","TargetDBEuro","Ingredient_ID","Qty","Unit"]
  ];

  for (const r of (data.products.recipes || [])) {
    const lossPct = (r.lossPercent != null && Number.isFinite(Number(r.lossPercent)))
      ? String(Number(r.lossPercent) * 100).replace(".", ",")
      : "";
    const target = (r.pricing?.targetDBEuro != null && Number.isFinite(Number(r.pricing.targetDBEuro)))
      ? String(Number(r.pricing.targetDBEuro)).replace(".", ",")
      : "";

    for (const line of (r.ingredients || [])) {
      rows.push([
        r.id || "",
        r.name || "",
        r.vatCategory || "food",
        lossPct,
        r.packagingSetId || "pack_default",
        target,
        line.ingredientId || "",
        String(line.qty ?? "").replace(".", ","),
        line.unit || "g"
      ]);
    }
  }

  downloadCsv("recipes.csv", rows);
});

fileImportCsv?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  const { headers, items } = parseCsvSemicolon(text);

  const hasIngredientsHeader = headers.includes("ID_Zutat") && headers.includes("Preis_pro_BaseUnit_EUR");
  const hasRecipesHeader = headers.includes("Recipe_ID") && headers.includes("Ingredient_ID") && headers.includes("Qty");

  // IMPORT: Ingredients
  if (hasIngredientsHeader) {
    for (const row of items) {
      const id = (row["ID_Zutat"] || "").trim();
      const name = (row["Name"] || "").trim();
      if (!id || !name) continue;

      const baseUnit = ((row["BaseUnit"] || "kg").trim() || "kg").toLowerCase();
      const price = normalizeNumber(row["Preis_pro_BaseUnit_EUR"]);
      const supplier = (row["Vendor"] || "").trim();
      const notes = (row["Notizen"] || "").trim();

      // only allow kg/l/pc to keep engine assumptions
      const unitSafe = (baseUnit === "kg" || baseUnit === "l" || baseUnit === "pc") ? baseUnit : "kg";

      const obj = {
        id,
        name,
        baseUnit: unitSafe,
        pricePerBaseUnit: Number.isFinite(price) ? price : 0,
        supplier,
        notes
      };

      const existing = (data.catalog.ingredients || []).find((x) => x.id === id);
      if (existing) Object.assign(existing, obj);
      else data.catalog.ingredients.push(obj);
    }
  }

  // IMPORT: Recipes (long format)
  if (hasRecipesHeader) {
    const grouped = new Map();

    for (const row of items) {
      const recipeId = (row["Recipe_ID"] || "").trim();
      const recipeName = (row["Recipe_Name"] || "").trim();

      if (!recipeId || !recipeName) continue;

      if (!grouped.has(recipeId)) {
        const vatCategoryRaw = (row["VatCategory"] || "food").trim().toLowerCase();
        const vatCategory = (vatCategoryRaw === "drink") ? "drink" : "food";

        const lossPctRaw = String(row["LossPct"] || "").trim();
        let lossPercent = undefined;
        if (lossPctRaw !== "") {
          const lp = normalizeNumber(lossPctRaw);
          if (Number.isFinite(lp) && lp >= 0) lossPercent = lp / 100;
        }

        const targetRaw = String(row["TargetDBEuro"] || "").trim();
        let targetDBEuro = null;
        if (targetRaw !== "") {
          const t = normalizeNumber(targetRaw);
          if (Number.isFinite(t) && t > 0) targetDBEuro = t;
        }

        grouped.set(recipeId, {
          id: recipeId,
          name: recipeName,
          vatCategory,
          lossPercent,
          packagingSetId: (row["PackagingSetId"] || "pack_default").trim() || "pack_default",
          pricing: { targetDBEuro, marketGross: null, sellGross: null },
          ingredients: [],
          notes: ""
        });
      }

      const rec = grouped.get(recipeId);

      const ingredientId = (row["Ingredient_ID"] || "").trim();
      const qty = normalizeNumber(row["Qty"]);
      const unitRaw = (row["Unit"] || "g").trim().toLowerCase();
      const unit = (unitRaw === "ml" || unitRaw === "pc" || unitRaw === "g") ? unitRaw : "g";

      if (!ingredientId) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      rec.ingredients.push({ ingredientId, qty, unit });
    }

    for (const rec of grouped.values()) {
      if (!rec.ingredients.length) continue;

      const existing = (data.products.recipes || []).find((x) => x.id === rec.id);
      if (existing) {
        // keep market/sell if present on existing
        const prevPricing = existing.pricing || {};
        rec.pricing.marketGross = prevPricing.marketGross ?? rec.pricing.marketGross;
        rec.pricing.sellGross = prevPricing.sellGross ?? rec.pricing.sellGross;
        Object.assign(existing, rec);
      } else {
        data.products.recipes.push(rec);
      }
    }
  }

  saveData(data);
  initFromData();
  fileImportCsv.value = "";
});

/* init */
function initFromData() {
  ensureDataShape();
  renderStatus();
  renderIngredients();

  writeVolumeAssumptionsToInputs();
  writeFixedStandardToInputs();
  renderFixedCustomTable();
  renderCostsSummary();

  renderRecipes();
  renderCalcOptions();

  calcMode.value = data.settings.calc.mode;
  calcDbPctInput.value = (data.settings.calc.targetDbPct * 100).toString().replace(".", ",");
  syncCalcModeUI();

  const r = getSelectedRecipe();
  if (r) setMarketSellInputsFromRecipe(r);

  // default recipe view
  syncRecipeViewModeUI();

  renderCalc();
}

setTab("ingredients");
initFromData();
