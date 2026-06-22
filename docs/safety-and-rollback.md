# OMUE 安全策略与回滚方案

## 核心原则

### 1. 透明、可审批、可回滚的 NLP-to-mutation，且默认沙箱先行

OMUE 允许 LLM 参与修复提议与受限写操作，但前提不是“直接写原资产”，而是把整条链路变成可见、可验证、可终止的流程：

- LLM 先产出 typed payload，而不是直接驱动任意资产写入。
- payload 必须通过 schema、allowlist 和 preflight 检查。
- 写操作默认先落到 `/Game/Scratch/` 沙箱副本。
- 沙箱 apply 和沙箱 compile 成功后，仍需人工审批才能 promote 到原资产。
- 任一步失败都必须保留失败原因、执行记录和恢复路径。

这意味着 OMUE 不是禁止 mutation，而是拒绝黑箱 mutation。

### 2. 白名单能力 + allowlist 路径

任何自动执行的写操作都必须同时满足：

- 操作类型在明确白名单内。
- 目标路径在 allowlist prefix 内。
- 请求 payload 通过 typed 校验。
- bridge capability 和 preflight check 显式声明该操作可以执行。

超出白名单、路径不符、schema 不合法或 bridge 不支持的请求，必须立即拒绝并升级给人处理。

### 3. 快照、回滚与验证必须可用

任何执行过的写操作都必须能够回答三个问题：

- 改了什么：保留 before/after、diff 预览、typed payload 与执行日志。
- 如何验证：保留 compile 结果、错误信息、后续验证记录。
- 如何恢复：保留沙箱副本、回滚记录或人工恢复路径。

如果这些信息缺失，系统就不应继续推进自动化修复流程。

### 4. Promote 到原资产是独立审批动作

沙箱 apply 成功不等于可以直接写回原资产。OMUE 把“在沙箱里验证提议”与“把结果 promote 到原资产”拆成两个不同阶段：

- `sandbox apply`：受限写操作，只作用于沙箱副本，用来验证提议是否成立。
- `promote`：把已验证结果应用到原资产，必须经过单独的人审批。

也就是说，沙箱阶段不需要额外审批闸门之外的第二次授权；但一旦目标从沙箱切换到原资产，就必须重新获得人工批准。

## 预览与审批

任何自动生成或自动执行的修复提议都必须先展示给用户，包括：

- 目标资产与目标路径。
- 受影响的字段、变量、节点或 metadata。
- before / after 差异。
- 可能的前置条件与失败风险。

用户批准之前，OMUE 只能停留在提议、校验、复制沙箱和展示差异阶段，不能静默跳过审批。

## 沙箱执行闭环

受限写操作的标准顺序是：

1. 读取当前上下文和编译错误。
2. 生成 typed payload。
3. duplicate 原始资产到 scratch sandbox。
4. 对 sandbox 副本执行 allowlisted 写操作。
5. 编译 sandbox 资产并收集结果。
6. 成功后进入 awaiting approval。
7. 人批准后 promote 到原资产。

如果第 4 或第 5 步失败，Agent 只能重试受限环节、升级为人工处理，或保留报告后终止，不能绕开沙箱直接修改原始资产。

## 回滚与失败恢复

当修复失败或审批被拒绝时，系统应优先执行以下策略：

1. 保留 Repair Session 记录，包括提议、执行状态、失败原因和验证输出。
2. 保留或重新生成 sandbox 副本，避免污染原资产。
3. 对 promote 后失败的情况提供明确恢复路径，例如回滚记录、源控恢复或人工处理指引。
4. 不自动进入无限重试；达到阈值后必须升级给人。

## 禁止事项

以下行为仍然被严格禁止：

- 绕过 typed payload 校验直接驱动写操作。
- 绕过 allowlist 或白名单能力写入任意 UE 资产。
- 未经审批直接 promote 到原资产。
- 在用户不知情的情况下调用外部网络服务执行资产修改。
- 在 PIE 运行中或编译冲突未解除时发起新的危险写操作。
- 跳过失败记录、验证结果或恢复路径就继续推进闭环。

## 安全矩阵

| Operation | Preview | Preflight | Sandbox | Human Approval | Rollback / Recovery |
| --- | --- | --- | --- | --- | --- |
| 读取项目 / 资产 / 日志上下文 | N/A | N/A | N/A | N/A | N/A |
| 生成 LLM 修复提议 | Required | Required | N/A | N/A | Session discard |
| duplicate 到 scratch | Visible in session | Required | Required | N/A | Delete / regenerate sandbox |
| sandbox apply | Required | Required | Required | N/A | Re-run / discard sandbox |
| sandbox compile | Result visible | Required | Required | N/A | Retry or escalate |
| promote 到原资产 | Required | Required | Already passed | Required | Rollback / source control / manual recovery |

## 用户责任

OMUE 提供的是受限自主工具链，不是自动驾驶系统。用户始终负责：

- 审核修复提议和差异展示。
- 决定是否批准 promote。
- 维护项目自己的版本控制与恢复策略。
- 在高风险或不确定场景下接管处理。

OMUE 的职责是把上下文、提议、验证、失败和恢复路径清晰地呈现出来，而不是替用户隐式承担最终变更责任。
