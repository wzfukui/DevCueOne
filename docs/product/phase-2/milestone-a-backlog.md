# DevCue One Phase 2 Milestone A Backlog

## 文档目的

这份文档把 `Milestone A：会话与数据底座` 拆成真正可执行的任务清单。

上游依据：

- [product-design.md](./product-design.md)
- [decisions.md](./decisions.md)
- [implementation-plan.md](./implementation-plan.md)

默认前提：

- 本地 SQLite 为状态中心
- 一会话一个主项目配置
- 当前激活会话是唯一语音输入目标
- `Milestone A` 只做数据底座和基础导航，不做多任务并发和语音路由

---

## Milestone A 的唯一目标

让应用从“单会话内存原型”升级为“可持久化的多会话工作台基础形态”。

更具体地说，Milestone A 完成后必须满足：

1. 用户能看到历史会话列表
2. 用户能创建、切换、重命名会话
3. 用户能创建项目配置，并在新建会话时选择项目配置
4. 会话、消息、项目配置在应用重启后可恢复
5. 当前会话切换后，后续输入归属明确

---

## Milestone A 明确范围

### 在范围内

1. SQLite 引入与初始化
2. 会话、消息、项目配置、设置的基础持久化
3. 左侧会话列表
4. 会话创建 / 激活 / 重命名
5. 项目配置列表与新建会话选项
6. 当前会话元信息展示
7. 启动时恢复最近会话状态

### 不在范围内

1. 多会话后台任务并行
2. 任务排队机制
3. 本地语音命令切换会话
4. 控制区语义拆分
5. 后台任务完成提醒策略
6. 高级诊断面板重构
7. 跨设备同步

这部分必须严格保持边界，避免 `Milestone A` 失控。

---

## 推荐技术落点

### SQLite 放置位置

- 数据库访问只在 Electron main process 发生
- Renderer 通过 IPC 获取和修改数据

### 建议数据库文件位置

- `app.getPath('userData')/app-state.sqlite`

### 建议模块边界

- `electron/data/database.*`
- `electron/data/session-store.*`
- `electron/data/task-store.*`
- `electron/data/message-store.*`
- `electron/data/profile-store.*`
- `electron/data/settings-store.*`

这次先把访问层做出来，不要直接把 SQL 拼在 [electron/main.mjs](../../../electron/main.mjs) 里。

---

## 最小数据模型

Milestone A 只需要落最小闭环，不要一次建过多字段。

### 1. `sessions`

建议最小字段：

- `id`
- `title`
- `title_source`
- `created_at`
- `updated_at`
- `last_activity_at`
- `bound_profile_id`
- `codex_thread_id`
- `last_message_preview`
- `archived_at`

### 2. `messages`

建议最小字段：

- `id`
- `session_id`
- `role`
- `text`
- `detail`
- `created_at`

### 3. `project_profiles`

建议最小字段：

- `id`
- `name`
- `working_directory`
- `developer_tool`
- `default_prompt_context`
- `usage_notes`
- `created_at`
- `updated_at`
- `last_used_at`

### 4. `settings`

建议保留现有全局设置，并增加：

- `last_active_session_id`

### 5. `event_logs`

Milestone A 只需要把表建出来，不必完整接入所有事件。

建议最小字段：

- `id`
- `session_id`
- `task_id`
- `kind`
- `payload_json`
- `created_at`

### 说明

`tasks` 表在 Milestone A 明确采用如下策略：

- 建立最小 schema
- 建立 `task-store` 骨架
- 不做完整 UI 接入
- 不做并发、排队和后台任务逻辑

这样既能保证数据模型对齐，也不会把 Milestone A 范围扩得过大。

---

## 数据迁移策略

当前应用已有一套基于设置和内存的运行方式，Milestone A 需要有迁移策略。

### 推荐默认迁移

首次启动带 SQLite 的版本时：

1. 创建数据库与基础表
2. 读取现有桌面设置
3. 如果用户已有 `workingDirectory`
   - 自动生成一个默认项目配置
4. 自动创建一个默认会话
   - 标题可为“默认会话”
   - 绑定默认项目配置
5. 将当前内存里已有的系统欢迎消息写入消息表

### 目标

保证升级后用户不会面对一个“空白但不知道为什么空白”的界面。

---

## IPC 任务清单

Renderer 不直接接触数据库，必须通过 IPC。

### A-IPC-01 获取会话列表

用途：

- 左侧渲染会话列表

返回建议：

- `id`
- `title`
- `last_activity_at`
- `bound_profile_name`
- `last_message_preview`
- `is_active`

### A-IPC-02 创建会话

输入：

- 可选标题
- 必选绑定 profile

输出：

- 新会话完整信息

### A-IPC-03 重命名会话

输入：

- `session_id`
- `title`

### A-IPC-04 激活会话

输入：

- `session_id`

效果：

- 更新 `last_active_session_id`

### A-IPC-05 获取会话消息

输入：

- `session_id`

输出：

- 消息列表

### A-IPC-06 获取项目配置列表

### A-IPC-07 创建或更新项目配置

### A-IPC-08 移除项目配置

