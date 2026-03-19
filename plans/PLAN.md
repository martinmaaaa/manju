# 漫剧在线系统重构计划（吸收 Seedance Skills 作为首套官方技能库）

## Summary
- 产品改为双模式：`Project Workflow` 是主线，`Canvas Studio` 是独立多模态沙盒。
- 画布保留并支持文本、图片、音频、视频，但分成两种持久化语义：
  - `EpisodeWorkspaceCanvas`：项目内单集工作台，只承接本集上下文
  - `StudioCanvas`：全局沙盒，可复制导入项目资产，但永不回写项目
- 模型“和厂商解耦”的具体含义是：系统不再有全局当前供应商；每个模型都是独立注册单元，带自己的 `vendor / modality / capability / config`，能力直接绑定模型 ID。
- `video_prompt_generate` 作为显式能力保留；不同“视频提示词描述风格”不做成不同模型，而做成不同 `SkillPack / PromptRecipe`。
- `Seedance 2.0 AI 分镜师团队` 作为第一版官方 stage skill library 的来源材料，重组后进入正式产品，而不是继续以文件夹工作流直接运行。

## Implementation Changes
### 1. 产品信息架构
- 主流程固定为：`项目创建/剧本上传 -> 剧本拆解 -> 资产锁定 -> 剧集列表 -> 单集工作台`。
- 项目入口支持 `文本粘贴 + docx/pdf`，创建 `Project + ScriptSource`。
- 单集工作台进入时只注入：项目设定、锁定资产、前文摘要、连续性状态；不继承上一集整张旧画布。
- 资产栏在单集工作台常驻显示；画布上仍可放文本、图片、音频、视频节点。

### 2. 模型层、能力层、技能层
- 新增核心注册模型：
  - `ModelDefinition { id, vendor, modality, capabilities, configSchema, adapter }`
  - `CapabilityDefinition { id, inputSchema, outputSchema, defaultModelId, allowedModelIds }`
  - `SkillPack { id, stageKind, promptMethodology, assets, references, reviewPolicies }`
- 第一版能力固定包含：
  - `script_decompose`
  - `episode_expand`
  - `asset_extract`
  - `character_generate`
  - `scene_generate`
  - `prop_generate`
  - `image_prompt_generate`
  - `video_prompt_generate`
  - `voice_prompt_generate`
  - `storyboard_generate`
  - `video_generate`
- 模型选择按能力暴露；每个能力有默认模型和候选模型，不提供全局 current provider。
- “不同视频提示词描述能力”落在 `SkillPack / PromptRecipe`，不是模型层；同一个 `video_prompt_generate` 能力可切换不同描述方法。

### 3. Seedance Skills 的产品化落地
- 将 [Seedance 2.0 AI 分镜师团队/skills](C:/Users/marti/Desktop/Code/aiyou/Seedance%202.0%20AI%20%E5%88%86%E9%95%9C%E5%B8%88%E5%9B%A2%E9%98%9F/skills) 重组为第一版官方技能库，并以结构化数据入库，不在运行时直接解析 Markdown 文件夹。
- 将 [Seedance 2.0 AI 分镜师团队/AGENTS.md](C:/Users/marti/Desktop/Code/aiyou/Seedance%202.0%20AI%20%E5%88%86%E9%95%9C%E5%B8%88%E5%9B%A2%E9%98%9F/AGENTS.md) 里的角色分工映射为内部执行角色，不在产品里显式展示 agent 机制。
- 第一版官方技能映射：
  - `director-skill` -> 剧本拆解/导演分析阶段
  - `art-design-skill` -> 资产设计阶段
  - `seedance-storyboard-skill` -> 分镜/视频提示词阶段
  - review skills -> `business review / compliance review` 策略库
- review gate 设计为可配置门禁：
  - 阶段级配置 `ReviewPolicy[]`
  - 默认在 `script_decompose / asset_design / video_prompt_generate` 开启
  - 门禁未通过时阶段不能推进

### 4. 领域模型与 API
- 重建核心实体：
  - `User`
  - `Project`
  - `ProjectMember { role: owner | admin | editor }`
  - `ProjectSetup`
  - `StageSkillSelection`
  - `StoryBible`
  - `CanonicalAsset`
  - `AssetLock`
  - `Episode`
  - `EpisodeContext`
  - `EpisodeWorkspace`
  - `StudioWorkspace`
  - `CapabilityRun`
  - `WorkflowRun`
- 资产锁定采用严格锁定：单集只能使用 locked canonical assets；仅 `owner/admin` 可解锁。
- 需要新增或重构的接口：
  - `POST /auth/register|login|logout`, `GET /me`
  - `POST /projects`, `POST /projects/:id/script-source`
  - `GET/PATCH /projects/:id/setup`
  - `GET /skill-packs`, `GET /review-policies`
  - `GET/PATCH /projects/:id/stage-config`
  - `GET/POST /projects/:id/assets`, `POST /assets/:id/lock|unlock`
  - `GET /projects/:id/episodes`, `POST /projects/:id/episodes/:episodeId/analyze`
  - `GET /episodes/:id/context`, `GET /episodes/:id/workspace`
  - `POST /studio/workspaces`, `POST /studio/workspaces/:id/import-project-assets`
  - `GET /models`, `GET /capabilities`, `POST /capability-runs`

## Test Plan
- 剧本入口：文本、docx、pdf 创建项目成功；不支持格式失败。
- 模型层：同厂商多个模型可并存；同能力切换模型不影响其他能力。
- 技能层：Seedance 官方技能库可被查询、选择、微调；不同 `video_prompt` recipe 输出风格不同。
- Review gate：业务审查或合规审查失败时阶段阻塞；通过后才能推进。
- 资产锁定：`editor` 不能解锁；单集无法绕过 locked asset。
- 单集上下文：进入工作台只承接设定、锁定资产、前文摘要、连续性状态。
- Studio：可复制导入项目资产；导入后修改不影响项目；Studio 产物不回写项目。
- 兼容策略：旧项目不迁移，新体系只服务新项目。

## Assumptions
- 本次为破坏式重建，不迁移旧项目和旧工作流数据。
- 最小登录体系纳入本次重构，采用应用自带 `email + password + session cookie`。
- `Seedance 2.0 AI 分镜师团队` 作为首套官方技能库的来源材料，运行态使用结构化 skill records，不直接依赖原始文件夹。
- 产品界面不显式展示 `director / art-designer / storyboard-artist` 这些 agent 名称，只展示阶段和能力。
