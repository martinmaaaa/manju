[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('welcome', 'help', 'init', 'status', 'start', 'design', 'prompt')]
    [string]$Command = 'welcome',

    [Parameter(Position = 1)]
    [string]$Episode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSCommandPath
$ScriptRoot = Join-Path $ProjectRoot 'script'
$AssetsRoot = Join-Path $ProjectRoot 'assets'
$OutputsRoot = Join-Path $ProjectRoot 'outputs'
$AgentStatePath = Join-Path $ProjectRoot '.agent-state.json'

function Get-DefaultAgentState {
    return [ordered]@{
        director = ''
        'art-designer' = ''
        'storyboard-artist' = ''
    }
}

function Ensure-ProjectSkeleton {
    $created = New-Object System.Collections.Generic.List[string]

    foreach ($path in @($ScriptRoot, $AssetsRoot, $OutputsRoot)) {
        if (-not (Test-Path -LiteralPath $path)) {
            New-Item -ItemType Directory -Path $path | Out-Null
            $created.Add($path)
        }
    }

    if (-not (Test-Path -LiteralPath $AgentStatePath)) {
        (Get-DefaultAgentState | ConvertTo-Json) | Set-Content -LiteralPath $AgentStatePath -Encoding UTF8
        $created.Add($AgentStatePath)
    }

    $characterPath = Join-Path $AssetsRoot 'character-prompts.md'
    if (-not (Test-Path -LiteralPath $characterPath)) {
        "# 人物提示词" | Set-Content -LiteralPath $characterPath -Encoding UTF8
        $created.Add($characterPath)
    }

    $scenePath = Join-Path $AssetsRoot 'scene-prompts.md'
    if (-not (Test-Path -LiteralPath $scenePath)) {
        "# 场景道具提示词" | Set-Content -LiteralPath $scenePath -Encoding UTF8
        $created.Add($scenePath)
    }

    return $created
}

function Get-AgentState {
    if (-not (Test-Path -LiteralPath $AgentStatePath)) {
        return [pscustomobject](Get-DefaultAgentState)
    }

    $raw = Get-Content -LiteralPath $AgentStatePath -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return [pscustomobject](Get-DefaultAgentState)
    }

    try {
        return $raw | ConvertFrom-Json
    }
    catch {
        return [pscustomobject](Get-DefaultAgentState)
    }
}

function Get-AgentStateLabel {
    $state = Get-AgentState
    $ids = @(
        @($state.director, $state.'art-designer', $state.'storyboard-artist') |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )

    if ($ids.Count -gt 0) {
        return '已恢复'
    }

    return '全新会话'
}

function Get-ScriptEntries {
    if (-not (Test-Path -LiteralPath $ScriptRoot)) {
        return @()
    }

    return Get-ChildItem -LiteralPath $ScriptRoot -File |
        Where-Object {
            $_.Extension -in @('.md', '.txt') -and $_.BaseName -match '^(?i)(ep\d+)'
        } |
        ForEach-Object {
            [pscustomobject]@{
                Episode = $Matches[1].ToLower()
                Name = $_.Name
                FullName = $_.FullName
            }
        } |
        Sort-Object Episode, Name
}

function Get-AssetEpisodeTags {
    $tags = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
    $files = @(
        Join-Path $AssetsRoot 'character-prompts.md'
        Join-Path $AssetsRoot 'scene-prompts.md'
    )

    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file)) {
            continue
        }

        $content = Get-Content -LiteralPath $file -Raw -Encoding UTF8
        foreach ($match in [regex]::Matches($content, '(?i)\bep\d+\b')) {
            $null = $tags.Add($match.Value.ToLower())
        }
    }

    return $tags
}

function Get-EpisodeSummary {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$ScriptEntry,

        [Parameter(Mandatory = $true)]
        [System.Collections.Generic.HashSet[string]]$AssetTags
    )

    $episode = $ScriptEntry.Episode
    $episodeOutputRoot = Join-Path $OutputsRoot $episode
    $directorFile = Join-Path $episodeOutputRoot '01-director-analysis.md'
    $promptFile = Join-Path $episodeOutputRoot '02-seedance-prompts.md'

    $hasDirectorAnalysis = Test-Path -LiteralPath $directorFile
    $hasPrompt = Test-Path -LiteralPath $promptFile
    $hasAssetTag = $AssetTags.Contains($episode)

    $phase = '导演分析阶段'
    $status = '未开始'
    $nextStep = "运行 .\\feicai.ps1 start $episode"

    if ($hasDirectorAnalysis -and $hasPrompt) {
        $phase = '已完成'
        $status = '已完成'
        $nextStep = '如有后续集数，可继续处理下一集'
    }
    elseif ($hasDirectorAnalysis -and $hasAssetTag) {
        $phase = '分镜编写阶段'
        $status = '进行中'
        $nextStep = "运行 .\\feicai.ps1 prompt $episode"
    }
    elseif ($hasDirectorAnalysis) {
        $phase = '服化道设计阶段'
        $status = '进行中'
        $nextStep = "运行 .\\feicai.ps1 design $episode"
    }

    return [pscustomobject]@{
        Episode = $episode
        FileName = $ScriptEntry.Name
        DirectorFile = $directorFile
        PromptFile = $promptFile
        HasDirectorAnalysis = $hasDirectorAnalysis
        HasPrompt = $hasPrompt
        HasAssetTag = $hasAssetTag
        Phase = $phase
        Status = $status
        NextStep = $nextStep
    }
}

