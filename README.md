# 🎬 HahaHome - AI 驱动的一站式漫剧创作平台

<p align="center">
  <strong>从创意到成片，一个人就是一个团队</strong>
</p>

---

## ✨ 项目简介

**HahaHome** 是一款 AI 驱动的漫剧创作平台，通过直观的节点式工作流，让创作者能够完成从剧本构思到最终视频成片的全流程制作。无需专业团队，一个人即可完成编剧、分镜设计、角色设计、图片生成、视频合成等全部创作环节。

## � 核心功能

### 📝 剧本创作
- **剧本大纲生成** — AI 自动生成完整剧本架构
- **分集剧本** — 自动拆分为多集，每集包含详细对白和场景描述
- **风格预设** — 设定画面风格，统一全剧视觉调性

### � 视觉创作
- **文字生图** — 支持多模型（Gemini Imagen、GPT Image、FLUX 等），可配置分辨率、比例、画质
- **角色设计** — AI 生成角色三视图和多种表情
- **分镜生成** — 根据剧本自动生成分镜画面
- **图片裁剪 & 融合** — 内置图片编辑工具

### 🎬 视频制作
- **图生视频** — 将分镜画面转化为动态视频片段
- **Sora 2 集成** — 接入 OpenAI Sora 进行高质量视频生成
- **视频编辑器** — 内置剪辑工具，支持片段拼接和导出
- **配音 & 音效** — Sonic Studio 音频生成

### � 工作流引擎
- **节点式画布** — 拖拽连线，自由组合创作流程
- **工作流模板** — 保存和复用常用创作流程
- **多项目管理** — 支持多个项目独立管理
- **智能模型降级** — 主模型不可用时自动切换备选模型

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React + TypeScript |
| 构建工具 | Vite |
| 状态管理 | Zustand |
| 桌面端 | Tauri (Windows / macOS) |
| AI 模型 | Gemini、GPT、FLUX、Sora 2、Kling、Luma、Runway |
| 在线部署 | Vercel |

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18.0.0
- npm ≥ 8.0.0
- 现代浏览器（Chrome / Edge / Safari）

### 安装运行

```bash
# 克隆项目
git clone https://github.com/martinmaaaa/manju.git
cd manju

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:5173 即可使用。

### 配置 API Key

首次使用需要配置 AI 模型的 API Key：

1. 打开项目列表页，点击右上角 **⚙ 系统设置**
2. 在「基础设置」中选择 API 提供商（Gemini / 云雾 / 自定义）
3. 输入对应的 API Key 并保存

## � 项目结构

```
hahahome/
├── App.tsx              # 主应用组件
├── components/          # UI 组件
│   ├── nodes/           # 节点组件（核心）
│   ├── SettingsPanel.tsx # 全局设置面板
│   └── ...
├── handlers/            # 节点动作处理器
├── services/            # AI 服务层（Gemini、LLM Providers）
├── stores/              # 状态管理 (Zustand)
├── hooks/               # 自定义 Hooks
├── utils/               # 工具函数
├── src/i18n/            # 国际化（中/英文）
├── src-tauri/           # Tauri 桌面端配置
└── public/              # 静态资源
```

## 🌐 部署

### Vercel（在线版）

项目已配置 `vercel.json`，连接 GitHub 后可一键部署。

### Tauri（桌面版）

```bash
# 需要安装 Rust 环境
npm run tauri build
```

支持 Windows (.exe) 和 macOS (.dmg) 打包。

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

原项目来自 [AIYOU](https://github.com/yubowen123/AIYOU_open-ai-video-drama-generator)，由光波开发。
