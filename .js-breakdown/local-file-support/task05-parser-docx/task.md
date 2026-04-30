# Task 05: DOCX 文件解析器

## Context

项目是 `js-knowledge-collector`，需要解析本地 `.docx`（Word）文件。

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

新建 `cli/lib/parsers/docx-parser.js`，解析 `.docx` 文件，提取文本内容，输出和现有 scrape 一致的格式。

## 需求

### 1. 依赖安装

需要在 `package.json` 中添加 `mammoth` 依赖：
```bash
npm install mammoth
```

使用 `mammoth` 将 docx 转换为纯文本。这是一个纯 Node.js 库，无需系统依赖。

### 2. 函数签名
```js
export async function parseDocx(filePath)
```

### 3. 功能
- 用 `mammoth.extractRawText` 读取 docx 文件并提取纯文本
- 标题：优先从文档属性中提取，回退到文件名（不含扩展名）
- 内容：文档纯文本
- 返回格式与 scrape 一致：
  ```js
  {
    error: "0",
    data: {
      title: "提取的标题",
      content: "Word文档文本",
      source_url: `file://${filePath}`,
      cover_url: "",
      description: ""
    }
  }
  ```

### 4. 错误处理
- 文件不存在 → 抛出 `Error: 文件不存在: ${filePath}`
- 解析失败 → 抛出 `Error: DOCX 解析失败: ${err.message}`
- mammoth 未安装 → 抛出 `Error: 请先安装 mammoth 依赖：npm install mammoth`

### 5. 输出
将解析结果写入缓存路径：
```
work_dir/scrape/local/<file-hash>/data.json
```
其中 file-hash 由 `cli/lib/file-path.js` 的 `generateFileHash()` 生成。

## 文件约束

- 新建文件：`cli/lib/parsers/docx-parser.js`
- 修改文件：`package.json`（添加 `mammoth` 依赖）
- 使用 ESM 导出

## 参考

- mammoth 用法：`const mammoth = require('mammoth'); const result = await mammoth.extractRawText({ path: filePath }); result.value 即为提取的文本`
- 现有缓存写入逻辑：`cli/lib/scraper.js`
