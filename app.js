// app.js
import { loadData, saveData, createEmptyData } from "./data.js";
import { calcCostResult, calcProductResult, calcPriceFromTargetDbPct } from "./engine.js";

let data = loadData();
const $ = (id) => document.getElementById(id);

/* ===== utils ===== */
function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 9)}${Date.now().toString(16).slice(-4)}`;
}

function normalizeNumber(input) {
  const raw = String(input ?? "").trim();
  if (raw === "") return NaN;

  let s = raw.replace(/\s/g, "");
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
    data.costModel.volumeAssumptions = { openDaysPerMonth: 12, expectedPortionsPerOpenDay: 80, overrideExpectedPortionsPerMonth: null };
  }

  // cleanup old dailyCosts if present
  if (data.costModel.dailyCosts) delete data.costModel.dailyCosts;

  saveData(data);
}

/* ===== top ===== */
const statusEl = $("status");
const btnExport = $("btnExport");
const fileImport = $("fileImport");
const btnReset = $("btnReset");

/* ===== tabs ===== */
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll("[data-panel]"));

function setTab(name) {
  tabButtons.forEach((b) => b.classList.toggle("isActive", b.dataset.tab === name));
  panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
}
tabButtons.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

/* ===== status ===== */
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

/* =======================
   Zutaten
======================= */
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

  saveData(data);
  renderStatus(); renderIngredients(); renderRecipes(); renderCalcOptions();
  renderCalc(true);
}

function deleteIngredientFromModal() {
  if (!editingId) return;
  data.catalog.ingredients = data.catalog.ingredients.filter((x) => x.id !== editingId);
  saveData(data);
  renderStatus(); renderIngredients(); renderRecipes(); renderCalcOptions();
  renderCalc(true);
}

/* =======================
   Fixkosten
======================= */
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
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="input" data-fc="label" data-id="${row.id}" value="${escapeHtml(row.label || "")}" placeholder="z.B. IHK" /></td>
      <td><input class="input" data-fc="amount" data-id="${row.id}" inputmode="decimal" value="${row.amount ?? ""}" placeholder="0,00" /></td>
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
  saveData(data);
  renderStatus(); renderFixedCustomTable(); renderCostsSummary();
  renderCalc(true);
}

function handleFixedCustomInput(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  const id = t.dataset.id; const field = t.dataset.fc;
  if (!id || !field) return;
  const row = data.costModel.fixedCostsMonthly.custom.find((x) => x.id === id);
  if (!row) return;

  if (field === "label") row.label = t.value;
  if (field === "amount") {
    const v = normalizeNumber(t.value);
    row.amount = Number.isFinite(v) ? v : 0;
  }
  saveData(data);
  renderStatus(); renderCostsSummary();
  renderCalc(true);
}

function handleFixedCustomClick(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.fc === "remove") {
    const id = t.dataset.id;
    data.costModel.fixedCostsMonthly.custom = data.costModel.fixedCostsMonthly.custom.filter((x) => x.id !== id);
    saveData(data);
    renderStatus(); renderFixedCustomTable(); renderCostsSummary();
    renderCalc(true);
  }
}

function handleCostsInputsChange() {
  readVolumeAssumptionsFromInputs();
  readFixedStandardFromInputs();
  saveData(data);
  renderStatus(); renderCostsSummary();
  renderCalc(true);
}

/* =======================
   Rezepte (pro Portion)
======================= */
const recSearch = $("recSearch");
const btnAddRecipe = $("btnAddRecipe");
const recTbody = $("recTbody");
const recEmpty = $("recEmpty");

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
  const units = ["kg", "g", "mg", "l", "ml", "pc"];
  return units.map((u) => `<option value="${u}" ${u === selectedUnit ? "selected" : ""}>${u}</option>`).join("");
}

function makeRecIngRow(ingredientId = "", qty = "", unit = "g") {
  const tr = document.createElement("tr");
  const qtyVal = qty === "" || qty == null ? "" : String(qty).replace(".", ",");
  tr.innerHTML = `
    <td><select class="input" data-rig="ing">${ingredientOptionsHtml(ingredientId)}</select></td>
    <td><input class="input" data-rig="qty" inputmode="decimal" placeholder="z.B. 250" value="${escapeHtml(qtyVal)}" /></td>
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

