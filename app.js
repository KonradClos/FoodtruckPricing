// app.js
import { loadData, saveData, createEmptyData } from "./data.js";
import {
  calcCostResult,
  calcProductResult,
  calcPriceFromTargetDbPct
} from "./engine.js";

/* =======================
   Helpers & State
======================= */
let data = loadData();
const $ = (id) => document.getElementById(id);

function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 9)}${Date.now().toString(16).slice(-4)}`;
}

// robust DE/EN number parser
function normalizeNumber(input) {
  const raw = String(input ?? "").trim();
  if (raw === "") return NaN;

  let s = raw.replace(/\s/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/\./g, "");
  }

  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
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

/* =======================
   Tabs
======================= */
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll("[data-panel]"));

function setTab(name) {
  tabButtons.forEach((b) => b.classList.toggle("isActive", b.dataset.tab === name));
  panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
}

tabButtons.forEach((btn) =>
  btn.addEventListener("click", () => setTab(btn.dataset.tab))
);

/* =======================
   Zutaten
======================= */
const ingTbody = $("ingTbody");
const ingEmpty = $("ingEmpty");
const ingSearch = $("ingSearch");
const btnAddIngredient = $("btnAddIngredient");

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

let ingMode = "add";
let editingIngId = null;

function renderIngredients() {
  const q = (ingSearch.value || "").toLowerCase();
  const list = data.catalog.ingredients.filter(
    (x) =>
      x.name.toLowerCase().includes(q) ||
      (x.supplier || "").toLowerCase().includes(q)
  );

  ingEmpty.style.display = data.catalog.ingredients.length === 0 ? "block" : "none";
  ingTbody.innerHTML = "";

  for (const ing of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ing.name}</td>
      <td>${ing.baseUnit}</td>
      <td>${formatEuro(ing.pricePerBaseUnit).replace(" €","")}</td>
      <td>${ing.supplier || ""}</td>
      <td class="actions">
        <button class="btn" data-edit="${ing.id}">Bearbeiten</button>
      </td>
    `;
    ingTbody.appendChild(tr);
  }
}

btnAddIngredient.addEventListener("click", () => {
  ingMode = "add";
  editingIngId = null;
  modalTitle.textContent = "Zutat hinzufügen";
  btnDelete.classList.add("hidden");
  modalError.classList.add("hidden");
  modalForm.reset();
  modal.showModal();
});

ingTbody.addEventListener("click", (e) => {
  const id = e.target?.dataset?.edit;
  if (!id) return;
  const ing = data.catalog.ingredients.find((x) => x.id === id);
  if (!ing) return;

  ingMode = "edit";
  editingIngId = id;
  modalTitle.textContent = "Zutat bearbeiten";
  btnDelete.classList.remove("hidden");
  fName.value = ing.name;
  fUnit.value = ing.baseUnit;
  fPrice.value = String(ing.pricePerBaseUnit).replace(".", ",");
  fSupplier.value = ing.supplier || "";
  fNotes.value = ing.notes || "";
  modal.showModal();
});

modalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const action = e.submitter?.value || "save";

  if (action === "delete" && editingIngId) {
    data.catalog.ingredients = data.catalog.ingredients.filter((x) => x.id !== editingIngId);
    saveData(data);
    modal.close();
    renderIngredients();
    renderRecipes();
    return;
  }

  const price = normalizeNumber(fPrice.value);
  if (!fName.value || !Number.isFinite(price)) {
    modalError.textContent = "Name und Preis sind erforderlich.";
    modalError.classList.remove("hidden");
    return;
  }

  const obj = {
    id: editingIngId || uid("ing"),
    name: fName.value.trim(),
    baseUnit: fUnit.value,
    pricePerBaseUnit: price,
    supplier: fSupplier.value.trim(),
    notes: fNotes.value.trim()
  };

  if (ingMode === "add") data.catalog.ingredients.push(obj);
  else {
    const idx = data.catalog.ingredients.findIndex((x) => x.id === editingIngId);
    if (idx >= 0) data.catalog.ingredients[idx] = obj;
  }

  saveData(data);
  modal.close();
  renderIngredients();
  renderRecipes();
});

ingSearch.addEventListener("input", renderIngredients);

/* =======================
   Rezepte (pro Portion)
======================= */
const recTbody = $("recTbody");
const recEmpty = $("recEmpty");
const btnAddRecipe = $("btnAddRecipe");
const recSearch = $("recSearch");

const recModal = $("recModal");
const recForm = $("recForm");
const recError = $("recError");
const recTitle = $("recTitle");
const btnRecDelete = $("btnRecDelete");

const rName = $("rName");
const rVat = $("rVat");
const rLoss = $("rLoss");
const rPackSet = $("rPackSet");
const rTargetDB = $("rTargetDB");
const recIngTbody = $("recIngTbody");
const btnAddRecIng = $("btnAddRecIng");

let recMode = "add";
let editingRecId = null;

function ingredientOptions(selected) {
  return data.catalog.ingredients
    .map(
      (i) =>
        `<option value="${i.id}" ${i.id === selected ? "selected" : ""}>${i.name}</option>`
    )
    .join("");
}

