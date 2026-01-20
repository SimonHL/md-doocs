/**
 * 表格转图片模块
 * 解析 HTML 中的表格，截图并上传，替换为图片 URL
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import * as cheerio from 'cheerio'
import { screenshotTable } from './screenshot.js'
import { uploadToWechat } from './upload.js'
import type { RenderConfig } from '../types.js'

export interface ProcessedResult {
    wechatHtml: string | null
    localHtml: string
}

/**
 * 处理 HTML 中的表格
 * @param html 渲染后的 HTML 内容
 * @param css 表格样式 CSS
 * @param config 渲染配置
 * @param mdFilePath Markdown 文件路径，用于确定图片保存位置
 * @returns 包含微信版和本地预览版 HTML 的结果对象
 */
export async function processTablesInHtml(
    html: string,
    css: string,
    config: RenderConfig,
    mdFilePath?: string
): Promise<ProcessedResult> {
    const $local = cheerio.load(html)
    const $wechat = cheerio.load(html)

    const tables = $local('table')
    const wechatTables = $wechat('table')

    if (tables.length === 0) {
        console.log('📋 未发现表格，跳过表格转图片')
        return { wechatHtml: html, localHtml: html }
    }

    console.log(`📋 发现 ${tables.length} 个表格，开始处理...`)

    // 1. 确定图片输出目录
    let outputDir: string
    let relativeDir = './'

    if (mdFilePath) {
        const mdDir = path.dirname(path.resolve(mdFilePath))
        outputDir = path.join(mdDir, 'images')
        relativeDir = './images/'

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
            console.log(`📁 创建图片目录: ${outputDir}`)
        }
    } else {
        outputDir = process.cwd()
    }

    // 2. 检查微信配置
    const { wechat } = config
    let canUpload = true
    if (!wechat.appID || !wechat.appSecret) {
        console.warn('⚠️  未配置微信 appID/appSecret，将只生成本地预览图片')
        canUpload = false
    }

    // 3. 处理每个表格
    for (let i = 0; i < tables.length; i++) {
        const table = tables.eq(i)
        const wechatTable = wechatTables.eq(i)

        // 使用 $local 获取 HTML (两者此时内容一致)
        const tableHtml = $local.html(table)

        console.log(`  处理表格 ${i + 1}/${tables.length}...`)

        try {
            // 3.1 截图到 images/ 目录
            const imagePath = await screenshotTable(tableHtml, {
                viewportWidth: 600,
                css,
                outputDir,
            })

            const filename = path.basename(imagePath)
            const relativePath = path.join(relativeDir, filename)

            // 3.2 替换本地 HTML 中的表格
            const localImgTag = `<figure><img src="${relativePath}" alt="表格" style="max-width:100%;"/></figure>`
            table.replaceWith(localImgTag)

            // 3.3 如果可以上传，则上传并替换微信 HTML
            if (canUpload) {
                try {
                    const imageUrl = await uploadToWechat(imagePath, wechat)
                    const wechatImgTag = `<figure><img src="${imageUrl}" alt="表格" style="max-width:100%;"/></figure>`
                    wechatTable.replaceWith(wechatImgTag)

                    console.log(`  ✅ 表格 ${i + 1} 处理完成 (本地+上传)`)
                } catch (uploadError: any) {
                    if (uploadError instanceof Error && uploadError.message.includes('40164')) {
                        console.error(`\n❌ ${uploadError.message}`)
                        console.error('🛑 因 IP 白名单限制，已停止后续上传。将仅生成本地预览文件。\n')
                        canUpload = false // 停止后续上传
                        // 微信版 HTML 保持原状（原表格），或者我们可以标记为失败
                        // 这里选择让 wechatHtml 变为 null，表示无法生成完整的微信版
                        return { wechatHtml: null, localHtml: $local.html() }
                    }
                    console.error(`  ⚠️ 表格 ${i + 1} 上传失败，仅保留本地图片:`, uploadError)
                    // 上传失败但不是 IP 错误，保留原表格在微信版中？或者这是部分失败？
                    // 简单起见，如果上传失败，微信版就不替换该表格
                    canUpload = false
                    return { wechatHtml: null, localHtml: $local.html() }
                }
            } else {
                console.log(`  ✅ 表格 ${i + 1} 截图完成 (仅本地)`)
            }

        } catch (error) {
            console.error(`  ❌ 表格 ${i + 1} 处理失败:`, error)
        }
    }

    // 如果上传功能被禁用（配置缺失或中途出错），wechatHtml 设为 null
    // 除非是一开始就没配置且没有报错（此时 wechatHtml = rawHtml? 不，此时只有 localHtml 有意义）
    // 按照约定，如果 wechatHtml 为 null，CLI 就不输出 rendered.html

    if (!canUpload) {
        return { wechatHtml: null, localHtml: $local.html() }
    }

    return { wechatHtml: $wechat.html(), localHtml: $local.html() }
}

/**
 * 仅截图表格（不上传，用于测试）
 */
export async function screenshotTablesOnly(
    html: string,
    css: string,
    mdFilePath?: string
): Promise<string[]> {
    const $ = cheerio.load(html)
    const tables = $('table')
    const results: string[] = []

    // 确定输出目录
    let outputDir: string | undefined
    if (mdFilePath) {
        const mdDir = path.dirname(path.resolve(mdFilePath))
        outputDir = path.join(mdDir, 'images')
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }
    }

    for (let i = 0; i < tables.length; i++) {
        const tableHtml = $.html(tables.eq(i))
        const imagePath = await screenshotTable(tableHtml, {
            viewportWidth: 600,
            css,
            outputDir,
        })
        results.push(imagePath)
    }

    return results
}

export { screenshotTable } from './screenshot.js'
export { uploadToWechat } from './upload.js'
