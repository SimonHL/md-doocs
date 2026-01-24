/**
 * 图表渲染模块
 * 使用 Playwright 渲染 Mermaid 图表为 SVG
 * 采用延迟注入策略，防止 SVG 被 Cheerio 处理破坏
 */

import { chromium } from 'playwright'
import * as cheerio from 'cheerio'

import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { uploadToWechat } from './table-to-image/upload.js'
import type { RenderConfig } from './types.js'

export interface MermaidImage {
    localPath: string
    url?: string
}

export interface MermaidData {
    html: string
    images: MermaidImage[]
}

/**
 * 准备 Mermaid 数据
 * 1. 提取 Mermaid 代码
 * 2. 渲染为图片 (截图)
 * 3. 上传到微信 (如果配置了)
 * 4. 将 HTML 中的 Mermaid 占位符替换为安全的注入标记
 */
export async function prepareMermaidData(
    html: string,
    rawMarkdown: string,
    config: RenderConfig,
    mdFilePath?: string
): Promise<MermaidData> {
    const $ = cheerio.load(html)
    const mermaidElements = $('.mermaid-diagram')

    if (mermaidElements.length === 0) {
        return { html, images: [] }
    }

    console.log(`🎨 发现 ${mermaidElements.length} 个 Mermaid 图表，准备渲染...`)

    // Extract code from raw markdown
    const mermaidRegex = /```mermaid\r?\n([\s\S]*?)\r?\n```/g
    const mermaidCodes: string[] = []
    let match = mermaidRegex.exec(rawMarkdown)
    while (match !== null) {
        mermaidCodes.push(match[1].trim())
        match = mermaidRegex.exec(rawMarkdown)
    }

    if (mermaidCodes.length === 0) {
        return { html, images: [] }
    }

    // Determine output directory
    let outputDir: string
    if (mdFilePath) {
        const mdDir = path.dirname(path.resolve(mdFilePath))
        outputDir = path.join(mdDir, 'images')
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }
    } else {
        outputDir = process.cwd()
    }

    // Render Images
    const images = await renderMermaidToImages(mermaidCodes, outputDir, config)

    // Replace placeholders with safe tokens
    mermaidElements.each((i, el) => {
        if (i < images.length) {
            $(el).replaceWith(`<mermaid-img-holder index="${i}"></mermaid-img-holder>`)
        }
    })

    return {
        html: $.html(),
        images
    }
}

/**
 * 注入 Mermaid 图片
 * @param html HTML 内容
 * @param images 图片数据列表
 * @param useRemoteUrl 是否使用远程 URL (WeChat) 否则使用本地路径
 */
export function injectMermaidImages(html: string, images: MermaidImage[], useRemoteUrl: boolean): string {
    if (images.length === 0) return html

    let result = html
    const holderRegex = /<mermaid-img-holder\s+index="(\d+)"\s*(?:\/>|>\s*<\/mermaid-img-holder>)/gi
    result = result.replace(holderRegex, (_match, index) => {
        const i = parseInt(index, 10)
        if (i >= 0 && i < images.length) {
            const img = images[i]
            const src = (useRemoteUrl && img.url) ? img.url : img.localPath

            // 如果是本地路径，转换为相对路径用于 img src
            // 这里简单处理，假设 images 目录在 HTML 同级或子级
            // 实际 mdFilePath 对应的 images 目录，生成的 HTML 也在 mdFilePath 同级
            let finalSrc = src
            if (!useRemoteUrl && path.isAbsolute(src)) {
                // 转换为相对路径: ./images/xxx.png
                finalSrc = `./images/${path.basename(src)}`
            }

            return `<figure><img src="${finalSrc}" alt="Mermaid Diagram" style="display:block; margin: 1em auto; max-width: 100%;"/></figure>`
        }
        return _match
    })

    return result
}

/**
 * 使用 Playwright 渲染 Mermaid 代码为图片，并处理上传
 */
