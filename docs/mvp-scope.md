# OMUE MVP 范围文档

## 概述

当前 MVP 已不再只是“只读上下文工作台”定义，而是收敛到第一个完整的 Agent 修复场景：**Blueprint 编译错误修复闭环**。目标不是广泛支持任意资产自动修改，而是在严格白名单和沙箱前提下，把一个真实且可验证的修复流程跑通。

## 第一个 Agent 场景：Blueprint 编译错误修复闭环

MVP 的核心场景是：

1. 读取 compile errors、message log、当前 Blueprint 上下文和相关诊断信息。
2. LLM 基于这些证据生成 `TypedFixPayload`。
3. payload 先经过 schema、allowlist 和 preflight 校验。
4. 系统 duplicate 原资产到 scratch sandbox，并只对 sandbox 副本 apply。
5. sandbox compile 成功后，进入人工审批闸门。
6. 用户批准后，再把同一 typed payload promote 到原资产。
7. 如果 sandbox compile 失败，记录失败原因并在受限范围内重试或升级给人处理。

这条链路定义了 OMUE 当前 MVP 的最小成功标准：**Agent 可以主动推进，但不能跳过验证和审批。**

## MVP In Scope

### 1. 上下文采集与诊断输入

- 项目信息、当前资产、Blueprint 摘要与图细节。
- 最近日志、编译状态、错误计数和相关错误文本。
- 面向 LLM 的结构化诊断输入。

### 2. LLM propose-fix

- Main 侧发起修复提议请求。
- LLM 输出结构化 `TypedFixPayload`。
- 对 proposal 做严格 schema 校验和失败记录。

### 3. Repair Session 与状态机

- 会话创建、恢复、取消、拒绝、批准。
- 状态推进：proposing、payload validating、sandbox duplicating、sandbox applying、sandbox compiling、awaiting approval、promoting。
- proposal failure、compile failure、retry 和 escalate 记录。

### 4. Sandbox-first 执行模型

- duplicate 原始资产到 scratch sandbox。
- 在 sandbox 上执行 allowlisted 写操作。
- 对 sandbox 资产执行 compile 验证。
- compile 通过后再允许进入 promote 阶段。

### 5. 人审批 promote

- 差异预览、审批闸门和执行结果展示。
- promote 到原资产必须由人单独批准。
- 批准后的结果、失败和恢复路径要被记录。

### 6. 受限写操作白名单

MVP 只覆盖任务与桥接层已明确支持的少量 allowlisted 操作，重点是低风险、可验证、可回滚的 Blueprint 属性/metadata 类写入，而不是开放任意节点级编辑。

任务明确点名的范围包括：

- `set_blueprint_metadata_marker`
- `set_blueprint_variable_default`

其他能力若未进入白名单，即使 LLM 提议合理，也必须拒绝或升级为人工处理。

## MVP Out of Scope

以下能力不属于当前 MVP：

- 任意 Blueprint 节点图自动改写。
- 无审批直接写原资产。
- 绕过 sandbox 的自动修复。
- 无 schema 约束的自由格式 LLM 写操作。
- AI / LLM 自行决定扩大 allowlist 或修改 bridge contract。
- 自动触发 PIE、Automation Tests 或更高风险执行流。
- 引入 WebSocket、云端编排或新的长期外部依赖。

## 成功标准

MVP 成功不是“模型会提建议”，而是以下闭环成立：

- LLM 能基于编译错误与上下文生成合法 typed payload。
- payload 能通过预检并在 sandbox 上执行。
- sandbox compile 结果可见、可用于下一步决策。
- 用户能在 approval gate 中看到差异并决定是否 promote。
- promote 失败、compile 失败或 schema 失败时，系统能留下可追溯记录并终止或升级。

## 非目标

以下内容不是当前 MVP 的目标：

- 成为通用 Unreal 助手。
- 成为自动驾驶式的资产修复系统。
- 在无人工把关下批量修改项目内容。
- 把所有 Blueprint 编辑能力一次性暴露给 Agent。

## 风险与边界

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LLM proposal 不稳定 | payload 缺字段、格式错误或越界 | typed schema 校验、失败捕获、精确系统指令 |
| UE 编译状态异步清理 | sandbox compile 阶段出现短暂 `compile_in_progress` | 轮询 `/compile/status`，等待 bridge idle 后再编译 |
| 沙箱与原资产语义偏差 | 沙箱通过但 promote 后仍可能遇到环境差异 | 把 promote 作为独立审批动作，并保留用户本地验证 |
| 白名单过窄导致场景无法覆盖 | Agent 经常需要升级给人 | 先保证安全闭环，再按任务逐步扩展 allowlisted 操作 |

## 验收方式

当前 MVP 以用户本地验证为准，目标是用真 bridge + 真 LLM + scratch fixture 跑通一次真实 Blueprint 编译修复流程：

1. 读取编译错误和上下文。
2. 生成合法 typed payload。
3. duplicate 到 sandbox。
4. sandbox apply + sandbox compile。
5. 进入 awaiting approval。
6. 人批准 promote 到原资产。
7. 验证原资产上的结果与记录一致。
