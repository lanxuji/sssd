# 迁移到 Cloudflare Pages

从 Netlify 迁到 Cloudflare Pages，全程免费，不需要改任何代码。

---

## 一、为什么迁

| | Netlify 免费版 | Cloudflare Pages 免费版 |
|---|---|---|
| 流量 | 100 GB/月 | **不限量** |
| 带宽计费 | 超限会停站 | 不计费 |
| 构建 | 300 分钟/月 | 500 次/月 |
| 国内访问 | 一般 | 较好（亚太节点多） |
| 站点默认可见性 | **私有**（需手动 Make public） | **公开** |

---

## 二、部署步骤（拖拽，5 分钟）

### 第 1 步：注册
打开 `dash.cloudflare.com` → 注册（免费，不要信用卡）→ 邮箱验证。

### 第 2 步：创建项目
左侧 **Workers & Pages** → **Create** → **Pages** → **Upload assets**（上传静态资源）。

### 第 3 步：上传文件夹
- **Project name**：起个名字，比如 `sssd`，最终网址就是 `sssd.pages.dev`
- 把 **`sclh-app` 文件夹里的内容**拖进虚线框

> ⚠️ **关键**：是打开 `sclh-app` 后**里面的内容**（index.html、css、js、icons、vendor、manifest.json、sw.js、`_headers`），**不是** `sclh-app` 这个文件夹本身。
> 传错会导致根目录没有 `index.html`，访问就是 404。

### 第 4 步：Deploy
点 **Deploy site**，等 30 秒左右，得到网址：
```
https://sssd.pages.dev
```
Cloudflare 默认就是公开的，不用像 Netlify 那样手动 Make public。

---

## 三、验证清单

部署完逐项确认：

1. ✅ 打开网址，能看到蓝色界面、队名"狮山实达"
2. ✅ 顶部标签显示「云端已连接」（不是「本机模式」）
3. ✅ 底部 6 个导航都能切换
4. ✅ 右上角 ⚙️ 能登录，`sclh` / `sclh2026`
5. ✅ 首页 📷 能出图，**有深蓝渐变背景**
6. ✅ 用**手机浏览器**（非电脑）打开一次，确认能访问

---

## 四、常见问题

### 访问 404 / 白屏
文件夹层级错了。看部署后的文件列表，根目录第一层必须直接有 `index.html`。

### 一直看到旧版本
1. 先**关掉页面完全重开**（App 有离线缓存，版本是 `sclh-v5`）
2. 还不行就在手机设置里清除该网站的缓存
3. `_headers` 已配置 `index.html` 不缓存，正常情况不会遇到

### 想换成自己的域名
项目 → **Custom domains** → 添加域名 → 按提示改 DNS（如果用 Cloudflare 托管域名会自动配好，还带 HTTPS）。

### 旧 Netlify 站点怎么办
建议**保留一段时间**，两边同时可用（数据是云端的，共用同一份）。确认 Cloudflare 稳定后，再把群里发的链接换成新地址；旧的可以删掉，不影响数据。

---

## 五、以后怎么更新

改了代码要重新部署：
项目 → **Deployments** → 右上角 **Create a new deployment** → 重新拖文件夹（或只拖改动的文件）。

网址不变，队友不受影响。

---

## 六、目录说明

本次为 Cloudflare 新增/调整的文件：

| 文件 | 说明 |
|---|---|
| `_headers` | 缓存策略：HTML 每次校验，css/js 缓存 1 小时 |
| `js/poster.js` | **新增**：Canvas 海报绘制，替代 html2canvas（已删除，省 194 KB） |
| `sw.js` | 离线缓存版本升到 `sclh-v5`，清单已同步 |
