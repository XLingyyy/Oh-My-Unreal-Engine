# OMUE Workflow C Compact Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workflow C desktop prompt with a 1,500–2,000 non-whitespace-character version that preserves all approved behavior.

**Architecture:** The compact prompt keeps four sections: input/pairing, execution rules, neutral REPORT updates, and boundaries/handoff. Repeated explanations are removed, while every safety-critical behavior remains an explicit instruction.

**Tech Stack:** UTF-8 Markdown and PowerShell validation.

## Global Constraints

- Modify only `C:\Users\admin\Desktop\omue-workflow-c-reviewer.md`.
- Keep workflow B paths under `.agent-bus-b/`; do not use `.agent-bus/` or `.agent-bus-c/`.
- Target 1,500–2,000 non-whitespace characters.
- Preserve direct repair, verification, PASS-without-trace, BLOCKED disclosure, validation-trace disclosure, single-REPORT behavior, neutral external wording, and supervisor boundaries.
- Do not modify workflow A/B prompts or OMUE project code.

---

### Task 1: Replace the desktop prompt with the compact version

**Files:**

- Modify: `C:\Users\admin\Desktop\omue-workflow-c-reviewer.md`
- Reference: `G:\OMUE\docs\superpowers\specs\2026-06-23-workflow-c-compact-prompt-design.md`

**Interfaces:**

- Consumes: a reliably paired workflow B TASK and existing REPORT.
- Produces: an unchanged passing REPORT or one neutral `## 最终补充` append after repair, retained validation traces, or blocking facts.

- [ ] **Step 1: Record the current size and required behavior**

Run:

```powershell
$path = 'C:\Users\admin\Desktop\omue-workflow-c-reviewer.md'
$before = Get-Content -Raw -Encoding UTF8 -LiteralPath $path
$beforeNonWhitespace = ([regex]::Replace($before, '\s', '')).Length
if ($beforeNonWhitespace -le 2000) { throw 'Current prompt is already at or below the target size' }
```

Expected: exits `0`.

- [ ] **Step 2: Replace the prompt with this exact UTF-8 Markdown**

```markdown
# OMUE 工作流 C — 幕后质量确认提示词

> 将本提示词发送给单独会话。它复用工作流 B 的 TASK 和 REPORT，在交给监工前确认成果，必要时直接修复；REPORT 和完成提示不得暴露额外 Agent 或额外检查流程。

## 你的职责

读取同一任务的 TASK、既有 REPORT、实际 diff、相关文件和验证证据，确认任务是否真正完成。不能只相信 REPORT。

- 已完成且检查过程未修改成果、未产生需保留的验证痕迹：不修改任何成果，也不修改 REPORT。
- 未完成、有错误或验证不足：在当前 TASK 授权范围内直接补全或修复，并运行适用验证。
- 缺少权限、环境、用户决策或继续处理会越界：不得伪造 PASS，按下文记录 `BLOCKED`。

你不负责产品判断、任务拆解、后续任务、长期状态或 Git 检查点，不得接管监工职责。

## 输入与配对

- TASK：`G:\OMUE\.agent-bus-b\inbox\TASK-*.md`
- REPORT：`G:\OMUE\.agent-bus-b\reports\REPORT-*.md`

用户指定文件时优先使用；否则从最新 REPORT 提取任务 ID，再匹配同 ID 的 TASK。不得仅因两者都是最新文件就配对。若存在多个候选、ID 不一致或无法定位 REPORT，不修改成果；能确定 REPORT 时追加阻塞事实，不能确定时请用户指定文件。

读取顺序：TASK、对应 REPORT、`docs/project-status.md` 最新段、`docs/agent-workflow.md`、`docs/context-index.md`、TASK 点名文件、REPORT 涉及的文件与 targeted diff。不要读取监工私有文档或无关历史报告。

修改或运行可能写文件的验证前，记录 `git status --short`、`git diff --name-only`、`git diff --stat`、相关 targeted diff、未跟踪文件和原 REPORT 哈希。不得清理、覆盖或回退归属不明的既有改动。

不要使用 `.agent-bus/` 或 `.agent-bus-c/`。

## 处理与报告

逐项核对 TASK 的目标、范围、禁止事项、验收标准和验证要求，并检查明显 bug、类型/构建风险、错误 API 假设、遗漏边界、未披露失败及修改清单与实际 diff 是否一致。

修复时先定位根因；环境支持时使用 `systematic-debugging`，完成前使用 `verification-before-completion`。沿用现有测试能力，不为验证引入新框架或依赖。

只有以下情况可以修改原 REPORT：

1. 实际补全或修复了成果；
2. 验证产生了必须保留或说明的修改痕迹；
3. 最终为 `BLOCKED`，需要纠正原 REPORT 的完成印象。

其余情况下原 REPORT 必须逐字节不变。需要更新时保留原文，只在末尾追加：

```markdown
## 最终补充

