# Task 07: CLI 命令扩展

## Context

项目是 `js-knowledge-collector`，已有 CLI 命令 `collect <url>` 只支持 URL。现在要扩展为支持本地文件和批量导入。

现有 CLI 入口：`cli/cli.js`

## 目标

修改 `cli/cli.js`，添加本地文件相关命令。

## 需求

### 1. `collect` 命令自动检测

现有 `collect <url>` 命令应自动检测输入是 URL 还是本地路径：
- 如果是本地路径 → 调用 `collectFile()`（由 task02 实现）
- 如果是 URL → 调用原有 `collectUrl()` 流程

无需修改命令签名，用户自然使用即可：
```bash
# 原有用法不变
node cli/cli.js collect https://mp.weixin.qq.com/s/xxx

# 新增：直接传文件路径
node cli/cli.js collect D:/notes/article.md
node cli/cli.js collect ./document.pdf
```

### 2. 新增 `collect-dir` 命令

批量导入整个目录的文件。

```bash
node cli/cli.js collect-dir <directory> [--recursive] [--include "*.md,*.pdf"]
```

功能：
- 扫描目录下的文件
- 按扩展名过滤（默认包括 md, txt, pdf, docx, html）
- `--recursive` 递归子目录
- 逐个调用 `collectFile()` 处理
- 最后输出汇总：成功 N 个、失败 N 个、跳过 N 个

### 3. 新增 `collect-file` 命令（可选，显式指定文件模式）

和 `collect` 一样，但明确走文件流程，可用于调试：
```bash
node cli/cli.js collect-file <path>
```

### 4. 帮助信息更新

更新 `printUsage()` 函数，在 Commands 列表中新增：
```
  collect-file <path>  Collect a local file (md/txt/pdf/docx/html)

  collect-dir <dir>    Batch collect files from a directory
    --recursive          Include subdirectories
    --include <exts>     File extensions to include (comma-separated, default: md,txt,pdf,docx,html)
```

## 修改约束

- 修改文件：`cli/cli.js`
- 不要修改其他文件
- 保持现有的 arg parser 逻辑不变
- `collect-dir` 的汇总输出格式：
  ```json
  {
    "status": "success",
    "total": 10,
    "success": 8,
    "failed": 1,
    "skipped": 1,
    "results": [...]
  }
  ```
