# Task 01: File Path Detection & Metadata Utility

## Context

项目是 `js-knowledge-collector`（D:\github\my\js-knowledge-collector），一个知识收集工具，目前只支持 URL 抓取。现在要扩展为支持本地文件（md/txt/pdf/docx/html）。

现有入口：`cli/lib/collector.js` 中的 `collect(url)` 函数，内部调用 `scraper.js` 做 HTTP 抓取。

## 目标

新建 `cli/lib/file-path.js`，提供本地文件检测和元数据提取功能。

## 需要实现的功能

### 1. `isLocalPath(input)` — 检测输入是否为本地路径

输入可能是 URL 或本地路径。判断逻辑：
- `file://` 协议开头 → 是本地路径
- 包含 `\`（Windows 路径分隔符）→ 是本地路径
- 以 `/` 开头（Unix 绝对路径）→ 是本地路径
- 以 `./` 或 `../` 开头 → 是本地路径
- 其余情况视为 URL

### 2. `resolveFilePath(input)` — 将输入解析为绝对路径

- `file://` 前缀去掉后得到路径
- 相对路径用 `path.resolve()` 转为绝对路径
- 绝对路径直接返回

### 3. `detectFileType(filePath)` — 根据文件扩展名检测文件类型

支持的类型：
- `.md` → `'md'`
- `.txt` → `'txt'`
- `.pdf` → `'pdf'`
- `.docx` → `'docx'`
- `.html`, `.htm` → `'html'`
- 其他 → 抛出 Error

### 4. `generateFileHash(filePath)` — 为文件生成缓存标识

用 `crypto.createHash('md5')` 对绝对路径 + 文件 mtime 做 hash，生成文件名（类似 `generateFileName` 对 URL 的处理）。

### 5. `getFileCategory(fileType)` — 返回分类目录名

- md/txt → `'local'`
- pdf → `'local'`
- docx → `'local'`
- html → `'local'`

## 文件约束

- 新建文件：`cli/lib/file-path.js`
- 使用 ESM 导出（`export function ...`）
- 依赖：仅 `node:path`, `node:fs`, `node:crypto`（均为内置）
- 不要修改任何现有文件

## 输出格式约定（重要）

后续的文件解析器需要输出和现有 `scrape` 一致的 `data.json` 格式，供 Summarizer 使用：

```json
{
  "error": "0",
  "data": {
    "title": "提取的标题或文件名",
    "content": "文件纯文本内容",
    "source_url": "file:///绝对/路径",
    "cover_url": "",
    "description": "文件描述（可空）"
  }
}
```

缓存路径约定：
```
work_dir/scrape/local/<file-hash>/data.json
```

## 参考现有代码

- `cli/lib/scraper.js` 中的 `generateFileName()` — 参考其 hash 逻辑
- `cli/lib/scraper.js` 中的 `getCategoryDir()` — 参考其分类逻辑