function addRecIngRow(ing = "", qty = "", unit = "g") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><select class="input">${ingredientOptions(ing)}</select></td>
    <td><input class="input qty" value="${qty}" inputmode="decimal"></td>
    <td>
      <select class="input unit">
        <option>g</option><option>mg</option><option>ml</option><option>pc</option>
      </select>
    </td>
    <td class="actions"><button class="btn btnDanger">X</button></td>
  `;
  tr.querySelector(".unit").value = unit;
  recIngTbody.appendChild(tr);
}

btnAddRecIng.addEventListener("click", () => addRecIngRow());

recIngTbody.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") e.target.closest("tr").remove();
});

function renderRecipes() {
  const q = (recSearch.value || "").toLowerCase();
  const list = data.products.recipes.filter((r) =>
    r.name.toLowerCase().includes(q)
  );

  recEmpty.style.display = data.products.recipes.length === 0 ? "block" : "none";
  recTbody.innerHTML = "";

  for (const r of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.vatCategory}</td>
      <td>${r.pricing?.targetDBEuro ? formatEuro(r.pricing.targetDBEuro) : "—"}</td>
      <td class="actions">
        <button class="btn" data-edit="${r.id}">Bearbeiten</button>
      </td>
    `;
    recTbody.appendChild(tr);
  }

  renderCalcOptions();
}

btnAddRecipe.addEventListener("click", () => {
  recMode = "add";
  editingRecId = null;
  recTitle.textContent = "Rezept hinzufügen";
  btnRecDelete.classList.add("hidden");
  recForm.reset();
  recIngTbody.innerHTML = "";
  addRecIngRow();
  recModal.showModal();
});

/* =======================
   Kalkulation
======================= */
const calcRecipeSelect = $("calcRecipeSelect");
const calcMode = $("calcMode");
const calcDbPctInput = $("calcDbPctInput");
const calcErrors = $("calcErrors");

const calcCostIngredients = $("calcCostIngredients");
const calcCostPackaging = $("calcCostPackaging");
const calcCostFixed = $("calcCostFixed");
const calcCostTotal = $("calcCostTotal");

const calcMinGross = $("calcMinGross");
const calcMinNet = $("calcMinNet");

const marketPriceGross = $("marketPriceGross");
const sellPriceGross = $("sellPriceGross");
const sellNet = $("sellNet");
const gapToMarket = $("gapToMarket");

const calcDbEuro = $("calcDbEuro");
const calcDbPct = $("calcDbPct");

function setCalcError(msg) {
  if (!msg) {
    calcErrors.classList.add("hidden");
    calcErrors.textContent = "";
  } else {
    calcErrors.textContent = msg;
    calcErrors.classList.remove("hidden");
  }
}

function renderCalcOptions() {
  calcRecipeSelect.innerHTML = "";
  for (const r of data.products.recipes) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    calcRecipeSelect.appendChild(opt);
  }
}

function renderCalc() {
  setCalcError("");

  const r = data.products.recipes.find((x) => x.id === calcRecipeSelect.value);
  if (!r) return;

  const costRes = calcCostResult(data, "recipe", r, "de", 0);
  if (!costRes.ok) return setCalcError(costRes.errors.join(" "));

  const c = costRes.result.costs;
  calcCostIngredients.textContent = formatEuro(c.baseCost);
  calcCostPackaging.textContent = formatEuro(c.packaging);
  calcCostFixed.textContent = formatEuro(c.fixed);
  calcCostTotal.textContent = formatEuro(c.totalCostPerPortion);

  let minGross, minNet;

  if (calcMode.value === "pct") {
    const pct = normalizeNumber(calcDbPctInput.value) / 100;
    const price = calcPriceFromTargetDbPct({
      costPerPortion: c.totalCostPerPortion,
      targetDbPct: pct,
      vatRate: costRes.result.vatRate
    });
    if (!price.ok) return setCalcError(price.error);
    minGross = price.grossRounded;
    minNet = price.netImplied;
  } else {
    if (!r.pricing?.targetDBEuro) {
      return setCalcError("Im €-Modus braucht das Rezept einen Ziel-Überschuss.");
    }
    const p = calcProductResult(data, "recipe", r, "de", 0).result.pricing;
    minGross = p.grossRounded;
    minNet = p.netImplied;
  }

  calcMinGross.textContent = formatEuro(minGross);
  calcMinNet.textContent = formatEuro(minNet);

  const sellGross = normalizeNumber(sellPriceGross.value);
  if (Number.isFinite(sellGross)) {
    const net = sellGross / (1 + costRes.result.vatRate);
    sellNet.textContent = formatEuro(net);
    calcDbEuro.textContent = formatEuro(net - c.totalCostPerPortion);
    calcDbPct.textContent = formatPct((net - c.totalCostPerPortion) / net);
  }

  const market = normalizeNumber(marketPriceGross.value);
  if (Number.isFinite(market) && Number.isFinite(sellGross)) {
    gapToMarket.textContent = formatEuro(sellGross - market);
  }
}

calcRecipeSelect.addEventListener("change", renderCalc);
calcMode.addEventListener("change", renderCalc);
calcDbPctInput.addEventListener("input", renderCalc);
sellPriceGross.addEventListener("input", renderCalc);
marketPriceGross.addEventListener("input", renderCalc);

/* =======================
   Export / Import / Reset
======================= */
$("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "foodtruck-pricing.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("fileImport").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  data = JSON.parse(await file.text());
  saveData(data);
  init();
});

$("btnReset").addEventListener("click", () => {
  localStorage.clear();
  data = createEmptyData();
  saveData(data);
  init();
});

/* =======================
   Init
======================= */
function init() {
  renderIngredients();
  renderRecipes();
  renderCalcOptions();
  setTab("ingredients");
}

init();
