# AIHOT 精选阅读器（feeds 前端）

把 AIHOT 的资讯用 feeds 在前端页面显示。Fork 自 `KKKKhazix/khazix-skills`，
本项目是该 fork 之上的一个独立前端消费端。

- 上游仓库：https://github.com/KKKKhazix/khazix-skills
- 本 fork：https://github.com/o1laabs/khazix-skills
- 数据服务：https://aihot.news
- 授权：组织内部 / 个人非商业免费；对外提供须取得 AIHOT 书面授权
  （见 https://aihot.news/terms · wzglyay@virxact.com）

---

## 打开

在 Minis 里点开即可：

```
minis://shared/aihot-feeds/index.html
```

命令行预览：

```sh
cd /var/minis/shared/aihot-feeds
python3 -m http.server 8765 > /dev/null 2>&1 &
# 浏览器访问 http://localhost:8765
```

---

## 两个数据源（互为兜底）

页面右上角 `⇄` 切换，或自动降级。

| | 数据源 | 端点 | 说明 |
|---|---|---|---|
| **A** | **API 直连** `LIVE` | `/api/v1/items` | 有 `Access-Control-Allow-Origin: *`，浏览器可直连。实时 |
| **B** | **RSS 快照** `SNAPSHOT` | `feeds.js` | `feed.xml` **无 CORS 头**，浏览器直连被拦，故先落盘 |

降级链：`API 直连 → RSS 快照 → localStorage 缓存`，全失败才报错。

### ⚠️ 踩过的三个坑（都在代码注释里标了）

1. **`feed.xml` 没有 CORS 头** —— API 有（`*`），RSS 没有。浏览器直连 RSS
   必被拦（实测 127ms 就 `TypeError: Failed to fetch`）。
   试过的公共代理：allorigins（`/get` 间歇 500/522）、corsproxy.io（403）、
   codetabs（超时）、cors.lol（429）——**全部不可靠，不能作为方案**。
   → 改为本地落盘。

2. **minis:// 下 `fetch()` 完全不可用** —— 不只是跨域，连同目录相对路径
   （`./feeds.json`、`./app.js`）都 `TypeError`。只有 `<script src>`、
   `<link>`、`<img>` 这类**标签加载**可用。
   → 所以快照写成 `feeds.js`（`window.AIHOT_SNAPSHOT = {...}`）用 `<script>` 注入，
   `feeds.json` 保留给命令行消费者。

3. **浏览器会缓存 `app.js`** —— 改完不生效，白排查半天。
   → `index.html` 里给 `<script src>` 加了 `?v=N`，改代码时记得一起递增。

---

## 抓取快照

```sh
cd /var/minis/shared/aihot-feeds
python3 fetch_feeds.py          # 抓取并写入 feeds.json + feeds.js
python3 fetch_feeds.py --stats  # 只看当前快照概况
```

一次抓取同时取四个源并合并去重：

- `RSS selected`（feed.xml，50 条）
- `RSS full`（feed/full.xml，50 条）
- `API items`（mode=all&window=7d，100 条）
- `API selected`（mode=selected&window=24h，20 条）

**并累积归档**（`archive` 字段）——这是关键：

> AIHOT 只有 `24h` / `7d` 两个滚动窗口（`window=48h` 直接 400）。
> **超过 7 天的数据在 API 上永久取不回**，且它单条没有详情端点
> （`/api/v1/items/<id>` 返 404，原文 "No public API v1 operation exists at…"）。
> 所以想留存，必须自己落盘。`archive` 就是干这个的：每次抓取合并进历史，
> 按 id 去重，只增不减。

---

## 功能

- **微信订阅号卡片式**：左文右图、来源头像 + 时间的小灰字底栏；
  点卡片展开，露出分类标签、「站内阅读 / 原文」链接、`score` 与「推荐理由」。
  每个来源按名字哈希生成**固定头像色 + 首字**，同一家媒体每次颜色一致。
- 两数据源切换 + 自动降级 + 本地缓存兜底
- 分类筛选（AI 模型 / AI 产品 / 行业 / 论文 / 技巧观点）
- 关键词搜索（标题 + 摘要 + 推荐理由 + 来源）
- 亮 / 暗主题（跟随系统）
- 每条给「站内阅读」与「原文」两个出口 —— **看原文永远是核实的第一步**
- 显示 `score` 与「推荐理由」，让你知道它为什么被选进来
- 相对时间（23 分钟前 / 1 天前）

---

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 页面骨架 + 样式 |
| `app.js` | 数据源、渲染、交互 |
| `feeds.js` | 快照（JS 形式，供页面 `<script>` 加载）**自动生成** |
| `feeds.json` | 同一份快照（JSON 形式，供命令行/外部消费）**自动生成** |
| `fetch_feeds.py` | 抓取脚本，写入上面两个文件 |

---

## 已知限制

- **API 直连较慢**：实测一次请求 10.5s（沙箱网络），页面加载约 12s。
  快照模式瞬时（本地）。
- **只有 119 条**：这是「最近 7 天 + 24h 精选」的合并去重结果，不是全量。
  AIHOT 全量精选约 4,015 条，要走 `/api/v1/selected/snapshot` 翻 4 页拿基线，
  再轮 `/api/v1/selected/changes` 增量（见 `../aihot/QUALITY-AND-REBUILD-20260924.md`）。
- **分类近半为空**：上游 `category` 字段约 48% 是 null，这些条目只在「全部」里出现。
- **不做全文**：AIHOT 只给摘要，且 `summary` 不可当事实引用，必须回原文。
