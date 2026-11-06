# 手机端 Web 游戏 · 账号 / 积分 / 排行榜 安全架构定稿

- 版本：**v0.5 · 归档版**（2026-11-06）｜v0.2 条件分支 → v0.3 单一路径 → v0.4 发布载体评估 → **v0.5 未采纳归档**
- 状态：**未采纳 / 已归档，请勿据此开发**。用户最终裁决：目标只是「用户前端能玩」，**不做用户注册、积分系统、排行榜，开源项目不碰后端**。§2–§11 的账号 / 账务 / 风控架构整体作废，保留仅为决策追溯。
- **最终方案见 §13（纯前端最轻量，零改动即达标）**。
- 适用项目：**三体世界 /《自然选择号，前进四》**（即本工作区项目；线上发布页 nodeId `Ipkm3BuUttxgpr9CywzevY`）
- 适用前提：手机端普通浏览器优先、即将上线排行榜、需要基础账号体系、积分可兑换**平台内权益**、**游戏前端全部开源 / 后端闭源**
- 说明：本文是架构设计文档，未提交 git、未修改资料库云端编辑态/发布态内容；v0.2–v0.3 曾误标为「独立项目」，v0.4 已按用户提供的发布链接更正归属。

## v0.3 变更摘要（相对 v0.2）

| 确认结果 | 收敛动作 |
|---|---|
| C1 = **普通移动浏览器** | **删除微信自动登录**。浏览器内不存在静默拿 openid 的技术路径；登录改「游客态 + Passkey 优先 + 手机号短信兜底」 |
| C2 = **无已认证服务号 / 备案域名** | 微信 provider 推迟到 P2；新增**短信接口防刷**（开源放大效应）、域名 + HTTPS 工程前置 |
| C3 = **平台内权益** | 兑换**删除订单域 / 发货 / 物流 / 售后 / 第三方券核销**；改单次事务「扣积分 + 授予权益」，新增 `entitlements` 表与重复授予约束 |

新增 §11 附录：P0 建表 DDL 与接口契约，可直接照着开工。

## v0.4 变更摘要（相对 v0.3）

用户补充：游戏目前通过 **WorkBuddy 资料库托管页**发布（公开版 `https://www.workbuddy.link/p/Ipkm3BuUttxgpr9CywzevY`，nodeId 与本工作区项目一致）。经评估新增 **§12 发布载体评估**：结论为「资料库页适合保留作宣传/分享入口，但**不能承载账号、积分、排行榜与兑换**」，给出 11 项冲突清单、目标架构、渐进迁移三步与待核实事项。同时更正文档归属（此前误标为独立项目）。

---

## 0. 三条硬结论（未变，仍是全篇地基）

| 目标 | v0.1 | v0.3 | 原因 |
|---|---|---|---|
| 防篡改 / 防作弊 | P0 | **P0++（准货币级，全部预算所在）** | 积分可兑换权益 → 作弊等于资损 |
| 防逆向 / 防抄袭 | 低成本档 | **整类删除，主动拥抱开源** | 代码已公开，客户端隐藏手段零收益 |
| 防数据抓取 | 顺带做 | 放弃代码/数值表保护；**新增用户数据与榜单接口防护** | 数值表已公开，身份与行为数据不能公开 |

1. **客户端侧安全预算归零**：不做混淆、不做 WASM 藏逻辑、不做反调试、不做证书固定、不做任何前端密钥。
2. **「后端闭源」不是安全边界**：攻击者不需要源码，黑盒观察请求响应即可逆推。闭源保护的是密钥、风控规则、运营数据，不是逻辑。
3. **前端开源是资产**：判定逻辑抽成前后端共用的纯函数包，规则透明、可申诉、可审计，且不会出现两套实现不一致（§6.1）。

---

## 1. 已确认前提与工程前置

| # | 你的回答 | 对方案的直接影响 |
|---|---|---|
| C1 | 普通浏览器 | 微信自动登录**不成立**，删除该需求；PWA 成为「方便玩」的主要抓手 |
| C2 | 还没有（服务号 / 备案域名） | `snsapi_base` / `wx.login()` 均不可用；登录自力更生，短信服务商需自行接入 |
| C3 | 平台内权益 | 兑换是纯状态变更，无对外履约，事务可一次提交完成 |

**P0 工程前置（不是安全问题，但没做就开工不了）**

| 前置 | 为什么必须 | 备注 |
|---|---|---|
| 一个固定域名 + HTTPS 证书 | Cookie `Secure`、PWA Service Worker、Passkey 的 `rpId` 都绑定域名；**域名定了就别中途换**（换了 Passkey 凭据全部失效） | 证书可走免费 CA |
| 服务器接入备案 | 若用国内节点，属接入合规要求 | **具体流程与时效以服务商/监管当前要求为准，需核实** |
| 短信服务商账号 | 手机号兜底登录必需，且**每条有成本** | 密钥只存后端，见 §3.4 |

`假设：团队有至少 1 名后端、前后端可用同一语言。 验证：核对人力清单；若无后端，见 §10 A4。`

---

## 2. 架构总览

