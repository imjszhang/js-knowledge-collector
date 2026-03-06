---
name: link-collector
description: 收集用户发送的链接并排重入队，配合 cron 定时批量调用 knowledge_collect 入库到知识库。支持查看/修改/删除队列，支持即时入库。
version: 1.0.0
author: js-knowledge-collector
---

# 链接收集器

收集用户在对话中发送的链接，排重后写入队列文件，由 cron 定时批量调用 `knowledge_collect` 入库到知识库。

## 触发条件

| 场景 | 行为 |
|------|------|
| 用户消息中包含 URL | 自动触发 **收集流程** |
| 用户说"立刻入库"/"马上收藏"/"现在就收"等 | 走 **即时入库** 通道 |
| 用户要求查看/修改/删除/清空队列 | 走 **队列管理** 流程 |
| cron 隔离会话触发 | 走 **定时入库** 流程 |

## 文件布局

技能文档（本文件及 references/）随插件安装自动部署，运行时数据存放在 workspace 的 `.openclaw/link-collector/` 目录下：

```
<workspace>/
└── .openclaw/
    └── link-collector/
        ├── inbox.jsonl          # 收集队列（append-only）
        ├── batch-*.jsonl        # 处理中的批次（临时，cron 会话产生）
        └── archive/             # 已处理批次归档
```

所有数据路径均相对于 workspace 根目录。首次使用时如果 `.openclaw/link-collector/` 目录或 `inbox.jsonl` 不存在，应自动创建。

## Cron 定时任务

本技能依赖一个 cron 定时任务来批量处理队列。如果用户开始发链接但 cron 任务尚未配置，应主动提醒用户执行以下命令一键配置：

```bash
openclaw knowledge setup-collector
```

可选参数：`--every <分钟>` 设置执行间隔（默认 30），`--tz <时区>` 设置时区（默认 Asia/Shanghai），`--remove` 移除定时任务。

---

## 1. 收集流程（主会话）

当用户消息中包含一个或多个 URL 时执行：

1. **提取 URL**：识别消息中所有有效链接（http/https），同消息内去重。
2. **队列排重**：读取 `.openclaw/link-collector/inbox.jsonl`，跳过 URL 已存在且 status 为 `pending` 或 `failed` 的条目。
3. **知识库排重**：对剩余 URL 调用 `knowledge_search` 按 URL 查询，跳过已入库的。
4. **写入队列**：将新链接逐行追加到 `.openclaw/link-collector/inbox.jsonl`，格式参见 `references/link-format.md`。
5. **标签处理**：
   - 用户显式指定了标签（如 `#AI #论文`）→ 使用用户标签，`auto_tags: false`
   - 未指定 → 根据域名和对话上下文推断标签，`auto_tags: true`
6. **备注处理**：用户对链接的附加说明写入 `note` 字段。
7. **反馈用户**：简要告知新增 N 条、跳过 N 条（含跳过原因：已在队列 / 已入库）。

### 追加写入示例

每条链接一行 JSON，直接追加到文件末尾：

```json
{"url":"https://example.com/article","added_at":"2026-03-06T10:00:00+08:00","status":"pending","retries":0,"tags":["ai"],"auto_tags":true,"note":"","last_error":null,"processed_at":null}
```

---

## 2. 即时入库（主会话）

当用户明确要求立即入库时（如"这条马上收藏"、"立刻入库"、"现在就收"）：

1. 按收集流程执行排重（队列 + 知识库）。
2. 对新链接直接调用 `knowledge_collect` 工具：
   - **参数**：`url`（必填），其余使用默认值。
3. 结果处理：
   - **成功** → 告知用户已入库，不写入队列。
   - **失败** → 告知用户入库失败，将链接写入 `.openclaw/link-collector/inbox.jsonl` 作为兜底，等待 cron 重试。

---

## 3. 队列管理（主会话）

用户可在非处理时段对队列进行管理操作。

### 查看

读取 `.openclaw/link-collector/inbox.jsonl`，以表格形式展示：

```
📋 链接队列（inbox: N 条）

  #  状态      链接                            标签       备注       入队时间
  1  pending   https://example.com/a           [AI]       -         03-06 10:00
  2  failed    https://example.com/b           [Go]       重试1次   03-05 09:00
  ...
```

若 `.openclaw/link-collector/` 下存在 `batch-*.jsonl`，额外展示为"处理中"只读区：

```
⏳ 处理中批次（N 条，不可修改）

  1  processing  https://example.com/old-1     [DB]       -         03-05 08:00
  ...
```

### 修改

