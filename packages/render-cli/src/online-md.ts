/**
 * Online Markdown 生成模块
 * 将 Markdown 中的本地图片替换并在 URL 前增加代理，生成 -online.md
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { mpFileUpload } from './utils/mp-upload.js'
import type { RenderConfig } from './types.js'

/**
 * 生成包含在线图片链接的 Markdown 文件
 */
export async function generateOnlineMarkdown(mdFilePath: string, config: RenderConfig): Promise<string> {
    const mdDir = path.dirname(path.resolve(mdFilePath))
    let content = fs.readFileSync(mdFilePath, 'utf-8')
    const { wechat } = config

    if (!wechat.appID || !wechat.appSecret) {
        console.warn('⚠️  未配置微信 appID/appSecret，无法生成真正在线的图片链接')
        return content
    }

    // 收集所有需要替换的项
    const replacements: Array<{ original: string; src: string }> = []

    // 1. 匹配 Markdown 图片语法: ![alt](path)
    const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = mdImageRegex.exec(content)) !== null) {
        replacements.push({ original: match[0], src: match[2] })
    }

    // 2. 匹配 HTML img 标签: <img src="path" ...>
    const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g
    while ((match = htmlImageRegex.exec(content)) !== null) {
        replacements.push({ original: match[0], src: match[1] })
    }

    if (replacements.length === 0) {
        console.log('📝 -online.md 中未发现需要处理的本地图片')
        return content
    }

    console.log(`📝 在 -online.md 中处理 ${replacements.length} 张图片...`)

    // 替换本地图片
    for (const item of replacements) {
        const { src, original } = item

        // 跳过远程图片和 Base64
        if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) {
            continue
        }

        const localPath = path.isAbsolute(src) ? src : path.resolve(mdDir, src)

        if (fs.existsSync(localPath)) {
            try {
                const fileBuffer = fs.readFileSync(localPath)
                const filename = path.basename(localPath)

                console.log(`  📤 上传在线图片: ${filename}...`)
                const remoteUrl = await mpFileUpload(fileBuffer, filename, wechat)

                // 增加代理前缀
                const finalUrl = `https://wsrv.nl?url=${encodeURIComponent(remoteUrl)}`

                // 替换 original 中的 src 部分
                const replaced = original.replace(src, finalUrl)

                // 在全文中替换该项
                content = content.replace(original, replaced)
                console.log(`     ✅ 已替换为代理链接`)
            } catch (error) {
                console.error(`     ❌ 上传失败:`, error instanceof Error ? error.message : error)
            }
        } else {
            console.warn(`  ⚠️ 图片文件未找到: ${localPath}`)
        }
    }

    return content
}

/**
 * 写入 Online Markdown 文件
 */
export async function writeOnlineMarkdown(content: string, mdFilePath: string): Promise<void> {
    const parsed = path.parse(mdFilePath)
    const outputPath = path.join(parsed.dir, `${parsed.name}-online.md`)

    fs.writeFileSync(outputPath, content, 'utf-8')
    console.log(`✅ 已生成在线 Markdown: ${outputPath}`)
}