```
[ 开源前端 · 移动浏览器 / PWA ]
  渲染 / 输入采集 / 乐观 UI / 展示服务端结果
  上报：意图 + 操作序列 + seq + idempotency_key
  绝不上传：最终分数 · 余额 · user_id · 客户端时间 · 随机种子 · cost
      │  HTTPS
      ▼
──────────── 信任边界（TLS 不是边界，进程边界才是） ────────────
[ 闭源后端 ]
  接入层   会话解析（身份只从会话解出）· 限流 · 幂等 · 参数白名单
  认证层   游客签发 · Passkey 校验 · 短信发码/验码（强限流）
  规则层   rules-core @rule_version + 服务端种子 → 复算 / 重放
  账务层   points_ledger 双分录 · accounts 行锁 · 对账 · 阈值
  业务层   排行榜 · 兑换事务 · entitlements · 账号绑定合并
  数据层   PostgreSQL（事务/账务） + Redis（会话/幂等/限流/验证码）
```

**积分写入路径唯一**：结算接口 → 规则层复算 → ledger 入账。不提供 `POST /score`、`POST /points/add` 之类结果上报接口。

---

## 3. 账号体系（无微信生态）

### 3.1 数据模型

| 表 | 关键字段 | 说明 |
|---|---|---|
| `users` | `user_id` (ULID) · `display_name` · `status` · `created_at` | 业务表只认 `user_id` |
| `identities` | `(provider, subject) → user_id` 主键 | provider ∈ `guest` / `phone` / `passkey` / `wechat_oauth` / `wechat_minigame` |
| `sessions` | `session_id` · `user_id` · `expires_at` · `revoked` | 服务端可撤销 |
| `accounts` | `user_id` · `balance` · `CHECK(balance >= 0)` | 物化余额 + **行锁串行化写入** |
| `points_ledger` | §4.1 | 积分唯一真相 |
| `entitlements` | §4.3 | 已授予的平台内权益 |
| `link_events` / `audit_log` | 绑定合并 / 管理员操作留痕 | 不可逆操作必须可追溯 |

**保留 `wechat_*` 两个枚举位但不实现**：以后办下服务号或做小游戏，只加 provider 实现，不改表、不改业务代码。这是「现在不做、未来不返工」的最低成本。

### 3.2 登录方案裁决：微信自动登录砍掉

**明确结论：普通移动浏览器里，不存在任何「微信端自动登录」的技术路径。** 网页拿不到微信身份，OAuth 需要微信内置浏览器或公众号网页授权上下文，扫码登录在手机上要跳微信 App、体验反而更差。别在这条路上花时间。

| 方式 | 手机端体验 | 成本 | 主要风险 | 阶段 |
|---|---|---|---|---|
| **游客态** | ⭐ 打开即玩，零摩擦 | 0 | 换设备丢账号 → 靠绑定解决 | **P0** |
| **Passkey / WebAuthn** | ⭐ 指纹/面容一次过，无验证码、无短信费、抗钓鱼 | 中 | 需 HTTPS + `rpId` 绑定域名；跨平台凭据同步依赖系统凭据管理器，**国内 Android 生态支持度需实测核实** | **P0 首选** |
| **手机号 + 短信验证码** | 通用，但要等码、要打字 | **每条有成本** | 刷短信 / 短信轰炸 / 验证码枚举 | **P0 兜底** |
| 邮箱 + 魔法链接 | 零短信成本，适合国际用户 | 低 | 国内到达率与习惯 | P1 可选 |
| 微信扫码登录（开放平台网站应用） | 移动端体验差 | 资质 + 认证/费用（**以官方当前政策为准，需核实**） | — | **P2，不推荐** |
| 微信内 H5 `snsapi_base` | 不适用（无服务号） | — | — | 未来办下服务号再启用 |

**Lazy Auth（先玩后绑）**：首屏不要求任何登录，游客态直接开局；仅在用户点「排行榜 / 我的积分 / 兑换 / 换设备」时才引导绑定 Passkey 或手机号，绑定后把游客账上积分合并过去。

### 3.3 会话与令牌（浏览器路径已确定）

| 项 | 做法 | 红线 |
|---|---|---|
| 令牌 | 短期 access token（建议 15–30 分钟，可按体验调）+ 较长 refresh token，服务端签发 | 客户端存的 token **不是秘密**，靠「短期 + 服务端可撤销」 |
| 存储 | refresh token 放 `HttpOnly; Secure; SameSite=Lax` **Cookie**（普通浏览器可用，比小游戏 storage 方案安全） | 别放 localStorage（XSS 可捞走） |
| 鉴权 | 每个请求从 Cookie/会话解出 `user_id` | 请求体里的 `user_id` / `phone` / `isAdmin` 一律忽略 |
| 注销 | 服务端置 `revoked` + 清 Cookie | 客户端「删 token」不算注销 |

### 3.4 短信接口防刷（v0.3 新增，开源放大效应）

前端全开源 = 发码接口的地址、参数、调用方式人尽皆知，任何人都能照着写个循环刷你账单。**这是本轮确认后最容易被忽略的资损点。**

| 控制 | 具体做法 |
|---|---|
| 服务端生成 | 验证码服务端生成、短时有效（建议 5 分钟，可调）、**一次性消费**、失败次数上限 |
| 存储 | 存短期 Redis 或哈希，**不明文落库、不写日志** |
| 频率 | 同手机号 60s 间隔 + 每日上限；同 IP / 网段限流；**全局日发送上限 + 触顶告警** |
| 人机前置 | 发码前做轻量校验（如无感行为校验 / 简单交互题） | 
| 可访问性 | 不要用纯图形验证码卡死读屏用户；提供替代通道 |
| 防枚举 | 响应**不区分**手机号是否已注册，统一「若号码有效将收到验证码」；耗时也要抹平 |
| 密钥 | 短信服务商密钥只在后端；发码与验码两个接口**分别限流** |
| 账单 | 服务商侧设日消费上限 / 告警（若有该能力） | 