async function renderMermaidToImages(
    codes: string[],
    outputDir: string,
    config: RenderConfig
): Promise<MermaidImage[]> {
    console.log(`🎨 使用 Playwright 渲染 ${codes.length} 个 Mermaid 图表为图片...`)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // 检查微信配置
    const { wechat } = config
    let canUpload = true
    if (!wechat.appID || !wechat.appSecret) {
        canUpload = false
    }

    const renderHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        body { font-family: sans-serif; background: white; margin: 0; padding: 20px; }
        .mermaid { margin: 20px 0; display: inline-block; }
        /* Fix Mermaid text cutoff */
        svg { overflow: visible !important; }
    </style>
</head>
<body>
    ${codes.map((code, i) => `<div id="mermaid-${i}" class="mermaid">${code}</div>`).join('\n')}
    <script>
        mermaid.initialize({ 
            startOnLoad: false, // We will call init manually
            theme: 'default',
            securityLevel: 'loose',
            flowchart: { htmlLabels: false }
        });
        // Manually initialize mermaid diagrams
        document.addEventListener('DOMContentLoaded', function() {
            mermaid.init();
        });
    </script>
</body>
</html>`

    await page.setContent(renderHtml, { waitUntil: 'networkidle' })
    // 等待一会确保渲染完成
    await page.waitForTimeout(2000)

    const resultImages: MermaidImage[] = []

    for (let i = 0; i < codes.length; i++) {
        const timestamp = Date.now()
        const filename = `mermaid-${timestamp}-${i}.png`
        const localPath = path.join(outputDir, filename)

        try {
            const locator = page.locator(`#mermaid-${i}`)
            // 截图
            await locator.screenshot({
                path: localPath,
                omitBackground: false // 默认为透明，设为 false 可能需要，但背景已设为 white
                // 实际上如果不设，且 body background white，截图应该包括背景
                // 如果 omitBackground: true，则透明，对于某些深色模式可能更好？
                // 但微信背景通常是白色的。保持原状（默认）或显式。
                // 之前的 table screenshot 是默认。
            })

            let url: string | undefined

            if (canUpload) {
                try {
                    url = await uploadToWechat(localPath, wechat)
                    console.log(`  ✅ Mermaid 图表 ${i + 1} 处理完成 (本地+上传)`)
                } catch (error: any) {
                    if (error instanceof Error && error.message.includes('40164')) {
                        console.error(`\n❌ ${error.message}`)
                        console.error('🛑 因 IP 白名单限制，已停止后续上传。\n')
                        canUpload = false
                    } else {
                        console.error(`  ⚠️ Mermaid 图表 ${i + 1} 上传失败:`, error)
                    }
                }
            } else {
                console.log(`  ✅ Mermaid 图表 ${i + 1} 截图完成 (仅本地)`)
            }

            resultImages.push({ localPath, url })

        } catch (error) {
            console.error(`  ❌ Mermaid 图表 ${i + 1} 渲染失败:`, error)
            // Push placeholder or skip? Better to push something so index matches
            // 但如果截图失败，没有文件。
            // 这里推入空或者错误图? 简单起见，不推入，后续 index 匹配时会跳过
            // 但这样会导致后续图表错位。应该推入一个 dummy image
            resultImages.push({ localPath: '' })
        }
    }

    await browser.close()
    return resultImages
}

/**
 * 处理 PlantUML 图表
 */
export async function processPlantUMLDiagrams(html: string): Promise<string> {
    const $ = cheerio.load(html)
    const plantumlElements = $('.plantuml-diagram')

    if (plantumlElements.length === 0) return html

    console.log(`🌱 发现 ${plantumlElements.length} 个 PlantUML 图表，开始处理...`)

    for (let i = 0; i < plantumlElements.length; i++) {
        const $el = $(plantumlElements[i])
        const $img = $el.find('img')
        if ($img.length > 0) {
            const svgUrl = $img.attr('src')
            if (svgUrl && svgUrl.includes('plantuml.com')) {
                try {
                    const response = await fetch(svgUrl)
                    if (response.ok) {
                        let svgContent = await response.text()
                        svgContent = svgContent
                            .replace(/(<svg[^>]*)\swidth="[^"]*"/g, '$1')
                            .replace(/(<svg[^>]*)\sheight="[^"]*"/g, '$1')
                        $img.replaceWith(svgContent)
                        console.log(`  ✅ PlantUML 图表 ${i + 1} 已内嵌 SVG`)
                    }
                } catch {
                    console.error(`  ⚠️ PlantUML 图表 ${i + 1} SVG 获取失败，保留图片链接`)
                }
            }
        }
    }

    return $.html()
}
