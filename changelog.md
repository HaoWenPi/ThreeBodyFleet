# changelog

「三体世界 · 自然选择号深空航行模拟」版本变更记录。
**每次版本更新必须在本文件追加一条记录**，并与 git tag、Gitee `main`、资料库云端页面保持一致。

## 维护约定

1. 版本号采用语义化 `MAJOR.MINOR.PATCH`（架构/破坏性变化、新功能、修复与参数微调），git 附注 tag 名为 `vX.Y.Z`。
2. 发版顺序固定：更新代码 → 在本文件追加条目 → 提交 → 打 tag → 推送 Gitee `main` 与 tag → 按项目交付链路同步资料库云端编辑态并发布 → 回填「交付对齐」。
3. 条目只记录**本版相对上一版的增量**（首个版本汇总此前迭代），分类固定为：新增 / 变更 / 修复 / 文档 / 运维。
4. 量化数据必须可溯源（文件名、字节数、校验结果、提交号）；未知数据留空，不猜测、不把概念设计写成已完成成果。
5. 历史条目不得改写；写错时发新版本修订并在新条目中说明。
6. 仅新增文档或 tag、运行代码零差异时，云端发布态无需新建事务，但必须完成「本地 / Gitee blob / 编辑态 / 发布态」一致性核验并在条目中说明。

## 版本索引