`假设：短信服务商提供消费上限或告警能力。 验证：查服务商控制台；若无，靠服务端全局日上限兜底。`

### 3.5 Passkey 落地要点

- `rpId` 绑定域名、必须 HTTPS → 域名早定（§1）。
- `challenge` 由服务端生成、短时有效、一次性消费；校验 `origin` 与 `rpIdHash`。
- 一个 `user_id` 可挂多个 passkey（手机 + 电脑）；凭据公钥存服务端，**安全性不依赖前端代码保密**。
- 必须提供「设备丢失」恢复路径 = 手机号兜底；否则用户换机即永久丢号。
- 前端开源让 WebAuthn 流程完全公开，这没问题：可伪造的只有请求，验不过的仍是 challenge。

### 3.6 游客态 → 绑定合并

1. 游客：服务端签发匿名会话 + 生成 `user_id`，积分正常记 ledger（不用等登录）。
2. 绑定：Passkey / 手机号验证成功 → 事务内把 `identities` 指向目标 `user_id`，游客积分以一条 `reason=account_merge` 流水并入（**不直接改余额字段**）。
3. 冲突：若该身份背后已有账号且两边都有积分 → 累加 + 写 `link_events`，前端二次确认后执行；合并**不可逆**。
4. 绑定接口幂等，防网络重试重复并入。

### 3.7 越权红线

- 身份只从服务端会话解出；**请求体里出现 `user_id` / `phone` / `openid` / `isAdmin` / `cost` / `score` / `balance` 一律忽略或拒绝**。
- 所有资源接口按 `session.user_id` 行级过滤。
- 对外错误统一模糊（`INVALID_REQUEST`），细节只进服务端日志；别靠错误码差异暴露内部规则（协议反正已公开）。
- 手机号属个人信息：告知同意、最小必要、提供注销与数据删除通道。

---

## 4. 积分（准货币）服务端保护

### 4.1 Ledger：禁止裸改余额

```sql
points_ledger(
  id, user_id, delta, reason, ref_id,
  idempotency_key  UNIQUE,   -- 幂等落 DB 层，不靠应用层 if
  rule_version,              -- 用哪版规则算出来的
  created_at
)
accounts(user_id PK, balance, CHECK(balance >= 0), updated_at)
```

单事务写账流程（**顺序固定，防并发丢更新**）：

```
BEGIN
  SELECT balance FROM accounts WHERE user_id = $1 FOR UPDATE   -- 串行化
  INSERT INTO points_ledger(... delta, idempotency_key ...)     -- 唯一约束挡重放
  UPDATE accounts SET balance = balance + $delta WHERE user_id = $1
COMMIT
```

- 任何积分变动**只能 INSERT 流水**；`CHECK (balance >= 0)` 是最后一道防线。
- **不要在流水表里存 `balance_after`**：并发插入时它会产生竞态错误值，余额以 `accounts` 行锁后的结果为准。
- 日终对账：`SUM(delta)` 必须等于 `accounts.balance`，差额非 0 告警。
- `idempotency_key` 由服务端按 `(session_id, seq)` 派生，比让客户端自己生成可靠。

### 4.2 赚取侧：上报意图，服务端复算

| 客户端上报 | 服务端做 |
|---|---|
| `actions[]` · `seq` · `idempotency_key`（种子与 `rule_version` 由服务端开局时下发并留库） | 用 `rules-core` 重放 → 得分数 → 阈值比对 → ledger 入账 |

- **随机种子必须服务端下发并留存**，客户端自生成 = 可挑高分种子。
- 客户端用同一规则包做乐观 UI，服务端结果回来后修正；不一致以服务端为准。
- 超阈值不硬拒游戏：记风控事件 + 待复核，但可先冻结兑换权限。

### 4.3 兑换侧（平台内权益，v0.3 简化）

**删除**：订单域、发货、物流、第三方券核销、发货回调验签、售后流程 —— 平台内权益是纯状态变更，没有对外履约。

**新增 `entitlements` 与单事务兑换**：

```sql
entitlements(
  user_id, entitlement_id, ref_redeem_id,
  PRIMARY KEY (user_id, entitlement_id),   -- 同一权益不重复授予
  UNIQUE (ref_redeem_id)                    -- 一张兑换单只能发一次
)
```

事务顺序：

1. `SELECT balance FROM accounts WHERE user_id = $1 FOR UPDATE` → 防并发双花
2. 从**服务端配置**读 `entitlement_id` 的 cost / 有效期 / 是否可重复持有（**绝不采信前端传的 `cost`**）
3. 校验余额 ≥ cost、校验活动期与持有条件
4. 同一事务内：写 `reason=redeem` 流水 → 插 `redeem_orders` → 插 `entitlements` → 扣 `accounts.balance` → `COMMIT`
5. 任一步失败整体回滚，不产生半扣状态；确需事后冲正则写 `reason=refund` 流水并标记兑换单 `refunded`

