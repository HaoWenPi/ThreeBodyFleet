# changelog

「三体世界 · 自然选择号深空航行模拟」版本变更记录。
**每次版本更新必须在本文件追加一条记录**，并与 git tag、GitHub（主仓库）/ Gitee（镜像）的 `main`、资料库云端页面保持一致。

## 维护约定

1. 版本号采用语义化 `MAJOR.MINOR.PATCH`（架构/破坏性变化、新功能、修复与参数微调），git 附注 tag 名为 `vX.Y.Z`。
2. 发版顺序固定：更新代码 → 在本文件追加条目 → 提交 → 打 tag → 同步推送 `main` 与 tag 到 GitHub（主仓库）及 Gitee（镜像）→ 按项目交付链路同步资料库云端编辑态并发布 → 回填「交付对齐」。
3. 条目只记录**本版相对上一版的增量**（首个版本汇总此前迭代），分类固定为：新增 / 变更 / 修复 / 文档 / 运维。
4. 量化数据必须可溯源（文件名、字节数、校验结果、提交号）；未知数据留空，不猜测、不把概念设计写成已完成成果。
5. 历史条目不得改写；写错时发新版本修订并在新条目中说明。
6. 仅新增文档或 tag、运行代码零差异时，云端发布态无需新建事务，但必须完成「本地 / GitHub blob / Gitee blob / 编辑态 / 发布态」一致性核验并在条目中说明。
7. 双仓库（2026-11-06 起）：`origin` = GitHub `git@github.com:HaoWenPi/ThreeBodyFleet.git` 为主仓库（fetch 源、`main` 上游），并配置两条 push URL 同时推送 GitHub 与 Gitee；`gitee` = Gitee 镜像远端，用于单独核验。一次 `git push` / `git push --tags` 即双端同步，发版后须分别核验两端 HEAD 与 tag 一致。

## 版本索引

