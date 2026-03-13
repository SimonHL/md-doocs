/**
 * Markdown 渲染器
 * 使用 @md/core 进行渲染，确保与 Web 端一致
 */

import type { IOpts } from '@md/shared/types'
import type { RenderConfig } from './types.js'
import * as fs from 'node:fs'

import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initRenderer } from '@md/core/renderer'

import { modifyHtmlContent } from '@md/core/utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 直接读取 CSS 文件
function loadThemeCSS(themeName: string): string {
  const basePath = path.resolve(
    __dirname,
    '../../shared/src/configs/theme-css',
  )

  // 加载基础 CSS
  const baseCSS = fs.readFileSync(path.join(basePath, 'base.css'), 'utf-8')

  // 与 Web 端保持一致：default.css 始终作为主题基础层，
  // 再叠加具体主题，避免丢失列表等基础样式。
  const defaultThemeCSS = fs.readFileSync(
    path.join(basePath, 'default.css'),
    'utf-8',
  )

  let themeCSS = defaultThemeCSS
  if (themeName !== 'default') {
    const themeFile = `${themeName}.css`
    try {
      const specificThemeCSS = fs.readFileSync(
        path.join(basePath, themeFile),
        'utf-8',
      )
      themeCSS = `${defaultThemeCSS}\n\n${specificThemeCSS}`
    }
    catch {
      themeCSS = defaultThemeCSS
    }
  }

  // 关键修复：修改 CSS 选择器，避免通用 code 样式覆盖代码块样式
  // 将 "code {" 替换为 ":not(pre) > code {"，使其仅应用于行内代码
  // 同时处理可能的空白字符情况
  const fixedThemeCSS = themeCSS.replace(
    /(^|\n|\})[ \t]*code[ \t]*\{/g,
    '$1:not(pre) > code {',
  )

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

    const openBraces = (line.match(/\{/g) || []).length
    const closeBraces = (line.match(/\}/g) || []).length

    if (trimmed.startsWith('@') && !trimmed.includes('{')) {
      insideAtRule = true
    }

    if (
      braceDepth === 0
      && !insideAtRule
      && trimmed
      && !trimmed.startsWith('@')
      && !trimmed.startsWith(':root')
      && trimmed.includes('{')
    ) {
      // 使用更保守的替换方式避免正则回溯问题
      const selectorEnd = line.indexOf('{')
      if (selectorEnd > 0) {
        const leadingSpace = line.match(/^[ \t]*/)?.[0] || ''
        const selector = line.slice(leadingSpace.length, selectorEnd).trim()
        const rest = line.slice(selectorEnd)
        result.push(`${leadingSpace}${scope} ${selector} ${rest}`)
      }
      else {
        result.push(line)
      }
    }
    else {
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
 * 渲染结果类型
 */
export interface RenderResult {
  html: string
  css: string
  addition: string
  rawMarkdown: string
}

/**
 * 渲染 Markdown 并返回结构化结果
 */
export function renderMarkdownToResult(
  mdFilePath: string,
  config: RenderConfig,
): RenderResult {
  const absolutePath = path.resolve(mdFilePath)
  const rawMdContent = fs.readFileSync(absolutePath, 'utf-8')

  // 1. 初始化渲染器
  const opts: IOpts = {
    legend: config.options.legend,
    citeStatus: config.options.citeStatus,
    countStatus: config.options.countStatus,
    isMacCodeBlock: config.codeBlock.macStyle,
    isShowLineNumber: config.codeBlock.showLineNumber,
    themeMode: config.codeBlock.theme === 'github-dark' ? 'dark' : 'light',
  }

  // 初始化渲染器
  const renderer = initRenderer(opts)

  // 2. 准备所有 CSS (提前到 HTML 处理前，以便提取样式用于内联)
  const themeCSS = loadThemeCSS(config.theme.name)
  const variableCSS = generateCSSVariables(config)
  const customCSS = config.customCSS || ''

  const fullCSS = `${variableCSS}\n${themeCSS}\n${customCSS}`
  const scopedCSS = wrapCSSWithScope(fullCSS, '.container')

  // 3. 渲染 content
  // modifyHtmlContent 会处理 front-matter, marked parse, sanitize, postProcess
  const bodyHtml = modifyHtmlContent(rawMdContent, renderer)

  // 4. Addition CSS
  // core 已经在 postProcessHtml 中添加了部分样式 (如 .hljs.code__pre > .mac-sign)
  // 这里我们添加 render-cli 特有的样式修复，沿用之前的 fix

  // GFM Alert Styles
  // Use blockquote.markdown-alert to increase specificity over theme's blockquote
  const alertCSS = `
    blockquote.markdown-alert {
        padding: 8px 16px !important;
        margin-bottom: 16px !important;
        border: 1px solid !important;
        border-radius: 6px !important;
        background-color: #ffffff !important;
        box-shadow: none !important;
    }
    .markdown-alert-title {
        display: flex;
        align-items: center;
        font-weight: 600;
        margin-top: 5px;
        margin-bottom: 5px;
        line-height: 1.5;
    }
    .markdown-alert-title svg {
        margin-right: 8px !important;
        fill: currentColor;
    }
    
    /* Note */
    blockquote.markdown-alert-note { 
        border-color: #0969da !important; 
        background-color: #e6f2ff !important; 
        color: #24292f; 
    }
    .alert-title-note { color: #0969da !important; }
    .alert-icon-note { fill: #0969da !important; }

    /* Tip */
    blockquote.markdown-alert-tip { 
        border-color: #1f883d !important; 
        background-color: #e6ffec !important; 
        color: #24292f; 
    }
    .alert-title-tip { color: #1f883d !important; }
    .alert-icon-tip { fill: #1f883d !important; }

    /* Important */
    blockquote.markdown-alert-important { 
        border-color: #8250df !important; 
        background-color: #f6f0ff !important; 
        color: #24292f; 
    }
    .alert-title-important { color: #8250df !important; }
    .alert-icon-important { fill: #8250df !important; }

    /* Warning */
    blockquote.markdown-alert-warning { 
        border-color: #9a6700 !important; 
        background-color: #fff8c5 !important; 
        color: #24292f; 
    }
    .alert-title-warning { color: #9a6700 !important; }
    .alert-icon-warning { fill: #9a6700 !important; }

    /* Caution */
    blockquote.markdown-alert-caution { 
        border-color: #cf222e !important; 
        background-color: #ffebe9 !important; 
        color: #24292f; 
    }
    .alert-title-caution { color: #cf222e !important; }
    .alert-icon-caution { fill: #cf222e !important; }
    `

  const additionCSS = `
    /* 修复表格边框合并问题 */
    .container table {
        border-collapse: collapse;
    }
    /* 覆盖可能的 reset 样式 */
    .container pre {
        margin: 10px 0;
        padding: 0;
        overflow-x: auto !important;
        overflow-y: hidden;
        white-space: pre !important;
        word-wrap: normal !important;
        -webkit-overflow-scrolling: touch;
    }
    .container pre code {
        white-space: pre !important; 
    }
    ${alertCSS}
  `

  return {
    html: bodyHtml,
    css: scopedCSS,
    addition: additionCSS,
    rawMarkdown: rawMdContent,
  }
}
