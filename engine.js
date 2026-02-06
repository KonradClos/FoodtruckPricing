/* engine.js
   Core calculation engine for Foodtruck pricing (DE/EN)
   - Recipes are PER PORTION (no batch/yield)
   - Unit conversion supports: kg, g, mg, l, ml, pc, stk
   - Cost calculation separated from pricing calculation
   - Pricing modes:
     A) target € (target contribution in EUR)
     B) target DB% of net revenue (classic contribution margin %)
   - rounding: always up to roundingStep (default 0.10)
*/

export const I18N = {
  de: {
    ERR_TARGET_DB_INVALID: "Zielwert muss größer als 0 sein.",
    ERR_DB_PCT_INVALID: "Ziel-DB % muss zwischen 0 und <100 liegen.",
    ERR_PRODUCT_NOT_FOUND: "Produkt nicht gefunden.",
    ERR_INGREDIENT_NOT_FOUND: "Zutat nicht gefunden.",
    ERR_PACKSET_NOT_FOUND: "Verpackungs-Set nicht gefunden.",
    ERR_UNIT_CONVERSION: "Einheiten-Umrechnung nicht möglich.",
    ERR_PURCHASE_PRICE_INVALID: "Einkaufspreis pro Einheit muss >= 0 sein.",
    ERR_VAT_CATEGORY_INVALID: "Ungültige MwSt-Kategorie.",
    ERR_VOLUME_ASSUMPTIONS_INVALID:
      "Öffnungstage/Portionen pro Tag müssen > 0 sein (oder Monatsportionen überschreiben)."
  },
  en: {
    ERR_TARGET_DB_INVALID: "Target value must be > 0.",
    ERR_DB_PCT_INVALID: "Target DB% must be between 0 and <100.",
    ERR_PRODUCT_NOT_FOUND: "Product not found.",
    ERR_INGREDIENT_NOT_FOUND: "Ingredient not found.",
    ERR_PACKSET_NOT_FOUND: "Packaging set not found.",
    ERR_UNIT_CONVERSION: "Unit conversion not possible.",
    ERR_PURCHASE_PRICE_INVALID: "Purchase price per unit must be >= 0.",
    ERR_VAT_CATEGORY_INVALID: "Invalid VAT category.",
    ERR_VOLUME_ASSUMPTIONS_INVALID:
      "Open days/portions per day must be > 0 (or override monthly portions)."
  }
};

