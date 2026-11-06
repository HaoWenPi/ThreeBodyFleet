# 自然选择号 · 深空航行模拟

一个基于 Three.js 的单页 3D 舰队航行模拟。驾驶「自然选择号」旗舰与 11 艘僚舰，切换推进档位，在「前进四」进入 0.10c 跃迁。

**纯静态、零后端、无需登录；本地运行时完全离线。** 所有依赖都在仓库里，双击 `index.html` 即可离线运行。

- 在线试玩：https://www.workbuddy.link/p/Ipkm3BuUttxgpr9CywzevY
- 当前程序版本：**v1.0.2**（HUD 左上角「舰籍信息」面板显示；模型包自身的 `1.0.0` 与之独立）
- 许可证：Apache-2.0，见 [LICENSE](LICENSE)
- 版本变更记录：[changelog.md](changelog.md)

> 演示数值为游戏化设定，非原著设定。

---

## 快速开始

### 方式一：在线玩（最快）

打开上面的公开链接即可，手机浏览器直接可玩，无需注册。首屏是一个三球体加载圈：点击圈体或「进入舰桥」即可开始（加载圈在模型数据读入期间也会持续转动）；开场层刻意保持简洁，完整键位见下方「操作」或游戏内按 `H`。

### 方式二：本地离线运行（推荐给开发者）

1. 克隆仓库或下载 zip 并解压：

   ```bash
   git clone git@github.com:HaoWenPi/ThreeBodyFleet.git
   ```

2. 确认以下文件与目录保持原有相对位置（不要只拷贝 `index.html`）：

   ```
   index.html
   app.js
   style.css
   vendor/three.min.js
   ship-model.js
   models/NaturalSelection-Structured/ship-structured.js
   ```

3. **双击 `index.html`**。

不需要 `npm install`、不需要构建、不需要起服务器、不需要数据库。`file://` 下即可运行，断网也能玩。

### 方式三：起一个静态服务（可选）

若习惯用 `http://` 打开（例如要调试 Service Worker 或做真机局域网测试）：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。服务只负责分发静态文件，本身不含任何业务逻辑。

**浏览器要求**：支持 WebGL 的桌面或移动浏览器。Three.js r150 已随仓库放在 `vendor/three.min.js`，无需 CDN。若 WebGL 不可用，页面会显示明确提示而不是白屏。

---

## 操作

### 桌面

| 输入 | 作用 |
| --- | --- |
| 鼠标移动 | 控制航向与俯仰（离屏幕中心越远转得越快） |
| `W` / `S` · `↑` / `↓` | 低头 / 抬头 |
| `A` / `D` · `←` / `→` | 左转 / 右转 |
| `Q` / `E` | 左滚转 / 右滚转 |
| `0` / `1`–`4` · 滚轮 · 底部档位按钮 | 停车 / 前进一至前进四 |
| `F` · `Shift`+`F` | 循环切换 5 套阵型：楔形前锋 / 环形护卫 / 双列巡航 / 战列横队 / 松散巡航 |
| `V` / `R` / `H` / `M` / `P` | 视角 / 复位 / 帮助 / 静音 / 暂停 |
| 点击画面 | 锁定鼠标指针（`Esc` 退出） |

### 手机 / 平板

| 手势 | 作用 |
| --- | --- |
| 单指拖动 | 控制航向与俯仰，抬手后归零 |
| 双指捏合 | 缩放镜头（相机距离） |
| 双指间距保持稳定后平移 | 绕舰环绕观察视角，**不要求两指平齐或完全同向** |
| 底部档位按钮 | 换档（按钮为固定尺寸，不会被窄屏布局压扁） |
| 右下角图标坞 | 小屏下 HUD 自动折叠为图标，点击展开对应面板 |
| 视角胶囊 / 折叠按钮 | 一键复位视角 / 切换完整 HUD |

小屏模式由运行时自动判定，也可用 `?compact=1|0` 强制指定。

---

## 档位与跃迁

| 档位 | 速度 | 说明 |
| --- | --- | --- |
| `0` 停车 | 0 | 引擎待机 |
| `1` 前进一 | 0.025 c | |
| `2` 前进二 | 0.050 c | |
| `3` 前进三 | 0.075 c | |
| `4` 前进四 | 0.100 c | **跃迁**：星光拖尾、速度线、镜头拉伸与尾焰收敛 |

档位为线性梯度，所有速度相关视觉量由 `speedC / 0.1` 统一驱动。按 `0` 或 `1`–`3` 退出跃迁。

---

## URL 参数

