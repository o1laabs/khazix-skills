# AIHOT / X — X 风格信息流阅读器

把 AIHOT 的聚合消息渲染成 **X（Twitter）** 的界面：纯黑底、左侧导航、信息流推文、底部操作栏、详情抽屉。

**技术栈：React 18.3.1**（通过 esm.sh CDN 以 ESM 加载，无需构建步骤）。

打开：[index.html](minis://shared/aihot-x/index.html)

## 关于「X 的前端框架」

X 的前端框架（React + React Native Web + 自研 `@x` 组件库）**没有开源**，外部拿不到。
可对标的是 Twitter 开源的 `twitter/twitter-text`（字数解析）、`twitter/hogan.js`（模板）—— 都不是 UI 框架。

所以这里做的是：**用 React 那套现代前端栈，还原 X 的视觉与交互**。

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 入口；含全局错误捕获（minis:// 下模块报错否则是黑盒） |
| `style.css` | X 的视觉规范：纯黑 #000、#e7e9ea 文字、#1d9bf0 强调色 |
| `react-lite.js` | 从 esm.sh 加载 React 18 + createRoot，导出 `h` |
| `data.js` | 数据层：API / 快照双源、分类、时间格式化、标题切分 |
| `icons.js` | X 官方形状的内联 SVG 图标（Home/Search/Bell/User/Logo…） |
| `app.jsx.js` | 主应用：App / Post / Detail 组件 |
| `feeds.js` | 本地快照（`window.AIHOT_SNAPSHOT`，由 fetch_feeds.py 生成） |
| `fetch_feeds.py` | 抓取脚本，输出 feeds.js + feeds.json |

## 还原了 X 的哪些特征

- **纯黑背景** `#000` + `#e7e9ea` 正文色（X 的暗色主题精确色值）
- **左侧导航栏**（宽屏显示，窄屏自动隐藏）+ X logo
- **信息流推文**：头像 → 名字 + @handle + ·时间 → 正文 → 底部操作栏
- **底部操作栏**：回复 / 转发 / 点赞 / 浏览数（图标 + 悬停高亮）
- **强调色** `#1d9bf0`（X 蓝），用于链接、选中态、按钮
- **详情抽屉**：点推文弹出，X 的 modal 观感
- **圆角头像 + 认证勾**、`@handle` 灰色小字、`·` 分隔的时间戳
- X 的字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC"`

## 数据源

| 模式 | 来源 | 说明 |
|---|---|---|
| `⚡ live` | `aihot.news/api/v1` | 有 CORS，可直连；较慢 |
| `⛁ snapshot` | 本地 `feeds.js` | 秒开，可累积归档 |

点右上角按钮切换。API 失败会自动回退快照。

## 两个沙箱约束（踩过的坑）

1. **`minis://` 下 `fetch()` 对任何 URL 都失败** —— 所以本地数据必须包成
   `window.AIHOT_SNAPSHOT = {...}` 的 `.js`，用 `<script src>` 加载。
2. **`<script type="module">` 的 `import` 可用**（走模块加载器，不走 fetch API），
   因此 React 能从 esm.sh 正常加载。这是本项目成立的前提。

## 刷新数据

```bash
cd /var/minis/shared/aihot-x
python3 fetch_feeds.py          # 抓取并写入 feeds.js / feeds.json
python3 fetch_feeds.py --stats  # 只看当前快照统计
```
