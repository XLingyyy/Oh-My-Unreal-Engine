# @omue/desktop

OMUE 的 Electron 桌面工作台，负责连接 Unreal Editor、本地模型 Provider 和受控修复流程。

## 主要职责

- 使用 React 展示工程、资产、日志、编译状态和 Blueprint 结构化证据。
- 在 Electron Main 进程中管理 Provider 凭据、Agent Loop 和 Repair Session。
- 区分 Project Scope 与 Asset Scope，阻止工程级诊断进入资产写入流程。
- 将模型输出转换为 Typed Proposal，并在执行前完成结构、目标和状态校验。
- 通过 `/Game/Scratch/` 沙箱、编译验证和人工审批控制资产写回。
- 在真实 Bridge 不可用时明确展示断开或降级状态，不使用 Mock 数据伪装成功。

## 运行模式

默认使用 Mock Bridge，便于独立查看界面和调试交互：

```powershell
npm run dev:desktop
```

连接本地 Unreal Editor Bridge：

```powershell
$env:VITE_OMUE_BRIDGE_MODE="real"
$env:VITE_OMUE_BRIDGE_BASE_URL="http://127.0.0.1:21805"
npm run dev:desktop
```

完整 Agent 流程还需要在设置中配置受支持的模型 Provider。API Key 由 Main 进程管理，不暴露给 Renderer。

## 工程命令

在仓库根目录运行：

```powershell
npm run dev:desktop
npm run test:agent-ui
npm run typecheck
npm run build
```

## 目录结构

```text
apps/desktop/
├─ scripts/          # 开发启动与真实环境 smoke 脚本
└─ src/
   ├─ main/          # Electron Main、Agent Loop、Provider 与设置存储
   ├─ preload/       # Renderer 安全 IPC 边界
   ├─ renderer/      # React 工作台
   ├─ shared/        # 桌面端共享逻辑
   └─ test/          # Agent、设置、安全边界与 UI 回归测试
```

桌面端不会直接操作 UE 资产文件；所有编辑器交互都通过 `OmueUnrealBridge` 的本地协议完成。
