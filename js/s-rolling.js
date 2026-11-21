/* Rolling forecast: dynamic budgeting (monthly re-forecasts) and the rupee cost of forecast error. */
(function () {
  const { D, h, F, col, alpha, card, baseOpts, tbl, seg, slider, kpi } = Core;
  const R = D.rolling, ser = D.series.slice(18, 24);
  const last = (a) => a.slice(6);                     /* Apr to Sep 2026, the months scored in the static backtest */
  const act6 = last(R.actual);
  const mape = (a, f) => f.reduce((s, x, i) => s + Math.abs((x - a[i]) / a[i]), 0) / f.length;
  const M = {
    trendS: mape(act6, ser.map((r) => r.traditional_sales)), aiS: mape(act6, ser.map((r) => r.ai_sales)),
    trendR: mape(act6, last(R.trend)), aiR: mape(act6, last(R.ai)), naiveR: mape(act6, last(R.snaive)),
  };
  const sf = { trend: ser.map((r) => r.traditional_sales), ai: ser.map((r) => r.ai_sales) };
  const cm = D.traditional && D.traditional.cm_ratio ? D.traditional.cm_ratio : 0.210782;
  const costRatio = 0.755937;  /* purchase cost as a share of sales, last 12 months (Data sheet) */
  const profit6 = ser.reduce((s, r) => s + r.actual_profit, 0);
  function cost(fc, ex, lost) { return fc.reduce((s, f, i) => { const a = act6[i]; return s + (f > a ? (f - a) * costRatio * ex : (a - f) * lost * cm); }, 0); }

  Sections.rolling = {
    title: "Rolling forecast",
    head() { return { h1: "Re-forecasting every month helps the AI model, not the trend line, and forecast error has a rupee cost", p: "A static budget is set once; a rolling forecast is refitted each month with the latest actuals. Both methods are scored on the same six months (April to September 2026)." }; },
    render(root) {
      root.append(h("div", { class: "kpis" },
        kpi("Trend line, static to rolling", F.pc(M.trendS) + " to " + F.pc(M.trendR), "Refitting a straight line does not help", "bad"),
        kpi("AI ensemble, static to rolling", F.pc(M.aiS) + " to " + F.pc(M.aiR), "About one point lower when updated monthly", "good"),
        kpi("Simple seasonal rule, rolling", F.pc(M.naiveR), "Level with the rolling AI forecast", ""),
        kpi("Cost of error, trend budget", "INR " + F.n0(cost(sf.trend, 0.08, 0.4)), F.pc(cost(sf.trend, 0.08, 0.4) / profit6) + " of 6-month profit (base assumptions)", "bad"),
        kpi("Cost of error, rolling AI", "INR " + F.n0(cost(last(R.ai), 0.08, 0.4)), F.pc(cost(last(R.ai), 0.08, 0.4) / profit6) + " of 6-month profit", "good")));

      /* chart 1: one-month-ahead vs actual */
      const st = { m: "sales" };
      const labels = R.months.map(F.mon);
      const c1 = card({ title: "One-month-ahead forecasts against actual", height: 320, file: "rolling-forecast",
        sub: "Each point is what the method predicted the month before, using only the history available then. Press a legend item to hide a line.",
        controls: [seg([{ v: "sales", label: "Sales" }, { v: "profit", label: "Operating profit" }], st.m, (v) => { st.m = v; c1.draw(); }, "Measure")] });
      c1.draw(() => {
        const c = col(); const p = st.m === "profit";
        const L = (label, data, color, dash, w) => ({ label, data, borderColor: color, backgroundColor: color, borderWidth: w || 2.2, borderDash: dash || [], pointRadius: 3, pointHoverRadius: 5, tension: 0, spanGaps: false, fmt: (v) => "INR " + F.n0(v) });
        const o = baseOpts({ yTitle: p ? "INR thousand" : "INR lakh" }); o.scales.y.ticks.callback = p ? (v) => (v / 1e3).toFixed(0) : (v) => F.lk(v, 1);
        const ds = p ? [L("Actual", R.actual_profit, c.actual, [], 2.6), L("Trend, refit monthly", R.trend_profit, c.trad, [6, 4]), L("AI ensemble, refit monthly", R.ai_profit, c.ai)]
          : [L("Actual", R.actual, c.actual, [], 2.6), L("Trend, refit monthly", R.trend, c.trad, [6, 4]), L("AI ensemble, refit monthly", R.ai, c.ai), L("Same month last year, plus growth", R.snaive, c.naive, [2, 3], 1.8)];
        return { type: "line", data: { labels, datasets: ds }, options: o };
      });

      /* chart 2: static vs rolling */
      const c2 = card({ title: "Static budget versus rolling re-forecast", height: 320, file: "static-vs-rolling",
        sub: "Sales error (MAPE), April to September 2026. Lower is better. The static bars are the backtest from the Accuracy tab." });
      c2.draw(() => {
        const c = col(); const o = baseOpts({ type: "bar", mode: "nearest", intersect: true, yTitle: "Sales MAPE" }); o.scales.y.beginAtZero = true; o.scales.y.ticks.callback = (v) => F.pc(v, 0);
        const nv = (D.diagnostics.benchmark_sales.find((r) => r.method === "Seasonal naive + growth") || {}).mape;
        return { type: "bar", data: { labels: ["Trend line", "AI ensemble", "Seasonal rule"], datasets: [
          { label: "Static: set once in March", data: [M.trendS, M.aiS, nv], backgroundColor: alpha(c.ink2, 0.55), borderRadius: { topLeft: 4, topRight: 4 }, maxBarThickness: 60, fmt: (v) => F.pc(v, 1) },
          { label: "Rolling: refit monthly", data: [M.trendR, M.aiR, M.naiveR], backgroundColor: c.ai, borderRadius: { topLeft: 4, topRight: 4 }, maxBarThickness: 60, fmt: (v) => F.pc(v, 1) }] }, options: o };
      });
      root.append(h("div", { class: "grid g2" }, c1.root, c2.root));

      /* cost of error lab */
      const lv = { ex: 0.08, lost: 0.4 };
      const kp = h("div", { class: "kpis", style: { gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" } });
      const c3 = card({ title: "What the forecast errors cost over six months", height: 280, legend: false, file: "cost-of-error",
        sub: "Over-forecasting leaves excess stock that expires or ties up cash. Under-forecasting loses sales at the contribution margin. Move the sliders to test your own assumptions." });
      const sets = () => [["Static trend", cost(sf.trend, lv.ex, lv.lost)], ["Static AI", cost(sf.ai, lv.ex, lv.lost)], ["Rolling trend", cost(last(R.trend), lv.ex, lv.lost)], ["Rolling AI", cost(last(R.ai), lv.ex, lv.lost)]];
      function paintKpi() { const s = sets(); kp.replaceChildren(...s.map(([n, v], i) => kpi(n, "INR " + F.n0(v), F.pc(v / profit6) + " of 6-month profit", i === 0 || i === 2 ? "bad" : "good"))); }
      c3.draw(() => {
        const c = col(); const s = sets(); const o = baseOpts({ type: "bar", mode: "nearest", intersect: true, yTitle: "INR thousand" }); o.scales.y.beginAtZero = true; o.scales.y.ticks.callback = (v) => (v / 1e3).toFixed(0);
        return { type: "bar", data: { labels: s.map((x) => x[0]), datasets: [{ label: "Cost of forecast error", data: s.map((x) => x[1]), backgroundColor: [c.trad, c.ai, alpha(c.trad, 0.6), alpha(c.ai, 0.6)], borderRadius: { topLeft: 4, topRight: 4 }, maxBarThickness: 80, fmt: (v) => "INR " + F.n0(v) }] }, options: o };
      });
      const s1 = slider({ label: "Cost of excess stock (expiry and cost of money)", min: 0.02, max: 0.15, step: 0.01, value: lv.ex, fmt: (v) => F.pc(v, 0) + " of excess purchase value", hint: "Base case 8%", onInput: (v) => { lv.ex = v; paintKpi(); c3.draw(); } });
      const s2 = slider({ label: "Share of unmet demand that is lost", min: 0.1, max: 0.8, step: 0.05, value: lv.lost, fmt: (v) => F.pc(v, 0), hint: "Base case 40%. Each lost rupee costs the contribution margin (21%)", onInput: (v) => { lv.lost = v; paintKpi(); c3.draw(); } });
      paintKpi();
      root.append(h("div", { class: "card" }, h("h2", { text: "Cost of forecast error" }), h("p", { class: "sub", text: "These rupee figures rest on the stated assumptions, not on measured stock records. They show the order of magnitude and which method costs more; the ranking holds across the slider range." }),
        h("div", { class: "grid g2" }, h("div", null, s1.root, s2.root), h("div", null, kp))));
      root.append(c3.root);
      root.append(h("div", { class: "card" }, h("p", { class: "note", html: "<b>How to read this tab.</b> " + R.note + " Profit is a thin residual (about 6% of sales), so profit accuracy barely changes with rolling updates; judge the benefit on sales. Twelve forecast months is a small sample." })));
    },
  };
})();
