import { defineConfig } from 'tsdown'
import { builtinModules } from 'node:module'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {})
]

export default defineConfig([
  {
    entry: { index: 'src/main/index.ts' },
    outDir: 'out/main',
    format: 'cjs',
    platform: 'node',
    external,
    tsconfig: './tsconfig.node.json'
  },
  {
    entry: { index: 'src/preload/index.ts' },
    outDir: 'out/preload',
    format: 'cjs',
    platform: 'node',
    external,
    tsconfig: './tsconfig.node.json'
  }
])
