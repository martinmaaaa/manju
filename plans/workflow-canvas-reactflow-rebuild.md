# 工作台与画布重构方案（React Flow 版）

## Summary
- 直接废弃当前自绘式 `CanvasSurface` 作为主实现，改为基于 `@xyflow/react` 重建 workflow 画布层。
- 当前范围只做：
  - 左侧 workflow 画布
  - 右侧纯预览面板
  - 底部镜头时间线
- 当前不做：
  - 右侧 transport 控件
  - 提交审核
  - 团队协作
- 工作台核心语义改成 momolab 式：
  - 底部镜头条是一级导航
  - 每个镜头拥有独立子图
  - 画布服务于当前镜头，不再是整集唯一大画布

## Progress
- 已完成：
  - `shotGraphs + timeline` 数据模型落地
  - 旧整集图向当前镜头子图的兼容迁移
  - `episode workspace` 画布底座切换到 `@xyflow/react`
  - 底部镜头条改成 `绝对时间细轨 + 等宽镜头卡 + 播放游标`
  - 工作台右侧收敛为预览主卡，顶部独立参考区已并回预览侧
  - 旧工作台侧栏残留状态与重复 helper 已清理
  - 自由加节点和手动布局操作已降入“高级画布”入口
- 待继续：
  - 右侧预览卡继续压缩非核心信息，保留更明确的镜头结果优先级
  - 节点模板和 momolab 风格继续收窄
  - 主流程页面壳层与各页面职责重排

## Canvas Library Decision
- 采用 `@xyflow/react` 作为唯一主画布库。
- 不采用 X6：
  - React 集成心智更重
  - 对当前 shot-based 小图编辑器属于过度武装
  - 当前更需要 React 状态可控、自定义节点快落地，而不是通用企业级图编辑引擎
- 不采用 Rete.js：
  - 更偏 processing-oriented visual programming
  - 对当前产品超规格
- 不再继续维护现有手写拖拽/连线/坐标方案。

## Data Model
- 在 `EpisodeWorkspaceContent` 中新增：
  - `shotGraphs: Record<shotId, { nodes, connections, viewport?, history? }>`
  - `timeline?: { currentSeconds: number; totalSeconds: number }`
- 在 `EpisodeShotSlot` 中新增：
  - `startSeconds?: number`
  - `endSeconds?: number`
- 旧整集图迁移规则：
  - 如果只有顶层 `nodes/connections`，首次加载时迁入当前或首个镜头的 `shotGraphs[selectedShotId]`
  - 保存后统一写回新结构
  - 顶层 `nodes/connections` 只保留当前 active shot graph 的镜像，兼容旧 UI 和运行时

## Implementation Changes
### 画布层
- 新建 `WorkflowFlowCanvas`，底层使用 `ReactFlow`。
- 节点和边改成 React Flow 的 `nodes/edges` 数据结构，保留现有业务字段映射。
- 使用 `nodeTypes` 实现固定模板节点：
  - `prompt`
  - `image-ref`
  - `subject-ref`
  - `prop-ref`
  - `video-output`
  - 需要时再补 `image-output`
- 使用自定义 `Handle` 实现输入槽位语义，不再自己计算端口 DOM 和命中。
- 连线校验继续复用现有 `canvasGraphHelpers` 的输入类型/多输入校验逻辑。

### TimelineRail
- 镜头卡保持等宽，不按时长比例拉伸。
- 上方增加整集绝对时间细轨和游标。
- 点击镜头卡切换 `selectedShotId`，同时切换当前 `shotGraph`。
- 点击细轨可 seek 到绝对时间，并映射到对应镜头。
- 播放键当前只驱动“整集时间游标”，不强制驱动右侧预览跨镜头播放。

### 运行逻辑
- `runEpisodeCanvasNode` 改为基于当前 `selectedShotId` 读取/写回对应 `shotGraph`。
- 只把当前镜头子图送入运行时，不再默认提交整集大图。
- `saveClipToEpisodeShotStrip` 保留，继续承接当前镜头结果回写到底部镜头条。

## Defaults
- 当前阶段右侧只放预览，不做 momolab 那排控件。
- 当前阶段不做提交审核、团队协作和评论流。
- 当前阶段保留 Studio 沙盒与现有后端接口。


## Latest Progress
- `WorkflowFlowCanvas` now supports right-click add-node actions on the pane for `text`, `image`, `video`, and `audio`.
- The advanced canvas panel exposes the same four node types and documents the right-click path.
- `episodeWorkspaceEditorHelpers` now owns the pure workspace mutations for shot switching, timeline seeking, and custom node insertion.