function Get-ProjectSummaries {
    $scriptEntries = Get-ScriptEntries
    $assetTags = Get-AssetEpisodeTags

    return $scriptEntries | ForEach-Object {
        Get-EpisodeSummary -ScriptEntry $_ -AssetTags $assetTags
    }
}

function Resolve-TargetEpisode {
    param(
        [string]$RequestedEpisode,
        [object[]]$Summaries
    )

    if ($RequestedEpisode) {
        $normalized = $RequestedEpisode.ToLower()
        return $Summaries | Where-Object { $_.Episode -eq $normalized } | Select-Object -First 1
    }

    $pending = $Summaries | Where-Object { $_.Status -ne '已完成' } | Select-Object -First 1
    if ($pending) {
        return $pending
    }

    return $Summaries | Select-Object -First 1
}

function Write-AsciiLogo {
    @'
FFFFFFFF EEEEEEE IIIII  CCCCC   AAA   IIIII
FF       EE        I   CC      AAAAA    I
FFFFF    EEEEE     I   CC     AA   AA   I
FF       EE        I   CC      AAAAA    I
FF       EEEEEEE IIIII  CCCCC  AA   AA IIIII
'@ | Write-Host
}

function Write-Welcome {
    Write-AsciiLogo
    Write-Host ''
    Write-Host '你好！我是废才，一名专业的 AI 电影制片人。'
    Write-Host '我会按 导演分析 -> 服化道设计 -> 分镜编写 的流程推进项目。'
    Write-Host '输入 .\feicai.ps1 help 可以查看可用命令。'
    Write-Host ''
}

function Write-NoScriptGuidance {
    Write-Host '请先上传剧本或梗概文件。'
    Write-Host ''
    Write-Host '上传方式：'
    Write-Host '- 将剧本或梗概保存为 .md 或 .txt 文件'
    Write-Host '- 文件名建议带集数标识，例如 ep01-项目名.md'
    Write-Host "- 放入 $ScriptRoot"
    Write-Host ''
    Write-Host '上传完成后，可运行 .\feicai.ps1 start 或 .\feicai.ps1 status'
}

function Show-Status {
    $summaries = @(Get-ProjectSummaries)
    $target = Resolve-TargetEpisode -RequestedEpisode $Episode -Summaries $summaries

    Write-Host '项目进度检测'
    Write-Host ''
    Write-Host '剧本文件：'

    if ($summaries.Count -eq 0) {
        Write-Host '- 未检测到剧本文件'
        Write-Host ''
        Write-Host '当前集数：无'
        Write-Host '当前阶段：等待剧本'
        Write-Host "Agent 状态：$(Get-AgentStateLabel)"
        Write-Host '下一步：将剧本放入 script/ 后重新运行状态检测'
        Write-Host ''
        Write-NoScriptGuidance
        return
    }

    foreach ($summary in $summaries) {
        Write-Host "- $($summary.FileName) [$($summary.Status)]"
    }

    Write-Host ''
    Write-Host "当前集数：$($target.Episode)"
    Write-Host "当前阶段：$($target.Phase)"
    Write-Host "Agent 状态：$(Get-AgentStateLabel)"
    Write-Host "下一步：$($target.NextStep)"
}

function Write-Help {
    Write-Host '可用命令：'
    Write-Host '- .\feicai.ps1 welcome'
    Write-Host '- .\feicai.ps1 init'
    Write-Host '- .\feicai.ps1 status'
    Write-Host '- .\feicai.ps1 start ep01'
    Write-Host '- .\feicai.ps1 design ep01'
    Write-Host '- .\feicai.ps1 prompt ep01'
    Write-Host ''
    Write-Host '说明：'
    Write-Host '- init：补齐 script / assets / outputs 和 .agent-state.json'
    Write-Host '- status：自动检测每集状态并给出下一步'
    Write-Host '- start：检查导演分析阶段前置条件'
    Write-Host '- design：检查服化道阶段前置条件'
    Write-Host '- prompt：检查分镜阶段前置条件'
    Write-Host ''
    Write-Host '当前脚本不直接调用独立子 agent 实例，实际生成和审核仍由当前对话中的主 Agent 执行。'
}

