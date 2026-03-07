# 链接队列数据格式

## 文件格式

`.openclaw/link-collector/inbox.jsonl` 和 `.openclaw/link-collector/batch-*.jsonl` 均使用 JSONL（JSON Lines）格式：每行一个完整的 JSON 对象，以换行符分隔。

选择 JSONL 的原因：
- 追加写入不需要读取/解析整个文件
- 单行损坏不影响其他记录
- 便于逐行流式处理

## 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 链接地址（排重主键） |
| `added_at` | string | 是 | 入队时间，ISO 8601 带时区（如 `2026-03-06T10:00:00+08:00`） |
| `status` | string | 是 | 当前状态，见下方状态定义 |
| `retries` | number | 是 | 已重试次数，初始为 `0` |
| `tags` | string[] | 是 | 标签数组，可为空数组 `[]` |
| `auto_tags` | boolean | 是 | 标签是否由 AI 自动推断（`true`=自动，`false`=用户指定） |
| `note` | string | 是 | 用户附加备注，无备注时为空字符串 `""` |
| `priority` | boolean | 否 | 用户要求「立刻入库」时设为 `true`，cron 优先处理。默认 `false`，省略时视为 `false` |
| `last_error` | string\|null | 是 | 最近一次失败的错误信息，无错误时为 `null` |
| `processed_at` | string\|null | 是 | 处理完成时间（ISO 8601），未处理时为 `null` |

## 状态定义与流转

```
                  ┌──────────────────────────────────┐
                  │                                  │
                  ▼                                  │
  [用户发链接] → pending ──→ processing ──→ done     │
                  │              │                   │
                  │              │ 失败且 retries<3  │
                  │              ├──────────→ failed ─┘
                  │              │          (回到 inbox，
                  │              │           下次 cron 重新处理)
                  │              │
                  │              │ 失败且 retries>=3
                  │              └──────────→ permanently_failed
                  │
                  │ knowledge_search 发现已入库
                  └──────────────────────→ skipped
```

| 状态 | 含义 |
|------|------|
| `pending` | 待处理，在 inbox 中等待 cron 拾取 |
| `processing` | 正在处理中（batch 文件内，cron 会话正在执行） |
| `done` | 已成功入库 |
| `failed` | 处理失败，将被回写到 inbox 等待重试（retries 已 +1） |
| `skipped` | 排重时发现已入库，跳过 |
| `permanently_failed` | 超过最大重试次数（3 次），不再自动重试 |

## 示例记录

```json
{"url":"https://arxiv.org/abs/2401.12345","added_at":"2026-03-06T10:00:00+08:00","status":"pending","retries":0,"tags":["论文","AI"],"auto_tags":true,"note":"","last_error":null,"processed_at":null}
{"url":"https://github.com/example/repo","added_at":"2026-03-06T11:30:00+08:00","status":"pending","retries":0,"tags":["开源项目"],"auto_tags":false,"note":"值得关注","last_error":null,"processed_at":null}
{"url":"https://example.com/broken-link","added_at":"2026-03-05T09:00:00+08:00","status":"failed","retries":1,"tags":[],"auto_tags":true,"note":"","last_error":"HTTP 503 Service Unavailable","processed_at":null}
```

## 归档规则

cron 处理完一个 batch 文件后：

1. batch 文件（含各条目的最终状态）移至 `.openclaw/link-collector/archive/` 目录保留。
2. 归档文件名保持不变（如 `batch-2026-03-06T10-00-00.jsonl`）。
3. `failed` 的条目（retries < 3）在归档前已追加回 `inbox.jsonl`，归档文件中的副本仅作审计记录。
4. 归档文件不自动清理，必要时可手动删除旧归档。

## 原子写入

对 `inbox.jsonl` 的修改/删除操作（非追加）使用原子写入：

1. 将修改后的内容写入 `.openclaw/link-collector/inbox.jsonl.tmp`
2. rename `.openclaw/link-collector/inbox.jsonl.tmp` → `.openclaw/link-collector/inbox.jsonl`

确保写入中途崩溃不会损坏原文件。
