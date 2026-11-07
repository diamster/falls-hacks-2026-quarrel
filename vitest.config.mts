import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.ts"],
      // Keep the interactive implementation well exercised. Rendering/layout,
      // CSS animation and native-dialog behavior still need browser review.
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
