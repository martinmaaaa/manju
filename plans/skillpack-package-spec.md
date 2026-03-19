# SkillPack 包规范

## 目标
- 把外部技能目录统一收口成系统可加载、可校验、可执行的技能包。
- 技能包目录采用 `assets / references / scripts / schemas` 四层结构。
- 运行时通过 manifest + schema + 资源索引装载，不再手写包清单。

## 目录结构
```text
your-skill-source/
  SKILL.md
  skillpack.director.json
  skillpack.storyboard.json
  schemas/
    *.json
  assets/
    *.md
    *.json
  references/
    *.md
    *.json
  scripts/
    *.js
    *.py
    *.ps1
```

## 目录职责
- `SKILL.md`
  - 来源技能的主说明文件。
  - 会自动进入 `references.sourceMaterials`。
- `skillpack.*.json`
  - 技能包入口 manifest。
  - 一个目录可以声明多个 skillpack。
- `schemas/`
  - 结构化执行协议。
  - 定义 `promptBlocks / outputContract / artifactBindings / reviewConfig`。
- `assets/`
  - 运行时资源。
  - 例如 system prompt 模板、block 模板、输出模板。
  - `.md/.txt` 资源会进入 prompt 组装链。
- `references/`
  - 参考资料。
  - 例如 examples、方法说明、外部文档摘录。
  - 会进入导入预览链，并以摘要形式进入 prompt 组装链。
- `scripts/`
  - 可选的确定性脚本。
  - 用于 prompt 前预处理、输出归一化后 enrich、review 前修正。

## Manifest 示例
```json
{
  "id": "seedance-storyboard-v1",
  "name": "Seedance Storyboard",
  "stageKind": "video_prompt_generate",
  "executionRole": "storyboard-artist",
  "schemaId": "seedance-storyboard-core-v1",
  "capabilitySchemaIds": {
    "video_prompt_generate": "seedance-storyboard-core-v1",
    "storyboard_generate": "seedance-storyboard-core-v1",
    "voice_prompt_generate": "seedance-storyboard-core-v1"
  },
  "description": "将单集上下文整理成视频提示词、配音提示词和结构化分镜。",
  "promptMethodology": "先抽 beat，再整理 shot，最后收敛为工作台可消费的分镜结果。",
  "assets": {
    "primaryOutput": "seedance-prompts",
    "artifacts": ["storyboard_beats", "video_prompts", "voice_prompts"]
  },
  "references": {
    "notes": ["references 用于补充方法说明、示例和导入预览。"]
  },
  "scripts": {
    "entries": [
      {
        "id": "normalize-shot-prompt",
        "label": "Normalize shot prompt",
        "path": "normalize-shot-prompt.js",
        "runtime": "node",
        "phase": "after_normalize",
        "description": "对结构化分镜结果做确定性清洗。",
        "timeoutMs": 5000,
        "allowFailure": false
      }
    ]
  },
  "reviewPolicies": ["business-review", "compliance-review"],
  "promptRecipes": [
    {
      "id": "seedance-cinematic-v1",
      "name": "电影感",
      "description": "强调镜头语言、构图和镜头推进。"
    }
  ]
}
```

## Manifest 必填字段
- `id`
- `name`
- `stageKind`
- `executionRole`
- `description`
- `promptMethodology`
- `assets.primaryOutput`
- `schemaId` 或 `capabilitySchemaIds`

## Script Entry 规范
- `scripts.entries` 可选，但一旦声明就必须完整填写：
  - `id`
  - `label`
  - `path`
  - `runtime`
  - `phase`
- 当前支持的 `runtime`
  - `node`
  - `python`
  - `powershell`
- 当前支持的 `phase`
  - `before_prompt`
  - `after_normalize`
  - `before_review`
- `path` 必须位于当前技能包的 `scripts/` 目录内。
- `timeoutMs` 可选，允许范围 `1000-120000` 毫秒。
- `allowFailure` 默认为 `false`。

## Loader 行为
- 递归扫描 `Seedance 2.0 AI 分镜师团队/skills/**/skillpack.*.json`。
- 递归扫描 `Seedance 2.0 AI 分镜师团队/skills/**/schemas/*.json`。
- 加载 manifest 时自动补齐：
  - `source`
  - `assets.directories / assets.files / assets.documents`
  - `references.sourceMaterials / references.directories / references.files / references.documents`
  - `scripts.directories / scripts.files / scripts.entries`
  - `schema / schemasByCapability`

## Lint / 校验规则
- manifest 必填字段不能为空。
- `schemaId` 或 `capabilitySchemaIds` 至少存在一个。
- manifest 的 `stageKind` 必须和所映射 schema 的 `stageKind` 一致。
- schema 版本必须是合法 semver。
- `promptBlocks` 不能缺少 `id / label / template`，且 `id` 不能重复。
- `outputContract` 只能使用系统支持的字段类型。
- `object / object[]` 必须声明 `itemFields`。
- `artifactBindings` 只能使用系统支持的 target group 和 transform。
- `reviewConfig` 引用的 review profile 必须存在。
- `scripts.entries` 的 `runtime / phase / path / timeoutMs` 必须通过校验。

## 运行时边界
- manifest 负责声明技能包入口和资源位置。
- schema 负责定义结构化执行协议。
- `assets/*.md` 会进入 prompt 组装链。
- `references/*.md` 会进入导入预览链，并以摘要形式进入 prompt 组装链。
- `scripts.entries` 负责三个脚本阶段：
  - `before_prompt`：在 prompt 组装前改写结构化输入
  - `after_normalize`：在模型输出归一化后做确定性 enrich/清洗
  - `before_review`：在 review gate 前做最终修正或补充元数据

## 官方包现状
- `Seedance 2.0 AI 分镜师团队/skills/director-skill`
  - `skillpack.director.json`
  - `skillpack.episode.json`
  - `schemas/seedance-director-core-v1.json`
  - `schemas/seedance-episode-expand-core-v1.json`
- `Seedance 2.0 AI 分镜师团队/skills/art-design-skill`
  - `skillpack.asset-design.json`
  - `schemas/seedance-asset-design-core-v1.json`
  - `schemas/seedance-image-prompt-core-v1.json`
- `Seedance 2.0 AI 分镜师团队/skills/seedance-storyboard-skill`
  - `skillpack.storyboard.json`
  - `schemas/seedance-storyboard-core-v1.json`

## 迁移规则
- 外部来源包先对齐到 `assets / references / scripts / schemas` 结构。
- 运行时只认 manifest、schema 和被 loader 索引后的资源对象。
- 后续导入器需要先做“导入预览 + 差异报告 + 人工确认”，不能把原始技能包直接当成可运行包。
