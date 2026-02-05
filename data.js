// data.js
// Handles app data, defaults and localStorage

export const STORAGE_KEY = "foodtruck_pricing_v1";

export function createEmptyData() {
  return {
    meta: {
      schemaVersion: "1.0.0",
      currency: "EUR",
      locale: "de-DE",
      lastSavedISO: new Date().toISOString()
    },

    settings: {
      rounding: { mode: "ceil", step: 0.10 },
      vatRates: { food: 0.07, drink: 0.19 },
      defaults: {
        pricingMode: "targetDB",
        vatCategory: "food",
        packagingSetId: "pack_default",
        lossPercent: 0.02
      },
      validation: { requireTargetDBPerProduct: true }
    },

    costModel: {
      fixedCostsMonthly: {
        standard: {
          rent: 0,
          insurance: 0,
          phoneInternet: 0,
          equipmentLeasing: 0,
          accounting: 0,
          other: 0
        },
        custom: []
      },
      dailyCosts: {
        enabled: true,
        standard: {
          pitchFee: 0,
          extraPower: 0,
          helpers: 0,
          other: 0
        },
        custom: []
      },
      volumeAssumptions: {
        openDaysPerMonth: 12,
        expectedPortionsPerOpenDay: 80,
        overrideExpectedPortionsPerMonth: null
      }
    },

    catalog: {
      ingredients: [],
      packagingItems: [],
      packagingSets: [
        { id: "pack_default", name: "Standard To-Go", items: [] }
      ]
    },

    products: {
      recipes: [],
      items: []
    },

    planning: {
      weeklyPlans: []
    },

    history: {
      priceChanges: []
    }
  };
}

export function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const empty = createEmptyData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    return empty;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const empty = createEmptyData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    return empty;
  }
}

export function saveData(data) {
  data.meta.lastSavedISO = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
