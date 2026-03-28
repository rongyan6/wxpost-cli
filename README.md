# @rongyan/wxpost-cli

微信公众号草稿发布命令行客户端。将本地 Markdown 文件转换为微信富文本，自动上传图片，创建/查看/发布草稿。

## 要求

- Node.js >= 18
- 运行中的 [wxpost-server](https://github.com/rongyan6/wxpost-server) 实例

## 安装

```bash
npm install -g @rongyan/wxpost-cli
```

或通过 npx 直接运行（无需安装）：

```bash
npx @rongyan/wxpost-cli add_draft article.md
```

## 配置

首次运行时自动在 `~/.@rongyan/env-cli.json` 创建配置模板并退出。编辑后重新运行即可。

```json
{
  "server_url": "http://localhost:3000",
  "api_key": "your-api-key",
  "need_open_comment": 1,
  "only_fans_can_comment": 0,
  "mdflow": {
    "primary_color": null,
    "heading_2": null,
    "asset_dir": null
  }
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `server_url` | wxpost-server 地址 | `http://localhost:3000` |
| `api_key` | 与 wxpost-server 一致的鉴权密钥 | — |
| `need_open_comment` | 草稿是否开启评论（0/1） | `1` |
| `only_fans_can_comment` | 是否仅粉丝可评论（0/1） | `0` |
| `mdflow.primary_color` | 文章主题色，`null` 则每次随机 | `null` |
| `mdflow.heading_2` | 二级标题样式，`null` 则每次随机 | `null` |
| `mdflow.asset_dir` | Mermaid 图表 PNG 输出目录（可选） | — |

### mdflow 可选值

**primary_color**：`blue` `green` `orange` `yellow` `purple` `sky` `rosegold` `olive` `black` `gray` `pink`

**heading_2**：`default` `color` `bottom` `left`

## 命令

### add_draft — 创建草稿

```bash
wxpost add_draft <file.md> [--account <appid>]
```

从 Markdown 文件创建草稿。文章类型由 front matter 中的 `article_type` 字段决定，默认为 `news`（图文消息）。

#### 图文消息（news）

```markdown
---
title: 文章标题（最多 32 字，必填）
author: 作者名（可选）
digest: 自定义摘要（可选，不填则自动截取正文前 100 字）
cover: ./images/cover.jpg
---

正文内容，支持标准 Markdown 语法...
```

| front matter 字段 | 说明 |
|---|---|
| `title` | 文章标题，必填，最多 32 字 |
| `cover` | 封面图本地路径（相对于 .md 文件），必填 |
| `author` | 作者，可选 |
| `digest` | 摘要，可选，超出 128 字由服务端截断 |

封面图会自动上传为永久素材；正文中引用的本地图片会自动上传为内容图并替换 URL。

#### 图片消息（newspic）

```markdown
---
title: 相册标题（必填）
article_type: newspic
image_list:
  - ./photos/01.jpg
  - ./photos/02.jpg
  - ./photos/03.png
---

可选的图片说明文字（仅支持纯文本，不支持 Markdown 语法）
```

| front matter 字段 | 说明 |
|---|---|
| `title` | 标题，必填，最多 32 字 |
| `article_type` | 固定填 `newspic` |
| `image_list` | 本地图片路径列表（相对于 .md 文件），1-20 张，必填 |

`image_list` 中的图片全部上传为永久素材；第一张自动作为封面。

#### 图片处理

所有图片均通过文件头（magic bytes）校验格式，扩展名与内容不符会报错。

| 用途 | 支持格式 | 大小限制 | 超限处理 |
|---|---|---|---|
| 封面图（news cover） | JPG / PNG / BMP / GIF | 10MB | JPG/PNG 自动无损压缩；BMP/GIF 超限直接报错 |
| 图片消息图片（newspic image_list） | JPG / PNG / BMP / GIF | 10MB | 同上 |
| 正文内联图（news 正文 img 标签） | JPG / PNG | 1MB | 自动无损压缩；压缩后仍超则报错 |

路径均相对于 Markdown 文件所在目录解析。

### list_draft — 草稿列表

```bash
wxpost list_draft [--offset <n>] [--count <n>] [--account <appid>]
```

| 选项 | 说明 | 默认 |
|---|---|---|
| `--offset` | 起始偏移 | `0` |
| `--count` | 返回数量，最大 20 | `20` |
| `--account` | 指定公众号 AppID | 配置中的默认账号 |

输出示例：

```
草稿总数: 12  本次返回: 3

[1] 我的第一篇文章
    media_id:   xxx
    更新时间:   2026/3/28 10:30:00

[2] 相册：春日出行
    media_id:   yyy
    更新时间:   2026/3/27 09:00:00
```

### publish — 发布草稿

```bash
wxpost publish <media_id> [--account <appid>]
```

将草稿正式发布为群发消息。

## 多账号

所有命令均支持 `--account <appid>` 指定公众号账号，不传则使用 wxpost-server 配置中的 `defaultAccount`。

## 完整示例

```bash
# 创建图文草稿
wxpost add_draft article.md

# 创建并指定账号
wxpost add_draft article.md --account wx84671d15576a9880

# 查看草稿列表
wxpost list_draft

# 翻页
wxpost list_draft --offset 20 --count 10

# 发布
wxpost publish <media_id>
```
