import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    exclude: ['@niteowl/ui', '@niteowl/app-config'],
  },
  server: {
    allowedHosts: [
      'inventory.mccarthysirishpub.com',
    ],
  },
  plugins: [tanstackStart(), viteReact()],
})

export default config
