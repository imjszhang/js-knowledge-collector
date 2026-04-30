# Task 06: HTML 文件解析器

## Context

项目是 `js-knowledge-collector`，需要解析本地 `.html` / `.htm` 文件。

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

新建 `cli/lib/parsers/html-parser.js`，解析本地 HTML 文件，提取正文文本，输出和现有 scrape 一致的格式。

## 需求

### 1. 依赖

项目已有 `cheerio` 依赖，可直接复用，无需新增 npm 包。

### 2. 函数签名
```js
export async function parseHtml(filePath)
```

### 3. 功能
- 用 `fs.readFile` 读取 HTML 文件内容
- 用 `cheerio` 解析 HTML
- 标题：优先取 `<title>` 标签内容，回退到 `<h1>` 标签，再回退到文件名
- 内容：提取 `<body>` 的文本内容（去除 script、style、nav、footer 等非正文元素）
- 返回格式与 scrape 一致：
  ```js
  {
    error: "0",
    data: {
      title: "提取的标题",
      content: "HTML正文文本",
      source_url: `file://${filePath}`,
      cover_url: "",
      description: ""
    }
  }
  ```

### 4. 错误处理
- 文件不存在 → 抛出 `Error: 文件不存在: ${filePath}`
- 解析失败 → 抛出 `Error: HTML 解析失败: ${err.message}`

### 5. 输出
将解析结果写入缓存路径：
```
work_dir/scrape/local/<file-hash>/data.json
```
其中 file-hash 由 `cli/lib/file-path.js` 的 `generateFileHash()` 生成。

## 文件约束

- 新建文件：`cli/lib/parsers/html-parser.js`
- 使用 ESM 导出
- 依赖：仅 `node:fs`, `node:path` 和已有的 `cheerio`，不要新增 npm 依赖

## 参考

- 现有 cheerio 用法：`cli/lib/web-scraper.js` 中已有 cheerio 的使用
- 现有缓存写入逻辑：`cli/lib/scraper.js`
