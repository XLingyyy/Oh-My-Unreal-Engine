# Drawer Factual Source Convergence Design

日期：2026-06-23

工作流：B

产品代码基线：`cc9c926 handoff: converge factual source authority`

## 1. 问题

Handoff 与 Inspector 已建立 mock/real 来源边界，但 Drawer 中仍有四个入口可能把演示能力当作真实能力：

- Questions 无条件生成 BT/BB mock-only questions；
- Closure 无条件加入 BT/BB、Change Plan、manifest、approval、旧 fix-execution 等 mock/legacy gates；
- Change Plan 无条件挂载 3 个 deterministic mock plans；
- BP Change Workspace 无条件使用 mock/local inventory、mock plan builder 和 mock AI adapter。

这些页面在 real bridge mode 下仍可从 Drawer 与 Command Palette 进入，用户容易误以为 mock fixture、mock approval、mock manifest 或 mock workspace 是当前真实会话事实。

## 2. 已确认边界

- 一次性处理 Questions、Closure、Change Plan、BP Change Workspace。
- real mode 不显示 mock fixture、mock manifest、mock approval gate、mock change plan 或 mock BP workspace 作为可用事实。
- real mode 有现成真实 Renderer/Bridge/Agent session 事实时可显示只读事实；无真实来源时显示 unavailable。
- mock mode 保留现有演示页面并明确标注 Mock。
- 不删除 mock 能力，不修改其内部演示行为。
- 不修改 shared protocol、Main、preload、renderer services、Bridge、UE plugin、Agent loop 或依赖。
- 不新增 endpoint、协议字段、真实 planning/workspace runtime、AI/LLM、compile、PIE、Automation 或 UE asset write。
- 所有新增 source、unavailable、navigation gate copy 支持中英文。

## 3. 方案比较

### 方案 A：集中 Drawer source adapter + 页面挂载门禁（采用）

新增纯 Renderer adapter，统一计算四个页面的 source authority 和可用事实。Drawer 在挂载页面前做门禁：

- Questions：real 显示真实派生问题；mock 显示含 mock BT/BB 问题的演示矩阵；
- Closure：mock 挂载原演示 Closure；real 仅在当前 persisted Agent session 已终结时显示只读 closure facts，否则 unavailable；
- Change Plan：mock 挂载原 mock workspace；real 仅在当前 persisted session 有真实 proposals 时显示只读 proposal facts，否则 unavailable；
- BP Change Workspace：mock 挂载原 mock workspace；real 始终 unavailable，因为当前没有真实 workspace runtime。

优点：

- 权威逻辑集中且可单测；
- 不需要改造两个 800+ 行 mock workspace；
- real mode 不会执行或挂载 mock-only component；
- persisted-real 能力只展示已有 Agent session facts，不扩展运行能力。

### 方案 B：分别在四个大组件内部添加 mode 分支

每个组件自行判断 mock/real。文件改动分散、重复 source precedence，且大组件更难审查。

### 方案 C：real mode 直接移除三个 mock-only Drawer 项

边界最硬，但导航在 mock/real 间跳变，Command Palette 与 tab registry 更复杂，也无法向用户解释能力为什么不可用。

## 4. 核心架构

新增：

```text
apps/desktop/src/renderer/components/workbench/drawerFactualSourceAdapter.ts
apps/desktop/src/renderer/components/workbench/DrawerSourceStatus.tsx
```

核心类型：

```ts
export type DrawerSourceKind =
  | 'live'
  | 'persisted-real'
  | 'cache'
  | 'mock'
  | 'unavailable';

export type DrawerSourceReason =
  | 'bridge-live'
  | 'bridge-cache'
  | 'persisted-agent-session'
  | 'mock-fixture'
  | 'no-live-question-data'
  | 'no-persisted-closure'
  | 'no-persisted-change-plan'
  | 'no-real-blueprint-workspace';

export interface DrawerPageAuthority {
  kind: DrawerSourceKind;
  reason: DrawerSourceReason;
  updatedAt: string | null;
  available: boolean;
}

export interface DrawerFactualSourceModel {
  pages: {
    questions: DrawerPageAuthority;
    closure: DrawerPageAuthority;
    changePlan: DrawerPageAuthority;
    blueprintChangeWorkspace: DrawerPageAuthority;
  };
  persistedClosure: DrawerPersistedClosureFact | null;
  persistedPlans: DrawerPersistedPlanFact[];
}
```

