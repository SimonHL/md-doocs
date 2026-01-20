# md-render CLI

基于 md-doocs 二次开发的 Markdown 渲染命令行工具，专注于为微信公众号生成完美的 HTML 格式。

## ✨ 特性

- **独立运行**：无需启动 Web 服务，直接在终端将 `.md` 转换为 `.html`。
- **自定义样式**：支持通过 `md-config.yaml` 配置主题色、字体及自定义 CSS。
- **深色代码块**：集成 `highlight.js`，完美支持 GitHub Dark 等深色代码风格。
- **表格自动转图**：自动使用 Playwright 对表格进行截图，并上传至微信公众号素材库，解决公众号表格样式适配难题。
- **文件管理**：图片资源自动归档到 Markdown 同级 `images/` 目录。

## 📦 安装

在项目根目录下运行：

```bash
# 安装项目依赖
pnpm install

# 安装 Playwright 浏览器内核 (用于表格截图)
pnpm exec playwright install chromium
```

## 🚀 使用方法

### 基础命令

```bash
# 使用 tsx 直接运行
pnpm exec tsx packages/render-cli/src/index.ts <markdown文件路径>
```

示例：

```bash
pnpm exec tsx packages/render-cli/src/index.ts "/Users/docs/article.md"
```

### 命令行参数

| 参数 | 简写 | 描述 | 默认值 |
| :--- | :--- | :--- | :--- |
| `<file>` | - | **(必选)** 输入的 Markdown 文件路径 | - |
| `--config <path>` | `-c` | 指定配置文件路径 | 默认查找同目录的 `md-config.yaml` 或 `~/.md-doocs/md-config.yaml` |
| `--output <path>` | `-o` | 指定输出 HTML 文件路径 | 输入文件名 + `.rendered.html` |
| `--no-table-image` | - | 跳过表格转图片功能 | 默认开启表格转图片 |

示例：

```bash
# 指定输出文件路径，并跳过表格转图片
pnpm exec tsx packages/render-cli/src/index.ts "article.md" -o "final.html" --no-table-image
```

## ⚙️ 配置文件

在 Markdown 文件同目录下新建 `md-config.yaml`：

```yaml
# 微信公众号配置 (仅当需要表格转图片上传时必填)
wechat:
  appID: "wx1234567890abcdef"
  appSecret: "abcdef1234567890abcdef1234567890"

# 主题基础设置
theme:
  name: "default"         # 主题名称: default, elegant, brief
  primaryColor: "#0F4C81" # 主色调
  fontFamily: "Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif"
  fontSize: "16px"

# 代码块设置
codeBlock:
  theme: "github-dark"    # 推荐使用 github-dark 获得深色背景体验
  macStyle: true          # Mac 风格窗口按钮
  showLineNumber: true    # 显示行号

# 自定义 CSS (支持直接覆盖样式)
customCSS: |
  /* 例如：修改引用块样式 */
  blockquote {
    border-left-color: var(--md-primary-color);
    background-color: #f6f6f6;
  }
  
  /* 如果您喜欢手绘风格，可以在这里粘贴 Sketch 风格的 CSS */
```

## 📊 表格转图片流程

当启用表格转图片功能（默认开启）时：

1. CLI 会识别 Markdown 中的所有 `<table>`。
2. 使用 Playwright 在无头浏览器中渲染表格，并依据当前主题样式进行截图。
3. 截图保存在 Markdown 同级目录的 `images/` 子文件夹中。
4. 调用微信公众号接口上传截图。
5. 在最终 HTML 中将表格替换为微信图片链接。

> **注意**：截图时会自动应用 `.container` 样式作用域，确保图片中的表格样式与最终网页预览一致。

## ❓ 常见问题排查

### 1. 报错 `IP 白名单限制 (40164)`

**现象**：
```
❌ Error: 获取 access_token 失败: invalid ip 1.2.3.4 ... (40164)
```

**解决**：
这是因为您的机器 IP 未在微信公众号后台配置。
1. 复制报错提示中的 IP 地址。
2. 登录 [微信公众平台](https://mp.weixin.qq.com)。
3. 进入 **设置与开发 > 基本配置 > IP白名单**。
4. 点击“修改/查看”，添加该 IP。

### 2. 代码块没有深色背景

请检查 `md-config.yaml`：
```yaml
codeBlock:
  theme: "github-dark"
```
同时确保 `customCSS` 中没有使用 `unset !important` 等强行重置代码块样式的规则。CLI 内部已做了兼容处理，通常情况下直接配置即可生效。

### 3. 生成图片位置
所有生成的表格截图都会保存在源文件目录下的 `images/` 文件夹内，命名格式为 `table-{timestamp}-{random}.png`。
