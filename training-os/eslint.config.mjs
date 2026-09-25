import coreWebVitals from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...ts,
  {
    rules: {
      // Les liens vers /api/* sont des téléchargements de fichiers : <a> est volontaire
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "storage/**", "storage-test/**"] },
];
export default config;
