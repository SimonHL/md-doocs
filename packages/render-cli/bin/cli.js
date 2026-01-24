#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 尝试查找本地 tsx
let tsxPath = join(__dirname, '../node_modules/.bin/tsx')

// 如果在 monorepo 结构中或者被安装为依赖，可能需要向上查找
if (!existsSync(tsxPath)) {
  tsxPath = join(__dirname, '../../node_modules/.bin/tsx')
}

const entryFile = join(__dirname, '../src/index.ts')

const result = spawnSync(tsxPath, [entryFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true, // Windows 兼容
})

process.exit(result.status ?? 0)
