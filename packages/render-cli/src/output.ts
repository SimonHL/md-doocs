/**
 * HTML 输出模块
 * 将渲染结果包装为完整的 HTML 文档
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cheerio from 'cheerio'
import juice from 'juice'
import type { RenderResult } from './renderer.js'
import type { RenderConfig } from './types.js'

/**
 * 代码高亮 CSS URL
 */
const CODE_HIGHLIGHT_CDN = 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/'

/**
 * 表格内联样式配置
 * 从 customCSS 中提取的关键样式，用于微信兼容
 */
interface TableStyles {
  table: string
  thead: string
  th: string
  td: string
}

/**
 * 为表格元素添加内联样式
 * WeChat 编辑器会剥离 <style> 标签，只保留 inline style
 */
export function inlineTableStyles(html: string, _config?: RenderConfig): string {
  const $ = cheerio.load(html)

  // 从 customCSS 中识别表格样式，或使用默认值
  // 这里使用手绘风格的默认值
  const styles: TableStyles = {
    table: 'width:100%; border-collapse:collapse; margin:1.15em 0; font-size:0.9375em; border:2px solid #2d2d2d;',
    thead: 'background-color:#fff9c4;',
    th: 'background-color:#fff9c4; padding:0.55em 0.8em; font-weight:700; color:#2d2d2d; border-bottom:2px solid #2d2d2d; border-right:1px dashed #2d2d2d;',
    td: 'padding:0.55em 0.8em; border-bottom:1px dashed #2d2d2d; border-right:1px dashed #2d2d2d; background-color:rgba(229,224,216,0.1);',
  }

  // 应用内联样式
  $('table').each((_, el) => {
    const existingStyle = $(el).attr('style') || ''
    $(el).attr('style', existingStyle + styles.table)
  })

  $('thead').each((_, el) => {
    const existingStyle = $(el).attr('style') || ''
    $(el).attr('style', existingStyle + styles.thead)
  })

  $('th').each((_, el) => {
    const existingStyle = $(el).attr('style') || ''
    $(el).attr('style', existingStyle + styles.th)
  })

  $('td').each((_, el) => {
    const existingStyle = $(el).attr('style') || ''
    $(el).attr('style', existingStyle + styles.td)
  })

  return $.html()
}

/**
 * 为代码块添加内联样式
 * 确保微信编辑器中代码块可以横向滚动且不换行
 */
export function inlineCodeBlockStyles(html: string): string {
  const $ = cheerio.load(html)

  // 外层容器样式 (确保与图片容器对齐)
  const wrapperStyles = 'display: block; overflow-x: auto !important; overflow-y: hidden; background: #282c34; border-radius: 8px; margin: 10px 0 !important; padding: 0; -webkit-overflow-scrolling: touch;'

  // 代码块样式 (WeChat 兼容：-webkit-box 负责块级布局，nowrap 应用于 code)
  // 注意：pre 不能应用 white-space: nowrap，否则会导致 mac-sign 无法正确占据顶部空间
  const preStyles = 'margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 0 !important; background: transparent !important; word-wrap: normal !important; word-break: normal !important; overflow: visible !important;'

  const codeStyles = "display: -webkit-box !important; padding: 10px 10px 15px !important; white-space: nowrap !important; word-wrap: normal !important; overflow-x: visible !important; font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace !important; min-width: 100%; box-sizing: border-box !important;"

  $('pre').each((_, el) => {
    const $pre = $(el)
    const existingClass = $pre.attr('class') || ''

    // 创建 wrapper
    const $wrapper = $('<section></section>')
    $wrapper.attr('style', wrapperStyles)
    $wrapper.attr('class', 'code-snippet__fix ' + existingClass)

    // 配置 pre
    $pre.attr('style', preStyles)

    // 配置 code
    $pre.find('code').attr('style', codeStyles)

    // 包裹
    $pre.wrap($wrapper)
  })

  return $.html()
}

/**
 * 为图片添加内联样式
 * 确保图片在微信中占满宽度且不被缩小
 * 使用与代码块一致的 section 包裹，确保视觉宽度一致
 */
