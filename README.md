# AIYOU Online Workflow

在线版漫剧生产系统，采用 `Project Workflow + Canvas Studio` 双模式。

## 核心结构

- `Project Workflow`
  - 项目创建与剧本上传
  - 剧本拆解与故事圣经
  - 资产锁定
  - 剧集列表
  - 单集工作台
- `Canvas Studio`
  - 文本、图片、音频、视频多模态沙盒
  - 可复制导入项目资产
  - 不回写项目主数据

## 本地开发

### 前端

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

### 服务端

```bash
npm --prefix server install
npm run server:dev
```

默认接口：`http://localhost:3001/api`

### 数据库

```bash
docker compose -f docker-compose.db.yml up -d
```

默认连接串：`postgresql://postgres:postgres@localhost:5433/aiyou`

## 环境变量

- 根目录：`.env.example`
- 服务端：`server/.env.example`

## 当前实现要点

- 在线端优先，不再包含桌面端壳子
- 最小登录体系：`email + password + session cookie`
- 模型按能力选择，不使用全局 current provider
- Seedance 2.0 技能包作为第一版官方技能库来源

## License

[MIT](./LICENSE)
