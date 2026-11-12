// Tailwind CSS v4 (docs/adr/0004-tailwind-css.md). Turbopack reads this file from the Next.js
// project folder (apps/web), not from turbopack.root (the repo root).
export default {
    plugins: {
        '@tailwindcss/postcss': {},
    },
};