function msg(lang, key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

/** ===== helpers ===== */
export function roundUpToStep(value, step = 0.1) {
  const inv = Math.round(1 / step);
  return Math.ceil(value * inv) / inv;
}

export function sumObjectValues(obj) {
  return Object.values(obj || {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

/** ===== units ===== */
const UNIT_GROUP = {
  // mass
  kg: "mass",
  g: "mass",
  mg: "mass",

  // volume
  l: "volume",
  ml: "volume",

  // piece
  pc: "piece",
  stk: "piece"
};

function normalizeUnit(u) {
  return String(u || "").trim().toLowerCase();
}

/**
 * Convert qty from unit -> baseUnit (same group)
 * Returns qty expressed IN baseUnit.
 */
export function toBaseUnit(qty, unit, baseUnit, lang = "de") {
  const q = Number(qty);
  if (!Number.isFinite(q)) return { ok: false, error: msg(lang, "ERR_UNIT_CONVERSION") };

  const u = normalizeUnit(unit);
  const b = normalizeUnit(baseUnit);

  if (!UNIT_GROUP[u] || !UNIT_GROUP[b]) return { ok: false, error: msg(lang, "ERR_UNIT_CONVERSION") };
  if (UNIT_GROUP[u] !== UNIT_GROUP[b]) return { ok: false, error: msg(lang, "ERR_UNIT_CONVERSION") };

  if (u === b) return { ok: true, value: q };

  // mass: kg <-> g <-> mg
  if (UNIT_GROUP[u] === "mass") {
    const toGrams = (val, from) => {
      if (from === "kg") return val * 1000;
      if (from === "g") return val;
      if (from === "mg") return val / 1000;
      return NaN;
    };
    const fromGrams = (gVal, to) => {
      if (to === "kg") return gVal / 1000;
      if (to === "g") return gVal;
      if (to === "mg") return gVal * 1000;
      return NaN;
    };
    const grams = toGrams(q, u);
    const out = fromGrams(grams, b);
    if (!Number.isFinite(out)) return { ok: false, error: msg(lang, "ERR_UNIT_CONVERSION") };
    return { ok: true, value: out };
  }

  // volume: l <-> ml
  if (UNIT_GROUP[u] === "volume") {
    if (u === "l" && b === "ml") return { ok: true, value: q * 1000 };
    if (u === "ml" && b === "l") return { ok: true, value: q / 1000 };
    return { ok: false, error: msg(lang, "ERR_UNIT_CONVERSION") };
  }

  // piece: pc <-> stk (1:1)
  if (UNIT_GROUP[u] === "piece") {
    return { ok: true, value: q };
  }

  return { ok: false, error: msg(lang, "ERR_UNIT_CONVERSION") };
}

/** ===== lookups ===== */
export function indexById(list) {
  const m = new Map();
  (list || []).forEach((x) => x && x.id && m.set(x.id, x));
  return m;
}

export function getVatRate(data, vatCategory, lang = "de") {
  const cat = normalizeUnit(vatCategory);
  const rates = data?.settings?.vatRates || {};
  if (cat === "food") return rates.food ?? 0.07;
  if (cat === "drink") return rates.drink ?? 0.19;
  throw new Error(msg(lang, "ERR_VAT_CATEGORY_INVALID"));
}

/** ===== cost components ===== */
export function calcFixedCostPerPortion(data, lang = "de") {
  const fixed = data?.costModel?.fixedCostsMonthly || {};
  const standardTotal = sumObjectValues(fixed.standard);
  const customTotal = (fixed.custom || []).reduce((a, x) => a + (Number(x?.amount) || 0), 0);
  const fixedMonthlyTotal = standardTotal + customTotal;

  const vol = data?.costModel?.volumeAssumptions || {};
  const override = vol.overrideExpectedPortionsPerMonth;

  let monthlyPortions = null;

  if (override != null && override !== "") {
    const ov = Number(override);
    if (Number.isFinite(ov) && ov > 0) monthlyPortions = ov;
  } else {
    const openDays = Number(vol.openDaysPerMonth);
    const perDay = Number(vol.expectedPortionsPerOpenDay);
    if (Number.isFinite(openDays) && openDays > 0 && Number.isFinite(perDay) && perDay > 0) {
      monthlyPortions = openDays * perDay;
    }
  }

  if (!monthlyPortions || monthlyPortions <= 0) {
    return { ok: false, error: msg(lang, "ERR_VOLUME_ASSUMPTIONS_INVALID"), value: 0 };
  }

  return { ok: true, value: fixedMonthlyTotal / monthlyPortions, fixedMonthlyTotal, monthlyPortions };
}

export function calcDailyCostPerPortion(data, plannedDayTotalPortions, lang = "de") {
  const dailyCfg = data?.costModel?.dailyCosts || {};
  if (!dailyCfg.enabled) return { ok: true, value: 0 };

  const standardTotal = sumObjectValues(dailyCfg.standard);
  const customTotal = (dailyCfg.custom || []).reduce((a, x) => a + (Number(x?.amount) || 0), 0);
  const dailyTotal = standardTotal + customTotal;

  const portions = Number(plannedDayTotalPortions);
  if (!Number.isFinite(portions) || portions <= 0) {
    return { ok: true, value: 0, dailyTotal, plannedDayTotalPortions: 0 };
  }
  return { ok: true, value: dailyTotal / portions, dailyTotal, plannedDayTotalPortions: portions };
}

export function calcPackagingCostPerPortion(data, packagingSetId, lang = "de") {
  if (!packagingSetId) return { ok: true, value: 0 };

  const packSets = indexById(data?.catalog?.packagingSets || []);
  const packItems = indexById(data?.catalog?.packagingItems || []);
  const set = packSets.get(packagingSetId);

  if (!set) return { ok: false, error: msg(lang, "ERR_PACKSET_NOT_FOUND"), value: 0 };

  const total = (set.items || []).reduce((sum, line) => {
    const item = packItems.get(line.packagingItemId);
    if (!item) return sum;
    const qty = Number(line.qty) || 0;
    const price = Number(item.pricePerUnit) || 0;
    return sum + qty * price;
  }, 0);

  return { ok: true, value: total };
}

/**
 * Recipe ingredients are PER PORTION.
 * Each ingredient has:
 * - baseUnit (e.g. kg)
 * - pricePerBaseUnit (€/kg)
 * Recipe line has qty + unit (e.g. 250 g)
 * -> convert to baseUnit, multiply by pricePerBaseUnit
 */
export function calcRecipeIngredientCostPerPortion(data, recipe, lang = "de") {
  const ingMap = indexById(data?.catalog?.ingredients || []);

  const lossPct = Number.isFinite(Number(recipe?.lossPercent))
    ? Number(recipe.lossPercent)
    : (data?.settings?.defaults?.lossPercent ?? 0);

  const lossFactor = 1 + Math.max(0, lossPct);

  let cost = 0;
  for (const line of recipe?.ingredients || []) {
    const ing = ingMap.get(line.ingredientId);
    if (!ing) return { ok: false, error: msg(lang, "ERR_INGREDIENT_NOT_FOUND"), value: 0 };

    const baseUnit = ing.baseUnit;
    const conv = toBaseUnit(line.qty, line.unit, baseUnit, lang);
    if (!conv.ok) return { ok: false, error: conv.error, value: 0 };

    const qtyInBase = conv.value; // in ingredient.baseUnit
    const pricePerBase = Number(ing.pricePerBaseUnit);

    if (!Number.isFinite(pricePerBase) || pricePerBase < 0) {
      return { ok: false, error: msg(lang, "ERR_PURCHASE_PRICE_INVALID"), value: 0 };
    }

    cost += qtyInBase * pricePerBase;
  }

  return { ok: true, value: cost * lossFactor, lossFactor, baseCostNoLoss: cost };
}

export function calcItemPurchaseCostPerPortion(item, data, lang = "de") {
  const purchase = Number(item?.purchasePricePerUnit);
  if (!Number.isFinite(purchase) || purchase < 0) {
    return { ok: false, error: msg(lang, "ERR_PURCHASE_PRICE_INVALID"), value: 0 };
  }

  const lossPct = Number.isFinite(Number(item?.lossPercent))
    ? Number(item.lossPercent)
    : (data?.settings?.defaults?.lossPercent ?? 0);

  const lossFactor = 1 + Math.max(0, lossPct);
  return { ok: true, value: purchase * lossFactor };
}

/** ====== cost-only result (no pricing validation) ====== */
export function calcCostResult(data, productType, product, lang = "de", plannedDayTotalPortions = 0) {
  try {
    const vatRate = getVatRate(data, product.vatCategory, lang);

    const fixed = calcFixedCostPerPortion(data, lang);
    if (!fixed.ok) return { ok: false, errors: [fixed.error], result: null };

    const daily = calcDailyCostPerPortion(data, plannedDayTotalPortions, lang);

    const packaging = calcPackagingCostPerPortion(data, product.packagingSetId, lang);
    if (!packaging.ok) return { ok: false, errors: [packaging.error], result: null };

    let baseCost = 0;
    let detail = {};

    if (productType === "recipe") {
      const ingCost = calcRecipeIngredientCostPerPortion(data, product, lang);
      if (!ingCost.ok) return { ok: false, errors: [ingCost.error], result: null };
      baseCost = ingCost.value;
      detail = {
        ingredientCostPerPortion: ingCost.value,
        ingredientCostNoLoss: ingCost.baseCostNoLoss,
        lossFactor: ingCost.lossFactor
      };
    } else if (productType === "item") {
      const itemCost = calcItemPurchaseCostPerPortion(product, data, lang);
      if (!itemCost.ok) return { ok: false, errors: [itemCost.error], result: null };
      baseCost = itemCost.value;
      detail = { purchaseCostPerPortion: itemCost.value };
    } else {
      return { ok: false, errors: [msg(lang, "ERR_PRODUCT_NOT_FOUND")], result: null };
    }

    // Labor intentionally NOT included (you wanted batch removed & labor not used)
    const laborCost = 0;

    const costPerPortion =
      baseCost +
      packaging.value +
      fixed.value +
      (daily.ok ? daily.value : 0) +
      laborCost;

    return {
      ok: true,
      errors: [],
      result: {
        name: product.name,
        productType,
        vatCategory: product.vatCategory,
        vatRate,
        costs: {
          baseCost, // ingredients (recipe) or purchase (item) already includes loss
          packaging: packaging.value,
          fixed: fixed.value,
          daily: (daily.ok ? daily.value : 0),
          labor: laborCost,
          totalCostPerPortion: costPerPortion,
          detail
        },
        assumptions: {
          fixedMonthlyTotal: fixed.fixedMonthlyTotal,
          monthlyPortions: fixed.monthlyPortions,
          dailyTotal: daily.dailyTotal ?? 0,
          plannedDayTotalPortions: daily.plannedDayTotalPortions ?? 0
        }
      }
    };
  } catch (e) {
    return { ok: false, errors: [String(e?.message || e)], result: null };
  }
}

/** ===== pricing helpers ===== */
export function calcPriceFromTargetEuro({ costPerPortion, targetEuro, vatRate, roundingStep = 0.10 }) {
  const net = Number(costPerPortion) + Number(targetEuro);
  const grossRaw = net * (1 + Number(vatRate));
  const grossRounded = roundUpToStep(grossRaw, roundingStep);
  const netImplied = grossRounded / (1 + Number(vatRate));
  return { netRaw: net, grossRaw, grossRounded, netImplied };
}

export function calcPriceFromTargetDbPct({ costPerPortion, targetDbPct, vatRate, roundingStep = 0.10, lang = "de" }) {
  const p = Number(targetDbPct);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    return { ok: false, error: msg(lang, "ERR_DB_PCT_INVALID") };
  }
  // DB% of NET revenue: net = cost / (1 - p)
  const net = Number(costPerPortion) / (1 - p);
  const grossRaw = net * (1 + Number(vatRate));
  const grossRounded = roundUpToStep(grossRaw, roundingStep);
  const netImplied = grossRounded / (1 + Number(vatRate));
  return { ok: true, netRaw: net, grossRaw, grossRounded, netImplied };
}

/** ===== product result (target EURO in recipe) =====
    (used by € mode in app.js)
*/
export function calcProductResult(data, productType, product, lang = "de", plannedDayTotalPortions = 0) {
  const targetEuro = Number(product?.pricing?.targetDBEuro);
  if (!Number.isFinite(targetEuro) || targetEuro <= 0) {
    return { ok: false, errors: [msg(lang, "ERR_TARGET_DB_INVALID")], result: null };
  }

  const costRes = calcCostResult(data, productType, product, lang, plannedDayTotalPortions);
  if (!costRes.ok) return costRes;

  const out = costRes.result;

  const price = calcPriceFromTargetEuro({
    costPerPortion: out.costs.totalCostPerPortion,
    targetEuro,
    vatRate: out.vatRate,
    roundingStep: data?.settings?.rounding?.step ?? 0.10
  });

  const dbEuro = price.netImplied - out.costs.totalCostPerPortion;
  const dbPct = price.netImplied > 0 ? dbEuro / price.netImplied : 0;

  return {
    ok: true,
    errors: [],
    result: {
      ...out,
      pricing: {
        mode: "targetEuro",
        targetEuro,
        netRaw: price.netRaw,
        grossRaw: price.grossRaw,
        grossRounded: price.grossRounded,
        netImplied: price.netImplied,
        dbEuro,
        dbPct
      }
    }
  };
}

/** COMPAT alias if old code expects calcProductResultS */
export const calcProductResultS = calcProductResult;
