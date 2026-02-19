import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", ".astro/**", ".wrangler/**", "node_modules/**", "**/env.d.ts", "**/*.astro"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
