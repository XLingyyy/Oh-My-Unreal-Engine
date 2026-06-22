# @omue/shared-protocol

OMUE 桌面端与 Unreal Bridge 共用的 TypeScript 契约包。

## 包含内容

- 工程、资产、日志、编译状态和 Blueprint 图结构类型。
- Agent Session、Typed Proposal、修复候选和验证结果类型。
- 沙箱写入、快照、回滚和能力发现契约。
- Provider、设置、IPC 与 HTTP 响应类型。
- 默认设置、轻量运行时校验和测试用 Mock 数据。

该包不发起网络请求，也不依赖 Electron 或 Unreal Engine。业务执行由桌面端和 Bridge 分别完成。

## 使用

```typescript
import type {
  AgentProposal,
  OmueContextSnapshot,
  ReversibleWriteRequest,
} from '@omue/shared-protocol';
```

## 工程命令

在仓库根目录运行：

```powershell
npm run build:shared
npm run typecheck:shared
```

构建同时生成 ESM 类型产物和供 Electron Main 使用的 CommonJS 产物。依赖版本统一由仓库根目录的 `package-lock.json` 管理。