function renderRecipes() {
  const listAll = data.products.recipes || [];
  const list = getFilteredRecipes();
  recEmpty.style.display = (listAll.length === 0) ? "block" : "none";

  recTbody.innerHTML = "";
  for (const r of list) {
    const target = r?.pricing?.targetDBEuro;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(getVatLabel(r.vatCategory))}</td>
      <td>${Number.isFinite(Number(target)) && Number(target) > 0 ? formatEuro(target).replace(" €","") : "—"}</td>
      <td class="actions"><button class="btn" data-rec="edit" data-id="${r.id}">Bearbeiten</button></td>
    `;
    recTbody.appendChild(tr);
  }

  renderCalcOptions();
}

function showRecError(text) {
  recError.textContent = text;
  recError.classList.remove("hidden");
}

function openRecipeModalAdd() {
  recModalMode = "add"; editingRecId = null;
  recTitle.textContent = "Rezept hinzufügen";
  btnRecDelete.classList.add("hidden");
  recError.classList.add("hidden"); recError.textContent = "";
  rName.value = ""; rVat.value = "food"; rLoss.value = "";
  fillPackagingSetOptions("pack_default");
  rTargetDB.value = "";
  recIngTbody.innerHTML = ""; addRecIngredientLine();
  recModal.showModal(); rName.focus();
}

function openRecipeModalEdit(id) {
  const r = data.products.recipes.find((x) => x.id === id);
  if (!r) return;
  recModalMode = "edit"; editingRecId = id;
  recTitle.textContent = "Rezept bearbeiten";
  btnRecDelete.classList.remove("hidden");
  recError.classList.add("hidden"); recError.textContent = "";
  rName.value = r.name ?? "";
  rVat.value = r.vatCategory ?? "food";
  const lossPct = r.lossPercent != null ? (Number(r.lossPercent) * 100) : "";
  rLoss.value = lossPct !== "" && Number.isFinite(lossPct) ? String(lossPct).replace(".", ",") : "";
  fillPackagingSetOptions(r.packagingSetId ?? "pack_default");
  const t = r?.pricing?.targetDBEuro;
  rTargetDB.value = (Number.isFinite(Number(t)) && Number(t) > 0) ? String(t).replace(".", ",") : "";
  recIngTbody.innerHTML = "";
  for (const line of (r.ingredients || [])) recIngTbody.appendChild(makeRecIngRow(line.ingredientId, line.qty, line.unit));
  if ((r.ingredients || []).length === 0) addRecIngredientLine();
  recModal.showModal(); rName.focus();
}

function readRecipeFromModal() {
  const name = (rName.value || "").trim();
  const vatCategory = (rVat.value || "food").trim();
  if (!name) return { ok: false, error: "Name ist erforderlich." };

  let lossPercent = null;
  const lpRaw = String(rLoss.value || "").trim();
  if (lpRaw !== "") {
    const lp = normalizeNumber(lpRaw);
    if (!Number.isFinite(lp) || lp < 0) return { ok: false, error: "Schwund/Verlust % muss ≥ 0 sein." };
    lossPercent = lp / 100;
  }

  const packSetId = (rPackSet.value || "pack_default").trim();

  let targetDBEuro = null;
  const tRaw = String(rTargetDB.value || "").trim();
  if (tRaw !== "") {
    const t = normalizeNumber(tRaw);
    if (!Number.isFinite(t) || t <= 0) return { ok: false, error: "Ziel-Überschuss (€) muss leer sein oder > 0." };
    targetDBEuro = t;
  }

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
      pricing: {
        targetDBEuro: targetDBEuro,
        marketPriceGross: null,
        sellPriceGross: null
      },
      ingredients,
      notes: ""
    }
  };
}

function saveRecipeFromModal() {
  const parsed = readRecipeFromModal();
  if (!parsed.ok) return showRecError(parsed.error);

  if (recModalMode === "add") data.products.recipes.push({ id: uid("rec"), ...parsed.recipe });
  else {
    const idx = data.products.recipes.findIndex((x) => x.id === editingRecId);
    if (idx >= 0) {
      const prev = data.products.recipes[idx];
      const mergedPricing = { ...(prev.pricing || {}), ...(parsed.recipe.pricing || {}) };
      data.products.recipes[idx] = { ...prev, ...parsed.recipe, id: editingRecId, pricing: mergedPricing };
    }
  }

  saveData(data);
  renderStatus(); renderRecipes(); renderCalcOptions();
  renderCalc(true);
}

function deleteRecipeFromModal() {
  if (!editingRecId) return;
  data.products.recipes = data.products.recipes.filter((x) => x.id !== editingRecId);
  saveData(data);
  renderStatus(); renderRecipes(); renderCalcOptions();
  renderCalc(true);
}

/* =======================
   Kalkulation
======================= */
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
const calcMinGross = $("calcMinGross");
const calcMinNet = $("calcMinNet");

const marketPriceGross = $("marketPriceGross");
const sellPriceGross = $("sellPriceGross");
const sellNet = $("sellNet");
const gapToMarket = $("gapToMarket");

const calcDbEuro = $("calcDbEuro");
const calcDbPct = $("calcDbPct");
const calcErrors = $("calcErrors");

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

function renderCalc(forceRebind = false) {
  setCalcError("");

  // reset outputs
  [
    calcCostIngredients, calcCostPackaging, calcCostFixed, calcCostTotal,
    calcTargetDB, calcVat, calcMinGross, calcMinNet,
    sellNet, gapToMarket, calcDbEuro, calcDbPct
  ].forEach((el) => el.textContent = "—");

  const id = calcRecipeSelect.value;
  const r = (data.products.recipes || []).find((x) => x.id === id);
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

  let minGross = null;
  let minNet = null;

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
    minGross = price.grossRounded;
    minNet = price.netImplied;
  } else {
    const targetEuro = Number(r?.pricing?.targetDBEuro);
    if (!Number.isFinite(targetEuro) || targetEuro <= 0) {
      return setCalcError("Im €-Modus braucht das Rezept einen Ziel-Überschuss > 0 (im Rezept eintragen).");
    }
    const resEuro = calcProductResult(data, "recipe", r, "de");
    if (!resEuro.ok) return setCalcError((resEuro.errors || []).join(" "));
    calcTargetDB.textContent = formatEuro(resEuro.result.pricing.targetEuro);
    minGross = resEuro.result.pricing.grossRounded;
    minNet = resEuro.result.pricing.netImplied;
  }

  calcMinGross.textContent = formatEuro(minGross);
  calcMinNet.textContent = formatEuro(minNet);

  // Bind inputs per recipe (persist)
  if (forceRebind || marketPriceGross.dataset.boundId !== r.id) {
    const m = r?.pricing?.marketPriceGross;
    const s = r?.pricing?.sellPriceGross;
    marketPriceGross.value = Number.isFinite(Number(m)) ? String(m).replace(".", ",") : "";
    sellPriceGross.value = Number.isFinite(Number(s)) ? String(s).replace(".", ",") : "";
    marketPriceGross.dataset.boundId = r.id;
    sellPriceGross.dataset.boundId = r.id;
  }

  const marketGross = normalizeNumber(marketPriceGross.value);
  const sellGross = normalizeNumber(sellPriceGross.value);

  // compute db using sell price if given; else from min price
  let usedNet = Number(minNet);
  if (Number.isFinite(sellGross) && sellGross > 0) {
    usedNet = sellGross / (1 + out.vatRate);
    sellNet.textContent = formatEuro(usedNet);
  }

  const dbEuro = usedNet - out.costs.totalCostPerPortion;
  const dbPct = usedNet > 0 ? dbEuro / usedNet : 0;
  calcDbEuro.textContent = formatEuro(dbEuro);
  calcDbPct.textContent = formatPct(dbPct);

  if (Number.isFinite(marketGross) && marketGross > 0 && Number.isFinite(sellGross) && sellGross > 0) {
    gapToMarket.textContent = formatEuro(sellGross - marketGross);
  }

  // persist market/sell
  if (!r.pricing) r.pricing = {};
  r.pricing.marketPriceGross = Number.isFinite(marketGross) ? marketGross : null;
  r.pricing.sellPriceGross = Number.isFinite(sellGross) ? sellGross : null;
  saveData(data);
}

/* =======================
   Events
======================= */
// Zutaten
btnAddIngredient?.addEventListener("click", openIngredientModalAdd);
ingSearch?.addEventListener("input", renderIngredients);
ingTbody?.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.action === "edit") openIngredientModalEdit(t.dataset.id);
});
modalForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const action = e.submitter?.value || "save";
  if (action === "save") saveIngredientFromModal();
  if (action === "delete") deleteIngredientFromModal();
  modal.close();
});

// Fixkosten
btnAddFixedCustom?.addEventListener("click", addFixedCustomRow);
fixedCustomTbody?.addEventListener("input", handleFixedCustomInput);
fixedCustomTbody?.addEventListener("click", handleFixedCustomClick);
openDaysPerMonthEl?.addEventListener("input", handleCostsInputsChange);
expectedPortionsPerOpenDayEl?.addEventListener("input", handleCostsInputsChange);
overrideMonthlyPortionsEl?.addEventListener("input", handleCostsInputsChange);
fc_rent?.addEventListener("input", handleCostsInputsChange);
fc_insurance?.addEventListener("input", handleCostsInputsChange);
fc_phoneInternet?.addEventListener("input", handleCostsInputsChange);
fc_equipmentLeasing?.addEventListener("input", handleCostsInputsChange);
fc_accounting?.addEventListener("input", handleCostsInputsChange);
fc_other?.addEventListener("input", handleCostsInputsChange);

// Rezepte
btnAddRecipe?.addEventListener("click", openRecipeModalAdd);
recSearch?.addEventListener("input", renderRecipes);
recTbody?.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.rec === "edit") openRecipeModalEdit(t.dataset.id);
});
btnAddRecIng?.addEventListener("click", (e) => { e.preventDefault(); addRecIngredientLine(); });
recIngTbody?.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.rig === "remove") {
    e.preventDefault();
    const tr = t.closest("tr");
    if (tr) tr.remove();
  }
});
recForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const action = e.submitter?.value || "save";
  if (action === "save") saveRecipeFromModal();
  if (action === "delete") deleteRecipeFromModal();
  recModal.close();
});

// Kalkulation
calcRecipeSelect?.addEventListener("change", () => renderCalc(true));
btnCalcRefresh?.addEventListener("click", () => renderCalc(true));
calcMode?.addEventListener("change", () => {
  data.settings.calc.mode = calcMode.value;
  saveData(data);
  syncCalcModeUI();
  renderCalc(true);
});
calcDbPctInput?.addEventListener("input", () => {
  const v = normalizeNumber(calcDbPctInput.value);
  if (Number.isFinite(v)) {
    data.settings.calc.targetDbPct = v / 100;
    saveData(data);
    renderCalc(true);
  }
});
marketPriceGross?.addEventListener("input", () => renderCalc(false));
sellPriceGross?.addEventListener("input", () => renderCalc(false));

// Export/Import/Reset
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
  localStorage.clear();
  data = createEmptyData();
  saveData(data);
  initFromData();
});

/* =======================
   init
======================= */
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

  marketPriceGross.dataset.boundId = "";
  sellPriceGross.dataset.boundId = "";
  renderCalc(true);
}

setTab("ingredients");
initFromData();