Adapter 输入只使用当前已有状态：

```ts
export interface DrawerFactualSourceInput {
  isMockClient: boolean;
  snapshot: OmueContextSnapshot | null;
  bridgeError: string | null;
  selectedSession: RepairSessionRecord | null;
}
```

`AgentWorkbenchShell` 构建一次 `DrawerFactualSourceModel`，同时用于：

- Command Palette command enablement / disabled reason；
- `DrawerPanel` page branching；
- Drawer tab source badges。

`DrawerPanel` 通过 prop 接收同一 model，不自行重复计算，避免导航和页面出现不同权威结论。

## 5. 页面来源矩阵

### 5.1 Questions

```text
mock client                         -> mock
real + snapshot + bridge error      -> cache
real + snapshot + no bridge error   -> live
real + no snapshot                  -> unavailable
```

- real Questions 使用现有 snapshot/evidence/graph/queue/review 派生问题。
- real Questions 必须过滤 `bt-blackboard` mock fixture questions。
- mock Questions 保留 BT/BB mock questions。
- real 有 snapshot 但派生结果为空时显示本语言的 no live questions 空状态，不回退 mock。

### 5.2 Closure

```text
mock client                                      -> mock
real + terminal persisted selected Agent session -> persisted-real
otherwise                                        -> unavailable
```

terminal state：

```text
done
escalated_done
closed
```

persisted-real Closure 只读显示：

- session ID；
- scope；
- current state；
- updated/closed time；
- close reason；
- target asset（asset scope）；
- proposal count；
- sandbox / approval / promote 是否存在。

real mode 不挂载现有 `InfrastructureClosurePanel`，因此不会显示其 mock checklist、mock Change Plan gates 或旧 execution readiness claims。

### 5.3 Change Plan

```text
mock client                              -> mock
real + persisted session proposals > 0  -> persisted-real
otherwise                                -> unavailable
```

persisted-real Change Plan 只读显示当前 session 中实际 proposals：

- proposal ID；
- proposedAt；
- kind；
- summary / diagnosis summary；
- confidence / risk；
- typed payload operation kind（如存在）；
- escalation reason / suggested human action（如存在）。

不得生成 `plan-001/002/003`，不得复用 `ChangePlanPackageWorkspace` 的 mock state。

### 5.4 BP Change Workspace

```text
mock client -> mock
real client -> unavailable
```

当前没有真实 BP planning workspace authority。即使 snapshot 有 current/open assets，也不能把 mock plan builder 或 mock adapter 伪装成真实 workspace。

real mode 显示：

- source=unavailable；
- 当前无真实 Blueprint change workspace；
- 当前可用的 current/open asset facts 不等于 planning capability；
- 不提供生成计划、mock adapter、approval 或 execution 按钮。

## 6. Drawer 导航与 Command Palette

四个相关 tab 在 Drawer 中保留稳定位置，并显示小型 source badge：

```text
Live / Persisted real / Cache / Mock / Unavailable
```

规则：

- Questions：有 live/cache/mock authority 时可用；
- Closure：mock 或 persisted-real 时可用，否则 tab 仍可打开 unavailable explanation；
- Change Plan：mock 或 persisted-real 时可用，否则 tab 仍可打开 unavailable explanation；
- BP Change Workspace：mock 可用；real 打开 unavailable explanation。

Command Palette 更严格：

- unavailable 的 Closure、Change Plan、BP Change Workspace command 设为 disabled；
- disabled reason 使用 typed bilingual copy；
- Questions 仍按 context/source authority 判断；
- Drawer tab 仍允许用户查看 unavailable 原因，不让导航项无提示消失。

