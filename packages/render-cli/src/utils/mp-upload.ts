/**
 * 微信公众号图床上传模块 (Adapted from apps/web/src/utils/file.ts)
 * 适配 Node.js 环境
 */

import fetch from 'node-fetch'
import FormData from 'form-data'
import type { RenderConfig } from '../types.js'

interface TokenInfo {
    access_token: string
    expires_in: number
    expire?: number
    errcode?: number
    errmsg?: string
}

// 简单的内存缓存
const tokenCache: Map<string, TokenInfo> = new Map()

/**
 * 获取微信 access_token
 */
async function getMpToken(appID: string, appSecret: string, proxyOrigin?: string): Promise<string> {
    // Check cache
    const cached = tokenCache.get(appID)
    if (cached && cached.expire && cached.expire > Date.now()) {
        return cached.access_token
    }

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

    const data = await response.json() as TokenInfo

    if (data.errcode) {
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

    // Cache token
    const tokenInfo: TokenInfo = {
        ...data,
        expire: Date.now() + (data.expires_in - 60) * 1000,
    }
    tokenCache.set(appID, tokenInfo)

    return data.access_token
}

/**
 * Upload file to WeChat
 * Adapted to accept Buffer and filename instead of File object
 */
export async function mpFileUpload(
    fileBuffer: Buffer,
    filename: string,
    config: RenderConfig['wechat']
): Promise<string> {
    const { appID, appSecret, proxyOrigin } = config

    if (!appID || !appSecret) {
        throw new Error('未配置微信 appID 或 appSecret')
    }

    const access_token = await getMpToken(appID, appSecret, proxyOrigin)
    
    const formdata = new FormData()
    formdata.append('media', fileBuffer, filename)

    let url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${access_token}&type=image`
    
    // Check file size and type for uploadimg optimization (checking filename extension primarily)
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const isImage = ['jpg', 'jpeg', 'png'].includes(ext)
    const sizeInMB = fileBuffer.length / (1024 * 1024)

    if (sizeInMB < 1 && isImage) {
        url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${access_token}`
    }

    if (proxyOrigin) {
        url = url.replace('https://api.weixin.qq.com', proxyOrigin)
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: formdata.getHeaders(),
        body: formdata
    })

    const result = await response.json() as { url?: string; errcode?: number; errmsg?: string }

    if (result.errcode) {
        throw new Error(`上传图片失败: ${result.errmsg} (${result.errcode})`)
    }

    if (!result.url) {
        throw new Error('上传图片失败: 返回数据中没有 url')
    }

    let imageUrl = result.url
    // Proxy URL replacement logic from web/utils/file.ts
    // Note: window.location check removed as we are in CLI
    if (proxyOrigin) {
         imageUrl = `https://wsrv.nl?url=${encodeURIComponent(imageUrl)}`
    }

    return imageUrl
}
