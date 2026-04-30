# Task 03: MD/TXT 文件解析器

## Context

项目是 `js-knowledge-collector`，需要解析本地 Markdown 和纯文本文件。

现有抓取流程输出格式（`work_dir/scrape/<category>/<id>/data.json`）：
```json
{
  "error": "0",
  "data": {
    "title": "文章标题",
    "content": "正文内容",
    "source_url": "原始URL",
    "cover_url": "封面图URL",
    "description": "描述/摘要"
  }
}
```

## 目标

新建 `cli/lib/parsers/md-txt-parser.js`，解析 `.md` 和 `.txt` 文件，输出和现有 scrape 一致的格式。

## 需求

### 1. 函数签名
```js
export async function parseMdTxt(filePath)
```

### 2. 功能
- 读取文件内容
- 如果是 `.md` 文件：
  - 提取 frontmatter（如果存在）中的 `title` 字段作为标题
  - 去除 frontmatter 部分，只保留正文作为 content
- 如果是 `.txt` 文件：
  - 标题用文件名（不含扩展名）
  - 全文作为 content
- 返回格式与 scrape 一致：
  ```js
  {
    error: "0",
    data: {
      title: "提取的标题",
      content: "正文内容",
      source_url: `file://${filePath}`,
      cover_url: "",
      description: ""
    }
  }
  ```

### 3. 错误处理
- 文件不存在 → 抛出 `Error: 文件不存在: ${filePath}`
- 读取失败 → 抛出 `Error: 读取失败: ${err.message}`

### 4. 输出
将解析结果写入缓存路径：
```
work_dir/scrape/local/<file-hash>/data.json
```
其中 file-hash 由 `cli/lib/file-path.js` 的 `generateFileHash()` 生成。

## 文件约束

- 新建文件：`cli/lib/parsers/md-txt-parser.js`
- 使用 ESM 导出
- 依赖：仅 `node:fs`, `node:path`（内置），不要新增任何 npm 依赖
- 读取前先用 `file-path.js` 检测文件类型（md 或 txt）

## 参考

- 现有缓存写入逻辑：`cli/lib/scraper.js` 中的 `fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8')`
- frontmatter 格式：以 `---` 开头和结尾的 YAML 块
