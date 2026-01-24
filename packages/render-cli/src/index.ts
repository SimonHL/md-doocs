#!/usr/bin/env node
/**
 * md-render CLI
 * 将 Markdown 渲染为可粘贴到微信公众号的 HTML
 */

import { Command } from 'commander'
import * as path from 'node:path'
import process from 'node:process'
import { loadConfig } from './config.js'
import { renderMarkdownToResult } from './renderer.js'
import { generateFullHTML, writeOutput, getDefaultOutputPath } from './output.js'
import { processTablesInHtml } from './table-to-image/index.js'
import { generateOnlineMarkdown, writeOnlineMarkdown } from './online-md.js'

const program = new Command()

program
    .name('md-render')
    .description('将 Markdown 渲染为微信公众号可用的 HTML')
    .version('1.0.0')
    .argument('<file>', 'Markdown 文件路径')
    .option('-c, --config <path>', '配置文件路径')
    .option('-o, --output <path>', '输出文件路径 (微信版)')
    .option('--no-table-image', '跳过表格转图片')
    .action(async (file: string, options: {
        config?: string
        output?: string
        tableImage?: boolean
    }) => {
        try {
            console.log('🚀 md-render 开始处理...')
            console.log(`📄 输入文件: ${path.resolve(file)}`)

            // 1. 加载配置
            const config = await loadConfig(options.config, file)

            // 1.5 生成在线 Markdown (-online.md)
            console.log('📝 生成在线 Markdown...')
            const onlineMd = await generateOnlineMarkdown(file, config)
            await writeOnlineMarkdown(onlineMd, file)

            // 2. 渲染 Markdown
            console.log('📝 渲染 Markdown...')
            const result = await renderMarkdownToResult(file, config)

            // 2.5 处理图表 (Mermaid, PlantUML)
            let processedHtml = result.html

            // 2.5.1 渲染 Mermaid 图表 (准备阶段)
            const { prepareMermaidData, injectMermaidImages, processPlantUMLDiagrams } = await import('./diagram-renderer.js')

            const mermaidData = await prepareMermaidData(processedHtml, result.rawMarkdown, config, file)
            processedHtml = mermaidData.html
            const mermaidImages = mermaidData.images

            // 2.5.2 处理 PlantUML 图表
            processedHtml = await processPlantUMLDiagrams(processedHtml)

            // 3. 处理表格转图片
            let wechatHtml: string | null = processedHtml
            let localHtml: string | null = null

            if (options.tableImage !== false) {
                console.log('🖼️  处理表格转图片...')
                const mergedCSS = `${result.css}\n${result.addition}`

                const processResult = await processTablesInHtml(processedHtml, mergedCSS, config, file)

                wechatHtml = processResult.wechatHtml
                localHtml = processResult.localHtml
            } else {
                console.log('⏭️  跳过表格转图片 (--no-table-image)')
                // 即使跳过表格转图片，我们也需要 localHtml 有值以便后续生成预览
                localHtml = processedHtml
            }

            // 3.5 处理普通本地图片上传 (New Feature)
            if (wechatHtml) {
                const { processImagesInHtml } = await import('./image-processor.js')
                wechatHtml = await processImagesInHtml(wechatHtml, config, file)
            } else if (!localHtml) {
                // 如果既没有 wechatHtml 也没 localHtml (tableImage failed severely?)
                // Usually processTablesInHtml guarantees localHtml unless catastrophic
                localHtml = result.html
            }

            // 4. 生成完整 HTML 并写入文件

            // 4.1 写入本地预览版 (已禁用)
            /*
            if (localHtml) {
                let previewHtml = generateFullHTML({
                    ...result,
                    html: localHtml,
                }, config.codeBlock.theme)

                // 注入 Mermaid 图片 (Use local paths)
                previewHtml = injectMermaidImages(previewHtml, mermaidImages, false)

                // 自动生成 preview 文件名: filename.preview.html
                const parsed = path.parse(file)
                const previewPath = path.join(parsed.dir, `${parsed.name}.preview.html`)

                await writeOutput(previewHtml, previewPath)
                if (!wechatHtml) {
                    // 如果微信版生成失败，重点提示预览版
                    console.log('💡 提示: 由于无法上传图片，已生成本地预览版方便您检查样式。')
                }
            }
            */

            // 4.2 写入微信正式版 (如果有)
            if (wechatHtml) {
                let fullHtml = await generateFullHTML({
                    ...result,
                    html: wechatHtml,
                }, config.codeBlock.theme)

                // 注入 Mermaid 图片 (Use remote URLs)
                fullHtml = injectMermaidImages(fullHtml, mermaidImages, true)

                const outputPath = options.output || getDefaultOutputPath(file)
                await writeOutput(fullHtml, outputPath)

                console.log('🎉 处理完成!')
                console.log('')
                console.log('💡 使用方法:')
                console.log('   1. 用浏览器打开生成的 HTML 文件 (.rendered.html)')
                console.log('   2. 按 Ctrl+A (Mac: Cmd+A) 全选')
                console.log('   3. 按 Ctrl+C (Mac: Cmd+C) 复制')
                console.log('   4. 粘贴到微信公众号编辑器')
                process.exit(0)
            } else {
                console.log('')
                console.log('⚠️  未生成微信正式版 HTML (因图片上传失败或配置缺失)')
                console.log('   请检查 IP 白名单配置或网络连接。')
                // Exit with error code if wechat version failed (optional, but good for CI)
                process.exit(1)
            }

        } catch (error) {
            console.error('❌ 错误:', error instanceof Error ? error.message : error)
            process.exit(1)
        }
    })

program.parse()
