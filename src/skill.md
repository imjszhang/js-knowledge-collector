# JS Knowledge Collector

知识收集器 — 从 URL 到知识库的全链路工具。

## 能力

| 命令 | 说明 |
|------|------|
| `collect <url>` | 抓取 + AI 总结 + 入库 |
| `search <keyword>` | 搜索文章 |
| `list` | 列出文章 |
| `stats` | 统计信息 |
| `export` | 导出（prism/json/md） |
| `delete <id>` | 删除文章 |
| `build` | 构建静态站 |
| `sync` | 提交 + 推送 |

## 使用方式

```bash
node cli/cli.js collect https://mp.weixin.qq.com/s/xxx --flomo
node cli/cli.js search "AI Agent"
node cli/cli.js list --source wechat --page 1
node cli/cli.js stats
node cli/cli.js export --format prism
```

## 支持的平台

微信公众号、小红书、知乎、即刻、X.com、Reddit、Bilibili、YouTube、GitHub 及通用网页。

## 收集流程

```
URL → 抓取 → AI 总结（概要/摘要/推荐） → SQLite 入库 → Flomo 推送（可选）
```