| 版本 | 日期 | git tag | 摘要 |
| --- | --- | --- | --- |
| [1.0.0](#100---2026-11-06) | 2026-11-06 | `v1.0.0` | 首个正式版本基线 |
| [1.0.1](#101---2026-11-06) | 2026-11-06 | `v1.0.1` | HUD 版本号 · 按钮误触航向修复 · 双指旋转放宽 |
| [1.0.2](#102---2026-11-06) | 2026-11-06 | `v1.0.2` | 三球体加载圈 · 开场层精简 · 指针交互 |

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

---

## [1.0.1] - 2026-11-06

### 新增

- HUD 舰籍面板新增「程序版本 `v1.0.1`」数据行（`#hud-version`，由 `app.js` 运行时创建并复用 `.kv` 行样式，**未改动托管平台注入过的 `index.html`**）；小屏 HUD 折叠时版本号写入折叠按钮提示。
- 新增版本常量 `APP_VERSION`，以及无头验证钩子 `window.__NS_VERSION__` / `window.__NS_GESTURE__`。

### 变更

- 双指手势判定重写：逐帧比较两指间距，间距变化超过 `1.5px` 判为捏合缩放，**间距稳定即用两指中心位移环绕观察**。不再要求两指平齐或完全同向，也不再把整段手势锁死在一个意图里——手指重新稳住即可从缩放切回旋转。水平 / 垂直环绕系数、线性档位与相机层均不变。
- 操作手册与开场提示文案同步改为「双指平移 · 间距不变 / 不要求两指平齐」，删除「同向拖动」表述；手势模块注释同步更新。

### 修复

- **点击 HUD / 工具栏按钮会意外改变航向**：全局 `mousemove` 原先无条件按屏幕坐标写 `state.mouseNX / mouseNY`，而档位条与工具按钮位于屏幕边缘，鼠标移过去就把航向输入推到 ±1 并持续偏航。新增 `pointerOnUI()` 判定，指针落在按钮 / 工具栏 / 档位条等交互控件上时暂停鼠标驾驶，并在点击时归零航向输入。
- 版本号写入折叠按钮提示后被 `syncCompact()` 的赋值覆盖，改为在唯一赋值点拼接版本号。

### 文档与运维

- 无头验证（`wb_v101_verify.py`，Edge + 新旧对照）8 条断言：新版全绿；以 git `HEAD:app.js`（v1.0.0）做反向对照，7 条红。关键量化：两指错开后平移 `B_yaw` 由 `0`（旧版锁死缩放）变为 `-0.5386`；点击按钮后 `mouseNX` 由 `0.8571`（持续偏航）变为 `0`；平齐平移与捏合缩放行为保持不变。`node --check app.js` 通过。

### 交付对齐

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 103182 B / md5 `56206e80d8` | — |
| Gitee `main` | tag `v1.0.1` | 一致 |
| 资料库编辑态 | **v16** / `WmEE0J8lRXCQ` | `app.js` 与本地逐字节一致 |
| 资料库发布态 | **v16** / `WmEE0J8lRXCQ`（公开版已同步） | 与编辑态一致 |

本版仅改 `app.js`（`index.html` / `style.css` 未动），云端按增量事务只上传该文件，并同步发布态。
事务 `tx_wQdbNm2wQoQwoz64avRWcO` 只上传 `app.js`（带 `Content-Type: application/javascript`）；`index.html` / `style.css` 与 v15 逐字节一致，平台标注 225 / 155 / 1 守恒。发布态拉回本地实跑 8 条断言全绿，四链路 `app.js` 103,182 B 逐字节一致，6 个资源 MIME 正确。

---

## [1.0.2] - 2026-11-06

### 新增

- 开场层加入 **Windows 开机加载圈的三球体版**（`style.css`）：3 颗发光球体沿同一轨道结伴公转，缓入缓出整圈旋转（`ns-boot-spin` 2.15s）、每颗球带 3 粒递减点阵尾迹、错相呼吸（`ns-boot-pulse`）与中心光核脉动。纯 CSS 实现，**在 `app.js` 尚未解析 9 MB 舰体数据时首屏即已转动**，不依赖 JS。
- `app.js` 追加渐进增强的指针交互（`initBootRing()`）：指针靠近圈体时三球沿半径散开（0 → 约 11px）、提亮（1 → 1.45）、整圈加速（2.15s → 1.40s），移出后复位；点击圈体等同点击「进入舰桥」。新增无头验证钩子 `window.__NS_BOOT__`（`ready / spheres / spread / glow / duration / enters`）。
- 支持 `prefers-reduced-motion: reduce`：圈体降速至 6s、球体与光核停止脉动。

### 变更

- 开场层精简为「标题 / 编号 / 一句标语 / 加载圈 / 一个按钮」：隐藏 `.start-tag`、`.start-desc`、`.start-foot` 与 4 行 `.start-keys` 键位提示；卡片收窄至 `min(430px,92vw)`、弱化边框与角标、按钮改小。完整键位仍保留在游戏内 `H` 帮助面板与 README，游玩中 HUD 提示条未改动。
- **实现手法**：复用 `.start-keys` 及其 4 个子 `div` 作为轨道容器与 3 颗球体，只隐藏文字、不删节点；`index.html` **零改动**（10,094 B 保持不变），因此云端 `index.html` 的 225 个 `data-page-node-id` / 155 条 `pnid` 注释 / 1 个 `inject.js` 标注完全不受影响，本版无需上传 HTML。
- `APP_VERSION` 由 `1.0.1` 升至 `1.0.2`，与 changelog、git tag 对齐。

### 文档

- `README.md` 更新程序版本为 v1.0.2，并在「在线玩」补一句开场加载圈与 `H` 帮助面板的说明。

### 交付对齐

> 本条在发版完成后回填；量化数据以实际提交与云端终检为准。

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 105,373 B / md5 `7fbc933a08d59ea03e1c55ee47bf9f2b`；`style.css` 24,899 B / md5 `841f9017db75a67f5ad68ded523dd846` | — |
| 待回填 | 见下方交付对齐补记 | — |
