# 视频模型输入矩阵

## 用法
- 这份文档只记录**当前实测已开放**的 deployment 能力。
- 公开资料宣称支持、但尚未通过本地 runtime 实测的能力，不计入“已开放”。
- 每次新增模型、放开新的参考类型、或调整生成方式，都要同步更新这里。

## 当前矩阵
| Deployment | Family | 生成方式 | 已开放输入槽位 | 当前参数项 | Runtime 映射 |
| --- | --- | --- | --- | --- | --- |
| `grok-video-3@bltcy` | Grok Video 3 | 无 | `promptText`, `referenceImages` | `ratio`, `resolution`, `durationSeconds` | 服务端直连 BLTCY 视频接口 |
| `seedance-2.0@bendi` | Seedance 2.0 | `首尾帧`, `全能参考（多参）` | `promptText`, `startFrame`, `endFrame`, `referenceAssets(image/video/audio x12)` | 暂无已开放参数 | 本地 Jimeng 浏览器逆向任务队列；`全能参考` 已实测支持图片 / 视频 / 音频累加与 `@引用` 菜单 |

## 待验证能力
| Deployment | 待验证项 | 状态 |
| --- | --- | --- |
| `seedance-2.0@bendi` | `全能参考` 端到端生成回收 | 页面与前端状态已实测，尚未点真实生成验证结果回收链 |
| `seedance-2.0@bendi` | 比例 / 清晰度 / 时长 / 生成音频 | 页面参数入口已观测，待补完整 schema 与端到端提交映射 |
| `seedance-2.0@bendi` | `智能多帧` / `主体参考` | 模式入口已观测，尚未纳入当前 deployment schema |

## 更新规则
- 只有“前端可见 + runtime 可执行 + 有过实测”的能力，才能从待验证移到当前矩阵。
- 如果某个能力只是页面上看得到、但还不能稳定回收结果，也仍然留在待验证。
