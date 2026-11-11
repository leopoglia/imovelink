import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: { DATABASE_URL: "", GEMINI_API_KEY: "", GOOGLE_API_KEY: "" },
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**"],
      exclude: [
        "src/__tests__/**",
        "src/types/**",
        "src/server/seeds/**",
        "src/app/**/layout.tsx",
        "src/app/icon.svg",
      ],
      // Metas do portfólio: 75% no backend, 25% no frontend.
      // Sem limite para src/app/vitrine: ainda não há teste dessa página.
      thresholds: {
        "src/server/**": { lines: 75 },
        "src/app/api/**": { lines: 75 },
        "src/lib/**": { lines: 75 },
        "src/components/**": { lines: 25 },
        "src/store/**": { lines: 25 },
        "src/app/(portal)/**": { lines: 25 },
        "src/app/login/**": { lines: 25 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