- 状态机简化为 `fulfilled / refunded`，**通常无需 `pending` 中间态与异步轮询**（无外部发货）。
- 可消耗型权益的「使用」也要记流水，思路同 ledger。
- 管理员改分 / 手工补发权益走 `audit_log`，需二次确认与留痕。
- 权益规则（成本、上限、有效期）属闭源侧配置；前端开源只负责展示，展示值可由服务端下发。

### 4.4 阈值、时钟、对账、合规

| 项 | 做法 |
|---|---|
| 上限 | 单局积分上限、单位时间获取速率、单日上限；超限记异常而非硬拒 |
| 时钟 | 每日首次 / 活动期 / CD 全用服务端时间；客户端时间只作展示参考 |
| 对账 | 日终 `SUM(delta)` vs `accounts.balance`；可按 `user_id` 重放完整流水 |
| 回滚 | 异常账号先冻结兑换权限（不影响游玩），复核后补发或冲正 |
| 合规（待法务核对） | 平台内虚拟权益仍涉及用户权益与规则公示；国内对网络游戏虚拟货币 / 随机抽取 / 兑换有监管口径。**具体以现行监管文件为准，需核实**。手机号、设备标识属个人信息，须告知同意 + 最小必要 + 注销通道。相比实物兑换，不涉及物流、发票与第三方核销，复杂度显著降低 |

---

## 5. 排行榜

- **写入路径唯一**：只有 ledger 结算能改榜；不开放分数上报接口。
- **展示与发奖解耦**：榜单实时展示，奖励周期结算后经复核再发，保留可回滚窗口。
- 接口只返回分页可见区间 + 脱敏展示名，**不返回手机号 / user_id / 设备标识**；游标分页而非深 offset，配套限流防批量枚举。
- 榜单快照留档，便于申诉复核。

---

## 6. 前端全开源 / 后端闭源

### 6.1 共享判定核心

抽纯 TS 包 `rules-core`：**无 DOM / 无网络 / 无外部随机源 / 纯函数** `replay(seed, actions[]) → { score, events[] }`，浏览器与 Node 同时 import。

- 浏览器做乐观 UI（手感零延迟），服务端复算（结果即权威）。
- 规则透明可申诉、社区可审计，不会出现两套实现不一致。
- **版本治理必须做**：每局记 `rule_version`；包发版打 tag，服务端保留历史版本以便回放旧账。
- 红线：包里**不得含任何 secret、不得含风控阈值与权益 cost**（属闭源侧）。

### 6.2 开源前泄密扫描（v0.3 风险面变大）

| 风险 | 具体例子 | 处理 |
|---|---|---|
| 密钥入库 | `.env`、`config.example.ts` 里的**短信服务商密钥**、DB 密码、JWT secret、CI 部署密钥、Postman 里的管理员 token | 开源前用 gitleaks / trufflehog **扫全历史**（含已删除提交），命中即**轮换**（删掉不算数） |
| 内测环境暴露 | README / issue 截图里的 `api-staging.internal.xxx`、内网 IP | 配置运行时注入，仓库只放公开生产域名 |
| 接口被照着刷 | 开源协议公开 → 发码 / 结算 / 兑换接口被脚本化调用 | 见 §3.4、§4.1、§4.3：限流 + 幂等 + 服务端权威，不靠「接口藏起来」 |
| 仿冒客户端 | Fork 前端接假后端骗用户登录 | 域名/证书、CSP、Origin 校验（仅辅助）、商标条款、用户提示 |
| 漏洞被公开贴 issue | 有人直接贴可利用细节 | `SECURITY.md` + 私下披露邮箱 + 修复 SLA |

**注意**：服务商密钥从「微信 AppSecret」换成了「短信服务商密钥 + DB/JWT secret」，泄密后果从「授权被冒用」升级为「直接烧钱」，扫描优先级更高。

### 6.3 许可证与商标

- 代码开源 ≠ 名字 / Logo / 美术素材 / 服务端 API 开源。选许可证（MIT / Apache-2.0 / GPL 视诉求），明确保留商标与美术权利。
- 后端 API 加使用条款，禁止冒用官方服务名义。
- 登记素材授权链（美术、字体、音效），这是抄袭发生时真正能用的证据。

---

## 7. 技术栈定稿

**移动 H5/Canvas + TypeScript + Vite + PWA ｜ Node.js/TypeScript + PostgreSQL + Redis**

| 维度 | 理由 |
|---|---|
| 开发效率 | 前后端同语言，`rules-core` 一个包两端复用 |
| 性能 / 包体 / 首屏 | 客户端不混淆不加密，体积与启动最轻，手机端最优 |
| 留存 | **PWA（manifest + Service Worker）是「普通浏览器 + 无小程序入口」下最重要的抓手**：可添加到主屏幕、离线可玩（但离线不结算，见 §9） |
| 生态 | Web 全生态；Passkey / WebAuthn、Cookie、Service Worker 全部原生可用 |
| 防逆向难度 | **归零，且不再作为评价维度** |
| 长期维护 | 开源仓库 `npm i && npm run dev` 即可复现，无引擎编辑器绑定 |

备选：游戏若为中重度 2D → Cocos Creator 3.x（**仍必须把 `rules-core` 独立成纯 TS 包**）；Unity WebGL 不选（首屏/包体/开源可复现性都差）；微信小游戏**暂不规划**，等有服务号或明确微信分发需求再评估。

`假设：游戏是轻量到中等复杂度 2D。 验证：看玩法原型；若重度 3D/强物理，改选引擎但 §2–§6 账务与账号设计不变。`

