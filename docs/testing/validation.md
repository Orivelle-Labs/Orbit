# 验证方法与证据索引

用户操作见[使用指南](../user-guide/usage.md)，当前职责与安全边界见[运行机制](../architecture/runtime.md)，命令、构建和发布合同见[开发指南](../development/build-and-release.md)。本页维护验证方法及有保留价值的结果；固定日期的通过不延伸到当前版本、其他平台或真实上游。

## 按变更选择验证

| 变更                               | 入口与边界                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vue、状态与 typed IPC              | `npm run check`，页面流程按需运行 `npm run test:e2e`；合成 bridge 不代替 Tauri、系统凭据或平台网络                                                                                                                                                                                           |
| Rust/core/helper、持久化和配置事务 | [native-workflow](../../scripts/native-workflow.mjs)及受影响测试；预览失效、文件冲突、应用/恢复、迟到响应、幂等与恢复状态                                                                                                                                                                    |
| 账户、API Key 与用量               | [Panel 夹具](../../tests/acceptance/panel)、[真实消费者](../../crates/orbit-core/src/service/tests/panel_acceptance.rs)及[本地发布检查](../../crates/orbit-core/src/service/tests/release_check.rs)；独立数据库和内存 Vault 不代表系统 Vault 或真实钱包                                      |
| 图片网络与本地保存                 | [发布检查](../../crates/orbit-core/src/service/tests/release_check.rs)的独立合成链路，真实上游另走[显式入口](../../crates/orbit-core/src/service/tests/image_live_demo.rs)；草稿权限与提交资格分别检查，结果不确定不重发                                                                     |
| 图片销售价格                       | [原生映射与缺价前置检查](../../crates/orbit-core/src/service/tests/image_pricing.rs)、[十进制估算](../../tests/unit/image-pricing.test.ts)、[工作台流程](../../tests/e2e/image-pricing.spec.ts)；两档各自按张/Token、账户费率、零价/缺价、旧目录与不同币种，均为合成数据，不证明真实账户消费 |
| 托盘、窗口和文件系统               | 目标 OS 的真实 app、系统控件、普通用户令牌和实际窗口事件；浏览器 UA、纯几何测试、快捷键不代替真实托盘鼠标事件                                                                                                                                                                                |
| 安装、更新和发布                   | 双平台 package evidence、NSIS/DMG 与 updater 签名；包可创建、签名通过、安装/重启成功分别记账                                                                                                                                                                                                 |

运行前固定完整源码、依赖锁、数据目录和实际包摘要，明确 peer、HTTP、Vault 与资金的替换组件。生产构建排除 demo/fixture；独立标识、数据库和非持久 WebView 的演示应用不证明正式数据迁移或登录链路。

以下外部入口保持显式 opt-in，具体保护以当前源码为准：

- [真实本地 Panel](../../crates/orbit-core/src/service/tests/panel_acceptance.rs)：受保护的独立 Panel/MySQL/TLS 与私有输入，包含 Key 管理和结果未知后的核对。
- [合成图片/只读用量](../../crates/orbit-core/src/service/tests/release_check.rs)：真实原生消费者与本地组件，合成会话/内存 Vault。证据目录以 create_new 防止同一用例原地重放。
- [真实图片上游](../../crates/orbit-core/src/service/tests/image_live_demo.rs)：当前明确预算与专属 fixture；重建目录不增加付款授权。
- [Codex/Keychain roundtrip](../../crates/orbit-core/src/service/tests/macos_config_roundtrip.rs)、[NativeVault](../../crates/orbit-core/tests/macos_native_preflight.rs)和 [CLI signer](../../crates/orbit-core/tests/updater_cli.rs)：各有独立 ignored 入口，不能计入普通合成通过。

未运行与 ignored 分开记录；历史预算、凭据及真实客户端写入授权不延续。Windows 真实多屏/DPI、全新 WebView2 引导和 macOS 完整签名包安装/在线更新等，须按实际候选另行提供证据。

## 测试维护边界

按核心业务风险维护测试，不以声明数或覆盖率为目标。重复或非核心展示组可直接退休，并明确接受减少的保护；不能靠 skip、放宽必要断言或缩窄发现入口隐藏失败。

当前退出的范围包括双平台/双宽度的窗口几何与滚动恢复矩阵、API Key 页搜索图标/窄窗布局、菜单栏主题/CSS/截图排列、首页及设置页文案/控件清单、图片比例和统一缩略图布局，以及重复的更新通知几何/普通倒计时检查。这些界面细节以后不再有等价的完整自动回归。

本轮另退出 Claude 映射提示和已绑定显示的多宽度布局/截图、用量错误提示的间距与右对齐、分页滚动几何、英文暗色价格窄窗布局、Windows UA 窗口控件投影烟测，以及 Codex 目录同步通知的文案与静默排列。这些展示和通知细节不再有等价的完整自动回归；用量错误重试后保留统计、分页仅重读记录且不重建统计或导航、已绑定模型与跨账户隔离仍有代表性浏览器流程。Windows 真实启动、原生事件、更新以及键盘/焦点入口继续保留。