1. 用户指定要修改的条目（按序号或 URL）和修改内容（标签、备注等）。
2. 读取 `.openclaw/link-collector/inbox.jsonl` 全部内容到内存。
3. 找到目标条目并修改。
4. 原子写入：先写 `.openclaw/link-collector/inbox.jsonl.tmp`，再 rename 覆盖 `.openclaw/link-collector/inbox.jsonl`。

### 删除

同修改流程，过滤掉目标条目后原子写回。

### 调整顺序

同修改流程，重排条目后原子写回。处理按文件中的行顺序串行执行，靠前的先被处理。

### 清空

清空 `.openclaw/link-collector/inbox.jsonl`（写入空文件）。不影响正在处理的 batch 文件。

### 查状态

查询某条链接的当前状态，依次检查：

1. `.openclaw/link-collector/inbox.jsonl` → 在队列中（告知 status）
2. `.openclaw/link-collector/batch-*.jsonl` → 正在处理中
3. `knowledge_search` → 已入库
4. 均未找到 → 不存在

### 保护机制

如果用户要修改/删除的链接位于 `batch-*.jsonl` 中，告知用户"该链接正在处理中，无法修改，处理完成后可操作"。

---

## 4. 定时入库流程（cron 隔离会话）

由 cron 任务 `link-collector-process` 触发（默认每 30 分钟），在隔离会话中执行。`maxConcurrentRuns: 1` 保证同时只有一个实例运行，上一轮未完成时新触发自动跳过。

### 步骤 1：确定处理批次

```
检查 .openclaw/link-collector/ 下是否存在 batch-*.jsonl
├─ 有 → 使用该文件（恢复上次中断的处理）
└─ 无 → 检查 inbox.jsonl
      ├─ 不存在或为空 → 输出"队列为空，无需处理"，退出
      └─ 有内容 → 执行轮转：
           1. rename .openclaw/link-collector/inbox.jsonl → .openclaw/link-collector/batch-{ISO时间戳}.jsonl
           2. 创建新的空 .openclaw/link-collector/inbox.jsonl
```

rename 是原子操作，轮转后新链接写入新的 inbox，与 batch 处理互不干扰。

### 步骤 2：串行处理

逐行读取 batch 文件，对每条记录：

1. **跳过非待处理项**：status 不是 `pending` 和 `failed` 的直接跳过。
2. **知识库排重**：调用 `knowledge_search` 按 URL 查询。
   - 已入库 → 将 status 更新为 `skipped`，继续下一条。
3. **入库**：调用 `knowledge_collect` 工具，参数 `url` 为链接地址。
4. **结果处理**：
   - 成功 → status 更新为 `done`，记录 `processed_at`。
   - 失败且 `retries < 3` → 将该条目追加回 `.openclaw/link-collector/inbox.jsonl`（retries + 1，记录 last_error），等待下次 cron 重试。
   - 失败且 `retries >= 3` → status 更新为 `permanently_failed`，记录 last_error，不再自动重试。
5. **单条失败不中断**：继续处理 batch 中的下一条。

### 步骤 3：归档与摘要

1. 将处理完的 batch 文件移至 `.openclaw/link-collector/archive/` 目录。
2. 输出处理摘要：成功 N 条、失败（已回队列）N 条、永久失败 N 条、跳过（已入库）N 条。

---

## 5. 容错与边界处理

| 场景 | 处理方式 |
|------|---------|
| `.openclaw/link-collector/` 目录不存在 | 自动创建 |
| `inbox.jsonl` 不存在 | 自动创建空文件 |
| JSONL 某行解析失败（损坏） | 跳过该行，在摘要中记录告警 |
| `knowledge_collect` 单条调用失败 | 标记失败，继续下一条 |
| 知识库服务整体不可用 | 第一条就会失败，后续均失败回队列，下次 cron 自动重试 |
| 最大重试次数 | 3 次，超过标记 `permanently_failed` |
| 处理中途 Agent 崩溃 | batch 文件仍在目录中，下次 cron 触发时自动恢复 |
| 队列为空 | 直接退出，不做无效操作 |
| `done` 记录堆积 | 归档到 `archive/` 目录，inbox 不会无限增长 |

---

## 6. 并发安全

本技能采用 inbox/batch 轮转机制实现读写隔离：

- **收集侧**（主会话）：只追加写入 `inbox.jsonl`，永远不读写 batch 文件。
- **处理侧**（cron 隔离会话）：rename inbox 为 batch 后，只操作 batch 文件。新链接写入新创建的 inbox，与 batch 互不干扰。
- **管理操作**（主会话）：只操作 `inbox.jsonl`。batch 文件中的内容对用户只读。
- **防并发执行**：cron `maxConcurrentRuns: 1`，同时只有一个处理任务运行。