参数均加在页面地址后，用 `&` 组合。以下列表按源码实际读取行为整理，未列出的参数不生效。

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `orbit=<deg>` · `pitch=<deg>` | 以指定环绕角度开场，便于分享定格视角 | `?orbit=-75&pitch=10` |
| `autostart=1` | 跳过开场层，直接进入场景 | `?autostart=1` |
| `gear=<0-4>` | **仅在 `autostart=1` 时生效**，指定开场档位，缺省为 `2` | `?autostart=1&gear=4` |
| `instant=1` | **仅在 `autostart=1` 时生效**，立即到达目标速度 | `?autostart=1&gear=4&instant=1` |
| `formation=<0-4>` | 指定开场阵型 | `?formation=2` |
| `hull=glb` | 回退到上一代 GLB 舰体，用于对照 | `?hull=glb` |
| `normal=1` | GLB 模式下恢复高频 normalMap | `?hull=glb&normal=1` |
| `compact=1` / `compact=0` | 强制小屏折叠 / 完整 HUD | `?compact=0` |
| `yaw=0` | 关闭模型朝向翻转 | `?yaw=0` |
| `roll=1` | 开场自动滚转 | `?roll=1` |

> `?zoom=` **不是**受支持的参数。缩放请用滚轮 / 双指捏合；`zoom` 在程序里表示「相机距离倍率」（越小画面越大），HUD 上显示的百分比是 `1/zoom`。

深链示例（本地或自建静态托管）：`index.html?orbit=-75&pitch=10&autostart=1&gear=4`

> 托管发布页是否向页面透传查询串取决于平台，本仓库未对此做保证；需要固定机位时建议用本地文件或自建静态托管打开。

---

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `index.html` | 页面骨架、开场层、HUD、帮助面板；`<head>` 最前是「进入舰桥」早绑定脚本 |
| `app.js` | 场景、相机、编队、手势、音效、HUD 全部逻辑 |
| `style.css` | HUD 与小屏适配样式 |
| `vendor/three.min.js` | 本地 Three.js r150（UMD，全局 `THREE`） |
| `models/NaturalSelection-Structured/` | 默认结构化舰体：内联 JS 载荷、GLB、贴图 atlas、manifest / bindings、[交付说明](models/NaturalSelection-Structured/交付说明.md) |
| `ship-model.js` | 上一代 GLB 内联回退载荷（`?hull=glb`） |
| `preview-structured.html` | 模型交互预览（PBR / 灰模 / 分区 × 视角 × 部位隔离） |
| `model-report.html` | 模型报告页 |
| `tools/` | 模型构建与绑定校验脚本 |
| `changelog.md` | 版本变更记录与发版约定 |

---

## 舰体与素材

默认使用**结构化 STL 舰体**：源 STL 60,382 三角面 / 29,935 焊接顶点，按面划分为 10 个语义部位，配套 4 张 2048² atlas。上一代 GLB 舰体（约 15 万面、3 张 2048 WebP）可通过 `?hull=glb` 对照查看；结构化载荷缺失时会自动补载 GLB。

素材实况与绑定依据在 [交付说明](models/NaturalSelection-Structured/交付说明.md) 中如实记录：源 STL 本身**无 UV、无材质、无贴图**，5 张设计图是渲染参考图而非 UV 贴图，4 张 atlas 是依据设计图与 GLB 提取的 3 张原始 PBR 贴图**重建**的，并未伪装成原始贴图。素材权利以实际持有的授权为准，本仓库不额外声明。

`models/.../manifest.json` 里的 `version: 1.0.0` 是**模型包自身版本**，与程序版本 v1.0.1 相互独立。

---

## 开发

无构建步骤，改动后建议做静态检查：

```bash
node --check app.js
python tools/validate_bindings.py --root models/NaturalSelection-Structured
```

`validate_bindings.py` 会读真实 GLB accessor 与 PNG 做 22 项产物级校验（含反向验证），不只读 manifest。

页面暴露了一批只读诊断钩子，便于无头浏览器验证：`__NS_VERSION__` / `__NS_VIEW__` / `__NS_VIEW_STATE__` / `__NS_GESTURE__` / `__NS_BRIDGE__` / `__NS_MODEL_OK__` / `__NS_DRIVE__` / `__NS_FLAME__` / `__NS_CAM__` / `__NS_AUDIO__` / `__NS_NOZZLES__` / `__NS_NOZZLE_FX__` / `__NS_HULL_STRUCTURED__`。

发版流程（语义化版本、git tag、GitHub 主仓库 + Gitee 镜像双推、云端发布态同步与一致性核验）见 [changelog.md](changelog.md) 的「维护约定」。

---

## 设计边界

这是**纯前端离线演示**：没有账号体系、没有积分系统、没有排行榜、没有后端服务，也不采集用户数据。页面运行时不发起任何 `fetch` / WebSocket / 接口请求。

仓库内的 `game-security-architecture.md` 是一份**已归档、未采纳**的历史设计稿，记录过「若将来要做账号与积分该怎么做」的评估过程，**不代表当前架构，也不是待办清单**。

---

## 许可

Apache License 2.0 — 见 [LICENSE](LICENSE)。第三方依赖 Three.js 以源码形式随仓库分发于 `vendor/three.min.js`。
