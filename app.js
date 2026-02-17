btnExportRecipesCsv?.addEventListener("click", () => {
  const rows = [
    [
      "Recipe_ID","Recipe_Name","VatCategory","LossPct","PackagingSetId","TargetDBEuro",
      "Cost_Total_EUR","MinGrossRounded_EUR","MinNetImplied_EUR","DB_EUR","DB_Pct",
      "Ingredient_ID","Qty","Unit"
    ]
  ];

  const mode = data?.settings?.calc?.mode || "euro";
  const targetDbPct = Number(data?.settings?.calc?.targetDbPct ?? 0.25);

  for (const r of (data.products.recipes || [])) {
    const lossPct = (r.lossPercent != null && Number.isFinite(Number(r.lossPercent)))
      ? String(Number(r.lossPercent) * 100).replace(".", ",")
      : "";

    const targetEuro = (r.pricing?.targetDBEuro != null && Number.isFinite(Number(r.pricing.targetDBEuro)))
      ? Number(r.pricing.targetDBEuro)
      : null;

    // ---- calculate once per recipe
    let costTotal = "";
    let minGross = "";
    let minNet = "";
    let dbEuro = "";
    let dbPct = "";

    const costRes = calcCostResult(data, "recipe", r, "de");
    if (costRes.ok) {
      const out = costRes.result;
      const total = Number(out.costs.totalCostPerPortion);
      if (Number.isFinite(total)) costTotal = String(total).replace(".", ",");

      // Mindestpreis je nach Modus
      if (mode === "pct") {
        const price = calcPriceFromTargetDbPct({
          costPerPortion: total,
          targetDbPct,
          vatRate: out.vatRate,
          roundingStep: data?.settings?.rounding?.step ?? 0.10,
          lang: "de"
        });
        if (price.ok) {
          minGross = String(price.grossRounded).replace(".", ",");
          minNet = String(price.netImplied).replace(".", ",");
          const dbe = price.netImplied - total;
          const dbp = price.netImplied > 0 ? dbe / price.netImplied : 0;
          dbEuro = String(dbe).replace(".", ",");
          dbPct = String(dbp).replace(".", ",");
        }
      } else {
        // euro mode: nur wenn TargetDBEuro am Rezept gesetzt ist
        if (Number.isFinite(targetEuro) && targetEuro > 0) {
          const resEuro = calcProductResult(data, "recipe", r, "de");
          if (resEuro.ok) {
            const p = resEuro.result.pricing;
            minGross = String(p.grossRounded).replace(".", ",");
            minNet = String(p.netImplied).replace(".", ",");
            dbEuro = String(p.dbEuro).replace(".", ",");
            dbPct = String(p.dbPct).replace(".", ",");
          }
        }
      }
    }

    // TargetDBEuro column (exported always)
    const targetEuroText = (Number.isFinite(targetEuro) && targetEuro > 0)
      ? String(targetEuro).replace(".", ",")
      : "";

    for (const line of (r.ingredients || [])) {
      rows.push([
        r.id || "",
        r.name || "",
        r.vatCategory || "food",
        lossPct,
        r.packagingSetId || "pack_default",
        targetEuroText,
        costTotal,
        minGross,
        minNet,
        dbEuro,
        dbPct,
        line.ingredientId || "",
        String(line.qty ?? "").replace(".", ","),
        line.unit || "g"
      ]);
    }
  }

  downloadCsv("recipes.csv", rows);
});
