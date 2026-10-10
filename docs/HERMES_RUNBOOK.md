# Hermes 可执行运行手册

## 输入清单

部署者提供的非敏感信息：目标域名/是否已有服务器、能否运行Node/Docker、表格字段名与类型、发布状态规则、手机系统/浏览器/App版本。

敏感信息只提供本地路径或秘密环境：飞书四项配置、服务器连接方式、工作台账号密码、SESSION_SECRET。不要向聊天索要密钥。不要复用原部署的任何私有文件。

默认部署策略：新子域名 + 单Node服务 + 本地限时媒体缓存。已有代理就复用代理；没有代理且有服务器/域名才用Compose的Caddy。没资源时先演示；临时真实联调用电脑+Tunnel。OSS无需准备。

## 阶段A：代码与模拟验收

```sh
git clone https://github.com/yefan710/feishu-xhs-mobile-publisher.git
cd feishu-xhs-mobile-publisher
npm ci
npm test
npm run demo
```

用真实浏览器点击登录demo → 默认否 → 账号A → JW10001 → 具体记录 → 三张预览 → 状态纠正标是 → 看回读确认和记录离开否列表 → 恢复否 → 切到账号B确认未被改变 → 退出登录。电脑不应发起真实App导航。模拟图是占位PNG，不作为真实图片品质验收。

记录：Node版本、npm test数量/exitcode、URL、实际点击步骤和截图路径。失败先修复，不得用文字存在或build成功代替点击验收。

## 阶段B：填配置与只读飞书检查

```sh
npm run setup -- --public-url https://你的子域名
npm run create-user -- --username 你的登录名
npm run doctor
npm run check:feishu
```

先让部署者在本地填写 `data/feishu.json` 或用受控文件操作从其指定秘密文件导入，不打印内容。检查右侧field mapping、严格类型、单选是/否以及表协作权限。check:feishu仅输出账号/JW/可用记录**数量**，不下载附件、不写任何记录。读表成功不能代表附件下载或写入权限成功。

若表格式不符，给出具体字段类型差异和迁移办法；不擅自修改原表、不清空历史状态。若应用未发布或无授权，停在此阶段明确缺什么权限、由谁提供。

## 阶段C：选择部署路径

### 已有网站或代理

用独立hostname，不占原网站/API。`npm start`或仅启动Compose的app服务；按部署者授权增加一段代理配置。备份原配置、检查语法、重载，确认旧站可正常访问。不要覆盖原站目录。

### 新Linux服务器+域名

确认DNS和80/443可达、供应商要求的认证/备案已完成。按README更正data目录uid1000权限，启动全部Compose服务。等待证书有效，再测HTTPS。购买、条款确认或其他需人操作的环节交给部署者；没有资源时做本地可复查产物，不把申请完成当成已部署。

### 无服务器/域名，临时验证

使用官方cloudflared；先启动本地服务，开启Quick Tunnel，把临时HTTPS地址写入 `.env` 后重启服务。保持Tunnel进程；确保图片路径无需额外门户登录。临时URL改变须重新prepare。

## 阶段D：真实测试行与手机

先取得部署者明确指定的测试record_id（新建测试行，状态否，非业务历史素材）。

1. 从手机移动网络访问工作台登录、筛选、prepare。
2. 检查全部图片URL能在无网页登录的另一浏览器请求中直接返回image/*，证书有效且没有302登录页。
3. 在工作台点击发布前，手机App已登录对应账号；实际点击并核对图片数量/顺序、标题、正文、标签。
4. 小红书最终发布由人完成；未发布也必须标记清楚。返回网页看回写确认，在飞书核对**该测试record_id**的状态以及其他记录未变。
5. 测试取消/导入失败，回网页恢复为否，飞书再次核对。
6. Android至少按实际目标机型测Intent和必要时scheme，iOS按实际需要测。记录系统/浏览器/App版本，任何未测组合标未验证。

不得自己登录原作者网站、批量标记真实业务、用自动App点击绕过平台或使用UA伪装掩盖失败。

## 阶段E：交付与运维

输出入口URL、部署路径、服务启动/恢复命令、私有配置位置（不输出值）、备份/账号撤销方法、验收证据与剩余限制。写入私有 `work/checkpoint.md`。

启动/检查：`docker compose ps`、`docker compose logs --tail=30 app`；更新：先备份配置与审计，再拉取代码运行npm ci/test，按已选部署路径重建/重启。更新不要切换成DEMO_MODE，不要删除尚有效的缓存；域名变化后重新准备任务。

备份 `.env`、`data/feishu.json`、`data/publish-accounts.json`，保存在受保护位置；audit按你的保留规则备份轮转。缓存图可不长期备份。账号禁用/密码替换即时撤销旧登录；旋转SESSION_SECRET撤销全部会话，旋转飞书secret需改配置并重启。

最后检查 `git status --ignored`：没有把.env/data/logs/截图里的素材添加进仓库。失败报告应含阶段、具体阻塞、影响、下一步；不要写“全部通过”掩盖真机未测。