---

## 8. 优先级与验收

### P0（MVP，可立即开工）

| # | 任务 | 验收标准（可复现的攻击测试） |
|---|---|---|
| P0-1 | 域名 + HTTPS + PWA 可安装 + Cookie 安全属性 | 真机「添加到主屏幕」可启动；Cookie 为 `HttpOnly; Secure; SameSite=Lax`；HTTP 请求全部跳 HTTPS |
| P0-2 | 出「权威边界字段表」 | 代码扫描无客户端写权威字段；积分/榜单/账号/权益全部 `server` |
| P0-3 | 建表（§11 DDL）+ 游客态开局 + 会话解身份 | 未登录直接开局可玩；伪造 `"user_id": "<他人>"` / `"phone": ...` → 仍只能操作自己数据 |
| P0-4 | `points_ledger` + `accounts` 行锁 + 幂等唯一索引 + 日终对账 | 同一结算并发 10 次只入账 1 次；`SUM(delta)` = `accounts.balance`，差额 0 |
| P0-5 | 结算改「上报操作序列」+ `rules-core` 服务端复算 + 服务端下发种子 | POST 伪造 `score=99999999` → 接口不存在/被拒；改客户端种子无效；同一 `seed+actions` 前后端结果一致 |
| P0-6 | `seq` 单调 + 幂等 + 限流 + 服务端时钟 | 重放旧包不生效；改客户端时间不影响「每日首次」；超频 429 |
| P0-7 | **Passkey 注册/登录 + 设备丢失恢复路径** | challenge 二次使用失败；伪造 origin 被拒；一个账号可挂 2 个 passkey；换设备可用手机号恢复 |
| P0-8 | **手机号短信兜底 + 发码接口防刷（§3.4）** | 连打 100 次发码 → 只发 1 条、其余 429，服务商账单无异常；已注册/未注册手机号响应**完全一致**；同一验证码用第二次失败；全局日上限触顶告警 |
| P0-9 | `entitlements` + 兑换单事务 + 冲正 | 伪造 `cost: 1` 仍按服务端配置扣减；并发兑换 10 次只成功 1 次、只发 1 份权益；事务失败时余额守恒 |
| P0-10 | 榜单展示/发奖解耦 + 写入唯一 + 响应脱敏 | 抓包看不到手机号 / 他人 user_id；无可改榜接口 |
| P0-11 | **开源前全历史密钥扫描 + 轮换** | gitleaks 扫全历史 0 命中；短信/DB/JWT 密钥已轮换一遍；`env.example` 只含占位符 |
| P0-12 | 《本期明确不做的防护》+ `SECURITY.md` + 许可证/商标声明 | 文档存在并逐条写明「不做混淆 / 不做反调试 / 不做前端密钥 / 不做微信自动登录」的理由 |

### P1（上线前）

游客绑定合并流程与二次确认、结算阈值与风控异常标记、榜单周期复核与回滚、`rules-core` 版本治理与历史回放、邮箱魔法链接（可选）、素材授权链登记、监控告警与灰度、合规法务核对（虚拟权益规则公示 + 个人信息）。

### P2（规模化后）

独立风控服务与行为序列模型、自动化攻击回归套件（把 P0 攻击测试固化进 CI）、设备指纹弱信号（需合规评估）、私服/仿冒监测与投诉下架通道；**若后续办下服务号或做小游戏，再启用 `wechat_*` provider**（表结构已留位）。

---

## 9. 矛盾与取舍（已裁决）

| 矛盾 | 裁决 |
|---|---|
| 「微信自动登录」 ↔ 普通浏览器 | **判定不可满足，需求删除**。技术上无静默路径；替代 = Passkey（体验更优）+ 手机号兜底。若未来这是硬指标，唯一解是把主载体改成微信小游戏 |
| 登录 ↔ 手机端「打开即玩」 | **Lazy Auth**：游客开局，进排行榜/兑换时才引导绑定 |
| 积分可兑换 ↔ 离线可玩 | 离线可玩但**离线不结算**：操作序列本地排队 + 幂等键，联网后服务端统一重放入账；兑换必须在线 |
| 前端全开源 ↔ 「做点保护」的直觉 | 客户端侧归零，预算全转 ledger / 复算 / 对账 / 限流 |
| 极致首屏 ↔ 后端复算 | 用 `rules-core` 做乐观 UI，视觉零延迟 |
| 后端闭源 ↔ 安全预期 | 闭源挡不住黑盒逆推；用状态归属、事务与审计说话 |

---

## 10. 假设登记表（剩余未决项）

C1/C2/C3 已由用户确认，不再列为假设。剩余：

| 编号 | 假设 | 如何验证 | 若不成立 |
|---|---|---|---|
| A4 | 至少 1 名后端，前后端同语言 | 核对人力 | 后端改托管 BaaS/云函数，但 ledger 事务、行锁、幂等唯一约束**不能省** |
| A5 | 游戏为轻量到中等 2D | 看玩法原型 | 引擎改 Cocos 3.x / 重估 WebGL，`rules-core` 仍须独立 |
| A7 | 排行榜当前无即时奖励，或奖励可延迟发放 | 看榜单规则 | 若有即时奖励 → 必须周期结算 + 复核 + 可回滚 |
| A8 | MVP 有可发起伪造请求的测试环境 | 核对环境 | P0-3/5/6/8/9 验收改接口层自动化用例 |
| A9 | Passkey 在目标用户机型上可用 | **真机实测** iOS Safari / 主流 Android 浏览器 | 支持度不足 → 手机号升为主路径，Passkey 降 P1 增强 |
| A10 | 短信服务商提供消费上限/告警 | 查服务商控制台 | 无 → 靠服务端全局日发送上限兜底 |
| A11 | 权益为「一次授予、永久或按时效持有」，无复杂库存 | 看权益清单 | 若有限量权益 → 补服务端库存扣减与超发防护 |

