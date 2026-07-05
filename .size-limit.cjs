module.exports = [
  {
    name: "Total shipped Next.js client JS",
    path: ".next/static/**/*.js",
    // Intentionally budgets all emitted client chunks, including route-level and dynamic chunks.
    // This tracks total shipped JS rather than only initial-load JS.
    // Baseline was 497.88 kB brotlied after a production build; 625 kB keeps ~25% headroom.
    limit: "625 kB",
  },
];