export function inlineImageStyles(html: string): string {
  const $ = cheerio.load(html)

  // 容器样式：严格与代码块对齐 (margin: 10px 0)
  const imageWrapperStyles = 'margin: 10px 0 !important; padding: 0 !important; overflow: hidden; display: block; border: none !important;'

  $('img').each((_, el) => {
    const $img = $(el)

    // 1. 强制图片本身全宽
    $img.removeAttr('width')
    $img.removeAttr('height')
    const existingStyle = $img.attr('style') || ''
    const cleanStyle = `width: 100% !important; height: auto !important; display: block; margin: 0 auto; box-sizing: border-box !important; visibility: visible !important; ${existingStyle}`
    $img.attr('style', cleanStyle)
    $img.attr('width', '100%')

    // 2. 处理容器（figure 或 my wrapper section）
    // 如果已经在 figure 中，必须消除 figure 的默认 margin
    const $parentFigure = $img.closest('figure')
    if ($parentFigure.length > 0) {
      const currentFigureStyle = $parentFigure.attr('style') || ''
      $parentFigure.attr('style', `${currentFigureStyle} ${imageWrapperStyles}`)
    } else {
      // 如果没有 figure，则检查是否已经有我们自己的 section wrapper
      let $parentSection = $img.closest('section')
      if ($parentSection.length === 0) {
        const $wrapper = $('<section></section>')
        $wrapper.attr('style', imageWrapperStyles)
        $img.wrap($wrapper)
      } else {
        // 如果有 section，确保样式一致
        const currentSectionStyle = $parentSection.attr('style') || ''
        $parentSection.attr('style', `${currentSectionStyle} ${imageWrapperStyles}`)
      }
    }
  })

  // 额外处理：如果 figure 包含 figcaption，确保 figcaption 不被挤压
  $('figcaption').each((_, el) => {
    $(el).attr('style', 'text-align: center; color: #888; font-size: 0.8em; margin-top: 5px;')
  })

  return $.html()
}

/**
 * 生成完整的 HTML 文档
 * 内联所有样式，便于复制粘贴到微信公众号
 */
export async function generateFullHTML(result: RenderResult, codeTheme: string = 'github', config?: RenderConfig): Promise<string> {
  // 1. 表格样式内联
  let finalHtml = inlineTableStyles(result.html, config)
  // 2. 代码块样式内联 (Wrapper 方案)
  finalHtml = inlineCodeBlockStyles(finalHtml)
  // 3. 图片样式内联 (容器归一化)
  finalHtml = inlineImageStyles(finalHtml)

  const codeHighlightUrl = `${CODE_HIGHLIGHT_CDN}${codeTheme}.min.css`
  let codeHighlightCSS = ''

  try {
    const response = await fetch(codeHighlightUrl)
    if (response.ok) {
      codeHighlightCSS = await response.text()
    } else {
      console.warn(`⚠️ 无法下载代码高亮样式: ${codeHighlightUrl}`)
    }
  } catch (e: any) {
    console.warn(`⚠️ 下载代码高亮样式失败 (如网络不通请忽略): ${e.message}`)
  }

  // 4. 构建完整 HTML 供 juice 处理
  const htmlToJuice = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* 注入主题 CSS */
    ${result.css}
    /* 注入代码高亮 CSS */
    ${codeHighlightCSS}
    /* 注入基础修复 CSS */
    ${result.addition}
  </style>
</head>
<body>
  <div class="container">
    <div id="output">
      ${finalHtml}
    </div>
  </div>
</body>
</html>`

  // 5. 使用 juice 进行样式内联
  const inlinedHtml = juice(htmlToJuice, {
    inlinePseudoElements: true,
    preserveImportant: true,
    resolveCSSVariables: false, // 已经在 core 中处理过变量或是后面手动替换
  })

  // 6. 提取 inlinedHtml 中的 output 部分并包装到预览页面
  const $ = cheerio.load(inlinedHtml)
  const outputInlined = $('#output').html() || ''

  // 7. 处理残留的 CSS 变量 (WeChat 不支持)
  const primaryColor = config?.theme?.primaryColor || '#0F4C81'
  const finalInlined = outputInlined
    .replace(/var\(\s*--md-primary-color\s*\)/g, primaryColor)
    .replace(/hsl\(\s*var\(\s*--foreground\s*\)\s*\)/g, '#3f3f3f')
    .replace(/var\(\s*--blockquote-background\s*\)/g, '#f7f7f7')
    .replace(/var\(\s*--md-font-size\s*\)/g, '16px')
    .replace(/var\(\s*--md-font-family\s*\)/g, "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif")

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rendered Markdown</title>
  <style>
    /* 页面预览基础样式 - 不会被复制到微信 */
    body {
      margin: 0;
      padding: 0;
      background: #f5f5f5;
    }
    
    .preview-page {
      display: flex;
      justify-content: center;
      padding: 20px;
    }

    /* 模拟编辑器宽度 */
    .preview-container {
      max-width: 100%;
      width: 100%;
      background: white;
      padding: 20px 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div class="preview-page">
    <div class="preview-container">
      <div class="container">
        <div id="output">
          ${finalInlined}
        </div>
      </div>
    </div>
  </div>
  
  <script>
    console.log('提示：按 Ctrl+A 全选，Ctrl+C 复制，然后粘贴到微信公众号编辑器');
  </script>
</body>
</html>`
}

/**
 * 将 HTML 写入文件
 */
export async function writeOutput(html: string, outputPath: string): Promise<void> {
  const absolutePath = path.resolve(outputPath)
  const dir = path.dirname(absolutePath)

  // 确保目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(absolutePath, html, 'utf-8')
  console.log(`✅ 输出文件: ${absolutePath}`)
}

/**
 * 根据输入文件路径生成默认输出路径
 */
export function getDefaultOutputPath(inputPath: string): string {
  const parsed = path.parse(inputPath)
  return path.join(parsed.dir, `${parsed.name}.rendered.html`)
}
