/**
 * 微信公众号图床上传模块
 * 将图片上传到微信公众号素材库
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import FormData from 'form-data'
import fetch from 'node-fetch'

interface WechatConfig {
    appID: string
    appSecret: string
    proxyOrigin?: string
}

interface TokenInfo {
    access_token: string
    expires_in: number
    expire?: number
}

// 简单的内存缓存
const tokenCache: Map<string, TokenInfo> = new Map()

/**
 * 获取微信 access_token
 */
async function getMpToken(config: WechatConfig): Promise<string> {
    const { appID, appSecret, proxyOrigin } = config

    // 检查缓存
    const cached = tokenCache.get(appID)
    if (cached && cached.expire && cached.expire > Date.now()) {
        return cached.access_token
    }

    // 请求新的 token
    let url = 'https://api.weixin.qq.com/cgi-bin/stable_token'
    if (proxyOrigin) {
        url = `${proxyOrigin}/cgi-bin/stable_token`
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            grant_type: 'client_credential',
            appid: appID,
            secret: appSecret,
        }),
    })

    const data = await response.json() as TokenInfo & { errcode?: number; errmsg?: string }

    if (data.errcode) {
        // 专门处理 IP 白名单错误
        if (data.errcode === 40164) {
            const ipMatch = data.errmsg?.match(/ip ([\d.:]+)/) || []
            const ip = ipMatch[1] || '未知 IP'
            throw new Error(`IP 白名单限制 (40164): 请将 IP [ ${ip} ] 添加到微信公众号后台白名单中`)
        }
        throw new Error(`获取 access_token 失败: ${data.errmsg} (${data.errcode})`)
    }

    if (!data.access_token) {
        throw new Error('获取 access_token 失败: 返回数据中没有 access_token')
    }

    // 缓存 token
    const tokenInfo: TokenInfo = {
        ...data,
        expire: Date.now() + (data.expires_in - 60) * 1000, // 提前 60 秒过期
    }
    tokenCache.set(appID, tokenInfo)

    return data.access_token
}

/**
 * 上传图片到微信公众号
 * @param imagePath 图片文件路径
 * @param config 微信配置
 * @returns 图片 URL
 */
export async function uploadToWechat(
    imagePath: string,
    config: WechatConfig
): Promise<string> {
    const accessToken = await getMpToken(config)
    const { proxyOrigin } = config

    // 读取图片文件
    const imageBuffer = fs.readFileSync(imagePath)
    const filename = path.basename(imagePath)
    const fileSize = imageBuffer.length / (1024 * 1024) // MB

    // 根据文件大小选择上传接口
    // 小于 1MB 的 JPEG/PNG 可以使用 uploadimg 接口（不占永久素材空间）
    const ext = path.extname(imagePath).toLowerCase()
    const isSmallImage = fileSize < 1 && (ext === '.png' || ext === '.jpg' || ext === '.jpeg')

    let url: string
    if (isSmallImage) {
        url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`
    } else {
        url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`
    }

    if (proxyOrigin) {
        url = url.replace('https://api.weixin.qq.com', proxyOrigin)
    }

    // 构建 FormData
    const formData = new FormData()
    // 关键修正: 必须提供 filename 参数，且与 working example 保持一致
    formData.append('media', imageBuffer, filename)

    // 上传
    const response = await fetch(url, {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders(),
    })

    const result = await response.json() as { url?: string; errcode?: number; errmsg?: string }

    if (result.errcode) {
        throw new Error(`上传图片失败: ${result.errmsg} (${result.errcode})`)
    }

    if (!result.url) {
        throw new Error('上传图片失败: 返回数据中没有 url')
    }

    console.log(`📤 图片已上传: ${result.url}`)
    return result.url
}

/**
 * 清除 token 缓存（用于测试）
 */
export function clearTokenCache(): void {
    tokenCache.clear()
}
