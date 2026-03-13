/**
 * 配置文件加载器
 * 按优先级查找并解析 YAML 配置文件
 */

import type { RenderConfig } from './types.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'

// 默认配置
const defaultConfig: RenderConfig = {
  imageHost: 'mp',
  wechat: {
    appID: '',
    appSecret: '',
    proxyOrigin: '',
  },
  theme: {
    name: 'default',
    primaryColor: '#0F4C81',
    fontFamily:
      '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif',
    fontSize: '16px',
  },
  codeBlock: {
    theme: 'github',
    macStyle: true,
    showLineNumber: false,
  },
  options: {
    citeStatus: false,
    countStatus: false,
    legend: 'alt',
  },
  customCSS: '',
}

/**
 * 查找配置文件
 * @param explicitPath 命令行指定的配置路径
 * @param mdFilePath Markdown 文件路径
 * @returns 配置文件路径或 null
 */
function findConfigFile(
  explicitPath: string | undefined,
  mdFilePath: string,
): string | null {
  // 1. 命令行显式指定
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) {
      return explicitPath
    }
    throw new Error(`配置文件不存在: ${explicitPath}`)
  }

  // 2. 与 md 文件同目录下的 md-config.yaml
  const mdDir = path.dirname(path.resolve(mdFilePath))
  const sameDir = path.join(mdDir, 'md-config.yaml')
  if (fs.existsSync(sameDir)) {
    return sameDir
  }

  // 3. 用户 home 目录下的全局配置
  const homeConfig = path.join(os.homedir(), '.md-doocs', 'md-config.yaml')
  if (fs.existsSync(homeConfig)) {
    return homeConfig
  }

  return null
}

/**
 * 深度合并配置
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key]
    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === 'object'
        && sourceValue !== null
        && !Array.isArray(sourceValue)
        && typeof result[key] === 'object'
        && result[key] !== null
      ) {
        result[key] = deepMerge(
          result[key] as Record<string, any>,
          sourceValue as Record<string, any>,
        ) as T[keyof T]
      }
      else {
        result[key] = sourceValue as T[keyof T]
      }
    }
  }
  return result
}

/**
 * 加载配置文件
 * @param explicitPath 命令行指定的配置路径
 * @param mdFilePath Markdown 文件路径
 * @returns 合并后的配置对象
 */
export function loadConfig(
  explicitPath: string | undefined,
  mdFilePath: string,
): RenderConfig {
  const configPath = findConfigFile(explicitPath, mdFilePath)

  if (!configPath) {
    console.warn('未找到配置文件，使用默认配置')
    return defaultConfig
  }

  console.log(`使用配置文件: ${configPath}`)

  const content = fs.readFileSync(configPath, 'utf-8')
  const userConfig = parseYaml(content) as Partial<RenderConfig>

  return deepMerge(defaultConfig, userConfig)
}

/**
 * 获取配置文件路径（用于测试）
 */
export function getConfigPath(
  explicitPath: string | undefined,
  mdFilePath: string,
): string | null {
  return findConfigFile(explicitPath, mdFilePath)
}
