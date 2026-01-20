/**
 * HTML 输出模块
 * 将渲染结果包装为完整的 HTML 文档
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cheerio from 'cheerio'
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
 * 生成完整的 HTML 文档
 * 内联所有样式，便于复制粘贴到微信公众号
 */
export function generateFullHTML(result: RenderResult, codeTheme: string = 'github', config?: RenderConfig): string {
  // 为表格元素添加内联样式，确保微信兼容性
  const inlinedHtml = inlineTableStyles(result.html, config)
  const codeHighlightCSS = `${CODE_HIGHLIGHT_CDN}${codeTheme}.min.css`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rendered Markdown</title>
  <style>
    /* 页面基础样式 */
    body {
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
    }
    
    /* 预览容器 */
    #output {
      max-width: 100%;
      width: 100%;
      background: white;
      padding: 20px 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    /* 渲染样式 */
    ${result.css}
    
    /* 代码块样式 */
    ${result.addition}
  </style>
  <!-- hljs 主题放在自定义样式之后，确保代码块颜色使用主题定义 -->
  <link rel="stylesheet" href="${codeHighlightCSS}" id="hljs">
</head>
<body>
  <div id="output">
    ${inlinedHtml}
  </div>
  
  <script>
    // 提示用户如何复制
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
