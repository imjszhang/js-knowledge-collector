# Task 08: 数据库 Schema 适配

## Context

项目是 `js-knowledge-collector`，现有数据库存储收集的文章。需要适配本地文件类型的入库。

现有数据库文件：`cli/lib/database.js`
现有 SOURCE_MAP（按域名映射到 source 类型）：
```js
const SOURCE_MAP = {
    wechat: 'mp.weixin.qq.com',
    xiaohongshu: 'xiaohongshu.com',
    // ... 等
};
```

## 目标

修改数据库层，支持本地文件类型（source = 'local'）的入库和查询。

## 需求

### 1. 扩展 SOURCE_MAP

新增 `local` 类型：
```js
const SOURCE_MAP = {
    // ... 现有映射
    local: 'local',  // 本地文件
};
```

### 2. 数据库表结构

检查现有 `CREATE TABLE` 语句，确认是否支持 `source_url` 存 `file://` 协议路径。

如果现有表结构已足够（TEXT 类型的 `source_url` 字段能存任意字符串），则无需修改表结构。

如果需要修改表结构，使用 `ALTER TABLE` 添加新字段，不要用 `DROP + CREATE`（会丢数据）。

### 3. 入库逻辑适配

检查 `addRecord()` 函数：
- `source_url` 字段传入 `file://${filePath}` 应能正常存储
- `source` 字段传入 `'local'` 应能正常存储

如有 `source` 字段的校验逻辑（如 CHECK constraint 或枚举校验），需加入 `'local'`。

### 4. 搜索/筛选适配

检查 `searchArticles()` 和 `listArticles()` 中的 source 筛选逻辑：
- `--source local` 应能正确筛选出本地文件入库的记录
- 现有的 `source` 到域名的映射用于展示，`local` 类型显示为 `local` 即可

### 5. 统计适配

检查 `getStats()` 函数：
- `source: 'local'` 应正确出现在统计结果中
- 现有 SOURCE_MAP 反查逻辑（source → 域名）对 `local` 类型返回 `'local'`

## 修改约束

- 修改文件：`cli/lib/database.js`
- 不要修改数据库表结构（除非必须），优先用 ALTER TABLE
- 不要破坏现有 URL 类型数据的兼容性
- 所有修改向后兼容：旧数据不受影响

## 参考

- 现有 `addRecord()` 实现：了解插入逻辑和字段映射
- 现有 `searchArticles()` 实现：了解 source 筛选逻辑
- 现有 `getStats()` 实现：了解统计分组逻辑
