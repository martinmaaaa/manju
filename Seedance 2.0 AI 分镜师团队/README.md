# 废才 Seedance 2.0 制片工作流

这个目录现在已经补齐为可开工的项目骨架，核心入口如下：

- `script/`：放用户剧本或梗概
- `assets/`：累积人物和场景提示词
- `outputs/`：每集导演分析和 Seedance 提示词产出
- `.agent-state.json`：记录三个子 agent 的会话状态占位
- `feicai.ps1`：初始化、状态检测和阶段前置检查入口

## 快速开始

1. 把剧本放进 `script/`，文件名建议使用 `ep01-xxx.md`。
2. 在根目录运行 `.\feicai.ps1 welcome` 或 `.\feicai.ps1 status`。
3. 根据状态提示进入下一步：
   - `.\feicai.ps1 start ep01`
   - `.\feicai.ps1 design ep01`
   - `.\feicai.ps1 prompt ep01`

## 说明

- 当前脚本负责项目路由、状态检测和前置检查。
- 实际内容生成与审核仍由当前对话中的主 Agent 按 `AGENTS.md` 流程执行。
