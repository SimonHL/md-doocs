/**
 * 图表渲染模块
 * 使用 Playwright 渲染 Mermaid 图表为 SVG
 * 采用延迟注入策略，防止 SVG 被 Cheerio 处理破坏
 */

import { chromium } from 'playwright'
import * as cheerio from 'cheerio'

export interface MermaidData {
    html: string
    svgs: string[]
}

/**
 * 准备 Mermaid 数据
 * 1. 提取 Mermaid 代码
 * 2. 渲染 SVG
 * 3. 将 HTML 中的 Mermaid 占位符替换为安全的注入标记
 */
export async function prepareMermaidData(html: string, rawMarkdown: string): Promise<MermaidData> {
    const $ = cheerio.load(html)
    const mermaidElements = $('.mermaid-diagram')

    if (mermaidElements.length === 0) {
        return { html, svgs: [] }
    }

    console.log(`🎨 发现 ${mermaidElements.length} 个 Mermaid 图表，准备渲染...`)

    // Extract code from raw markdown
    const mermaidRegex = /```mermaid\r?\n([\s\S]*?)\r?\n```/g
    const mermaidCodes: string[] = []
    let match: RegExpExecArray | null
    while ((match = mermaidRegex.exec(rawMarkdown)) !== null) {
        mermaidCodes.push(match[1].trim())
    }

    if (mermaidCodes.length === 0) {
        return { html, svgs: [] }
    }

    // Render SVGs
    const svgs = await renderMermaidCodes(mermaidCodes)

    // Replace placeholders with safe tokens
    mermaidElements.each((i, el) => {
        if (i < svgs.length) {
            // Use a custom tag that htmlparser2/cheerio likely preserves
            // Using a span with a special attribute is also safe
            $(el).replaceWith(`<mermaid-svg-holder index="${i}"></mermaid-svg-holder>`)
        }
    })

    return {
        html: $.html(),
        svgs
    }
}

/**
 * 注入 Mermaid SVG
 * 在最终 HTML 生成后调用，将注入标记替换为真实 SVG
 */
export function injectMermaidSvgs(html: string, svgs: string[]): string {
    if (svgs.length === 0) return html

    let result = html
    // Regex to match the holder tag
    // Match <mermaid-svg-holder index="i"></mermaid-svg-holder>
    // Cheerio might normalize it to <mermaid-svg-holder index="i"/> or similar
    const holderRegex = /<mermaid-svg-holder\s+index="(\d+)"\s*(?:\/?>|>\s*<\/mermaid-svg-holder>)/gi

    result = result.replace(holderRegex, (_match, index) => {
        const i = parseInt(index, 10)
        if (i >= 0 && i < svgs.length) {
            return `<div class="mermaid-diagram">${svgs[i]}</div>`
        }
        return _match
    })

    return result
}

/**
 * 使用 Playwright 渲染 Mermaid 代码为 SVG
 */
async function renderMermaidCodes(codes: string[]): Promise<string[]> {
    console.log(`🎨 使用 Playwright 渲染 ${codes.length} 个 Mermaid 图表...`)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    const renderHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        body { font-family: sans-serif; background: white; margin: 0; padding: 20px; }
        .mermaid { margin: 10px 0; }
        /* Fix Mermaid text cutoff */
        svg { overflow: visible !important; }
    </style>
</head>
<body>
    ${codes.map((code, i) => `<div id="mermaid-${i}" class="mermaid">${escapeHtml(code)}</div>`).join('\n')}
    <script>
        mermaid.initialize({ 
            startOnLoad: true, 
            theme: 'default',
            securityLevel: 'loose',
            flowchart: { htmlLabels: false }
        });
    </script>
</body>
</html>`

    await page.setContent(renderHtml, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    const svgList: string[] = []

    for (let i = 0; i < codes.length; i++) {
        try {
            // Get SVG content and fix dimensions
            const svgContent = await page.$eval(`#mermaid-${i}`, (el) => {
                const svg = el.querySelector('svg');
                if (!svg) return null;

                // Get the exact bounding box of the content
                const bbox = svg.getBBox();
                const padding = 20; // Add some padding
                const width = bbox.width + padding * 2;
                const height = bbox.height + padding * 2;

                // Update SVG attributes to ensure everything is visible
                svg.setAttribute('width', width.toString());
                svg.setAttribute('height', height.toString());

                // Adjust viewBox to cover the bounding box
                const viewBoxX = bbox.x - padding;
                const viewBoxY = bbox.y - padding;
                svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${width} ${height}`);

                // Ensure style doesn't restrict it
                svg.style.maxWidth = '100%';
                svg.style.height = 'auto';

                return el.innerHTML;
            });

            if (svgContent && svgContent.includes('<svg')) {
                svgList.push(svgContent)
            } else {
                console.error(`  ❌ Mermaid 图表 ${i + 1} 未生成 SVG`)
                svgList.push('<div style="color: red; padding: 10px; border: 1px solid red;">Mermaid 渲染失败</div>')
            }
        } catch (error) {
            console.error(`  ❌ Mermaid 图表 ${i + 1} 渲染失败:`, error)
            svgList.push('<div style="color: red; padding: 10px; border: 1px solid red;">Mermaid 渲染失败</div>')
        }
    }

    await browser.close()
    return svgList
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
                } catch (error) {
                    console.error(`  ⚠️ PlantUML 图表 ${i + 1} SVG 获取失败，保留图片链接`)
                }
            }
        }
    }

    return $.html()
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
