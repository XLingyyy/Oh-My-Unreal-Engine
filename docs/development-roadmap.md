# OMUE 开发路线图

## 路线图说明

本路线图分两条线并行表达：

- 产品能力线：OMUE 从只读上下文工具走向受限自主的 UE 专用 Agent。
- Agent 转型线：围绕 propose-fix、Repair Session、sandbox-first 执行与 human-approved promote 建立完整闭环。

下面的阶段名称保持稳定，不在本页用状态图标标记实时进度。

## 产品能力线

### Phase 0: 项目骨架与协议落地

- 建立 monorepo、基础文档和共享协议。
- 明确 Desktop、bridge、shared-protocol 的边界。
- 确立安全边界与多 Agent 协作方式。

### Phase 1: 只读 UE 上下文桥接

- 打通 Unreal Editor -> bridge -> Desktop 的只读链路。
- 暴露项目、当前资产、日志、编译状态等核心上下文。
- 让桌面端能够在 Mock / Real 模式间切换。

### Phase 2: 桌面端上下文工作台

- 用结构化视图展示项目诊断信息。
- 支撑 Blueprint 摘要、图细节、日志浏览和编译状态面板。
- 形成给 Agent 使用的稳定诊断工作台。

### Phase 3: 结构化诊断与提议生成

- 为 LLM 提供更完整的 Blueprint 与错误证据。
- 让系统能稳定地产生 typed fix proposal。
- 明确 proposal 与执行的边界。

### Phase 4: 沙箱执行与状态机闭环

- 引入 Repair Session、状态机、scratch duplicate、sandbox apply 与 sandbox compile。
- 把失败、重试、升级与恢复记录纳入统一流程。
- 建立 approval gate 前的完整验证闭环。

### Phase 5: 审批、报告与回滚工作流

- 让差异预览、approval gate、post-fix report 和 rollback history 形成完整用户工作流。
- 让每次修复都可审计、可追踪、可回顾。

### Phase 6: 真 UE promote 与本地验证

- 用真 bridge + 真 LLM 验证 promote 到原资产的端到端闭环。
- 让 human-approved promote 成为可重复的真实能力。

### Phase 7: 更强的 Agent 修复能力

- 扩展更多 allowlisted 写操作与更丰富的诊断能力。
- 逐步支持更复杂的 Blueprint 修复场景。
- 继续坚持受限自主和人工审批边界。

## Agent 转型阶段

这一条线描述从 LLM 提议到真实 UE 验证的完整 Agent 闭环。

### Phase A: LLM Propose-Fix

- 新增 Main 侧提议入口。
- 新 system prompt 与 JSON schema 校验。
- 用 mock 编译错误 fixture 验证合法 `TypedFixPayload` 输出。

### Phase B: Repair Session Store + IPC 契约

- 持久化 Repair Session。
- 建立状态机骨架与 IPC 通道。
- 支持 resume、cancel、approve、reject、discard。

### Phase C: Bridge 沙箱端点

- 增加 scratch duplicate、compile 等端点。
- 在 mock 与 real bridge 中保持能力对齐。
- 让 Agent Loop 可以进入真实 sandbox 流程。

### Phase D: 写操作白名单扩展

- 扩展少量安全写操作。
- 更新 typed payload、preflight check 和执行器实现。
- 保持 allowlist 与能力声明一致。

### Phase E: 串联完整 Agent Loop

- 把 propose、validate、duplicate、sandbox apply、compile、retry、promote 串成闭环。
- 在 mock 模式下先跑通端到端修复流程。

### Phase F: Agent Transition UI

- 增加进度面板、Diff Preview、Approval Gate、Resume 列表和相关 i18n。
- 让用户能在桌面端完整观察并控制修复会话。

### Phase G: 文档口径统一

- 对齐 README、safety-and-rollback、architecture、mvp-scope、roadmap、project-status。
- 统一为“UE 专用 Agent，受限自主、沙箱先行、人审批 promote”的产品口径。

### Phase H: 真 UE 本地验证

- 用真 bridge + 真 LLM + scratch fixture 跑完整编译修复。
- 重点验证 Approval -> promoting -> done 的真实 promote 闭环。

## 近期重点

当前路线图的近期重点不是继续扩张功能面，而是完成两件事：

1. 统一产品与文档口径，避免“上下文工作台”旧定位与 Agent 转型新定位并存。
2. 用真实 UE 本地验证 promote 闭环，确认受限自主模型在实践中可用。

## 长期原则

- 路线图中的能力扩展必须服从安全边界。
- 更强自动化不等于更少人工控制。
- 每一次扩展都应优先巩固 typed contract、沙箱验证、审批闸门和回滚能力。
