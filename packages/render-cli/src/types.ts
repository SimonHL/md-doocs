/**
 * 配置类型定义
 */

export interface WechatConfig {
    appID: string
    appSecret: string
    proxyOrigin?: string
}

export interface ThemeConfig {
    name: 'default' | 'grace' | 'simple'
    primaryColor: string
    fontFamily: string
    fontSize: string
}

export interface CodeBlockConfig {
    theme: string
    macStyle: boolean
    showLineNumber: boolean
}

export interface OptionsConfig {
    citeStatus: boolean
    countStatus: boolean
    legend: 'title-alt' | 'alt-title' | 'title' | 'alt' | 'none'
}

export interface RenderConfig {
    imageHost: 'mp' | 'github' | 'default'
    wechat: WechatConfig
    theme: ThemeConfig
    codeBlock: CodeBlockConfig
    options: OptionsConfig
    customCSS?: string
}

export interface CLIOptions {
    config?: string
    output?: string
    tableImage?: boolean
}
