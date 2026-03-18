# 模型底座单一真相

## 目的
- 这份文档是当前项目唯一允许维护的模型底座清单。
- 新工作流之外的旧 `全局 provider`、旧 `视频平台/模型配置`、旧 `Sora provider` 体系已删除，不再作为模型来源。
- 后续新增、下线、替换模型时，必须同时更新这里和服务端注册表，不允许再新增第二套前端本地模型列表。

## 分类规则

### 1. Model Family
- 表示稳定的模型家族，不绑定具体渠道。
- 例子：
- `gemini-3.1-pro`
- `nano-banana-2`
- `grok-video-3`
- `seedance-2.0`

### 2. Provider Adapter
- 表示具体提供商或运行时适配器。
- 例子：
- `bltcy-openai-chat`
- `bltcy-image-generation`
- `bltcy-video-generation`
- `jimeng-video-generation`

### 3. Model Deployment
- 表示前端节点真正选择和执行的对象。
- 一个 deployment 必须明确：
- `deploymentId`
- `familyId`
- `familyName`
- `name`
- `vendor`
- `providerModelId`
- `modality`
- `adapter`
- `inputSchema`
- `configSchema`

## 当前允许存在的 deployment

| deploymentId | familyId | vendor | modality | adapter | 输入能力 | 参数面板 |
| --- | --- | --- | --- | --- | --- | --- |
| `gemini-3.1-pro@bltcy` | `gemini-3.1-pro` | `bltcy` | `text` | `bltcy-openai-chat` | 无上游输入 | `temperature`, `maxOutputTokens` |
| `nano-banana-2@bltcy` | `nano-banana-2` | `bltcy` | `image` | `bltcy-image-generation` | `text`, `image[]` | `aspectRatio`, `imageSize` |
| `grok-video-3@bltcy` | `grok-video-3` | `bltcy` | `video` | `bltcy-video-generation` | `text`, `image[]` | `ratio`, `resolution`, `durationSeconds` |
| `seedance-2.0@bendi` | `seedance-2.0` | `bendi` | `video` | `jimeng-video-generation` | `text`, `image[]` | 当前为空，后续按真实能力补充 |

## 当前代码中的单一注册位置
- 服务端注册表：
- [server/registries.js](C:/Users/marti/Desktop/Code/aiyou/server/registries.js)
- 前端节点类型定义：
- [types/workflowApp.ts](C:/Users/marti/Desktop/Code/aiyou/types/workflowApp.ts)
- 节点执行分发：
- [server/canvasNodeRuntime.js](C:/Users/marti/Desktop/Code/aiyou/server/canvasNodeRuntime.js)
- BLTCY runtime：
- [server/modelRuntime.js](C:/Users/marti/Desktop/Code/aiyou/server/modelRuntime.js)
- Jimeng runtime：
- [server/services/jimengService.js](C:/Users/marti/Desktop/Code/aiyou/server/services/jimengService.js)
- [server/services/jimengJobManager.js](C:/Users/marti/Desktop/Code/aiyou/server/services/jimengJobManager.js)

## 严格约束
- 不允许再新增 `services/modelConfig.ts` 这类前端本地模型总表。
- 不允许再新增 `llmProviders`、`videoProviders`、`videoPlatforms`、`soraProviders` 这种并行模型体系。
- 不允许按“当前全局 provider”决定节点模型。
- 节点最终生效模型只能来自节点自己的 `modelId`。
- `Stage Config` 只能提供默认值，不能成为第二套模型来源。
- deployment 的 `name` 是唯一对外显示名，前端不根据 `vendor` 自动拼接文案，也不做重复检测。

## 同模型多提供商的处理方式
- 同一个模型家族可以有多个 deployment。
- UI 必须按 `familyName` 分组展示 deployment，而不是平铺所有 deployment。
- 例子：
- `sora-2 / yijiapi`
- `sora-2 / yunwu`
- `sora-2 / kie`
- 这种情况下：
- `familyId` 相同。
- `deploymentId` 不同。
- `adapter` 不同。
- `inputSchema` 和 `configSchema` 允许不同。
- 画布节点选择的是 deployment，不是 family。

## 新增模型时必须满足
1. 先确认它属于已有 family 还是新 family。
2. 在 [server/registries.js](C:/Users/marti/Desktop/Code/aiyou/server/registries.js) 新增 deployment，而不是另起一套本地配置中心。
3. 明确填写 `inputSchema` 和 `configSchema`，不能只填名字。
4. 在这份文档里补一行 deployment 记录。
5. 如果是同 family 的新 provider 版本，必须复用 family 语义，不能偷换成全新模型名。

## 下线模型时必须满足
1. 先从 [server/registries.js](C:/Users/marti/Desktop/Code/aiyou/server/registries.js) 删除 deployment。
2. 同步更新这份文档。
3. 如果影响 `Stage Config defaultModelId` 或 `allowedModelIds`，必须同一个改动一起修。

## 维护节奏
- 每次接新模型或替换 provider 时，改代码前先更新这份文档草案。
- 每次合并与模型底座相关的改动前，对照这份文档做一次清点。
- 如果代码和文档冲突，以“先修代码到单一注册表，再更新文档”为准，不允许保留双轨。
