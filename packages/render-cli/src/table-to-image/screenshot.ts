/**
 * 表格截图模块
 * 使用 Playwright 将 HTML 表格渲染为 PNG 图片
 */

import { chromium } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

/**
 * 截图配置
 */
export interface ScreenshotOptions {
  /** 视口宽度，默认 600px（约 30 个汉字） */
  viewportWidth?: number
  /** CSS 样式 */
  css?: string
  /** 输出目录 */
  outputDir?: string
}

/**
 * 将 HTML 表格渲染为 PNG 图片
 * @param tableHtml 表格 HTML 内容
 * @param options 截图选项
 * @returns 图片文件路径
 */
export async function screenshotTable(
  tableHtml: string,
  options: ScreenshotOptions = {}
): Promise<string> {
  const {
    viewportWidth = 600,
    css = '',
    outputDir = os.tmpdir(),
  } = options

  // 构建完整 HTML
  const fullHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: white;
      padding: 15px;
    }
    ${css}
  </style>
</head>
<body>
  <div id="table-container" class="container" style="background-color: white;">
    ${tableHtml}
  </div>
</body>
</html>`

  // 启动浏览器
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: 800 },
    deviceScaleFactor: 3,
  })

  // 加载 HTML
  await page.setContent(fullHtml, { waitUntil: 'networkidle' })

  // 获取表格元素边界
  const tableElement = await page.$('#table-container')
  if (!tableElement) {
    await browser.close()
    throw new Error('未找到表格容器元素')
  }

  // 生成唯一文件名
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 8)
  const filename = `table-${timestamp}-${randomId}.png`
  const outputPath = path.join(outputDir, filename)

  // 截图
  await tableElement.screenshot({
    path: outputPath,
    type: 'png',
  })

  await browser.close()

  console.log(`📸 表格截图已保存: ${outputPath}`)
  return outputPath
}

/**
 * 批量截图多个表格
 */
export async function screenshotTables(
  tables: string[],
  options: ScreenshotOptions = {}
): Promise<string[]> {
  const results: string[] = []

  for (const tableHtml of tables) {
    const imagePath = await screenshotTable(tableHtml, options)
    results.push(imagePath)
  }

  return results
}
