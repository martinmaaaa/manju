# 添梯系统架构（工作流版）

## 目标

把整个系统看成「若干工作流」组成，而不是「大量分散节点」的集合。

当前推荐的产品结构：

1. **项目层**
   - 负责项目创建、进入、删除
   - 默认进入工作流模块，而不是空白画布

2. **工作流层**
   - 这是产品主入口
   - 核心是「漫剧工作流」
   - 负责固定阶段、阶段状态、模板切换、流程初始化

3. **高级画布层**
   - 这是工作流的高级模式
   - 只保留通用创作能力，不再承载漫剧专用入口
   - 用于自由拼接、临时试验、素材补充、局部调试

4. **执行服务层**
   - 节点执行
   - 模型调用
   - 即梦任务提交与轮询
   - 文件与素材处理

5. **存储与同步层**
   - PostgreSQL 项目数据
   - IndexedDB 本地资产 / workflow 草稿
   - 本地文件存储
   - 远端同步

---

## 当前代码映射

### 1. 项目层

- `App.tsx`
- `components/ProjectsDashboard.tsx`
- `services/api/projectApi.ts`
- `server/index.js`
- `server/persistence.js`

职责：

- 项目切换
- 项目 settings 持久化
- 决定进入 `projects | pipeline | canvas`

### 2. 工作流层

- `services/workflowTemplates.ts`
- `components/PipelineView.tsx`

职责：

- 定义固定流程模板
- 定义阶段：剧本 → 人物资产 → 分镜 → 提示词 → 视频
- 生成漫剧工作流对应的节点图
- 汇总阶段状态

### 3. 高级画布层

- `App.tsx`
- `components/SidebarDock.tsx`
- `components/sidebar/AddNodePanel.tsx`
- `components/CanvasContextMenu.tsx`
- `components/WelcomeScreen.tsx`

职责：

- 只暴露通用工作流入口
- 只保留：
  - 文本
  - 图片
  - 视频
  - 音频
  - 图片编辑器
  - 上传素材

### 4. 执行服务层

- `handlers/useNodeActions.ts`
- `server/services/jimengService.js`
- `server/services/jimengJobManager.js`
- `services/jimengApi.ts`
- `services/geminiService.ts`

职责：

- 节点动作执行
- 即梦页面逆向对接
- 结果轮询
- 模型请求与回写

### 5. 存储与同步层

- `services/storage/*`
- `services/syncMiddleware.ts`
- `server/db.js`

职责：

- 画布数据保存
- 资产保存
- 远端同步
- 本地恢复

---

## 现在的产品规则

### 默认规则

- 项目默认进入 **工作流模块**
- 漫剧专用能力只在 **工作流模块** 聚合展示
- 画布不是主入口，而是 **高级模式**

### 画布规则

- 画布左侧加号菜单只显示通用工作流
- 画布右键创建菜单只显示通用工作流
- 欢迎页只显示通用工作流快捷入口
- 漫剧专用节点不再从画布入口直接暴露

### 漫剧工作流规则

- 固定五段式：
  - 剧本
  - 人物资产
  - 分镜
  - 提示词
  - 视频
- 模板负责生成内部节点图
- 用户优先操作阶段，不优先操作底层节点

---

## 后续建议

下一轮最值得继续推进的改造：

1. **阶段表单化**
   - 每个阶段做独立表单，不直接暴露节点细节

2. **工作流执行编排**
   - 阶段完成后自动给下一阶段预填输入

3. **工作流面板升级**
   - 左侧 `workflow` 面板从“保存的分组”升级为“工作流中心”

4. **即梦能力收口**
   - 即梦提交、排队、结果获取，全部只挂在视频阶段

5. **高级模式隔离**
   - 把画布明确标记为“高级模式 / 调试模式”

---

## 一句话总结

**添梯现在的正确产品方向是：工作流是主产品，画布是高级能力；漫剧工作流是核心主线，通用工作流只留在画布加号菜单里。**
