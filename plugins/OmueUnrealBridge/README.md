# OMUE Unreal Bridge

OMUE 的 Unreal Engine Editor C++ 插件。它在本机启动一个受限 HTTP 服务，为桌面工作台提供结构化编辑器上下文和沙箱操作能力。

## 能力

当前注册 15 条业务路由：

| 类型 | 路由 |
| --- | --- |
| 状态 | `GET /health`、`GET /capabilities` |
| 工程上下文 | `GET /context/project`、`GET /context/current-asset` |
| 诊断信息 | `GET /logs/recent`、`GET /compile/status` |
| Blueprint | `GET /context/blueprint-summary`、`GET /context/blueprint-graphs`、`GET /context/blueprint-graph-detail` |
| AI 资产诊断 | `GET /context/behavior-tree-diagnostic` |
| 沙箱写入 | `POST /write/scratch`、`POST /write/scratch/duplicate`、`POST /write/scratch/sandbox-apply` |
| 回滚与验证 | `POST /write/scratch/rollback`、`POST /compile/blueprint` |

所有写操作都受到目标路径、能力白名单、审批信息和快照状态约束。插件不会允许模型直接修改任意生产资产，也不会自动执行 Promote。

## 安装

1. 将 `plugins/OmueUnrealBridge` 复制到 Unreal Engine 项目的 `Plugins/` 目录。
2. 重新生成项目文件或由 Unreal Editor 构建插件。
3. 启动 Editor，在 Output Log 中确认 `OmueUnrealBridge` 已启动。
4. 访问 `http://127.0.0.1:21805/health` 检查连接。

插件类型为 Editor-only，不包含运行时游戏内容。

## 安全边界

- 服务仅用于本机 Editor 集成，默认端口为 `21805`。
- 读取接口不会保存或修改资产。
- 写接口只接受受支持的 Typed Payload 和允许的 Scratch/Test 路径。
- 沙箱操作与原资产写回分离；Promote 必须由桌面端单独审批。
- 失败响应返回结构化原因，调用方不能将拒绝或降级状态解释为成功。

## 验证

在真实 UE 环境中至少验证：

1. 插件可编译并加载。
2. 所有读取路由返回结构化 JSON。
3. Blueprint 编译状态能随 Editor 编译事件更新。
4. 非白名单路径、缺少审批或缺少快照的写请求被拒绝。
5. 沙箱写入和回滚不会影响无关资产。

当前仓库不包含 Unreal Engine 本体，C++ 插件构建需要在本地 UE5 工程中完成。
