/**
 * 通用图片处理模块
 * 扫描 HTML 中的图片标签，将本地图片上传到微信图床并替换链接
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cheerio from 'cheerio'
import { mpFileUpload } from './utils/mp-upload.js'
import type { RenderConfig } from './types.js'

export async function processImagesInHtml(
    html: string,
    config: RenderConfig,
    mdFilePath: string
): Promise<string> {
    const { wechat } = config

    // 如果未配置微信 credentials，直接跳过上传
    if (!wechat.appID || !wechat.appSecret) {
        console.log('⚠️  未配置微信 appID/appSecret，跳过图片上传')
        return html
    }

    const $ = cheerio.load(html, null, false) // false means parse as fragment (useful if wrapping logic varies, but here we expect full body mostly)
    // Actually renderer.ts wraps it in <section class="container">, so it's a snippet.

    const images = $('img')
    if (images.length === 0) {
        return html
    }

    console.log(`🖼️  发现 ${images.length} 张图片，检查本地图片...`)

    const mdDir = path.dirname(path.resolve(mdFilePath))
    let uploadCount = 0

    for (let i = 0; i < images.length; i++) {
        const img = images.eq(i)
        const src = img.attr('src')

        if (!src) continue

        // 跳过网络图片和 Base64
        if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) {
            continue
        }

        // 解析本地路径
        let localPath = src
        if (!path.isAbsolute(localPath)) {
            localPath = path.resolve(mdDir, src)
        }

        if (!fs.existsSync(localPath)) {
            console.warn(`⚠️  图片不存在: ${localPath} (src: ${src})`)
            continue
        }

        console.log(`  📤 上传图片 (${i + 1}/${images.length}): ${path.basename(localPath)}...`)

        try {
            const fileBuffer = fs.readFileSync(localPath)
            const filename = path.basename(localPath)

            const remoteUrl = await mpFileUpload(fileBuffer, filename, wechat)

            img.attr('src', remoteUrl)
            uploadCount++
            console.log(`     ✅ 上传成功`)
        } catch (error) {
            console.error(`     ❌ 上传失败:`, error instanceof Error ? error.message : error)
            // Decide: fail hard or keep local path? 
            // Original user logic: "Fail if upload fails"? 
            // In table-to-image we decided to fail gracefully or stop uploading.
            // Let's Log error and keep local path, but maybe throw if it's an IP whitelist error?
            // For now, consistent with table-to-image, we log and continue (local path remains).
            if (error instanceof Error && error.message.includes('40164')) {
                console.error('🛑 因 IP 白名单限制，停止后续上传。')
                break
            }
        }
    }

    if (uploadCount > 0) {
        console.log(`🎉 已上传 ${uploadCount} 张本地图片`)
    }

    return $.html()
}
