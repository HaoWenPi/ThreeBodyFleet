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
| [1.0.3](#103---2026-11-06) | 2026-11-06 | `v1.0.3` | 加载圈改为平面牛顿三体引力模拟 |
| [1.0.4](#104---2026-11-06) | 2026-11-06 | `v1.0.4` | 移除加载圈球体旁的尾迹小光点 |
| [1.0.5](#105---2026-11-06) | 2026-11-06 | `v1.0.5` | 加载圈改用混沌三体轨道 · 速度可视化 |
| [1.0.6](#106---2026-11-07) | 2026-11-07 | `v1.0.6` | 开场三体整体调慢 · 播放速率单点常量化 |

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

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 105,373 B / md5 `7fbc933a08d59ea03e1c55ee47bf9f2b`；`style.css` 24,899 B / md5 `841f9017db75a67f5ad68ded523dd846` | — |
| 代码提交 | `84f4bea` | 4 个文件变更 / 172 行新增 / 3 行删除；`index.html` 零改动 |
| GitHub（主）/ Gitee（镜像）`main` | tag `v1.0.2` 指向本条回填提交 | 双端 HEAD 与 tag refs 一致 |
| 资料库编辑态 | **v17** | `app.js` / `style.css` 与本地逐字节一致 |
| 资料库发布态 | **v17** / CDN `1wrvzu5Mtndu` | 与编辑态逐字节一致；6 个资源 MIME 全部正确 |

事务 `tx_GYTxgRkQK9QKlXXFOtMxGt`（baseVersion 16）按双向 diff 自检后**只上传 `app.js` 与 `style.css`**：`app.js` 的 PUT 带 `Content-Type: application/javascript`、`style.css` 带 `text/css`；`index.html` 未上传，发布态仍为平台注入版 25,221 B，标注 225 / 155 / 1 与 `__NS_BRIDGE__` 守恒。发布态产物已拉回本地逐字节比对，5 个 `.js` 均为 `application/javascript` 且带 `nosniff`。

本版验证：加载圈无头验证 37/37 PASS（390px / 1280px 双视口、v1.0.1 CSS 反向对照可红）、手机首屏与加载空窗回归 20/20 PASS（早绑定未受影响）、`node --check` 4 个 JS 全过、`validate_bindings.py` 22/22 PASS；静态视觉截图确认三球体、按钮完整、无滚动条。

---

## [1.0.3] - 2026-11-06

加载圈由「预设圆周运动学」改为「平面牛顿三体动力学」：三颗球是三个等质量质点，只受彼此万有引力，运动完全由数值积分产生。

### 新增

- `app.js` 的 `initBootRing()` 内实现二维三体引力模拟：每对 `(i,j)` 只计算一次力，`F_ij` 作用于 `i`、`F_ji = -F_ij` 作用于 `j`（牛顿第三定律）；`velocity Verlet` 辛积分固定步长 `dt = 0.0025`，按真实帧时间累加子步，后台恢复有 240 步上限守护。
- 初始条件取 **Chenciner–Montgomery 八字周期解**（`G = m = 1`，`T = 6.32591398`）：`r1 = (-0.97000436, 0.24308753)`、`r2 = (0.97000436, -0.24308753)`、`r3 = (0, 0)`；`v1 = v2 = (0.466203685, 0.43236573)`、`v3 = (-0.93240737, -0.86473146)`。此后**没有任何预设轨道或位置插值公式**。
- 启动时用同一套积分预跑一个周期，量出旋转后包围盒自动求渲染缩放（`span = 0.858079`），不把视觉常数硬编码进物理层；`resize` 只重算比例。
- 无头验证钩子 `window.__NS_BOOT__` 扩展 `pause / resume / reset / advance / renderOnce / snapshot`，确定性推进并暴露总动量、质心、总能量与漂移、三对作用力、三球位置与速度，供物理断言使用。

### 变更

- **运动学 → 动力学**：删除 v1.0.2 的「三球沿同一圆周等角速度公转」。纯 CSS 的 `ns-boot-spin` 保留为**首屏兜底**（9 MB 舰体数据解析期间仍有画面），`app.js` 就绪后给容器加 `.ns-phys` 关闭容器旋转，球体 `transform` 逐帧由积分结果写入；接管瞬间记录三球实际渲染位置，用 0.55s 平滑插值过渡到引力轨道，无跳变。
- **指针交互语义改变**：靠近圈体只改变**模拟时间流速**（`1 → 1.6`）、光晕与球体视觉尺寸，不再沿半径「推」球——外力会破坏动量守恒，与真实物理冲突。点击圈体仍进入舰桥。
- **渲染映射**：物理平面先整体旋转 45°（等距变换，实测旋转后包围盒 `±0.858079 / ±0.858079`，正好填满圆形容器），再等比缩放并映射到屏幕；屏幕 y 轴向下相当于镜像，均不改变动力学。中心光核留在原点，即**内力成对抵消后恒定不动的质心**。球体旋转角取瞬时速度方向，点阵尾迹始终背向运动方向。
- `APP_VERSION` 由 `1.0.2` 升至 `1.0.3`，与 changelog、git tag 对齐；`index.html` **仍为 10,094 B 零改动**，云端 225 个 `data-page-node-id` / 155 条 `pnid` 注释 / 1 个 `inject.js` 标注不受影响。

### 文档与运维

- `README.md` 补写物理口径（`G/m/dt/T`、能量、守恒量、速度变化、最小间距、正交渲染变换）与版本更新。
- 独立 Python Verlet 数值校准（`wb_ns_threebody_calib.py`）：`E0 = -1.287141991766325`，总动量 / 质心 / 角动量均为 `0`，一周期速度 `0.467218 → 1.271669`（**2.722 倍**，证明非匀速圆周），最小间距 `0.690508`（故无需引力软化），`dt = 0.0025` 下一周期回归误差 `0.00117`、40 周期能量漂移 `8.065e-11`。前端 JS 实测与独立积分一致（周期末漂移 `5.39e-11`）。
- 辛积分的能量误差是**有界相位振荡**而非长期漂移：独立积分每 `T/24` 采样峰值恒为 `3.6828e-6` 且不累积，前端实测 `3.6819e-6`；验证据此拆成「相位振荡 < 1e-5」与「周期末长期漂移 < 1e-8」两条断言。
- 无头验证 `wb_ns_threebody_verify.py` **57/57 PASS**（390px / 1280px 双视口、页面与交互回归、14 条物理断言），含 4 条**反向对照且全部如预期变红**：把 `F_ji = -F_ij` 的符号翻掉后，总动量 `2.478`、成对力偏差 `2.370`、能量漂移 `6.434`、周期末漂移 `6.436`，动量 / 作用力 / 两条能量断言全部转红；v1.0.2 CSS 反向对照确认「接管后 CSS 公转已关闭」断言能红。
- 手机首屏与加载空窗回归 `wb_ns_frontload_verify.py` **20/20 PASS**（`__NS_BRIDGE__` 早绑定未受影响）；`node --check` 4 个 JS 全过；`validate_bindings.py` 22/22 PASS。静态视觉预览（`wb_ns_threebody_preview.py`）在 390px 两个相位 + 900px 宽屏下确认三球位于容器内、构图随相位变化、按钮完整可见、无滚动条。
- v1.0.2 的 37 条加载圈验证脚本由本版 57 条脚本替代（旧脚本含「必须存在 CSS 匀速公转」的过时断言，不再适用）。

### 交付对齐

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 115,503 B / md5 `b78ab07fb314e43bd732a68b6c33bdba`；`style.css` 25,730 B / md5 `a9a8b866548bcd80e7767dff16d55350` | — |
| 代码提交 | `aa24652`（4 个文件 / 295 行新增 / 23 行删除） | `index.html` 10,094 B 零改动 |
| GitHub（主）/ Gitee（镜像）`main` | tag `v1.0.3` 指向本条回填提交 | 双端 HEAD 与 tag refs 一致 |
| 资料库编辑态 | **v18** | `app.js` / `style.css` 与本地逐字节一致 |
| 资料库发布态 | **v18** / CDN `Ewi_cYOYwVFh` | 与编辑态逐字节一致；6 个资源 MIME 全部正确 |

事务 `tx_JRjvrtdwEZdbsLli1BaOcA`（baseVersion 17）经双向 diff 自检后**只上传 `app.js` 与 `style.css`**：`app.js` 的 PUT 带 `Content-Type: application/javascript`、`style.css` 带 `text/css`；自检确认 `app.js` 在开场加载圈区块之前 / 之后的所有字节与 v1.0.2 完全一致（仅版本号替换），`style.css` 开场层之前的字节完全一致且 83 条旧规则行一条未删，`index.html` 未上传。发布态 `index.html` 仍为平台注入版 25,221 B，标注 225 / 155 / 1 与 `__NS_BRIDGE__` 守恒。发布态产物已拉回本地逐字节比对，5 个 `.js` 均为 `application/javascript` 且带 `nosniff`。

---

## [1.0.4] - 2026-11-06

移除开场加载圈中每颗大球旁的点阵尾迹小光点，画面只保留 3 颗等质量球体与圆心处恒定不动的质心光核。**引力模拟本身零改动**。

### 变更

- `style.css` 删除 `#startscreen .start-keys > div::after` 规则（原为每颗球身后 1 个 4px 主点 + 2 个 `box-shadow` 递减光点），并在原位置留下「勿恢复」注释；开场层注释中「尾迹」相关表述同步修正。
- `app.js` 仅同步 `APP_VERSION` 与一处渲染注释；`transform` 中的 `rotate(...)` 保留（此时只影响球面高光朝向）。**成对引力、`F_ji = -F_ij`、velocity Verlet 积分、`dt` / 周期 / 初始条件、`__NS_BOOT__` 诊断钩子全部未改**。
- `index.html` 仍为 10,094 B **零改动**，云端平台标注不受影响。

### 文档与运维

- `README.md` 版本升至 `v1.0.4`，并写明加载圈仅由 3 颗球体与质心光核组成、不绘制尾迹点。
- `APP_VERSION` 由 `1.0.3` 升至 `1.0.4`，与 changelog、git tag `v1.0.4` 对齐。
- 无头验证 `wb_ns_threebody_verify.py` 把「尾迹点存在」断言改为「`div::after` 的 `content` 与 `box-shadow` 均为 `none`」，并新增 **BADTAIL 反向对照**（把尾迹规则加回 CSS）确认该断言会红；CSS 反向对照基线由 `HEAD` 改指向 `v1.0.2` tag，避免随版本推进失效。`wb_ns_frontload_verify.py` 版本断言同步。

### 交付对齐

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 115,518 B / md5 `5332c0d5d34efdee8c69ec64aa1bc177`；`style.css` 25,508 B / md5 `2245b56b0ee33faa9d488c7ce445579b` | — |
| 代码提交 | `d9ae8ff`（4 个文件 / 41 行新增 / 15 行删除） | `index.html` 10,094 B 零改动 |
| GitHub（主）/ Gitee（镜像）`main` | tag `v1.0.4` 指向本条回填提交 | 双端 HEAD 与 tag refs 一致 |
| 资料库编辑态 | **v19** | `app.js` / `style.css` 与本地逐字节一致 |
| 资料库发布态 | **v19** / CDN `PxTQK44shFA8` | 与编辑态逐字节一致；6 个资源 MIME 全部正确 |

事务 `tx_Gw6q5lClIOEtfzZsh69C07`（baseVersion 18）经双向 diff 自检后**只上传 `app.js` 与 `style.css`**：`app.js` 的 PUT 带 `Content-Type: application/javascript`、`style.css` 带 `text/css`；自检逐字节重建确认 `app.js` 只有「版本号替换 + 一处渲染注释替换」两处白名单改动、物理代码零越界，`style.css` 只删除尾迹规则的 5 条有效行并改 3 处注释、未新增任何规则，`index.html` 未上传。发布态 `index.html` 仍为平台注入版 25,221 B，标注 225 / 155 / 1 与 `__NS_BRIDGE__` 守恒。发布态产物已拉回本地逐字节比对，5 个 `.js` 均为 `application/javascript`。

本版验证：无头验证 `wb_ns_v104_verify.py` **63/63 PASS**（含 BADTAIL 反向对照：只把尾迹规则加回 CSS，`div::after` 的 `content` 由 `none` 变为 `""`、`box-shadow` 出现 `rgba`，「无尾迹」断言如预期转红）；手机首屏与加载空窗回归 **20/20 PASS**；`node --check` 4 个 JS 全过；`validate_bindings.py` 22/22 PASS；静态视觉预览放大确认每颗大球旁的小光点已消失，仅剩 3 颗球体与圆心质心光核。

---

## [1.0.5] - 2026-11-06

修复加载圈「轨迹重复、速度变化很小、没有不确定感」。诊断确认根因是 **Chenciner–Montgomery 八字周期解本身的物理性质**（该解线性稳定，每 `T = 6.32591398` 精确回到初态），不是渲染或积分 bug。本版改用混沌三体轨道，并首次把速率映射到视觉量。

### 新增

- `app.js` 的 `initBootRing()` 初值离开八字解稳定岛：`v3.x += 0.10`、`v1/v2` 各 `-= 0.05`（总动量仍严格为 0）。独立 Python 数值实验（`Temp/wb_ns_chaos_calib.py` ~ `wb_ns_chaos_calib6.py`）实测：八字解受 `1e-6` 微扰后分离度仅 `5.0e-4`（线性稳定），扰动 `≤0.03` 时速度比仅 `2.72 → 3.17`、回归误差 `0.02`，仍是准周期；取 `0.10` 后进入混沌，`t = 240` 时微扰分离度 `5845`。
- **自适应子步长**：宏观步 `dt = 0.0025` 按当前最小间距的特征时间 `r^1.5` 拆成 `1~32` 个子步（子步总时间仍严格 `dt`），不引入引力软化，保持严格点质量牛顿引力。实测同一混沌初值在 `t = 120` 的能量相对误差峰值由固定步长 `2.64e-2` 降至 `1.78e-3`；细化到 `SUB_K = 0.006` 后段内峰值 `1.3e-5`。
- **分段重投**：真混沌三体几乎必然解体（实测本初值约 `t = 141` 抛射）。每段先静默预推进到不同相位（`3~13` 物理时间，仍是纯物理积分），再显示 `75` 物理时间（约 25.5 s）；8 段循环，段间 0.55 s 插值重投。段内 100% 物理，**段间重投是明确标注的视觉兜底**；球体跑远 / 能量漂移 > 0.5% / 非有限值也会立即触发重投。8 段起始构型两两距离实测 `1.80 ~ 2.39`，不会出现「重新开始」的重复感。
- **速度可视化**：球体尺寸（`0.68~1.40` 倍）、亮度（`0.72~1.77` 倍）与沿速度方向的拉伸（最多 `1.14 : 0.94` 的轻微拉伸）由瞬时速率驱动；不新增任何小球或尾迹。
- `__NS_BOOT__` 新增 `chaos / periodic / softening / segment / resamples / segTime / substeps / maxSub / speedMin / speedMax / span / maxRadius / initialDelta / warmup` 及 `reseed(seg)` 确定性切段钩子，`snapshot()` 同步暴露。

### 变更

- 渲染包围盒由「预积分一个周期」改为「预积分一段（75 物理时间）」，仍是启动期自动求解；正交变换（整体旋转 45° + 等比缩放）不变。
- `hook.period` / `hook.periods` 保留 `6.32591398`，语义改为**时间标尺**，新增 `periodic: false`；`model` 仍为 `planar-newtonian-3body`。
- 成对引力与 `F_ji = -F_ij`、velocity Verlet、`dt`、质心光核、纯 CSS 首屏兜底、0.55 s 接管插值、指针只改时间流速与光晕、无尾迹小点、`index.html` 零改动等既有红线全部保留。
- `APP_VERSION` 由 `1.0.4` 升至 `1.0.5`；`style.css` 开场层注释与 `will-change` 同步。

### 修复

| 现象 | 根因 | 本版结果 |
| --- | --- | --- |
| 轨迹重复 | 八字解是精确周期轨道，且线性稳定 | 轨道不闭合，段内状态离初值的最小回归距离 `0.016 → 0.239` |
| 速度变化小 | 物理速度比仅 `2.72`，且视觉量恒定 | 浏览器实测速度比 `2.72 → 3.68`（独立 Python 段实验 `4.0`），并首次把速率映射到尺寸 / 亮度 / 轻微拉伸 |
| 无不确定感 | 对称、可预测、每 2.15 s 循环 | 8 段微扰 `±0.0006` + 不同预推进相位；独立 Python 实验微扰分离 `0.13 ~ 0.49`，浏览器实测段间起始构型距离 `2.93`、同段时长后终点距离 `2.83` |

### 文档与运维

- `README.md` 版本、开场层说明与物理口径全部更新；`Temp/wb_ns_chaos_calib*.py` 共 6 轮独立数值实验可复现全部量化结论。
- 无头验证 `Temp/wb_ns_v105_verify.py` **76/76 PASS**（390px / 1280px 双视口、页面与交互回归、混沌性与守恒断言），含 4 组反向对照且全部如预期变红：BAD3RD（破坏第三定律）、BADTAIL（恢复尾迹点）、BADPERIODIC（`CHAOS_DELTA=0` 退回八字解后「非周期 / 速度比」断言转红：单标尺回归 `1.877 → 0.0024`、速度比 `3.68 → 2.72`）、NEG（v1.0.2 CSS）。6 个 WebGL iframe 同时加载会吃满内存被系统中断，故改为两批执行 + 反向对照使用轻量物理摘要，断言强度不变。
- 手机首屏与加载空窗回归 `wb_ns_frontload_verify.py` **20/20 PASS**；`node --check` 4 个 JS 全过；`validate_bindings.py` **22/22 PASS**。静态视觉预览 `Temp/wb_ns_threebody_preview.py` 在三个不同段 / 相位下确认三球构型互不相同、尺寸与亮度随速度变化、无尾迹小点、按钮完整且无滚动条；据放大截图把沿速度方向的拉伸由 `1.34:0.86` 收小到 `1.14:0.94`，保持球体观感。

### 交付对齐

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 121,511 B / md5 `cb85dd5e3e51ee60946fc0e889e87d95`；`style.css` 25,801 B / md5 `e8e21dcc4595992145514b703beda212` | — |
| 代码提交 | `b58959c`（4 个文件 / 273 行新增 / 89 行删除） | `index.html` 10,094 B 零改动 |
| GitHub（主）/ Gitee（镜像）`main` | tag `v1.0.5` 指向本条回填提交 | 双端 HEAD 与 tag refs 一致 |
| 资料库编辑态 | **v20** | `app.js` / `style.css` 与本地逐字节一致 |
| 资料库发布态 | **v20** / CDN `-DOt5WW_-V7M` | 与编辑态逐字节一致；6 个资源 MIME 全部正确 |

事务 `tx_ggDUKdyccdm3IcUMETufiC`（baseVersion 19）经双向 diff 自检后**只上传 `app.js` 与 `style.css`**：`app.js` 的 PUT 带 `Content-Type: application/javascript`、`style.css` 带 `text/css`；自检确认 `app.js` 只有「版本号替换 + 开场加载圈整块替换」两处变化，块前 / 块后字节与 v1.0.4 基线完全一致，块内关键字白名单与禁用标记（尾迹规则 / 预设轨道公式）全部通过；`style.css` 开场层之前字节不变，有效规则行仅 `will-change:transform` → `will-change:transform,filter` 一处变化；`index.html` 未上传。发布态 `index.html` 仍为平台注入版 25,221 B，标注 225 / 155 / 1 与 `__NS_BRIDGE__` 守恒。发布态产物已拉回本地逐字节比对，5 个 `.js` 均为 `application/javascript`。

> 本条在发版完成后回填；量化数据以实际提交与云端终检为准。

---

## [1.0.6] - 2026-11-07

开场加载圈**整体播放节奏调慢**，回应用户「三个星体的速度需要再慢一点」；上一版的混沌轨道、速度可视化与平面牛顿三体物理内核**完全保留**，本次只缩放时间流速。对应资料库云端编辑态 / 发布态版本号与提交号见下方「交付对齐」（发版完成后回填）。

### 新增

- `app.js` 开场层引入单一速率常量 `LOOP_S = 3.0`（标称「一圈」秒数，越大越慢），把原先散落在 `BASE_SPEED`、`hook.duration` 初始值、`measure()`、`reset()`、指针交互 5 处的 `2.15` 收敛到一个参数；后续要再调快慢只改这一行。
- 纯 CSS 首屏兜底同步放慢：`ns-boot-spin` / `ns-boot-core` 由 `2.15s` 改为 `3s`；`prefers-reduced-motion` 分支由 `6s` 改为 `8.6s`，与 JS 的 `timeFactor = 0.35` 保持同一比例（3 / 0.35 ≈ 8.6）。

### 变更

- `BASE_SPEED = T / LOOP_S`：每秒真实时间推进的物理时间由 `6.32591398 / 2.15 = 2.9423` 降到 `6.32591398 / 3.0 = 2.1086`，**慢 28.3%**；`__NS_BOOT__.duration` 由 2.15 变为 3.0，指针靠近时 `1.875`（原 1.344）。
- 段长仍是 75 个物理时间不变，故每段的屏幕停留由约 25.5 s 拉长到约 35.6 s，重投频率下降；8 段相位、段间 0.55 s 插值不变。
- `APP_VERSION` 由 `1.0.5` 升至 `1.0.6`；`index.html` **零改动**（10,094 B）。`dt = 0.0025`、`CHAOS_DELTA = 0.10`、`SEG_T = 75`、成对引力 `F_ji = -F_ij`、速度映射（尺寸 `0.68~1.40` / 亮度 `0.72~1.77` / 拉伸 `1.14:0.94`）等红线全部保留。

### 修复

- 本版无功能缺陷修复，为纯参数微调。

### 文档

- `README.md` 版本、段停留时长与新增「播放速率」口径段同步；开场层注释与 `style.css` 头部说明标注 v1.0.6 调慢。

### 运维

- 由 `Temp/wb_ns_v105_verify.py` 派生 `Temp/wb_ns_v106_verify.py`：更新版本 / 时长断言，新增 12 条「只改时间流速」断言（76 → 88 条），其中 4 条把 `accelerations/step/energy`、`initialFor/estimateSpan`、`render`、`frame` 四个函数块与 `v1.0.5:app.js` **逐字节比对**全部相同。实跑 **88/88 PASS**（390px / 1280px 双视口、页面与交互回归、混沌性与守恒断言），4 组反向对照 NEG / BADTAIL / BAD3RD / BADPERIODIC 全部如预期变红。
- 新增 `Temp/wb_ns_v106_speed.py` 行为级速率探针：Edge headless 的 `--virtual-time-budget` 只快进 timer、不调度 rAF，直接测「真实时间→物理时间」会恒 0，故改为对**测试副本**插桩 `tickReal(dtReal)`（逐字复用 `frame()` 的时间累加与 `step()` 循环），手动喂 60 个 `1/60 s` 固定步长；产品源码零改动。产品版 1 s 推进 `2.1075`、改回 2.15 的反向对照推进 `2.9400`，比值 `0.7168`（理论 `0.7167`），**12/12 PASS**；若未调慢比值会≈1 使断言转红。双 WebGL iframe + 虚拟时间会挂死 Edge，故改为两次单页面独立调用。
- `validate_bindings.py` **22/22 PASS**；`node --check` 4 个 JS 全过；`pre_push_audit.py` 推送前审计在提交后执行，结果随「交付对齐」回填。

### 交付对齐

| 链路 | 标识 | 与本地源码 |
| --- | --- | --- |
| 本地 | `app.js` 121,818 B / md5 `1dc57cf013efb72c86a18e0709dc46f8`；`style.css` 25,915 B / md5 `97fe8ebdcbdfa631e357ccf0be8bfa3e` | — |
| 代码提交 | 待回填 | `index.html` 10,094 B 零改动 |
| GitHub（主）/ Gitee（镜像）`main` | tag `v1.0.6` 指向交付对齐回填提交 | 双端 HEAD 与 tag refs 一致 |
| 资料库编辑态 | 待回填 | `app.js` / `style.css` 与本地逐字节一致 |
| 资料库发布态 | 待回填 | 与编辑态逐字节一致；6 个资源 MIME 全部正确 |

> 本条在发版完成后回填；量化数据以实际提交与云端终检为准。
