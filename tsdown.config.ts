import { defineConfig } from 'tsdown'
import { builtinModules } from 'node:module'

// Only externalize what cannot be bundled: electron, Node built-ins, and
// native addons (better-sqlite3 ships .node binaries).
const external = [
  'electron',
  'better-sqlite3',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`)
]

export default defineConfig([
  {
    entry: { index: 'src/main/index.ts' },
    outDir: 'out/main',
    format: 'cjs',
    deps: { neverBundle: external, onlyBundle: false },
    tsconfig: './tsconfig.node.json'
  },
  {
    entry: { index: 'src/preload/index.ts' },
    outDir: 'out/preload',
    format: 'cjs',
    deps: { neverBundle: external, onlyBundle: false },
    tsconfig: './tsconfig.node.json'
  }
])