输入：

- `profile_id`

### A-IPC-09 获取当前会话元信息

包括：

- 绑定 profile
- `codex_thread_id`
- 最近活动时间
- 最近音频路径

### A-IPC-10 记录消息

当前 voice / text turn 产生消息时，写入持久化层。

---

## Main Process Backlog

## A-MAIN-01 初始化数据库

完成项：

- 启动时检查数据库文件
- 无文件则初始化 schema
- 有文件则做版本检查

完成标准：

- 应用可重复启动，不会重复建表

## A-MAIN-02 拆出 store 层

完成项：

- session store
- task store skeleton
- message store
- profile store
- settings store

完成标准：

- [electron/main.mjs](../../../electron/main.mjs) 不直接堆积 SQL 字符串

## A-MAIN-03 启动恢复逻辑

完成项：

- 恢复最近激活会话
- 恢复绑定 profile
- 恢复会话消息

完成标准：

- 应用重启后能直接回到最近工作现场

## A-MAIN-04 消息写入改造

完成项：

- 现有系统消息、用户消息、助手消息写入数据库
- 原有 UI 状态仍能正常显示

完成标准：

- UI 与数据库中的消息一致

## A-MAIN-05 项目配置默认生成

完成项：

- 根据现有 `workingDirectory` 生成默认 profile
- 首次迁移时自动绑定到默认会话

完成标准：

- 老用户升级后不用手工重新配一遍

---

## Renderer Backlog

## A-UI-01 左侧会话列表布局

完成项：

- 新增会话侧栏
- 支持列表滚动
- 当前会话高亮

完成标准：

- 首屏能稳定看到多条历史会话

## A-UI-02 会话创建与切换

完成项：

- 点击新建会话
- 点击切换会话

完成标准：

- 切换后中间主区内容同步切换

## A-UI-03 会话重命名

完成项：

- 列表内直接改名
- Enter 保存
- Esc 取消

完成标准：

- 改名后刷新应用仍保留

## A-UI-04 项目配置入口

完成项：

- 列出已有 profile
- 新建 profile
- 编辑 profile
- 在新建会话时选择 profile
- 移除 profile 前二次确认

完成标准：

- 当前会话能看清已绑定项目
- 会话创建前必须明确选择项目

## A-UI-05 当前会话元信息

完成项：

- 会话标题
- 绑定项目
- 最近活动时间
- 当前 thread 标识摘要

完成标准：

- 用户知道自己当前到底在“哪个会话、哪个项目”里

## A-UI-06 启动恢复 UX

完成项：

- 应用启动后自动打开最近会话
- 若无历史数据，则引导创建默认会话

完成标准：

- 启动体验不是空白页

---

## 消息流改造任务

Milestone A 不要求重做整个消息系统，但要把消息持久化接入到现有链路里。

## A-MSG-01 系统欢迎消息入库

## A-MSG-02 语音输入生成的用户消息入库

## A-MSG-03 文字输入生成的用户消息入库

## A-MSG-04 Codex 返回的助手消息入库

## A-MSG-05 会话切换时按 `session_id` 读取消息

完成标准：

- 任一会话刷新后仍能看到自己的完整消息

---

## 验收用例

这些用例是 Milestone A 的最低验收线。

### Case 1：首次迁移

前提：

- 用户已有旧版设置和工作目录

预期：

- 启动后自动出现一个默认 profile
- 自动出现一个默认会话
- 不会是完全空白状态

### Case 2：创建会话

动作：

- 新建会话

预期：

- 新建前必须先选一个 profile
- 会话列表新增一项
- 新会话被设为当前激活会话

### Case 3：重命名会话

动作：

- 在列表中把“默认会话”改成“订单系统修复”

预期：

- 列表即时更新
- 重启应用后仍保持新名称

### Case 4：新建会话时确定项目配置

动作：

- 在新建会话弹窗中选择一个 profile 并创建

预期：

- 右侧会话信息更新
- 后续输入默认使用该 profile 的工作目录

### Case 5：切换历史会话

动作：

- 从会话 A 切到会话 B

预期：

- 中间消息区切换
- 当前会话元信息切换
- 后续输入归属会话 B

### Case 6：重启恢复

动作：

- 退出并重启应用

预期：

- 自动恢复最近激活会话
- 会话名称、消息、绑定 profile 仍在

---

## 推荐开发顺序

为了减少回滚，建议严格按下面顺序做。

### Step 1

- 数据库初始化
- schema
- store 层

### Step 2

- 会话列表读写 IPC
- profile 读写 IPC

### Step 3

- 左侧会话列表 UI
- 会话创建 / 切换 / 改名

### Step 4

- profile 管理 UI
- 新建会话选择 profile

### Step 5

- 消息持久化接入
- 启动恢复

### Step 6

- 验收与边界修补

---

## 对 Milestone A 的一句话要求

Milestone A 完成时，这个产品必须具备“像一个真正的多会话桌面工具，而不是一次性原型”的基本形态。

如果还不能稳定恢复历史会话、不能清楚绑定项目、不能在 UI 上分辨当前会话，那就说明 Milestone A 还没完成。
