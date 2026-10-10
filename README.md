# 飞书素材 → 小红书手机发布工作台

把飞书多维表格中的图文素材交给手机上的小红书编辑器：登录网页，选择发布账号和 JW 编号，预览图片、标题、正文、标签，点击发布，再在小红书里核对并完成最后一次发布。

本项目由已有网站中的实际发布模块提取为独立 Node.js 服务。**不需要小红书小程序，不需要小红书 appKey/appSecret，也不需要 OSS。** 原使用者反馈手机问题已经解决；新的手机、浏览器、小红书版本仍要按 [真机验收](docs/TESTING.md) 实测。App 交接使用未公开保证的协议，不能承诺所有机型永久兼容。

**状态含义：点击网页「发布」就请求把飞书「是否发布」改为「是」，并回读验证。这表示发起交接，不是小红书发布成功的回调。** 导入失败或取消时，返回网页点「取消 / 失败 · 恢复为否」。网页不会自动切换小红书账号，也不会自动点击 App 的最终发布按钮。

## 交给 Hermes 的入口

先让 Hermes 读 [AGENTS.md](AGENTS.md)、[部署运行手册](docs/HERMES_RUNBOOK.md) 和 [技术实现](docs/ARCHITECTURE.md)。可以直接复制这段指令给它：

> 请复用此仓库，为我独立部署飞书素材手机发布工作台。先读 README.md、AGENTS.md、docs/HERMES_RUNBOOK.md 和 docs/ARCHITECTURE.md。先运行模拟演示与测试，确认我的表格字段和网站环境，再配置我的飞书应用、独立发布账号和公开 HTTPS 地址。凭据只从我指定的本地文件或环境变量读取，不发到聊天、不提交 Git。保持默认状态「否」和点击发布回写「是」的规则。按照 docs/TESTING.md 分开验证浏览器操作、飞书回读和手机 App 导入，记录证据；不要把生成链接或打开 App 当成发布成功。不要购买资源、覆盖我已有的网站或改动历史记录。

## 功能与范围

| 功能 | 当前实现 |
|---|---|
| 工作台登录 | 独立账号；加盐 scrypt 密码哈希；12 小时 JWT；账号禁用/改密码撤销旧登录 |
| 飞书筛选 | 按账户名称、JW 编号、是否发布；默认「否」；空状态按「否」显示 |
| 图片准备 | 支持 1–18 张 PNG/JPEG/WebP/GIF；按附件顺序下载；每张最大 20 MiB |
| 手机交接 | iOS OIA 链接；Android Intent 指定包名；可手动选择 Android scheme 备用 |
| 状态更新 | 精确 record_id；只更新「是否发布」；幂等回写；飞书再次读取确认 |
| 防止旧素材误写 | 准备时保存账号、文字、附件快照；内容变化后拒绝旧任务回写 |
| 图片链接 | 服务器本地缓存；随机凭证；有效期 2 小时；过期不能读取 |
| 缓存维护 | 每 15 分钟清理过期素材；审计日志记录回读后的状态操作 |
| 演示 | 不连接飞书；模拟账号与三条记录；占位图片；仅演示筛选和状态 |
| 不在当前范围 | 视频、自动切换 App 账号、无人值守发布、发布成功回调、OSS 上传、多实例锁、每用户独立表格 |

## 你要先准备什么

| 项目 | 必要吗 | 已有时怎么用 | 没有时怎么准备 / 替代 |
|---|---|---|---|
| 飞书组织和多维表格 | 真实模式必要 | 使用你自己的表格及附件 | 新建或复制表格；先用模拟演示，不必立即授权真实表 |
| 飞书企业自建应用 | 必要 | 复用有权限的应用，或新建专用应用 | 在飞书开放平台创建企业自建应用；申请读字段、读记录、改记录、下载素材权限，发布版本 |
| 应用在目标表的访问权限 | 必要 | 将应用加入该表协作者并授予需要的读写范围 | 由表格所有者操作；仅开通 API 权限不等于能访问该表 |
| 运行 Node.js 的网站后端 | 必要 | 现有服务器运行此独立服务，反向代理到新子域名 | 申请云服务器，或先用自己的电脑运行 Node.js + 临时 HTTPS 隧道 |
| 手机与 App 可访问的 HTTPS 地址 | 真实交接必要 | 现有域名的子域名最方便 | 买域名并配置 DNS/TLS；临时试验可用 Tunnel 自动域名；托管平台域名须实测国内手机可达性 |
| 自己购买的域名 | 长期建议 | 用 `publish.你的域名` | 临时 Tunnel 不需要自有域名；长期地址更稳定，不必拥有独立官网 |
| OSS / COS / R2 等对象存储 | **不必要** | 可以先完全不用 | 本项目自带本地短期缓存；后续高流量时再改造存储适配层 |
| 小红书小程序、企业认证、分享开放平台凭据 | 本路线不需要 | 不读取这些凭据 | 不用为此项目先申请；若转官方 SDK，另行按平台当前规则申请，不能混用小程序 AppID |
| 手机上的小红书和外部浏览器 | 必要 | Android 先测试 Chrome；iOS 测 Safari | 安装 App 并登录正确发布账号；最终兼容结果以真实机型实测为准 |

