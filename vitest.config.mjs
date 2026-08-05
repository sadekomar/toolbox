import { defineConfig } from 'vitest/config'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const REPO = process.env.INSTATUS_REPO ?? resolve(homedir(), 'Documents/instatus')

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(REPO, 'packages/backend/src'),
      '@dashboard': resolve(REPO, 'packages/dashboard'),
      '@ui': resolve(REPO, 'packages/ui')
    }
  },
  test: {
    include: ['proptests/**/*.test.ts'],
    environment: 'node'
  }
})
