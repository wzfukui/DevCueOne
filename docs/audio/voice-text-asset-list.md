# DevCue One 语音文本资产清单

## 文档目的

统一管理两类文本资产：

1. 测试语音文本清单
2. 短确认语音台词清单

这些内容可用于：

- 人工录制语音样本
- API 预生成语音样本
- 自动化测试 fixture
- 本地确认语音资产池

---

## A. 测试语音文本清单

## A1. 中文任务指令

1. 帮我看下项目代码提交状态。
2. 当前在那个代码分支。
3. 帮我做个代码审核。
4. 执行测试用例。
5. 更新版本号和 README 文档。
6. 帮我总结最近一次提交做了什么。
7. 看一下当前有哪些未提交修改。
8. 帮我检查这个项目能不能正常构建。
9. 帮我找出主进程里和任务取消相关的逻辑。
10. 帮我梳理当前会话管理设计文档。

## A2. 英文任务指令

1. Check the current git status of this project.
2. Tell me which branch I am on.
3. Review the current code changes.
4. Run the test cases.
5. Update the version and the README.
6. Summarize the latest commit.
7. Show me the uncommitted changes.
8. Verify whether the project builds successfully.
9. Find the task cancellation logic in the main process.
10. Summarize the current session-management design docs.

## A3. 中文本地控制指令

1. 切到会话 文档整理。
2. 新建会话 版本发布。
3. 打开上一个会话。
4. 切到项目 1pass。
5. 切到项目 ProxyLife。
6. 切到项目 SimpleNav。
7. 暂停监听。
8. 取消当前任务。
9. 停止当前播报。

## A4. English local control commands

1. Switch to session Documentation.
2. Create a new session Release.
3. Open the previous session.
4. Switch to project 1pass.
5. Switch to project ProxyLife.
6. Switch to project SimpleNav.
7. Pause listening.
8. Cancel the current task.
9. Stop the current playback.

## A5. 中文模糊 / 易混淆指令

1. 我想看看这个会话是不是该切一下。
2. 帮我切一下，应该是那个文档会话。
3. 打开那个项目，不是这个，是上次那个。
4. 停一下，我是说先别听了，不是取消任务。
5. 这个先别播了，但任务继续跑。

## A6. English ambiguous commands

1. Maybe switch to the docs session.
2. Open the other project, not this one.
3. Stop for now, I mean stop listening, not the task.
4. Stop the voice, but keep the task running.
5. Switch to that previous session.

## A7. 中文无效 / 应忽略样本

1. 单个很短的语气词，例如“啊”。
2. 无意义噪音。
3. 只有敲击声，没有完整语义。

## A8. English invalid / should-ignore samples

1. A single short filler like “uh”.
2. Random background noise.
3. Keyboard taps without a spoken command.

---

## B. 短确认语音台词清单

这些台词用于“收到语音后立即给用户一个短反馈”，不是完整任务结果播报。

## B1. 中文短确认语音

1. 好的，马上处理。
2. 收到。
3. 请耐心等待。
4. 明白，请稍等。
5. 正在提交任务。
6. 请稍后。

## B2. English short acknowledgements

1. Okay, working on it.
2. Got it.
3. Please hold on.
4. Understood, one moment.
5. Submitting the task now.
6. Please wait a moment.

## B3. 语义分组建议

### 已接收

- 收到。
- Got it.

### 开始处理

- 好的，马上处理。
- 正在提交任务。
- Okay, working on it.
- Submitting the task now.

### 稍候等待

- 请耐心等待。
- 明白，请稍等。
- 请稍后。
- Please hold on.
- Understood, one moment.
- Please wait a moment.

---

## C. 标注建议

每条语音样本建议附带以下元数据：

- `id`
- `language`
- `category`
  - task
  - local_control
  - ambiguous
  - ignore
  - ack
- `text`
- `expected_route`
  - codex
  - local
  - ignore
  - ack_asset
- `notes`

---

## D. 当前工作语言设计要求

未来用户可以选择工作语言。

因此这份清单默认从第一版就要支持：

- 中文
- 英文

工作语言切换后，系统至少应影响：

1. 默认转写语言
2. 默认播报语言
3. 短确认语音包选择
4. 测试样本集选择
