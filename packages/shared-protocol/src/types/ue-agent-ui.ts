/**
 * UE Agent UI 共享类型（仅 UI 层使用，不进入 bridge payload、IPC、持久化或 UE 数据交换）。
 * 阶段 A：AgentCard discriminated union 覆盖 user-intent / scan-status / diagnosis / fix-plan /
 * change-preview / validation-result / failure / completion；并支持 project-candidates
 * 和 propose-and-create-session 等 scope 限定操作。
 *
 * 设计约束：
 * - 全部为 additive export，不修改既有 type / IPC / runtime schema。
 * - AgentCard 用 kind 字段静态绑定 data 类型，不允许 data: Record<string, unknown>。
 * - UI 日志类型命名为 AgentUiLogEntry，避免与既有 LogEntry 冲突。
 */

import type {
  AgentCandidateAsset,
  AgentProposal,
  AgentSessionErrorRecord,
  AgentSessionScope,
  AgentLoopCloseReason,
  AgentLoopState,
} from './index.js';

export type AgentCardKind =
  | 'user-intent'
  | 'scan-status'
  | 'diagnosis'
  | 'fix-plan'
  | 'change-preview'
  | 'validation-result'
  | 'project-candidates'
  | 'failure'
  | 'completion';

export interface ScanStatusStep {
  label: string;
  state: 'done' | 'current' | 'pending';
}

export interface ScanStatusData {
  steps: ScanStatusStep[];
  scannedResources: number;
  durationMs?: number;
}

export interface UserIntentData {
  userIntent: string;
  scope: AgentSessionScope;
  parentSessionId?: string;
  targetAssetPath?: string;
  inheritedEvidenceSummary?: string;
}

export interface DiagnosisData {
  conclusion: string;
  reason: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
  risk: 'low' | 'medium' | 'high';
  evidenceCount: number;
}

export interface FixPlanStep {
  label: string;
  code?: string;
}

export interface FixPlanData {
  target: string;
  summary: string;
  steps: FixPlanStep[];
  willModify: string[];
  willNotModify: string[];
  verification: string[];
}

export interface ChangePreviewData {
  targetAsset: string;
  willAdd: string[];
  willNotChange: string[];
  risk: 'low' | 'medium' | 'high';
  rollbackable: boolean;
  executionLocation: 'sandbox-copy' | 'canonical';
  verification: string[];
}

export interface ValidationCheck {
  label: string;
  passed: boolean;
}

export interface ValidationResultData {
  passed: boolean;
  checks: ValidationCheck[];
  resultSummary: string;
  recommendation: 'promote' | 'discard' | 'regenerate';
}

export interface ProjectCandidatesData {
  candidates: AgentCandidateAsset[];
  summary: string;
  suggestedNextSteps: string[];
}

export interface FailureData {
  errorCode: string;
  message: string;
  recoverable: boolean;
  scope: AgentSessionScope;
  createdAt: string;
  details?: unknown;
}

export type CompletionTone = 'success' | 'closed' | 'warning';

export interface CompletionData {
  tone: CompletionTone;
  message: string;
  sessionId: string;
  closeReason: AgentLoopCloseReason;
  terminalState: AgentLoopState;
}

export type AgentCardData =
  | { kind: 'user-intent'; data: UserIntentData }
  | { kind: 'scan-status'; data: ScanStatusData }
  | { kind: 'diagnosis'; data: DiagnosisData }
  | { kind: 'fix-plan'; data: FixPlanData }
  | { kind: 'change-preview'; data: ChangePreviewData }
  | { kind: 'validation-result'; data: ValidationResultData }
  | { kind: 'project-candidates'; data: ProjectCandidatesData }
  | { kind: 'failure'; data: FailureData }
  | { kind: 'completion'; data: CompletionData };

export interface AgentCardBase {
  id: string;
  title: string;
  createdAt: string;
  sessionId: string;
  collapsed?: boolean;
}

export type AgentCard = AgentCardBase & AgentCardData;

export interface EvidenceItem {
  id: string;
  assetName: string;
  assetPath: string;
  status: 'normal' | 'warning' | 'error';
  finding: string;
  details?: {
    inspected: string;
    result: string;
    relatedPath?: string;
    isAnomaly?: boolean;
  };
}

export interface ChangeItemChange {
  kind: 'add' | 'remove' | 'modify';
  summary: string;
  code?: string;
}

export interface ChangeItem {
  id: string;
  stage: 'before' | 'preview' | 'sandbox-applied' | 'promoted';
  targetAsset: string;
  changes: ChangeItemChange[];
  status: 'pending' | 'applied' | 'rolled-back' | 'failed';
  rollbackable: boolean;
  appliedAt?: string;
}

/**
 * UI 层日志条目（区别于既有 LogEntry —— LogEntry 来自 UE bridge，
 * AgentUiLogEntry 是 mock 卡片在 UI 层使用的轻量日志模型）。
 */
export interface AgentUiLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'tool-call' | 'compile' | 'pie' | 'agent-state' | 'bridge';
  message: string;
  payload?: string;
  timestamp: string;
}

export interface ProjectAssetNode {
  id: string;
  name: string;
  path: string;
  kind: 'Blueprint' | 'Input' | 'Map' | 'Config' | 'C++' | 'Plugin' | 'Folder' | 'File';
  children?: ProjectAssetNode[];
  status?: 'normal' | 'warning' | 'error' | 'selected' | 'agent-inspecting';
  expanded?: boolean;
}

export type AgentCardActionId =
  | 'view-evidence'
  | 'preview-fix'
  | 'apply-sandbox'
  | 'alternate-plan'
  | 'cancel'
  | 'view-diff'
  | 'view-logs'
  | 'regenerate'
  | 'promote'
  | 'discard'
  | 'select-target-asset'
  | 'continue-diagnosis'
  | 'approve'
  | 'reject';

export interface AgentCardAction {
  cardId: string;
  actionId: AgentCardActionId;
  payload?: {
    targetAssetPath?: string;
    assetPath?: string;
    [key: string]: unknown;
  };
}

export type {
  AgentCandidateAsset,
  AgentProposal,
  AgentSessionErrorRecord,
  AgentSessionScope,
  AgentLoopCloseReason,
  AgentLoopState,
};
