/**
 * Markdown 渲染器
 * 使用 marked 直接渲染，集成 highlight.js 进行代码高亮
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import hljs from 'highlight.js'

import type { RenderConfig } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 直接读取 CSS 文件
function loadThemeCSS(themeName: string): string {
    const basePath = path.resolve(__dirname, '../../shared/src/configs/theme-css')

    // 加载基础 CSS
    const baseCSS = fs.readFileSync(path.join(basePath, 'base.css'), 'utf-8')

    // 加载主题 CSS
    const themeFile = `${themeName}.css`
    let themeCSS = ''
    try {
        themeCSS = fs.readFileSync(path.join(basePath, themeFile), 'utf-8')
    } catch {
        // 如果找不到主题，使用 default
        themeCSS = fs.readFileSync(path.join(basePath, 'default.css'), 'utf-8')
    }

    // 关键修复：修改 CSS 选择器，避免通用 code 样式覆盖代码块样式
    // 将 "code {" 替换为 ":not(pre) > code {"，使其仅应用于行内代码
    // 同时处理可能的空白字符情况
    const fixedThemeCSS = themeCSS.replace(/(^|\n|})[ \t]*code[ \t]*{/g, '$1:not(pre) > code {')

    return `${baseCSS}\n\n${fixedThemeCSS}`
}

/**
 * 生成 CSS 变量
 */
function generateCSSVariables(config: RenderConfig): string {
    return `
:root {
  --md-primary-color: ${config.theme.primaryColor};
  --md-font-family: ${config.theme.fontFamily};
  --md-font-size: ${config.theme.fontSize};
  --foreground: 0, 0%, 10%; /* hsl 值 */
  --background: 0, 0%, 100%; /* hsl 值 */
}
`
}

/**
 * 将 CSS 限定在作用域内 (简化版)
 */
function wrapCSSWithScope(css: string, scope: string): string {
    const lines = css.split('\n')
    const result: string[] = []
    let insideAtRule = false
    let braceDepth = 0

    for (const line of lines) {
        const trimmed = line.trim()

        const openBraces = (line.match(/{/g) || []).length
        const closeBraces = (line.match(/}/g) || []).length

        if (trimmed.startsWith('@') && !trimmed.includes('{')) {
            insideAtRule = true
        }

        if (braceDepth === 0 && !insideAtRule && trimmed && !trimmed.startsWith('@') && !trimmed.startsWith(':root') && trimmed.includes('{')) {
            // 使用更保守的替换方式避免正则回溯问题
            const selectorEnd = line.indexOf('{')
            if (selectorEnd > 0) {
                const leadingSpace = line.match(/^[ \t]*/)?.[0] || ''
                const selector = line.slice(leadingSpace.length, selectorEnd).trim()
                const rest = line.slice(selectorEnd)
                result.push(`${leadingSpace}${scope} ${selector} ${rest}`)
            } else {
                result.push(line)
            }
        } else {
            result.push(line)
        }

        braceDepth += openBraces - closeBraces
        if (braceDepth === 0) {
            insideAtRule = false
        }
    }

    return result.join('\n')
}

/**
 * 配置 marked 渲染器，集成 highlight.js
 */
function setupMarkedRenderer(config: RenderConfig) {
    const renderer = {
        code({ text, lang }: { text: string; lang?: string }) {
            // 默认使用 plaintext
            const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'

            let highlighted = ''
            try {
                highlighted = hljs.highlight(text, { language }).value
            } catch {
                highlighted = text
            }

            // 强制添加 hljs 类，确保 github-dark 主题生效
            // 同时添加 language-xxx 类
            const macStyleClass = config.codeBlock.macStyle ? ' mac-style' : ''
            return `<pre class="${macStyleClass}"><code class="hljs language-${language}">${highlighted}</code></pre>\n`
        }
    }

    marked.use({ renderer })

    marked.setOptions({
        breaks: true,
        gfm: true,
    })
}

/**
 * 渲染结果类型
 */
export interface RenderResult {
    html: string
    css: string
    addition: string
}

/**
 * 渲染 Markdown 并返回结构化结果
 */
export async function renderMarkdownToResult(mdFilePath: string, config: RenderConfig): Promise<RenderResult> {
    setupMarkedRenderer(config)

    const absolutePath = path.resolve(mdFilePath)
    const mdContent = fs.readFileSync(absolutePath, 'utf-8')

    // 1. 准备所有 CSS (提前到 HTML 处理前，以便提取样式用于内联)
    const themeCSS = loadThemeCSS(config.theme.name)
    const variableCSS = generateCSSVariables(config)
    const customCSS = config.customCSS || ''

    const fullCSS = `${variableCSS}\n${themeCSS}\n${customCSS}`
    const scopedCSS = wrapCSSWithScope(fullCSS, '.container')

    const rawHtml = await marked.parse(mdContent)

    // 不再使用 Cheerio 进行样式内联，恢复纯净的 HTML 输出
    // 这将解决因样式提取不准确导致的 "灰色引用块" 和 "行内代码变块级" 等 UI 回归问题

    // 将 HTML 包裹在容器内，以便应用 .container 作用域的 CSS
    const bodyHtml = `<section class="container">${rawHtml}</section>`

    let macStyleCSS = ''
    if (config.codeBlock.macStyle) {
        macStyleCSS = `
    .container pre.mac-style {
      position: relative;
      padding-top: 34px !important;
      border-radius: 8px;
      background: #282c32 !important; /* 深色背景，与 github-dark 类似 */
      margin: 15px 0;
      overflow: hidden;
    }
    .container pre.mac-style::before {
      content: "";
      position: absolute;
      top: 11px;
      left: 12px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ff5f56;
      box-shadow: 18px 0 0 #ffbd2e, 36px 0 0 #27c93f;
      z-index: 10;
    }
    .container pre.mac-style code {
      padding: 0 15px 15px !important;
      background: transparent !important;
      display: block;
    }
    `
    }

    const additionCSS = `
    ${macStyleCSS}
    .container pre {
        margin: 10px 0;
        padding: 0;
    }
    
    /* 修复表格边框合并问题 */
    .container table {
        border-collapse: collapse;
    }
  `

    return {
        html: bodyHtml,
        css: scopedCSS,
        addition: additionCSS,
    }
}
