# DevCue One Phase 2 文档对齐 Review

## Review 范围

本次 review 覆盖以下文档：

- [product-design.md](./product-design.md)
- [decisions.md](./decisions.md)
- [implementation-plan.md](./implementation-plan.md)
- [milestone-a-backlog.md](./milestone-a-backlog.md)
- [README.md](../../../README.md)
- [frontend-visual-style.md](../../design/frontend-visual-style.md)

目标不是做语言润色，而是检查：

1. 目标和边界是否一致
2. 默认决策是否已经真正落地到计划
3. `Milestone A` 是否和总设计冲突
4. 现有 README 是否会误导后续实现讨论

---

## Review 结论

### 结论 1：Phase 2 四份核心文档现在已经基本对齐

当前四份核心文档之间已经形成明确层次：

- 总设计：定义产品模型和交互原则
- 决策文档：给出 5 个默认答案
- 实施计划：定义阶段顺序与里程碑
- Milestone A backlog：给出可执行任务清单

它们之间的上下游关系现在是清晰的，可以直接作为后续实现依据。

### 结论 2：本轮已修正 3 处对齐问题

#### 已修正问题 A

[product-design.md](./product-design.md) 原先仍保留“当前阶段需要拍板的开放问题”，这与 [decisions.md](./decisions.md) 已经锁死默认值冲突。

已修正为：

- 文档状态改为“锁定版”
- 明确默认决策以 decisions 文档为准
- 将原开放问题替换为“已锁定的默认决策”

#### 已修正问题 B

[implementation-plan.md](./implementation-plan.md) 中 `Milestone A` 原先未明确是否包含 `tasks` 基础 schema。

已修正为：

- `Milestone A` 明确包含 `tasks` 最小 schema 与 `store` 骨架

#### 已修正问题 C

[milestone-a-backlog.md](./milestone-a-backlog.md) 原先对 `tasks` 表的表述偏摇摆。

已修正为：

- `Milestone A` 明确建立最小 `tasks` schema
- 建立 `task-store` skeleton
- 但不做完整 UI、并发与队列逻辑

这使得数据模型和 Milestone 范围同时成立。

---

## 当前已对齐的关键点

以下关键决策现在在四份 Phase 2 文档中保持一致：

1. 多会话任务采用“会话级并行 + 全局并发上限 2”
2. 后台任务完成默认只做 UI 提示，不自动播报
3. 一会话只绑定一个主 profile
4. 控制区必须拆分监听 / 任务 / 播报三层语义
5. 持久化以本地 SQLite 为中心
6. `Milestone A` 只做会话与数据底座，不做并发和语音路由

---

## 非阻塞但需要注意的问题

### 问题 1：README 已落后于当前实现

[README.md](../../../README.md) 中有一段已经不再准确：

- 它写着 `codex exec resume` 还没接进来

而当前项目实际已经有 session resume 和相关诊断逻辑。

### 判断

这不会影响 Phase 2 设计推进，因为 README 不是这轮设计的真相源。  
但它会误导后来阅读仓库的人。

### 建议

把 README 更新单独作为一次文档清理任务，不和 Phase 2 实现混在一起。

### 问题 2：视觉风格文档与 Phase 2 文档没有冲突

[frontend-visual-style.md](../../design/frontend-visual-style.md) 的内容主要是视觉和布局原则，与 Phase 2 的产品模型没有直接冲突。

因此：

- 它可以继续保留
- 不需要为了 Phase 2 重写
- 后续仅在 UI 大改时检查是否仍符合即可

---

## 是否可以进入用户故事阶段

可以。

原因是：

1. 目标模型已经锁死
2. 默认决策已经锁死
3. 实施顺序已经锁死
4. `Milestone A` 的范围和任务粒度已经足够清晰

现在继续讨论高层设计的收益已经很低，最合理的下一步就是把这些结论转成用户故事。

---

## 建议的用户故事写法

后续用户故事建议按两层组织：

### 第一层：Epic

例如：

- 多会话导航
- 项目配置管理
- 会话恢复
- 后台任务管理
- 控制区语义拆分

### 第二层：Story

每条 story 应包含：

- 用户身份
- 目标
- 价值
- 验收条件

如果要直接服务实现，建议再补：

- 依赖
- 不在范围内
- 风险提示

---

## 最终结论

本轮 review 后，可以确认：

- Phase 2 设计文档已基本对齐
- 已不存在会明显阻碍实现推进的内部冲突
- README 存在轻度过时，但属于独立清理项，不阻塞 Phase 2

下一步可以直接开始编写用户故事。
