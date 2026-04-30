# Task 04: PDF 文件解析器

## Context

项目是 `js-knowledge-collector`，需要解析本地 PDF 文件。

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

新建 `cli/lib/parsers/pdf-parser.js`，解析 `.pdf` 文件，提取文本内容，输出和现有 scrape 一致的格式。

## 需求

### 1. 依赖安装

需要在 `package.json` 中添加 `pdf-parse` 依赖：
```bash
npm install pdf-parse
```

使用 `pdf-parse` 提取 PDF 文本内容。这是一个纯 Node.js 库，无需系统依赖。

### 2. 函数签名
```js
export async function parsePdf(filePath)
```

### 3. 功能
- 用 `pdf-parse` 读取 PDF 文件并提取文本
- 标题：优先从 PDF 元数据（metadata）中提取 `Title`，回退到文件名（不含扩展名）
- 内容：PDF 全文文本
- 返回格式与 scrape 一致：
  ```js
  {
    error: "0",
    data: {
      title: "提取的标题",
      content: "PDF文本内容",
      source_url: `file://${filePath}`,
      cover_url: "",
      description: ""
    }
  }
  ```

### 4. 错误处理
- 文件不存在 → 抛出 `Error: 文件不存在: ${filePath}`
- 解析失败（加密 PDF、损坏文件等）→ 抛出 `Error: PDF 解析失败: ${err.message}`
- pdf-parse 未安装 → 抛出 `Error: 请先安装 pdf-parse 依赖：npm install pdf-parse`

### 5. 输出
将解析结果写入缓存路径：
```
work_dir/scrape/local/<file-hash>/data.json
```
其中 file-hash 由 `cli/lib/file-path.js` 的 `generateFileHash()` 生成。

## 文件约束

- 新建文件：`cli/lib/parsers/pdf-parser.js`
- 修改文件：`package.json`（添加 `pdf-parse` 依赖）
- 使用 ESM 导出

## 参考

- pdf-parse 用法：`const pdf = require('pdf-parse'); const data = await pdf(fs.readFileSync(filePath)); data.text 即为提取的文本`
- 现有缓存写入逻辑：`cli/lib/scraper.js`