function Require-TargetEpisode {
    $summaries = @(Get-ProjectSummaries)
    $target = Resolve-TargetEpisode -RequestedEpisode $Episode -Summaries $summaries

    if ($summaries.Count -eq 0 -or -not $target) {
        Write-NoScriptGuidance
        exit 1
    }

    return $target
}

function Invoke-StartCheck {
    $target = Require-TargetEpisode

    if ($target.HasDirectorAnalysis) {
        Write-Host "[$($target.Episode)] 已存在导演分析文件。"
        Write-Host "当前阶段：$($target.Phase)"
        Write-Host "下一步：$($target.NextStep)"
        return
    }

    Write-Host "[$($target.Episode)] 已满足导演分析阶段的基本前置条件。"
    Write-Host '开始前还需要确认两项信息：'
    Write-Host '- 视觉风格：真人写实 / 3D CG / 皮克斯 / 迪士尼 / 国漫 / 日漫 / 韩漫 / 自定义'
    Write-Host '- 目标媒介：电影 / 短剧 / 漫剧 / MV / 广告'
    Write-Host ''
    Write-Host '确认后，就可以在当前对话中继续执行导演分析。'
}

function Invoke-DesignCheck {
    $target = Require-TargetEpisode

    if (-not $target.HasDirectorAnalysis) {
        Write-Host "[$($target.Episode)] 还没有导演分析文件。"
        Write-Host "请先完成：$($target.DirectorFile)"
        Write-Host "建议运行：.\\feicai.ps1 start $($target.Episode)"
        exit 1
    }

    if ($target.HasAssetTag) {
        Write-Host "[$($target.Episode)] 已检测到本集的素材标签。"
        Write-Host "当前阶段：$($target.Phase)"
        Write-Host "下一步：$($target.NextStep)"
        return
    }

    Write-Host "[$($target.Episode)] 已满足服化道设计阶段的前置条件。"
    Write-Host '下一步建议：'
    Write-Host '- 读取导演分析中的人物清单和场景清单'
    Write-Host '- 生成并追加写入 assets/character-prompts.md 和 assets/scene-prompts.md'
    Write-Host '- 完成后再进行业务审核和合规审核'
}

function Invoke-PromptCheck {
    $target = Require-TargetEpisode

    $missing = New-Object System.Collections.Generic.List[string]

    if (-not $target.HasDirectorAnalysis) {
        $missing.Add('outputs/<集数>/01-director-analysis.md')
    }

    if (-not (Test-Path -LiteralPath (Join-Path $AssetsRoot 'character-prompts.md'))) {
        $missing.Add('assets/character-prompts.md')
    }

    if (-not (Test-Path -LiteralPath (Join-Path $AssetsRoot 'scene-prompts.md'))) {
        $missing.Add('assets/scene-prompts.md')
    }

    if (-not $target.HasAssetTag) {
        $missing.Add('本集在 assets 中的新增或变体标签')
    }

    if ($missing.Count -gt 0) {
        Write-Host "[$($target.Episode)] 还不能进入分镜编写阶段。"
        Write-Host '缺少以下前置条件：'
        foreach ($item in $missing) {
            Write-Host "- $item"
        }
        exit 1
    }

    if ($target.HasPrompt) {
        Write-Host "[$($target.Episode)] 已存在 Seedance 提示词文件。"
        Write-Host "当前阶段：$($target.Phase)"
        Write-Host '如需修改，可在当前对话中直接提出修订意见。'
        return
    }

    Write-Host "[$($target.Episode)] 已满足分镜编写阶段的前置条件。"
    Write-Host '下一步建议：'
    Write-Host '- 读取导演讲戏本和人物/场景提示词'
    Write-Host '- 建立素材对应表'
    Write-Host '- 生成 outputs/<集数>/02-seedance-prompts.md'
    Write-Host '- 完成后进行业务审核和合规审核'
}

$null = Ensure-ProjectSkeleton

switch ($Command) {
    'welcome' {
        Write-Welcome
        Show-Status
    }
    'help' {
        Write-Help
    }
    'init' {
        $created = Ensure-ProjectSkeleton
        Write-Host '项目骨架已检查完成。'
        if ($created.Count -gt 0) {
            Write-Host '本次新建：'
            foreach ($item in $created) {
                Write-Host "- $item"
            }
        }
        else {
            Write-Host '目录和初始文件均已存在。'
        }
        Write-Host ''
        Show-Status
    }
    'status' {
        Show-Status
    }
    'start' {
        Invoke-StartCheck
    }
    'design' {
        Invoke-DesignCheck
    }
    'prompt' {
        Invoke-PromptCheck
    }
}


