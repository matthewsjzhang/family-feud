/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The question bank is one ~3.7 MB data chunk (~0.8 MB gzipped), loaded on demand.
  build: { chunkSizeWarningLimit: 4000 },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: { include: ["src/engine/**", "src/data/**"] },
  },
});
