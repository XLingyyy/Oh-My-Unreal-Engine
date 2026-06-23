# OMUE 工作流 C 审查 Agent 提示词设计

日期：2026-06-23

## 目标

创建一份长期固定、由用户手动发送给独立审查 Agent 的启动提示词：

`C:\Users\admin\Desktop\omue-workflow-c-reviewer.md`

工作流 C 以工作流 B 的手动交接模式为基础，在实现 Agent 完成任务并写入报告后，增加一个具备修复权限的独立审查 Agent。工作流 C 使用独立文件队列 `G:\OMUE\.agent-bus-c\`，不与工作流 A 或 B 混用。

## 工作流

```text
监工 Agent 与用户讨论并生成 TASK
→ TASK 写入 .agent-bus-c/inbox/
→ 实现 Agent 执行任务并写入 .agent-bus-c/reports/REPORT-*.md
→ 用户手动启动独立审查 Agent
→ 审查 Agent 配对并读取当前 TASK、对应 REPORT、git diff 和相关文件
→ 审查 Agent 判断任务是否真正完成且验证通过
→ 已完成：不修改任务成果，仅在原 REPORT 末尾追加审查记录
→ 未完成：审查 Agent 直接接手修复、重新验证，并把工作内容追加到原 REPORT
→ 用户回到监工 Agent 会话，由监工继续仲裁、状态维护和 Git 检查点
```

## 审查 Agent 职责

审查 Agent 必须：

1. 按任务 ID 或明确文件关联配对同一任务的 TASK 与 REPORT，不得仅凭“最新文件”错误配对。
2. 对照任务单检查目标、修改范围、禁止事项、验收标准和验证命令。
3. 检查实现报告、`git status`、targeted diff、修改文件及必要上下文，不能只审查报告文字。
4. 如果任务成果完整且通过，不修改代码、配置、测试、文档或其他任务成果。
5. 如果任务未完成、验证失败或存在必须修复的问题，直接接手实现并在原任务范围内完成修复。
6. 修复后运行适用的验证命令，并记录真实结果；未运行的验证必须说明原因。
7. 只更新实现 Agent 已创建的同一份 REPORT，不创建独立 REVIEW 报告。
8. 不提交 Git，不移动、删除或归档任务与报告文件。
9. 完成后通知用户返回监工 Agent 会话。

## 单一报告规则

每个任务只有一份 REPORT。审查 Agent在原 REPORT 末尾追加 `## 独立审查 Agent 补充`，至少记录：

- 审查结论：`PASS` / `FIXED_AND_PASS` / `BLOCKED`
- 审查依据和发现
- 是否修改任务成果
- 审查 Agent 实际修改的文件和内容
- 审查 Agent 运行的验证命令与结果
- 验证引起的不可避免修改痕迹及原因
- 最终遗留问题或阻塞

如果结论为 `PASS`，审查 Agent不得为了格式、偏好或“顺手优化”修改已完成成果。

## 验证修改痕迹

审查 Agent 运行验证时，如果工具或构建过程不可避免地生成、刷新或修改文件，必须：

1. 判断这些痕迹是否属于验证的必要副作用。
2. 尽量避免将无关生成物纳入任务成果。
3. 在原 REPORT 中列出具体路径、触发命令和原因。
4. 明确声明这些修改是验证导致的必要痕迹，不是越界扩展任务。

不得借“验证痕迹”掩盖主动重构、格式化、升级依赖或其他越界修改。

## 监工 Agent 边界

工作流 C 不改变监工 Agent 的角色性质。监工仍负责：

- 产品判断与架构边界
- 任务拆解和任务单生成
- 最终仲裁与后续推进
- 长期状态文档维护
- Git 检查点

独立审查 Agent 的修复权限只用于完成当前任务单，不接管监工职责，不生成后续任务，不修改产品方向，不执行 Git 提交。

## 文件与路径

- 任务单：`G:\OMUE\.agent-bus-c\inbox\TASK-*.md`
- 实现报告和唯一报告：`G:\OMUE\.agent-bus-c\reports\REPORT-*.md`
- 不创建或使用独立审查报告。
- 不使用 `.agent-bus/`、`.agent-bus-b/` 或工作流 A 的自动化脚本。

## 交付范围

本次只创建审查 Agent 提示词：

`C:\Users\admin\Desktop\omue-workflow-c-reviewer.md`

提示词的命名、Markdown 结构、启动说明、路径说明、读取顺序、行为规则、报告补充格式和安全边界参考现有：

- `omue-workflow-b-supervisor.md`
- `omue-workflow-b-implementer.md`
- `omue-workflow-a-supervisor.md`

本次不复制或修改监工 Agent 提示词，不修改监工角色，不创建自动化脚本。
