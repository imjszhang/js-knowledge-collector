# Task 02: collectFile 核心入口

## Context

项目是 `js-knowledge-collector`，需要为本地文件（md/txt/pdf/docx/html）添加收集支持。

现有流水线：
```
URL → scrape() → summarize() → assembleData() → Database → Flomo
```

文件解析器（task03-06）的输出格式与 scrape 一致，所以我们可以复用后续的 Summarizer/DB/Flomo 流程。

## 已有依赖

- task01 已创建 `cli/lib/file-path.js`，提供 `isLocalPath()`, `resolveFilePath()`, `detectFileType()`, `generateFileHash()`, `getFileCategory()`

## 目标

修改 `cli/lib/collector.js`，添加 `collectFile(filePath, options)` 函数，实现本地文件的完整收集流水线。

## 具体需求

### 1. 新增 `collectFile(filePath, options)` 函数

完整流程：
```
filePath → parseFile() → data.json → summarize() → assembleData() → DB → Flomo
```

步骤：
1. 用 `file-path.js` 解析文件绝对路径和类型
2. 计算缓存路径：`work_dir/scrape/local/<file-hash>/data.json`
3. 检查缓存（同 URL 流程的 findCachedScrape 逻辑）
4. 无缓存时调用对应类型的解析器：
   - `md`/`txt` → 调用 `parsers/md-txt-parser.js` 的 `parseMdTxt()`
   - `pdf` → 调用 `parsers/pdf-parser.js` 的 `parsePdf()`
   - `docx` → 调用 `parsers/docx-parser.js` 的 `parseDocx()`
   - `html` → 调用 `parsers/html-parser.js` 的 `parseHtml()`
5. 解析器输出为 `{ error: '0', data: { title, content, source_url: 'file://...' } }`
6. 写入缓存：`work_dir/scrape/local/<hash>/data.json`
7. 后续流程完全复用现有代码：summarize → assembleData → DB → Flomo

### 2. 修改现有 `collect()` 函数

改为自动检测输入类型：
```js
export async function collect(input, options = {}) {
    if (isLocalPath(input)) {
        return collectFile(input, options);
    }
    return collectUrl(input, options);  // 原有逻辑
}
```

原有 URL 收集逻辑重命名为 `collectUrl()`。

### 3. 修改文件约束

- 修改 `cli/lib/collector.js`
- 新增 `cli/lib/parsers/` 目录（本任务只需创建目录和 index.js 导出桩，具体解析器由其他任务实现）
- parsers/index.js 提供统一入口：
  ```js
  export { parseMdTxt } from './md-txt-parser.js';
  export { parsePdf } from './pdf-parser.js';
  export { parseDocx } from './docx-parser.js';
  export { parseHtml } from './html-parser.js';
  ```
- 如果某个解析器文件不存在（其他任务还未完成），抛出清晰的 Error：`"PDF 解析器尚未实现，请先安装 pdf-parse 依赖"`

### 4. 缓存逻辑

复用现有 `findCachedScrape` 的思路，但路径改为：
```js
// 文件类型缓存路径
const cachedPath = path.join(PROJECT_ROOT, 'work_dir', 'scrape', 'local', fileHash, 'data.json');
```

### 5. 数据组装

文件类型的 `assembleData` 需要适配：
- `source_url` 用 `file://` 协议
- `cover_url` 为空（本地文件通常无封面）
- `title` 优先用解析器提取的标题，回退到文件名（不含扩展名）

## 参考现有代码

- `cli/lib/collector.js` 的 `collect()` 函数 — 现有 URL 收集流程
- `cli/lib/scraper.js` 的缓存逻辑 — 参考 findCachedScrape