> 标注「以官方 / 平台 / 监管当前规则为准，需核实」的条目（备案流程、Passkey 机型兼容、微信开放平台资质、虚拟权益监管口径）均为**未知，未编造数值**，上线前须实测或核对官方意见。

---

## 11. 附录：P0 建表 DDL 与接口契约

### 11.1 PostgreSQL DDL（可直接执行，按实际需要调整字段类型）

```sql
CREATE TABLE users (
  user_id      text PRIMARY KEY,
  display_name text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identities (
  provider   text NOT NULL CHECK (provider IN
               ('guest','phone','passkey','wechat_oauth','wechat_minigame')),
  subject    text NOT NULL,
  user_id    text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user_idx ON identities(user_id);

CREATE TABLE sessions (
  session_id text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(user_id),
  expires_at timestamptz NOT NULL,
  revoked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  user_id     text PRIMARY KEY REFERENCES users(user_id),
  balance     integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE points_ledger (
  id              bigserial PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(user_id),
  delta           integer NOT NULL,
  reason          text NOT NULL CHECK (reason IN
                    ('settle','redeem','refund','account_merge','admin_adjust')),
  ref_id          text,
  idempotency_key text NOT NULL UNIQUE,
  rule_version    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON points_ledger(user_id, created_at);

CREATE TABLE redeem_orders (
  redeem_id       text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(user_id),
  entitlement_id  text NOT NULL,
  cost            integer NOT NULL,
  status          text NOT NULL DEFAULT 'fulfilled'
                    CHECK (status IN ('fulfilled','refunded')),
  idempotency_key text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entitlements (
  user_id        text NOT NULL REFERENCES users(user_id),
  entitlement_id text NOT NULL,
  ref_redeem_id  text NOT NULL UNIQUE REFERENCES redeem_orders(redeem_id),
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entitlement_id)
);

CREATE TABLE link_events (
  id           bigserial PRIMARY KEY,
  from_user_id text NOT NULL,
  to_user_id   text NOT NULL,
  reason       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor      text NOT NULL,
  action     text NOT NULL,
  target     text,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**并发写入铁律**：所有涉及积分变动的入口，都必须 `BEGIN` → `SELECT ... FROM accounts WHERE user_id=$1 FOR UPDATE` → `INSERT points_ledger` → `UPDATE accounts` → `COMMIT`。跳过行锁就是给自己埋丢更新与双花。

### 11.2 接口契约

| 方法 | 路径 | 请求（只列可信字段） | 响应 |
|---|---|---|---|
| POST | `/auth/guest` | — | `{ access_token, user_id }` + refresh Cookie |
| POST | `/auth/sms/send` | `{ phone, captcha_token }` | `{ ok: true }`（**恒同响应**） |
| POST | `/auth/sms/verify` | `{ phone, code }` | 会话 |
| POST | `/auth/passkey/options` | — | `{ challenge }` |
| POST | `/auth/passkey/verify` | `{ credential }` | 会话 |
| POST | `/auth/bind` | `{ provider, proof, idempotency_key }` | `{ user_id, merged_delta }` |
| POST | `/game/session/open` | — | `{ session_id, seed, rule_version }` |
| POST | `/game/session/settle` | `{ session_id, actions[], seq, idempotency_key }` | `{ score, points_delta, balance }` |
| POST | `/redeem` | `{ entitlement_id, idempotency_key }` | `{ redeem_id, balance }` |
| GET | `/leaderboard?cursor=` | — | `{ items: [{ rank, display_name, score }], next_cursor }` |

**全接口红线**：不接受 `user_id`、`score`、`balance`、`cost`、客户端时间戳、随机种子。`seed` / `rule_version` / `cost` 一律由服务端从会话与配置中取。错误响应统一模糊，细节只写服务端日志。

---

## 12. 发布载体评估：WorkBuddy 资料库托管页是否合适

**核实口径说明**：2026-11-06 对公开版链接做了一次抓取，只返回「正在加载发布页面」的**加载壳**，未取到页面内部 HTML/脚本细节。下文关于「平台重排 `index.html`、注入 `inject.js` 与节点标记、云端 6 个静态 artifact」的描述，来源是**本项目此前的云端产物核验记录**，不是本次抓取所见；涉及平台能力边界的条目一律标「需核实」，未编造。

### 12.1 结论

| 用途 | 是否合适 | 说明 |
|---|---|---|
| 宣传页 / 分享入口 / 二维码落地页 | ✅ **合适，建议保留** | 现成公开链接、免运维、适合展示与导流 |
| 游戏本体静态前端长期托管 | ⚠️ 勉强可用，不建议长期 | 静态分发本身没问题，但域名、响应头、SW 作用域不由你控制 |
| 承载账号 / Passkey / 积分 / 排行榜 / 兑换 | ❌ **不合适，架构级冲突** | 资料库页面是**静态页面发布/分享**，不是应用托管；v0.3 的全部核心都需要一个有控制权的服务端运行时 + 自有域名 |

一句话：**前端继续静态、继续开源都没问题；问题在于「权威状态」根本没有地方放。** 积分若只能存客户端，跟「未来可兑换权益」这条需求直接矛盾。

### 12.2 逐项冲突清单

| # | 需求 | 资料库托管页现状 | 后果 | 严重度 |
|---|---|---|---|---|
| 1 | 服务端权威 / 自定义 API | 只分发静态 artifact，无自定义后端运行时 | 积分只能存客户端 → 可随意改；与可兑换权益直接冲突 | **阻断** |
| 2 | 数据库 / 事务 / 行锁 | 无 PostgreSQL / Redis | ledger、幂等唯一约束、兑换事务、日终对账全无法实现 | **阻断** |
| 3 | 自有域名 + Passkey `rpId` | 域名 `workbuddy.link` 属平台 | `rpId` 不能绑第三方域；Cookie / Passkey / SW 三者无法同域 | **阻断** |
| 4 | Cookie / 会话 | 平台域 Cookie，跨域调用变第三方 Cookie | 浏览器第三方 Cookie 限制（Safari ITP 等）下会话不可靠；`HttpOnly/Secure/SameSite` 属性不由你定 | 高 |
| 5 | 定时任务 | 无调度能力 | 日终对账、榜单周期结算与复核、验证码过期清理跑不起来 | 高 |
| 6 | 响应头 / CSP / 缓存 / MIME | 由平台控制 | 无法自定义 CSP、缓存策略；静态资源 MIME 需依赖平台正确设置 | 中高 |
| 7 | PWA / Service Worker | scope 受平台路径约束，页面含平台注入脚本 | 离线策略与缓存不可控，「添加到主屏幕」体验打折 | 中高 |
| 8 | 前端全开源的可复现性 | 平台会重排 `index.html`（注入节点标记与脚本） | 开源仓库的 `index.html` ≠ 线上运行文件，贡献者难以逐字节复现 | 中 |
| 9 | WebSocket / 长连接 | 未提供 | 实时能力受限（当前玩法不强依赖，可暂忽略） | 低 |
| 10 | 合规与责任主体 | 带账号、虚拟权益兑换、手机号的活动挂在平台分享链接下 | 经营主体、用户协议、隐私政策、投诉通道的责任边界模糊；**平台条款是否允许需核实** | 需核实 |
| 11 | 平台能力边界 | 是否支持自定义域名 / 自定义响应头 / SW 未知 | 若平台实际支持绑定自有域名，第 3/4/6/7 项可缓解 | **需核实** |

> 项目历史上曾踩过「静态资源 MIME 不正确导致 JS 被浏览器拒绝执行」的阻断级问题（CDN 返回 `nosniff` 且 PUT 未带 `Content-Type`）。这提醒一件事：**托管能力不在自己手里时，连「文件能正常跑」都需要额外核验**，更别说承载账务。

### 12.3 目标架构

| 组件 | 放哪 | 职责 |
|---|---|---|
| 资料库托管页 | **保留原状** | 宣传 / 分享 / 二维码入口，加一个「开始游戏」跳转按钮即可 |
| 游戏前端（静态、开源） | **自有域名** | 渲染、输入、乐观 UI、PWA；无 secret，放对象存储/CDN/静态托管均可 |
| 后端 API（闭源） | **自有域名** | 会话、Passkey、短信、复算、ledger、兑换、榜单、对账 |
| PostgreSQL / Redis | 后端同侧 | 账务事务 / 会话与限流 |

**不可妥协的一条**：Passkey 的 `rpId`、Cookie 域、Service Worker scope 必须落在**同一个自有可注册域**（或其子域）。三者分家，v0.3 的认证方案就不成立。CORS 白名单精确限定游戏前端 origin，不要用 `*`。

### 12.4 渐进迁移（低成本三步，不破坏现有页面）

| 步 | 动作 | 验收标准 |
|---|---|---|
| 1 | 后端先在自有域名独立部署；资料库页通过 CORS 调用，仅先接「游客 + 开局下发 seed + 结算入账 + 榜单读取」，**不做登录** | 页面能读到服务端下发的 seed；改本地存储不影响服务端余额；结算由服务端入账 |
| 2 | 把游戏前端复制到自有域名，验证 PWA / Passkey / Cookie；资料库页降级为宣传页 + 跳转入口 | 自有域名可「添加到主屏幕」；Passkey 注册与登录成功；Cookie 为 `HttpOnly; Secure; SameSite=Lax` |
| 3 | 流量切到自有域名，旧公开链接保留跳转或提示 | 旧链接仍能到达游戏，无死链；资料库编辑态/发布态内容未被误改 |

**若坚持把前端留在平台域（退让方案）**：Passkey 不可用（rpId 绑不了平台域）、Cookie 退化为显式 `Authorization` token 每次请求携带、SW 不可控、会话受第三方 Cookie 限制——体验与安全双降，而且**后端依然必须部署在自有域名**。绕一圈还是要有自有域名，不如第 1 步就定下来。

### 12.5 需要核实（未编造，上线前逐项确认）

1. 资料库平台是否支持**绑定自定义域名**、设置自定义响应头/CSP、注册 Service Worker。
2. 平台条款是否允许在其公开发布页上开展带账号体系、虚拟权益兑换的经营性活动。
3. 公开发布态注入脚本的实际行为与影响面（本次抓取只拿到加载壳）。
4. 目标浏览器上第三方 Cookie 与 Passkey 的真机表现（对应 §10 A9）。
5. 现有页面若保留，是否需要在跳转前给用户一个明确的「前往游戏」提示，避免分享链接语义混淆。

> 本节只做架构裁决，**未对资料库云端编辑态/发布态做任何改动**；现有页面、CDN 产物与 GitHub/Gitee 仓库均保持原状。

---

## 13. 最终方案：纯前端最轻量（2026-11-06 用户裁决）

### 13.1 结论：零改动即达标

项目现状已满足全部目标：纯静态、零后端、离线可用、已开源、已上线。需求去掉「注册 / 积分 / 排行榜」后，**§12 判定的「架构级冲突」自动消失**——冲突的根源是「服务端权威」，现在不需要权威状态了，资料库静态托管页从「不合适」变回「完全合适」。

本地实证（2026-11-06）：

| 检查 | 方法 | 结果 |
|---|---|---|
| 前端零后端依赖 | Grep `app.js` 中 `fetch(` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `/api/` / `axios` | **0 命中** |
| 无外部 CDN | Grep `index.html` 的 `script` / `link` / `http(s)://` | 仅 `style.css`、`vendor/three.min.js`、`app.js` 三个**本地相对引用**，无任何外链 |
| 离线可运行 | Three.js r150 UMD 本地打包，`file://` 双击即开 | 项目历史已验证 |
| 已开源 | 根目录 `LICENSE`（**Apache-2.0**）、`changelog.md` | GitHub 主仓库 + Gitee 镜像均已上线 |
| 已发布 | 资料库公开版链接可用 | 手机浏览器直接打开即玩 |

### 13.2 保留 / 删除 / 唯一剩下的保护

| 类别 | 内容 |
|---|---|
| **保留** | 资料库现有发布页、静态前端、GitHub/Gitee 双仓库、`changelog.md` 版本管理、Apache-2.0 许可证 |
| **删除（不再做）** | 账号体系、Passkey / WebAuthn、短信验证码、Cookie / 会话、CORS、积分 ledger、`accounts` 行锁、兑换与 `entitlements`、排行榜、服务端复算、风控、日终对账、代码混淆、反调试、自建域名与后端 |
| **唯一剩下的「保护」** | **法律层**：Apache-2.0 许可证 + 版权声明 + 素材授权链。技术防护全部不需要——代码本来就公开，也没有需要守护的状态 |

### 13.3 三种零后端分发方式（都不要服务器）

| 方式 | 成本 | 适合 |
|---|---|---|
| **资料库现有发布页** | **0（已上线）** | 手机点链接直接玩、分享传播、无需任何改动 |
| GitHub Pages / Gitee Pages | 一次性开启 | 开源项目门面、可绑自有域名、随仓库自动更新 |
| 下载 zip 解压双击 `index.html` | 0 | 完全离线、无网络环境 |

推荐：**主用现有的资料库公开链接（零成本），可选补一个 GitHub Pages 作为开源门面**。不需要自有域名、不需要备案、不需要任何后端服务。

### 13.4 真正值得花力气的三件事（都在前端，均可选）

| 优先 | 事项 | 为什么 | 验收标准 |
|---|---|---|---|
| 1 | **补一份 `README.md`** | 仓库现有 `LICENSE`(Apache-2.0)、`changelog.md`、`models/.../交付说明.md`，**但没有根目录 README** → 开源访客不知道怎么跑、怎么玩 | 按 README 三步内能本地跑起来；写清键位（0–4 换档、F 阵型）、`?orbit=&pitch=&zoom=` 深链、`?hull=glb` 回退、移动端操作说明、许可证与素材来源 |
| 2 | **手机端首屏与加载空窗** | MB 级模型载荷下，历史上出现过「点开始没反应」的加载空窗（`index.html` 已有 `__NS_BRIDGE__` 早绑定脚本兜底）。「用户前端能玩」的真实瓶颈是**首屏和触控**，不是安全 | 真机 4G 下首屏可交互耗时；加载期间点「进入舰桥」有响应；控制台 0 error；窄屏按钮不被压扁（`syncCompact()`）、档位按钮不误触航向（`pointerOnUI()`） |
| 3 | **发布后静态资源 MIME 核验** | 纯静态托管**唯一**的阻断级运维风险：JS 的 `Content-Type` 不对会被 `nosniff` 拒绝执行，整页卡在加载（本项目历史踩过） | 发布态 6 个资源 HEAD 校验，其中 5 个 `.js` 均为 `application/javascript` |

### 13.5 最终验收清单（纯前端）

- [ ] 手机浏览器打开公开链接，**无需登录**即可玩
- [ ] 断网后仍可运行，或至少不白屏
- [ ] 控制台 0 error，无任何跨域 / 接口请求报错
- [ ] 窄屏 UI、双指旋转、档位与工具按钮无异常
- [ ] `file://` 直接打开 `index.html` 可运行
- [ ] 仓库根目录 `README.md` 存在且能复现运行

### 13.6 本次动作边界

只更新了本文档（加归档状态 + 本章），**未改动任何运行代码、未提交 git、未触碰资料库云端编辑态 / 发布态**；线上页面仍为 v16 原样，GitHub/Gitee 仓库不受影响。§2–§12 保留为决策记录，不作为待办清单。
