# 前端主流程重构方案（对标 momolab，结构高仿版）

## Summary
- 保留现有后端接口、运行时和主业务能力，重构前端主链为 5 个连续页面：`项目脚本分析 -> 资产生产 -> 剧集列表 -> 单集脚本/场景 -> 单集 Workflow`。
- 页面结构高仿 momolab，但不做 1:1 视觉复制；重点复刻信息架构、分栏关系、主次动线、镜头工作流语义。
- 工作台改为 `shot-centric`：底部镜头条是一级导航，每个镜头拥有独立子图；右侧当前阶段只放预览，不做 transport 控件、提交审核、团队协作。

## Progress
- 已完成：
  - 计划文档归档到 `plans/`
  - 工作台数据模型切到 `shot-centric`
  - 单集工作台画布底座切到 `React Flow`
  - 底部镜头条切到整集时间线语义
  - 页面壳层切到左侧流程导航结构
  - `setup / assets / episodes / scenes` 已完成第一轮主链重排
  - 资产页右侧收敛成轻量资产导航，工作台顶部参考区并回右侧预览
  - `setup` 页的流程设置和项目协作已降为默认收起的次级区
  - `episodes` 页收敛成按集进入的工单式列表
  - `scenes` 页收敛成进入工作台前的脚本/分切确认层
  - 资产页版本对比已改成抽屉式浮层，不再撑开主工作区
  - 页面拆分已启动：`episodes / scenes` 已迁出 `App.tsx` 成独立页面组件
  - `setup` 主内容区已迁出 `App.tsx`，复杂次级区通过 `secondarySections` 注入
  - `assets` 已迁出 `App.tsx` 成独立页面组件
  - `workspace` 的总览卡和右侧预览面板已迁出 `App.tsx`
  - `workspace` 的主工作台卡与分镜条已迁出 `App.tsx`
  - `studio` 页面与全局运行日志浮层已迁出 `App.tsx`
  - `setup` 的流程设置与项目协作次级区已迁出 `App.tsx`
  - `workspace` 的派生视图数据已抽到专门 helper
- 待继续：
  - `setup / assets / episodes / scenes / workspace` 继续压缩信息密度和视觉层级
  - 资产页和剧集页继续往 momolab 式工作台结构收口
  - 页面级 CTA 和次级入口继续去项目管理化

## Key Changes
### 页面壳层
- 用紧凑型 `FlowShell` 替换当前大 Hero 风格壳层。
- 主导航改成瘦左导轨 + 返回/面包屑，不再用顶部 `setup / assets / episodes` pill nav。
- 成员管理、团队协作、Studio 沙盒移出主流程一级导航。

### 路由与页面职责
- `/projects/:id/setup`
  - 合并“剧本上传、项目设定、阶段配置、剧本分析结果”。
  - 左栏放剧本输入、画幅/风格/模型预设、关键阶段参数。
  - 右栏放结构化剧本分析、主体列表、剧集预览。
  - 只保留主 CTA“查看资产”。
- `/projects/:id/assets`
  - 改成资产生产页，不再是长列表管理页。
  - 顶部 tabs：人物 / 生物 / 场景 / 道具。
  - 主区展示当前资产描述、主形象、情绪版/服装/派生生成区。
  - 右栏展示可搜索资产列表与锁定状态。
  - 版本比较降级为抽屉/弹层。
  - 主 CTA“进入剧集”。
- `/projects/:id/episodes`
  - 收敛成稀疏剧集卡列表，只保留状态、负责人/占位、`查看详情`、`进入工作台`。
- `/projects/:id/episodes/:episodeId/scenes`
  - 双栏：左侧单集完整剧本，右侧场景卡列表。
  - 只承担“阅读脚本 + 确认场景切分 + 进入 workflow”。
- `/projects/:id/episodes/:episodeId/workspace`
  - 改成镜头驱动工作台：左侧当前镜头子图画布，右侧纯预览面板，底部镜头时间线。

### 工作台交互模型
- 底部镜头条升格为一级导航，`selectedShotId` 是当前工作上下文唯一来源。
- 每个镜头拥有独立 graph；切换镜头即切换整套 `nodes/edges/viewport/history`。
- 默认模板节点围绕当前镜头生成结果组织，不再以整集共用大图为心智。

### 底部镜头条
- 采用 momolab 语义，而不是当前结果条语义。
- 结构固定为：
  - 上方一条整集绝对时间细轨：显示 `current / total`
  - 细轨上的 `playhead / progress`
  - 下方一排等宽镜头卡，每张卡只显示 `durationLabel + 镜头编号 + 缩略图`
- 不做按时长比例拉伸的 NLE 时间线，镜头卡保持等宽。
- 点击镜头卡：
  - 切换 `selectedShotId`
  - 将整集时间跳到该镜头的绝对起始时间
  - 切换到该镜头的独立子图
- 点击细轨：
  - 按整集绝对时间 seek
  - 映射到对应镜头
  - 同步切换 `selectedShotId`
- 播放键：
  - 只推进整集时间游标
  - 不自动切换当前 active graph
  - 不做 NLE 式“播放时编辑上下文跟着跳”

### 右侧预览面板
- 只保留当前镜头预览、状态、基础 metadata、生成结果摘要。
- 不实现 momolab 右侧 transport 控件。
- 不实现提交审核、评论、团队协作。
- 节点历史保留为只读历史块或后续扩展入口，不做复杂控制栏。

## Defaults
- 当前阶段不做：
  - 提交审核
  - 团队协作
  - 右侧 transport 控件
- 当前阶段保留：
  - Studio 沙盒
  - 现有后端接口
  - 节点运行与分镜结果回写能力


## Latest Progress
- Setup secondary sections now read their flow-card view model from `buildSetupFlowSections`.
- Workspace route assembly keeps the run-log overlay out of the main canvas page.
- `App.tsx` now delegates shot selection, timeline seek, and custom node insertion to runtime helpers instead of inlining those mutations.
