import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 950,
    rolldownOptions: {
      output: {
        // The renderer library and the weather record change rarely: keep them in their own cached files.
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three/ },
            { name: 'weather', test: /caribou\.json/ },
          ],
        },
      },
    },
  },
  // The simulation's whole-farm tests take a few seconds each alone and longer when the suite runs in parallel.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
})
