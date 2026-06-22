import type { EditorConnectionStatus, OmueContextSnapshot, BlueprintGraphDetailData, BehaviorTreeDiagnosticResponse, BridgeCapabilityDiscovery, ReversibleWriteRequest, ReversibleWriteResponse, RollbackRequest, RollbackResponse, DuplicateScratchRequest, DuplicateScratchResponse, CompileBlueprintRequest, CompileBlueprintResponse } from '@omue/shared-protocol';

/** 桥接层健康状态（桌面端专用） */
export interface BridgeHealth {
  connectionStatus: EditorConnectionStatus;
  serviceName: string;
  version: string;
  message: string;
  checkedAt: string;
}

/** Mock 可控场景（仅用于开发验证 UI 状态，不暴露到 BridgeClient 接口） */
export type MockBridgeScenario = 'normal' | 'slow' | 'disconnected' | 'empty' | 'partial' | 'target_not_found' | 'write_not_implemented';

/** BridgeClient 抽象接口。后续接入真实 UE HTTP API 时实现 RealHttpBridgeClient 即可替换。 */
export interface BridgeClient {
  getHealth(): Promise<BridgeHealth>;
  getContextSnapshot(): Promise<OmueContextSnapshot>;
  /** 按需请求单 Graph 节点/引脚/连线详情（K2b-2c）。不在 getContextSnapshot() 中自动调用。 */
  getBlueprintGraphDetail(graphId: string): Promise<BlueprintGraphDetailData>;
  /** 按需请求 Behavior Tree / Blackboard 只读诊断（E62）。不在 getContextSnapshot() 中自动调用。 */
  getBehaviorTreeDiagnostic(assetPath: string): Promise<BehaviorTreeDiagnosticResponse>;
  /** 获取桥接层能力和预检合约发现数据（E70）。只读端点，不触发任何写入/编译/PIE/Automation。 */
  getCapabilities(): Promise<BridgeCapabilityDiscovery>;

  /** 发起可回滚 UE 写入请求（E77+）。要求目标路径在白名单内、提供审批元数据、通过预检与快照就绪检查。仅实际接受执行的路径需要用户本地验证；拒绝路径必须返回结构化原因且不得修改资产。 */
  writeReversible(request: ReversibleWriteRequest): Promise<ReversibleWriteResponse>;
  sandboxApply(request: ReversibleWriteRequest): Promise<ReversibleWriteResponse>;

  /** 回滚之前通过 writeReversible 发出的写入操作（E77+）。要求提供目标路径、审批元数据、快照 ID。仅实际接受回滚的路径需要用户本地验证；拒绝路径必须返回结构化原因且不得修改资产。 */
  rollbackReversible(request: RollbackRequest): Promise<RollbackResponse>;
  duplicateScratch(request: DuplicateScratchRequest): Promise<DuplicateScratchResponse>;
  compileBlueprint(request: CompileBlueprintRequest): Promise<CompileBlueprintResponse>;
}
