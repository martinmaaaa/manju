# Skills Schema Roadmap

## Goal
- 把 `SkillPack` 从“描述型注册信息”升级成“真正驱动阶段执行的结构化协议”。
- 让 `capabilityEngine` 从手写 prompt/输出拼装器，收口成按 skill schema 调度的执行器。

## Current Scope
- 第一阶段内化三条主链 skill：
  - `seedance-director-v1`
  - `seedance-episode-director-v1`
  - `seedance-art-design-v1`
  - `seedance-storyboard-v1`
- 先打通 `director -> episode -> storyboard` 这条链，因为它直接决定单集工作台、分镜视频条和提示词节点。

## Target Structure
- `SkillExecutionSchema`
  - `systemInstruction`
  - `promptBlocks`
  - `outputContract`
  - `artifactBindings`
  - `reviewConfig`
- `SkillPack`
  - `schemaId`
  - `schema`
  - `assets`
  - `references`
  - `promptRecipes`
- `Review Registry`
  - `review rules`
  - `review profiles`
  - `review policies`

## Phase Plan
1. 建立 skill schema 注册表与通用 helper。
2. 让 `video_prompt_generate` 按 schema 组 prompt、归一化输出、写回 artifacts。
3. 让工作台优先消费结构化 `storyboardShots`。
4. 让 `script_decompose / episode_expand / asset_extract` 也切到 schema 驱动。
5. 把 review gate 从硬编码阶段判断升级成 rule/profile/policy registry。

## Done
- `seedance-storyboard-v1` 已经接入 schema，并驱动 `video_prompt_generate / storyboard_generate / voice_prompt_generate`。
- `seedance-director-v1` 和 `seedance-art-design-v1` 已接入 schema 的 prompt/output/artifact 流。
- `seedance-episode-director-v1` 已新增，`episode_expand` 已纳入 schema 驱动。
- `image_prompt_generate` 已纳入 schema 驱动，补齐了资产链里的提示词阶段。
- `SkillPack` 已升级为 capability 级 schema map，同一个 pack 可以挂多条 capability schema。
- Seedance 官方技能目录已切到 `assets / references` 语义，并通过 manifest loader 进入注册表。
- 官方 schema 已迁入各技能目录的 `schemas/`，不再继续手写在 `server/skillSchemas.js`。
- review gate 已升级为 `review rule -> review profile -> review policy` 三层注册结构。
- 单集工作台的 `shotStrip` 已优先消费结构化 `storyboardShots`。

## Next
- 继续把 `capabilityEngine` 里各 capability 的通用上下文准备抽成更薄的一层调度器。
- 为 schema loader 增加更严格的字段 lint、版本校验和脚本入口约束。
