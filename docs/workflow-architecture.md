# 工作流架构（现状）

## 目标

当前系统已经不再沿用旧的“通用画布 + 多套历史 workflow/UI/API”的结构，而是收敛成一条新的工作流主链：

1. `Project Workflow`
2. `Episode Scenes`
3. `Episode Workspace`
4. `Canvas Node Runtime`
5. `Shot Strip / 资产栏 / Review Gate`

`Canvas Studio` 仍然保留，但它是独立沙盒，不再代表产品主入口。

## 当前代码入口

### 前端入口
- [index.tsx](C:/Users/marti/Desktop/Code/aiyou/index.tsx)
- [App.tsx](C:/Users/marti/Desktop/Code/aiyou/App.tsx)

### 当前前端主组件
- [AppShell.tsx](C:/Users/marti/Desktop/Code/aiyou/components/workflow2/AppShell.tsx)
- [CanvasSurface.tsx](C:/Users/marti/Desktop/Code/aiyou/components/workflow2/CanvasSurface.tsx)
- [EpisodeShotStrip.tsx](C:/Users/marti/Desktop/Code/aiyou/components/workflow2/EpisodeShotStrip.tsx)
- [SchemaFieldControl.tsx](C:/Users/marti/Desktop/Code/aiyou/components/workflow2/SchemaFieldControl.tsx)

### 当前前端运行时
- [appApi.ts](C:/Users/marti/Desktop/Code/aiyou/services/appApi.ts)
- [services/workflow/runtime](C:/Users/marti/Desktop/Code/aiyou/services/workflow/runtime)
- [workflowApp.ts](C:/Users/marti/Desktop/Code/aiyou/types/workflowApp.ts)

### 当前后端主链
- [server/index.js](C:/Users/marti/Desktop/Code/aiyou/server/index.js)
- [server/capabilityEngine.js](C:/Users/marti/Desktop/Code/aiyou/server/capabilityEngine.js)
- [server/canvasNodeRuntime.js](C:/Users/marti/Desktop/Code/aiyou/server/canvasNodeRuntime.js)
- [server/modelRuntime.js](C:/Users/marti/Desktop/Code/aiyou/server/modelRuntime.js)
- [server/skillSchemas.js](C:/Users/marti/Desktop/Code/aiyou/server/skillSchemas.js)
- [server/reviewRegistry.js](C:/Users/marti/Desktop/Code/aiyou/server/reviewRegistry.js)
- [server/registries.js](C:/Users/marti/Desktop/Code/aiyou/server/registries.js)
- [server/workflowStore.js](C:/Users/marti/Desktop/Code/aiyou/server/workflowStore.js)

## 当前产品结构

### 1. 项目主链
- 项目创建和成员管理
- 剧本上传与项目设定
- 阶段配置
- 资产中心
- 剧集列表

### 2. 单集主链
- 分切页
- 工作台页
- 底部分镜视频条
- 右侧资产栏与检查器

### 3. 工作台语义
- 画布负责生产和试跑
- 分镜条只负责承接最终采用结果
- 右侧资产栏负责展示和聚焦本集锁定资产
- Review Gate 在工作台内显式提示阻塞原因

### 4. 模型底座
- 模型已经按 `family / deployment / providerModelId` 分离
- 画布节点是节点级模型选择，不再依赖全局 provider
- 参数和输入能力由 schema 驱动

### 5. skills 驱动
- `director -> episode -> storyboard -> asset/image_prompt` 已开始走 schema 驱动
- `capabilityEngine` 现在是调度器，而不是所有阶段知识的硬编码中心

## 已删除的旧体系

以下体系已经从当前主链中清理，不再作为现状结构的一部分：
- 旧 `components/workflow/*`
- 旧 `components/sidebar/*`
- 旧视频编辑器和旧画布工具链
- 旧 `services/api/*`
- 旧 `services/storage/*`
- 旧 `workflowTemplates`
- 旧根类型 [types.ts](C:/Users/marti/Desktop/Code/aiyou/types.ts)
- 旧 `hooks / handlers / stores`

如果文档或笔记里还提到这些路径，请把它们视为历史信息，不要再按这些结构继续开发。
