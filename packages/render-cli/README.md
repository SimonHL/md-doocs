# md-render CLI

基于 md-doocs 二次开发的 Markdown 渲染命令行工具，专注于为微信公众号生成完美的 HTML 格式。

## ✨ 特性

- **独立运行**：无需启动 Web 服务，直接在终端将 `.md` 转换为 `.html`。
- **高保真样式内联**：集成 `juice` 引擎，自动将所有 CSS 样式内联，确保粘贴到微信后台后，语法高亮和主题布局完美重现。
- **横向代码滚动**：完美解决微信端代码块横行滚动难题，支持 Mac 风格窗口样式。
- **全自动化媒体处理**：
    - **表格转图片**：自动截图并上传，解决公众号表格适配难题。
    - **本地图片上传**：检测并自动上传 Markdown 中的本地图片至微信素材库。
    - **在线 Markdown 生成**：同步生成一份图片链接已替换为微信 CDN 的 `-online.md` 文件。

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

您可以直接通过 TypeScript 运行（推荐在开发调试时使用）：

```bash
# 在 packages/render-cli 目录下
pnpm exec tsx src/index.ts <Markdown文件路径>
```

最推荐的方式是作为正式工具运行：

```bash
# 使用 bin 目录下的入口
./bin/cli.js <Markdown文件路径>
```

或者使用项目中定义的快捷命令：

```bash
pnpm start -- <Markdown文件路径>
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
pnpm start -- "article.md" -o "final.html" --no-table-image
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

当程序运行时，会自动执行以下操作：

1. **识别与转换**：识别 Markdown 中的本地图片和 `<table>`。
2. **自动化渲染**：使用 Playwright 在无头浏览器中渲染表格并截图。
3. **极速上传**：自动调用微信接口上传本地图片和表格截图至微信素材库。
4. **生成在线版**：生成一份 `<filename>-online.md`，其中的图片链接已全部替换为微信 CDN 链接，方便在其他平台使用。
5. **样式内联**：基于 `juice` 进行样式内联，生成最终的 `.rendered.html`。

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