## 7. 页面展示

`DrawerSourceStatus` 负责统一显示：

```text
Source / 来源
source kind
source reason
updatedAt（适用时）
```

`DrawerPanel` 负责组合：

- source status；
- 原有 mock component；
- persisted-real read-only facts；
- unavailable state。

不在 Change Plan 或 BP Change Workspace 内部添加 real branch，避免将 mock component 变成混合权威组件。

## 8. i18n

在 `ueAgentUi.drawer` 下新增 typed copy：

- 五种 source kind；
- 八种 source reason；
- source / updated labels；
- Questions no-live empty；
- Closure unavailable 与 persisted summary 字段；
- Change Plan unavailable 与 persisted proposal 字段；
- BP Workspace unavailable；
- Command Palette unavailable reasons；
- tab badge aria 文案。

新增逻辑不得硬编码英文 source/unavailable/gate 文案。

现有 mock workspace 内部历史英文不在本任务重写；但新增 wrapper、source status、real unavailable 和 persisted-real facts 必须双语。

## 9. 测试

新增：

```text
apps/desktop/src/test/drawer-factual-source-convergence.test.ts
```

至少覆盖：

- Questions live/cache/mock/unavailable precedence；
- Closure mock/persisted-real/unavailable；
- Change Plan mock/persisted-real/unavailable；
- BP Workspace mock/unavailable；
- persisted closure facts 使用真实 session 字段；
- persisted plans 使用真实 proposal IDs，不生成固定 mock IDs；
- real question generation 排除 `bt-blackboard`；
- real unavailable 分支不挂载三个 mock-only components；
- mock 分支继续挂载现有 components；
- Drawer 四个 tab 有 source badge；
- Command Palette unavailable commands disabled 且有 typed reason；
- en/zh source kinds、reasons、empty states 精确映射；
- forbidden scope 与 legacy fixed mock strings 的 real path 契约。

## 10. Formal Desktop evidence

使用正式 Main/preload、deterministic real loopback bridge、default mock renderer 和隔离 profile。

生成 8 张截图：

```text
drawer-real-questions-en.png
drawer-real-closure-en.png
drawer-real-change-plan-en.png
drawer-real-bp-workspace-en.png
drawer-mock-questions-zh.png
drawer-mock-closure-zh.png
drawer-mock-change-plan-zh.png
drawer-mock-bp-workspace-zh.png
```

并生成：

```text
drawer-factual-source-capture-summary.json
```

Real assertions：

- Questions 无 BT/BB mock fixture questions；
- Closure 不含 mock closure checklist、3 mock plans/manifests/gates；
- Change Plan 不含 `plan-001/002/003`；
- BP Workspace 不含 mock inventory、mock adapter 或生成计划控件；
- unavailable/persisted-real source 与文案正确；
- unavailable Command Palette commands 为 disabled。

Mock assertions：

- 四个演示页面仍可访问；
- source badge/status 明确为 Mock；
- mock Questions 可见 BT/BB fixture questions；
- mock Change Plan/BP workspace 仍保留现有演示内容。

双语通过 DOM assertions 覆盖四页 source/unavailable 文案；截图按 real English / mock Chinese 分组。

验证后必须恢复 default mock renderer、删除临时 env/profile/process。

## 11. 禁止范围

- 不修改 `packages/shared-protocol/**`。
- 不修改 `apps/desktop/src/main/**`、`apps/desktop/src/preload/**`、`apps/desktop/src/renderer/services/**`。
- 不修改 `plugins/OmueUnrealBridge/**` 或 Agent loop。
- 不新增 endpoint、polling、cache、依赖或协议字段。
- 不实现真实 Change Plan/BP workspace runtime。
- 不新增 AI/LLM、WebSocket、compile、PIE、Automation、asset write、approval execution 或 patch application。
- 不删除 mock components、fixtures 或 legacy services。