| 版本 | 日期 | git tag | 摘要 |
| --- | --- | --- | --- |
| [1.0.0](#100---2026-11-06) | 2026-11-06 | `v1.0.0` | 首个正式版本基线 |

---

## [1.0.0] - 2026-11-06

首个正式版本基线，汇总 2026-11-04 ~ 11-06 的全部迭代。对应资料库云端编辑态 / 发布态 **v15**（CDN 前缀 `uax0PgclmifO`），Gitee `main` 基于 `81b3d66` 的基线提交（含本文件），tag `v1.0.0`。

### 新增

- 深空航行场景：Three.js r150（本地 `vendor/three.min.js`，普通 script + 全局 `THREE`），`file://` 双击即可离线运行，不依赖 GLTFLoader；星场、星云、跃迁速度线、边缘蓝移、暗角与扫描线视觉层。
- 自然选择号旗舰 + **11 艘差异化僚舰**（巡洋 / 护卫 / 侦察 / 补给 4 种舰型，尺寸与响应特性各异）；弹簧-阻尼编队与四元数 slerp 转向，**5 套阵型**（楔形前锋 / 环形护卫 / 双列巡航 / 战列横队 / 松散巡航，F 键切换）。
- 四档航行：停车 / 前进一 `0.025c` / 前进二 `0.050c` / 前进三 `0.075c` / 前进四 `0.100c` 跃迁（线性梯度，游戏化设定，非原著数据）；三层递进尾焰、星场拖尾、FOV 与光强联动；HUD、雷达、第三人称跟随相机。
- 结构化 STL 旗舰 `models/NaturalSelection-Structured/`：源 STL **60,382 面 / 29,935 焊接顶点**，10 个语义部位各占独立贴图槽，4 张 2048² atlas；含 `manifest.json`、`bindings.json`、标准 GLB、内联 JS 与 `交付说明.md`；`tools/validate_bindings.py` **22 项校验 PASS**（含反向验证）。
- 交互预览 `preview-structured.html`（PBR / 灰模 / 分区 × 视角 × 部位隔离）与在线报告 `model-report.html`。
- 移动端：双指缩放与绕舰环绕视角、小屏 HUD 自动折叠为 5 个图标、`?compact=1|0` 强制模式。
- WebAudio 引擎声：噪声 → 带通扫频 LFO → 卷积混响 + 气笛脉动 + 轻和声垫构成的空灵气流。
- 深链参数：`?hull=glb|structured`、`?normal=1`、`?yaw=0`、`?compact=1|0`、`?orbit=<deg>&pitch=<deg>`、`?autostart=1&gear=<0-4>&instant=1`、`?formation=<0-4>`、`?roll=1`。
- 无头验证诊断钩子：`__NS_VIEW__` / `__NS_VIEW_STATE__` / `__NS_FLAME__` / `__NS_DRIVE__` / `__NS_CAM__` / `__NS_AUDIO__` / `__NS_BRIDGE__` / `__NS_MODEL_OK__` / `__NS_HULL_STRUCTURED__` / `__NS_NOZZLES__` / `__NS_NOZZLE_FX__`。

### 变更

- 默认旗舰由上一代 GLB 替换为结构化 STL 版；`?hull=glb` 回退 GLB（150 万 → 15 万面、3 张 2048 WebP 内联于 `ship-model.js` 7,462,253 B、净化涂装 + 哑光硬表面、默认停用高频 normalMap），结构化载荷缺失时自动补载 GLB。
- 模型本体旋转 180°，使舰首朝前、尾焰留在 `+Z` 船尾。
- 视角语义：`zoom` 为相机距离倍率，UI 显示 `1/zoom`；双指平移改为绕舰环绕（水平 `-= mx·2π`、垂直 `-= my·0.8π`，夹紧 ±1.25 rad）。
- 档位由指数式改为线性 `0 / 0.025 / 0.050 / 0.075 / 0.100`，所有速度相关视觉量统一由 `driveNorm = speedC / 0.1` 驱动。
- 引擎声由低频锯齿轰鸣改为空灵气流，`initAudio()` 显式 `resume()`。
- 四喷口坐标改为运行时从模型顶点导出：上排 2 束蓝 = `aft_booms` 末端 `z=38` 端面，下排 2 束红 = `ring_outer` 下缘后部两个金色 U 形框；蓝色火焰不压扁截面（`flat=1.0`）占满喷口，发光中心 `fy = cy - hy×1.47 ≈ 1.351`，跃迁档收敛以防加法混合过曝。

### 修复

- 「进入舰桥」点击无反应：`index.html` `<head>` 最前增加 `window.__NS_BRIDGE__` 早绑定（window 捕获 + 事件委托），`app.js` 的 `enterBridge()` 在 `pending` 时补执行，规避 9 MB 舰体数据加载空窗与平台节点重排。
- 页面卡在「舰 桥 接 入 中 …」：云端 `app.js` 的 MIME 被写成 `application/x-www-form-urlencoded`，CDN `nosniff` 使 Chrome 拒绝执行；v15 重传同名文件并携带 `Content-Type: application/javascript` 修复（代码零改动）。
- 蓝色尾焰相对喷口偏上约 15px：按几何导出的引擎舱半高整体下移发光中心，同机位截图像素量化偏差收敛到 <1px；跃迁档无大片纯白过曝。
- 双指垂直环绕方向反了、缩放百分比显示反向、窄屏 HUD 触摸目标被 flex 压小等问题。

### 文档与运维

- 构建 / 校验工具：`tools/build_structured_ship.py`、`tools/validate_bindings.py`、`tools/build_ship_model.py`。
- Gitee 仓库 `git@gitee.com:HaoWenPi/ThreeBodyFleet.git`：基于初始提交 `fc175bc` 建立 `main` 并设为服务端默认分支，**38 个受控文件 / 约 58 MB**；`.gitignore` 排除 `.workbuddy/`，`.gitattributes` 固定 `eol=lf`（避免 Windows 检出 CRLF 导致与云端产物字节不一致）；未启用 Git LFS。
- 资料库云端页面 `Ipkm3BuUttxgpr9CywzevY`：编辑态与发布态均为 v15，公开链接 https://workbuddy.link/p/Ipkm3BuUttxgpr9CywzevY 。
- 基线校验：`node --check` 4 个 JS 全过、`validate_bindings.py` 22/22 PASS、推送前 `pre_push_audit.py` 敏感文件 0 / 语法 0 失败、浅克隆 38/38 文件与本地逐字节一致。

### 交付对齐

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| Gitee `main` | tag `v1.0.0`（基于 `81b3d66`，含本文件） | 一致 |
| 资料库编辑态 | v15 / `uax0PgclmifO` | `app.js` 101,187 B、`style.css` 19,537 B 逐字节一致；`index.html` 为平台注入版 25,221 B（标注 225 / 155 / 1） |
| 资料库发布态 | v15 / `uax0PgclmifO` | 与编辑态逐字节一致；6 个资源 MIME 全部正确 |
| 核心文件 | `app.js` md5 `2c73e8a9d3` | — |

本版仅新增 `changelog.md` 与 git tag，页面运行文件零差异，故未新建云端事务或重新发布；已按维护约定完成四链路一致性核验。

> 注：`models/NaturalSelection-Structured/manifest.json` 中的 `version: 1.0.0` 是**模型包自身版本**，与本程序版本相互独立。