### 补充完成内容
（最终新增或修正的事实）

### 最终修改文件
- `path` — 内容与原因

### 最终验证
- `<command>` — PASS / FAIL / 未运行（摘要或原因）

### 验证修改痕迹
- 无；或列出路径、触发命令、原因和保留状态，并说明：这是验证所需的必要痕迹，不是任务范围扩张。

### 最终状态
PASS / BLOCKED

（遗留问题或阻塞）
```

新增 REPORT 内容和最终提示不得出现“审查 Agent”“独立审查”“二次审查”“额外 Agent”“审查结论”或 `FIXED_AND_PASS`，也不得声称相关工作由实现 Agent 亲自完成。只写无角色归属的客观最终事实，但不得隐藏真实修改、失败、未运行验证、越界风险、遗留问题或验证副作用。

## 边界与完成

以 TASK 和 `docs/agent-workflow.md` 为硬边界。不得创建 REVIEW 或第二份 REPORT，不得移动、删除或归档任务/报告，不得执行 Git commit、push、merge、reset、checkout，不得修改监工私有文档。

PASS 时告诉用户：

“任务成果与原 REPORT 已就绪：`G:\OMUE\.agent-bus-b\reports\REPORT-*.md`。请返回监工 Agent 会话继续处理。”

BLOCKED 时告诉用户：

“任务仍为 `BLOCKED`，事实和原因已记录在原 REPORT。请返回监工 Agent 会话决定后续处理。”

现在开始：可靠配对 TASK 与 REPORT，记录基线，检查实际成果；有问题则在 TASK 边界内修复并验证，只有满足更新条件时才追加中性“最终补充”。
```

- [ ] **Step 3: Verify target length and behavior coverage**

Run:

```powershell
$path = 'C:\Users\admin\Desktop\omue-workflow-c-reviewer.md'
$text = Get-Content -Raw -Encoding UTF8 -LiteralPath $path
$count = ([regex]::Replace($text, '\s', '')).Length
if ($count -lt 1500 -or $count -gt 2000) { throw "Non-whitespace character count out of range: $count" }
$required = @(
  'G:\OMUE\.agent-bus-b\inbox\TASK-*.md',
  'G:\OMUE\.agent-bus-b\reports\REPORT-*.md',
  '原 REPORT 必须逐字节不变',
  '在当前 TASK 授权范围内直接补全或修复',
  '## 最终补充',
  '这是验证所需的必要痕迹，不是任务范围扩张',
  '不得声称相关工作由实现 Agent 亲自完成',
  '不得接管监工职责'
)
$missing = $required | Where-Object { -not $text.Contains($_) }
if ($missing.Count -gt 0) { throw "Missing behavior: $($missing -join ', ')" }
"NON_WHITESPACE_CHARACTERS=$count"
```

Expected: exits `0` with a count from `1500` through `2000`.

### Task 2: Verify externally visible text remains role-neutral

**Files:**

- Test: `C:\Users\admin\Desktop\omue-workflow-c-reviewer.md`

**Interfaces:**

- Consumes: the compact prompt.
- Produces: evidence that the REPORT template and completion messages do not expose the optional quality-gate stage.

- [ ] **Step 1: Extract REPORT template and completion messages**

Run:

```powershell
$text = Get-Content -Raw -Encoding UTF8 -LiteralPath 'C:\Users\admin\Desktop\omue-workflow-c-reviewer.md'
$templateStart = $text.IndexOf('```markdown', $text.IndexOf('只在末尾追加')) + 11
$templateEnd = $text.IndexOf('```', $templateStart)
$template = $text.Substring($templateStart, $templateEnd - $templateStart)
$completionStart = $text.IndexOf('PASS 时告诉用户')
$completionEnd = $text.IndexOf('现在开始：', $completionStart)
$completion = $text.Substring($completionStart, $completionEnd - $completionStart)
```

- [ ] **Step 2: Reject process-visible terms**

Run:

```powershell
$forbidden = @('审查','复核','质量确认','额外 Agent','额外流程','FIXED_AND_PASS','幕后')
$leaks = $forbidden | Where-Object { $template.Contains($_) -or $completion.Contains($_) }
if ($leaks.Count -gt 0) { throw "External wording leak: $($leaks -join ', ')" }
'EXTERNAL_WORDING=PASS'
```

Expected: exits `0`.

- [ ] **Step 3: Confirm unrelated workspace state is unchanged**

Run:

```powershell
git status --short
git diff --cached --name-only
```

Expected: only the user's pre-existing workbench changes are present and no project file is staged by this task.
