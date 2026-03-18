# 画布节点级模型切换与 Schema 驱动参数面板方案

## Summary
- 目标是把画布升级为真正的多模态生成画布：`text / image / video` 节点都可独立选择模型，并根据模型声明动态展示参数。
- 这套能力属于画布本身，`EpisodeWorkspace` 只是复用它；`Canvas Studio` 和单集工作台共用同一套节点生成机制。
- 模型彼此独立，不存在全局 provider 心智。节点最终生效配置以节点自身为准，`Stage Config` 只负责在单集工作台创建节点或注入 workspace seed 时提供默认值。

## Implementation Changes
### 1. 画布节点模型
- 保留节点类型为 `text / image / video`，不新增独立的 `GeneratorNode` 类型。
- 每个节点扩展为“可执行节点”结构，至少包含：
  - `modelId`
  - `prompt` 或等价文本输入区
  - `params`
  - `inputBindings` 或等价连接输入结果
  - `output`/`preview`
  - `runStatus`、错误信息、最近一次运行结果
- 节点之间继续通过连线传值：
  - `text -> video`
  - `image + text -> video`
  - `image -> image`
  - `text -> image`
- 锁定资产在单集工作台中以独立素材节点存在，通过连线接入目标节点；不做隐式注入，不在节点内部偷偷带入。

### 2. 模型注册与 Schema
- 延续现有 `ModelDefinition` 方向，但把“仅有 `configSchema`”扩展成真正可驱动画布的模型声明。
- 每个模型至少声明：
  - `id / name / vendor / modality / adapter`
  - `capabilities`
  - `inputSchema`
  - `configSchema`
- `inputSchema` 用来声明该模型节点允许接收的上游输入类型与数量。
  - 例如视频模型可声明支持 `text`、`image[]`、`video[]`
  - 前端据此决定节点端口、连线校验、是否允许多参考输入
- `configSchema` 继续作为参数面板唯一来源，前端完全按 schema 自动渲染。
  - 支持 `enum / boolean / number / string / default / min / max`
  - 视频模型参数如 `ratio / resolution / duration / mode / referenceMode`
  - 图片模型参数如 `aspectRatio / imageSize / styleStrength`
- 这一版先不额外引入 UI metadata；前端只基于 `modality + inputSchema + configSchema` 生成行为和参数区。

### 3. 画布交互与工作台整合
- 画布节点 UI 改成接近你给的参考图：
  - 节点内显示输入摘要、模型选择、参数摘要、结果预览
  - 点击模型芯片展开模型列表
  - 点击参数入口展开 schema 驱动参数面板
- `Canvas Studio` 直接使用完整节点级模型切换能力。
- `EpisodeWorkspace` 使用同一套画布组件，但在创建或打开 workspace 时：
  - 根据项目 `Stage Config` 给节点填默认模型和默认 recipe
  - 同时把锁定角色/场景/道具素材放成独立节点，供用户连线到图片/视频节点
- `Stage Config` 保留，但语义改成“默认值提供层”：
  - 例如 `video_generate.modelId` 是新视频节点默认模型
  - `video_prompt_generate.promptRecipeId` 是相关文本/视频节点默认 recipe
  - 节点一旦创建，用户在节点里改模型和参数后，以节点配置为最终生效值

### 4. 运行时与能力映射
- 节点执行不再直接依赖“当前 provider”，而是按节点 `modelId` 找对应模型与适配器。
- 前端执行某节点时，按该节点的 `inputSchema` 从上游连线收集输入，再提交到后端。
- 后端按 `modelId` 分发到独立 runtime：
  - `Grok` 是一个独立视频模型
  - 逆向 `Seedance 2.0 / Jimeng` 是另一个独立视频模型
- 视频节点的参数、输入模式、可接素材类型都由该模型自己的 schema 决定，不再把所有视频模型当成同一种接口。
- 当前重构阶段里，音频不纳入通用方案主线；`Seedance 2.0 / Jimeng` 的特殊音频能力后续单独扩展，不阻塞这次节点级模型体系落地。

## Test Plan
- 文本节点只显示文本模型，图片节点只显示图片模型，视频节点只显示视频模型。
- 切换不同视频模型时，参数面板按各自 `configSchema` 正确变化，旧参数不会污染新模型。
- 连线校验按模型 `inputSchema` 生效：
  - 支持的输入可连接
  - 不支持的输入不可连接或执行时报明确错误
- 单集工作台进入后，节点默认模型来自项目 `Stage Config`，但在节点内改模型后以节点配置生效。
- 锁定资产以独立节点形式进入工作台，可被图片/视频节点显式引用。
- `Canvas Studio` 与 `EpisodeWorkspace` 使用同一套节点执行与参数渲染逻辑，不出现一边能切模型一边不能切的分叉。
- `video_generate` 运行时能根据不同 `modelId` 走不同适配器，不再把视频模型统一按同一请求格式硬套。

## Assumptions
- 本轮主线只覆盖 `text / image / video` 三类节点；音频能力暂不作为通用画布模型体系的一部分推进。
- `Stage Config` 继续保留在项目流中，但仅作为默认值层，不锁定节点最终选择。
- 模型差异优先通过 `inputSchema + configSchema` 表达；这一版不额外引入展示用 UI metadata。
- 单集工作台仍属于 `Project Workflow` 主链路，`Canvas Studio` 仍是独立沙盒，但两者复用同一画布节点能力。