保留账户切换与迟到响应隔离、精确金额/币种/未知费用、凭据与恢复快照边界、生成前确认及禁止重试收费请求、更新下载取消/迟到事件/安装确认，以及图片保存、局部删除和持久改名。菜单栏的隐藏轮询、财务与账户隔离保留在 unit，键盘/焦点和 Escape 保留在 menubar-focus 浏览器入口；更新通知仍验证更新结果、倒计时替换和错误提示不被旧计时器清除。保存配置/Key 绑定的保留用例同步当前成功提示和独立状态徽标，继续要求明确确认、只提交一次，以及没有载入/连接成功的虚假声明。原生 Rust、安装/签名测试、测试发现和 CI 入口保留。浏览器 fixture 不代表真实系统托盘、原生安装或上游验收。

## 保留的原生回执

机器 JSON 按原字节保留，绑定其源码、平台和实际包；旧参数及界面只描述当时版本。原生包只允许构建合同规定的 Tauri UNK→NSS 标记差异，不能泛化任意摘要差异。

| 回执                                                          | 用途与范围                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Windows v1.0.2](evidence/v1.0.2-windows.json)                | v1.0.1 到候选的安装与数据保留，使用受控 HTTPS peer                                 |
| [DMG v1.0.2](evidence/v1.0.2-dmg.json)                        | 挂载与 Finder 布局，不含安装后更新或重启                                           |
| [macOS 快捷面板](evidence/menubar-native-2026-11-14.json)     | 单屏/全屏点击及修复，多屏与后续右键另验                                            |
| [Windows 原生客户端](evidence/windows-native-2026-11-15.json) | 托盘、客户端请求与恢复；按 current_delivery / follow_up_ordinary_user 判断最终交付 |
| [Windows updater](evidence/windows-updater-2026-11-15.json)   | 临时信任密钥下 NSIS 实装/重启，构建与验收脚本来源分别绑定                          |
| [macOS 焦点](evidence/tray-focus-native-2026-11-16.json)      | NSPanel/WKWebView 焦点，不代替完整 Tauri 或真实图标点击                            |

Windows 普通用户入口为 [with-panel-fixture.ps1](../../tests/windows/with-panel-fixture.ps1) 的 `-OrdinaryUser`，仅适用于明确标记的 disposable VM。使用已有 .NET Framework 将 [hidden-test-host.cs](../../tests/windows/hidden-test-host.cs) 编为 GUI host，测试启动器和观察器不进入发行物。

2026-11-15 的 Windows 回执包含真实普通用户检查；提升权限的准备进程不作为 app 运行条件。早期控制台黑窗的归属未捕获，验收启动器隐藏进程后未再观察到控制台显示，不能据此确定原反馈根因。Codex publishing 冲突、测试选择器及 fixture 缺路由等首轮问题与最终复验分别判断。

## 平台、图片与更新的关键结论

- **平台读取（2026-11-18）**：原生用量消费者经 TLS/Ed25519、真实 Panel/MySQL 读取合成调用，父付款账户未读到子账户记录；真实聚合 flush 后钱包与账本未变。内存 Vault 和预置会话不证明真实登录链路。
- **图片执行（2026-11-17）**：原生 Service 经真实 Panel/MySQL、Edge 和受控上游，覆盖默认订阅、API stream+n=2 及蒙版编辑的本地保存、解码与禁止重发。旧版本 Service 成功不代表旧 UI 或正式包已验收。
- **真实图片（2026-11-11）**：当时仅执行一张生成和一张编辑；实际文件均为 1536×1024 PNG，与请求尺寸/格式并不完全一致。使用合成会话、FakeVault、独立 SQLite 钱包和内存凭据 broker，合成销售共 USD 0.02；不覆盖桌面登录、系统 Vault、MySQL 并发，也不证明所有请求参数被兑现。
- **Windows 更新（2026-11-15）**：临时密钥和受控 HTTPS 下，签名 NSIS 0.2.0→0.3.0 完成安装、重启与数据保留，覆盖错误签名、取消、维护互斥和安装前篡改。仅断言脚本变化时复用原包，不能称为当前源码重编；无正式 Release，也不具有 macOS 同等自动回滚证明。

图片草稿隔离、标题持久化、模型目录同步与配置恢复的现行行为由单元/浏览器/Rust 回归维护；源码入口见上表和[运行机制](../architecture/runtime.md)，失效演示端口及逐轮统计不作为使用前提。

## 结果维护

说明保留必要的源码、环境、替换组件与结论，现存回执直接关联到本页。更新现有主题，清理无继续价值的阶段过程和失效路径；不通过旧稿索引或固定提交查询维持文档可用性。可执行 Panel 夹具继续位于 [tests/acceptance/panel](../../tests/acceptance/panel/)。
