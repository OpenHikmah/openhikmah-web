module.exports = [
  {
    name: "Next.js client JS",
    path: ".next/static/**/*.js",
    // Baseline was 497.88 kB brotlied after a production build; 625 kB keeps ~25% headroom.
    limit: "625 kB",
  },
];