你不需要复制原作者的网站、服务器、登录账户、飞书密钥或图片。此仓库只包含脱敏代码、空配置模板和合成测试数据。

## 1. 零凭据先跑演示

安装 Node.js 22 LTS 或更新 LTS、Git。Windows PowerShell 和 Linux/macOS 终端都可以运行：

```sh
git clone https://github.com/yefan710/feishu-xhs-mobile-publisher.git
cd feishu-xhs-mobile-publisher
npm ci
npm test
npm run demo
```

电脑访问 `http://127.0.0.1:3000/`，演示账号 `demo`，密码 `demo-only-password`。依次筛选「演示账号A」、`JW10001`，点击记录，展开「状态纠正与备用操作」，标记为是，再恢复为否。

演示只在内存中改变合成记录，重启恢复；图片为占位像素。**演示不提供真实 App 导入，不应公开当作生产服务。** `npm run demo` 默认只监听本机。不要在生产环境启用 `DEMO_MODE=1`。

## 2. 配置飞书应用和表格

1. 在 [飞书开发者后台](https://open.feishu.cn/app) 登录自己的组织，创建「企业自建应用」。在凭证页获取 App ID 和 App Secret，写入本地配置文件。
2. 在权限管理中，依据下表的官方接口文档申请对应**应用身份**权限。支持细分权限时只申请所需范围；若控制台提供的是整体「查看、评论、编辑和管理多维表格」，按表格读写用途申请。素材下载也必须单独检查权限要求，不要用仅看网页的权限代替。
3. 创建并发布应用版本，按组织规则完成管理员审批，使新权限生效。
4. 由表格所有者在多维表格分享/协作者设置中添加应用，赋予需要的编辑权限。高级权限表还要给应用可见的行、字段和附件；发布状态字段必须可写。来自其他数据源的只读同步表不能作为回写目标。
5. 打开表格，确定 `app_token` 和 `table_id`。常见独立 Base 链接为 `/base/<app_token>?table=<table_id>`；Wiki 文档链接不能直接把 Wiki token 当 app_token，须先解析到实际多维表格。参照官方 [Bitable 接入指南](https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview)。
6. 表格中保留下面八类字段。原来的快捷字段二维码可以保留，本程序不读取它。

| 用途 | 官方接口 |
|---|---|
| 获取应用 tenant_access_token | [自建应用获取访问凭证](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal) |
| 检查字段名、类型、状态选项 | [列出字段](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/list) |
| 读取素材队列 | [列出记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/list) |
| 回写状态并再次读取 | [更新记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/update)、[获取记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/get) |
| 下载表格附件 | [下载素材](https://open.feishu.cn/document/server-docs/docs/drive-v1/media/download) |

权限标识与控制台界面可能调整，以接口文档的「权限要求」和你所在组织的授权结果为准。`npm run check:feishu` 只验证读表/字段，不会擅自通过写业务数据证明权限。

### 字段契约

| 默认字段名 | 飞书类型（API type） | 约束 |
|---|---|---|
| 课件编号 | 文本（1） | `JW` + 数字，例如 `JW10001` |
| 账户名称 | 文本（1） | 必填；这是素材归属，不是网页登录名或 App 授权 |
| 使用模板名 | 文本（1） | 必填，用于区分同一 JW 多套素材 |
| 笔记标题 | 文本（1） | 必填；发布前在 App 检查当前长度限制 |
| 笔记正文 | 文本（1） | 必填；保留换行 |
| 笔记标签 | 文本（1） | 可为空；例如 `#教育 #课件` |
| 图片/视频 | 附件（17） | 本版本只处理图片；1–18 张，不自动截断视频或超量附件 |
| 是否发布 | 单选（3） | 必须同时有「是」「否」两个选项；未填写按「否」展示 |

如果朋友的「发布状态」是复选框、公式、快捷字段或多选，需新建可写的单选字段并映射，不能只改字段名。如果「账户名称」是多选/关联记录，先建立真实文本字段作为本工作台入口；此版本严格检查类型，不猜测转换。

同一个 JW 可以对应不同账号、不同模板、不同记录，最终操作使用 **record_id**，避免把 A 账号素材写到 B 账号。

### 填写私有配置

```sh
npm run setup -- --public-url https://publish.example.com
```

将示例域名替换成你的地址。此命令生成 `.env` 随机会话密钥和 `data/feishu.json`，不会覆盖已有文件。用本地编辑器填写：

```json
{
  "app_id": "你的应用ID",
  "app_secret": "你的应用密钥",
  "app_token": "你的多维表格token",
  "table_id": "你的数据表ID",
  "fields": {
    "课件编号": "课件编号",
    "账户名称": "账户名称",
    "使用模板名": "使用模板名",
    "笔记标题": "笔记标题",
    "笔记正文": "笔记正文",
    "笔记标签": "笔记标签",
    "图片/视频": "图片/视频",
    "是否发布": "是否发布"
  }
}
```

`fields` 左边是程序内部标准名，右边是你表格的实际列名。例如把右边改为 `"课件编号": "JW编号"`、`"是否发布": "发布状态"`。八个实际列名不能重复。配置在进程中缓存，改动后重启服务。不要把这份真实文件发到 GitHub、聊天或浏览器。

## 3. 创建自己的工作台登录账号

```sh
npm run create-user -- --username publisher
npm run doctor
npm run check:feishu
```

第一条会隐藏输入密码，要求 12–512 字符。账号文件只保存加盐 scrypt 哈希。Hermes 非交互运行时可以从已有秘密管理器注入 `PUBLISH_PASSWORD` 环境变量，运行命令后清除；禁止把密码放到 `--password` 参数、日志或公开脚本里。

已有用户更换密码：`npm run create-user -- --username publisher --replace`，旧 JWT 会立即失效。禁用用户：在私有 `data/publish-accounts.json` 对该用户设置 `"disabled": true`。目前一个部署共享一张表；所有登录用户都能筛选该表所有账号，**没有每用户行级隔离**。朋友使用自己的服务器、自己的表和自己的账号即可。

## 4. 已有网站 / 服务器：怎么挂进去

你只需要一个能运行 Node.js 的后端，不必另做一个门户网站。建议为现有域名新增 `publish.example.com` 子域名，独立运行本项目，再用 Nginx/Caddy 反向代理。这样不会占用原网站的 `/api` 路由。

```sh
npm ci --omit=dev
npm start
```

默认监听 `127.0.0.1:3000`。在现有反向代理里参考 [Nginx 示例](deploy/nginx.conf.example)，替换域名与已有证书路径，设置读取超时至少 200 秒（图片准备可能较慢），先检查代理配置再重载。`.env` 中的 `APP_PUBLIC_URL` 必须等于手机访问的 **HTTPS 根地址**。不要用浏览器中的 localhost、内网 IP 或未签发证书地址作为图片公网 URL。

本版使用网页同源 `/api`，**不直接支持 `/某个子目录/` 安装**。若必须嵌入已有后台子路径，Hermes 要同步修改前端 API、静态资源、反向代理和生成图片 URL，并补做测试；不能把当前根路径版直接拷贝到后台目录后宣称已经部署。

## 5. 从零搭网站、域名、HTTPS

以下是部署路径，不代替资源购买授权，价格和活动以供应商下单页面为准。

1. 在云服务商注册自己的账号、完成相应认证，申请一台能运行 Node.js 22 / Docker 的 Linux 云服务器，具备公网访问。小规模可先从 1–2 vCPU、2 GiB 内存和足够图片缓存的磁盘试验，再按实际并发调整；这是起步规格，不是容量保证。
2. 没有域名时，在域名注册商查询可用域名，填写持有者资料、完成认证并购买；已有域名只增加子域名即可。阿里云可参考 [域名注册快速入门](https://help.aliyun.com/zh/dws/getting-started/quickly-register-a-new-domain-name)。
3. 在 DNS 控制台添加 `publish` 的 A 记录指向服务器公网 IPv4。IPv6 只有真实可用时才加 AAAA，错误 AAAA 会造成部分手机连接失败。
4. 云安全组放行 80/443；应用 3000 端口只向本机开放；管理端口按自己的运维要求限制。用中国内地服务器提供网站时，按服务商要求完成 ICP 备案后开放域名访问；参阅 [阿里云备案](https://beian.aliyun.com/)。其他地域也须遵守当地和业务适用要求。
5. 安装 Git、Node.js 22 LTS、Docker Engine 和 Compose 插件，克隆仓库，完成上述配置与账号创建。`.env` 中 `APP_DOMAIN` 填同一域名，`APP_PUBLIC_URL` 填对应 HTTPS 地址。
6. 没有现成反向代理时，使用仓库的 Compose + Caddy。DNS 正确、80/443 可访问后，Caddy 自动办理和续期 HTTPS 证书，参见 [Caddy HTTPS 指南](https://caddyserver.com/docs/quick-starts/https)。

```sh
# Linux：容器使用 uid/gid 1000，先让私有目录可由它访问。
# 确认当前路径确实是本项目，勿对系统目录执行递归操作。
mkdir -p data/media
sudo chown -R 1000:1000 ./data
sudo chmod 700 ./data
sudo chmod 600 ./data/feishu.json ./data/publish-accounts.json
docker compose up -d --build
docker compose ps
docker compose logs --tail=30 app
```

现在用手机移动网络打开 `https://publish.你的域名/`，登录并预览真实测试记录。Caddy 需要公网 DNS 和验证端口正常，不能在证书告警页面选择绕过警告来验收。

如果服务器已经运行 Nginx/Caddy，占用 80/443，**只启动 `docker compose up -d --build app`**，由现有代理转发到 `127.0.0.1:3000`；不要启动另一个抢占端口的 Caddy。备份现有代理配置，不覆盖其他网站。

Compose 映射持久化 `./data`；后续创建/改密码可执行 `docker compose exec app node scripts/create-user.cjs --username publisher --replace`。主机再次运行 setup/账号脚本时，要使用有私有目录权限的身份。保持单实例，不能直接扩到多个副本。

### 没有服务器或域名：先用电脑 + 临时 Tunnel

1. 保持电脑联网，先在本机准备真实飞书配置与账号。
2. 从 [Cloudflare 官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) 安装 `cloudflared`；运行 Node 服务后，在另一个终端执行：

```sh
cloudflared tunnel --url http://localhost:3000
```

3. 它打印随机 `https://xxx.trycloudflare.com` 地址。保持隧道进程运行，把 `.env` 的 `APP_PUBLIC_URL` 改为这个地址，重启 Node 服务，重新选择素材。手机访问同一 HTTPS 地址。
4. 此路径无须自有域名或服务器，但电脑关机、隧道退出、随机域名变化后旧素材链接会失效。Quick Tunnel 用于测试，无可用性保证；国内不同网络可能不可达，须分别测试手机浏览器与 App 图片下载。

不要给图片 URL 加额外的 Cloudflare Access/邮箱登录页面，小红书获取图片时无法代替人完成登录。工作台和业务 API 已有自己的账号鉴权，只有随机限时图片 URL 对外可读。

其他替代：支持长期 Node 进程、HTTPS 和持久磁盘的托管平台。GitHub Pages、纯 OSS 静态网站只有前端，不能安全保存飞书密钥、下载附件或回写状态；需要另配后端，不能当作本项目的完整替代。Serverless 的执行时限/临时磁盘也可能不适合准备18张图片，迁移前要改造并实测。

## 6. OSS 要不要申请？有了又怎么用？

**先不申请也能完整运行。** 当前链路是「飞书附件 → Node 下载到 `data/media` → 同一网站提供临时 HTTPS 图片 → App 获取」。它使用服务器公网下行流量和磁盘；缓存15分钟检查一次，过期即拒绝访问，文件实际删除可能稍后发生。

若以后希望减轻服务器带宽或使用对象存储，可准备：

1. 在自己的阿里云账号开通 OSS，创建独立 Bucket，选合适地域，保持私有访问；参照 [OSS 控制台快速入门](https://help.aliyun.com/zh/oss/user-guide/console-quick-start/)。
2. 使用只针对该 Bucket / 前缀的 RAM 凭据，放服务器秘密配置。不要使用账号根密钥，也不要在网页中保存 AccessKey。
3. 由后端上传图片并生成短期签名 HTTPS GET URL，签名有效期应覆盖交接和下载时间；根据需要配置自定义域名和 HTTPS，参照 [绑定自定义域名](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names)。不要用 OSS 内网 Endpoint 给手机。
4. 设定临时对象生命周期和费用告警；确认 App 访问不被防盗链、登录页或过短签名有效期拦截。

**此仓库还没有 OSS 上传适配器，不能仅填一个 Bucket 就启用。** Hermes 需替换 `prepare` 的存储步骤、生成 URL 和过期清理，保留字段快照、顺序、鉴权和回读测试。COS / R2 可按同样接口另做适配；当前最省改动的替代就是已有本地缓存。

## 7. 手机操作、迁移与故障排查

1. 在小红书先登录目标账号。浏览器工作台的「账户名称」只是选择对应素材。
2. 打开你的 HTTPS 工作台，登录；默认「否」，选账号，再选 JW，点具体一条记录。
3. 等待全部图片准备完成，核对图片数量/顺序、标题、正文、标签和账号。
4. 点「发布」。原生可见链接打开 App；同时网页请求回写「是」。在 App 里检查所有字段，再由你点最终发布。
5. 返回网页看「飞书回读确认」，并在飞书核对该条记录。失败/取消则恢复为「否」。

旧二维码字段可改为你的工作台入口链接/二维码。当前基础版不需要逐条二维码：同一个固定入口登录后选账号/JW即可。不要往二维码 URL 放密码、JWT、App Secret 或长期附件地址。切换时先用一条新建测试记录验收，再逐批使用，别批量重置历史「是」记录。

| 现象 | 排查与处理 |
|---|---|
| 点击发布无反应 / 下载提示 | 先恢复状态为否；确认 App 已安装；Android 用 Chrome 测 Intent，再手动选 scheme 备用；iOS 用 Safari；退出微信/飞书内嵌页；记录系统、浏览器、App版本。不要下载所谓 Lumi 文件 |
| `AbortSignal.timeout is not a function` | 当前 `request.js` 使用计时器和可选 AbortController，无此 API 依赖；确认线上确实更新到了本版本，刷新缓存 |
| 读表成功但图片失败 | 检查素材下载权限、高级权限及附件 `extra`；检查实际 MIME、大小和是否混入视频；后端使用带表格权限信息的下载请求 |
| 网页图片好但 App 没图片 | 用另一网络测试随机图片 URL 无登录访问，检查 HTTPS证书、公网 DNS、反向代理、过期时间；内网IP和 localhost 不是公网素材地址 |
| 飞书状态写失败 | 检查应用版本权限、表协作权限、字段可写、单选选项；素材被修改会返回409，重新选择；网络未确认返回后会重试，仍须人工回读 |
| 同一JW多条素材 | 按账号/模板选择正确记录；代码使用 record_id，不会按 JW 批量改全部 |
| 服务重启/域名变化 | 已准备任务在磁盘中保留至过期；JWT 密钥改变会使旧登录失效；新域名须重新准备图片 |
| App 打开但标题/标签没带入 | 协议可能已变化；保存无密钥的版本信息和字段表现，逐平台修复 `direct-route.js`；不能只因为 App 打开就判通过 |

Android Intent 必须保留真实点击手势。当前实现事先生成可见 `<a href>`，点击时不等待回写、不模拟隐藏链接点击；这是为避免异步后唤起被浏览器拦截。参考 [Chrome Android Intents](https://developer.chrome.com/docs/android/intents)。浏览器选择仍需真机验证，不能承诺某个浏览器一定成功。

## 技术、测试与安全文档

- [技术实现与接口契约](docs/ARCHITECTURE.md)：数据流、协议负载、状态、快照、限流和扩展点。
- [Hermes 运行手册](docs/HERMES_RUNBOOK.md)：逐阶段命令、读回证据、部署分支、停止条件。
- [验收清单](docs/TESTING.md)：自动测试、浏览器点击、飞书测试行、手机最后交接。
- [安全边界](docs/SECURITY.md)：私有文件、图片凭证、权限范围、日志和单实例限制。
- [交付时的验证记录](docs/VERIFICATION.md)：已验证内容与未验证内容。

协议来自 [Aixuangit/Lumi](https://github.com/Aixuangit/Lumi) 的图文交接实现，保留 [NOTICE](NOTICE) 和 [Apache-2.0 LICENSE](LICENSE)。本项目不是小红书官方 SDK，没有官方背书。官方替代请查看 [分享开放平台 JS 文档](https://agora.xiaohongshu.com/doc/js) 和 [Android 文档](https://agora.xiaohongshu.com/doc/android)，凭据、可用字段和开放状态按当时平台规则另行评估。
