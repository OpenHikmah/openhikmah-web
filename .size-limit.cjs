module.exports = [
  {
    name: "Total shipped Next.js client JS",
    path: ".next/static/**/*.js",
    // Intentionally budgets all emitted client chunks, including route-level and dynamic chunks.
    // This tracks total shipped JS rather than only initial-load JS.
    // Baseline was 697.88 kB brotlied after adding canvas export (html-to-image + jspdf, #115);
    // 875 kB keeps ~25% headroom, same convention as the original 497.88 kB -> 625 kB budget.
    limit: "875 kB",
  },
];
