# 本地文件收集支持

## 目标

为 js-knowledge-collector 添加本地文件（md/txt/pdf/docx/html）收集能力，复用现有的 Summarizer → Database → Flomo 流水线。

## 核心思路

新增 `file-parser` 模块，输出与现有 `scrape` 一致的 `data.json` 格式，后续流程无需改动。

## 拆分方案

**策略**：`by-pipeline`（3 阶段流水线，阶段内并行）

```
Stage 0 ──────────────────────────
  task01: file-path 工具模块（无依赖）
    ↓
  task02: collectFile 核心入口（依赖 task01）
    ↓
Stage 1 ────────────────────────── 4 个解析器并行
  task03: md/txt 解析器（零依赖）
  task04: pdf 解析器（需 pdf-parse）
  task05: docx 解析器（需 mammoth）
  task06: html 解析器（复用 cheerio）
    ↓
Stage 2 ────────────────────────── 2 个子任务并行
  task07: CLI 命令扩展
  task08: 数据库 schema 适配
```

## 子任务清单

| # | 目录 | 说明 | 新增/修改文件 | 依赖 |
|---|------|------|-------------|------|
| 01 | task01-file-path | 文件检测 & 路径工具 | 新增 `cli/lib/file-path.js` | 无 |
| 02 | task02-collect-file | collectFile 核心入口 | 修改 `collector.js`，新增 `parsers/` 目录和 `parsers/index.js` | task01 |
| 03 | task03-parser-md-txt | md/txt 解析器 | 新增 `parsers/md-txt-parser.js` | task02 |
| 04 | task04-parser-pdf | pdf 解析器 | 新增 `parsers/pdf-parser.js` + `pdf-parse` 依赖 | task02 |
| 05 | task05-parser-docx | docx 解析器 | 新增 `parsers/docx-parser.js` + `mammoth` 依赖 | task02 |
| 06 | task06-parser-html | html 解析器 | 新增 `parsers/html-parser.js` | task02 |
| 07 | task07-cli | CLI 命令扩展 | 修改 `cli/cli.js`（collect 自动检测 + collect-dir + collect-file） | S1 全部完成 |
| 08 | task08-database | 数据库适配 | 修改 `cli/lib/database.js`（SOURCE_MAP 扩展 + source='local'） | S1 全部完成 |

## 执行顺序

1. 串行执行 task01 → task02
2. 并行执行 task03 ~ task06
3. 并行执行 task07 + task08

## 新增 npm 依赖

| 依赖 | 用途 | 大小 | 任务 |
|------|------|------|------|
| `pdf-parse` | PDF 文本提取 | ~500KB | task04 |
| `mammoth` | DOCX 转文本 | ~300KB | task05 |
