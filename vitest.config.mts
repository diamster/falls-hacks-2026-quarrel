import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    // Full SVG scenes are CPU-heavy in jsdom. Serialize files on shared local
    // machines; this runner allowance does not change application timing checks.
    maxWorkers: 1,
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.ts", "src/server/**/*.ts", "src/themes/**/*.{ts,tsx}"],
      // Keep the interactive implementation well exercised. Rendering/layout,
      // CSS animation and native-dialog behavior still need browser review.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
