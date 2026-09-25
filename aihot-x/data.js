/* ============ 数据层 ============ */
/* 注意：minis:// 下 fetch() 不可用，所以快照走 window.AIHOT_SNAPSHOT（feeds.js 注入）。
   API 端点有 CORS 可直连，但慢（实测 ~10s），故作为可选数据源。 */

export const API = 'https://aihot.news/api/v1';

export const CAT = {
  'ai-models': 'AI 模型',
  'ai-products': 'AI 产品',
  'industry': '行业',
  'paper': '论文',
  'tip': '技巧观点',
};

/* 从来源名生成稳定的头像色 + 首字（X 头像那种） */
export function avatarOf(name) {
  const s = String(name || '?').replace(/^[Xx]：\s*/, '').replace(/[（(].*?[)）]/g, '').trim() || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palette = [
    ['#1d9bf0', '#0d6efd'], ['#00ba7c', '#00875a'], ['#f91880', '#c4106a'],
    ['#7856ff', '#5a3fd6'], ['#ffd400', '#e0a800'], ['#ff7a00', '#d95f00'],
    ['#00b8d4', '#0088a8'], ['#e0245e', '#b01048'], ['#17bf63', '#0f8a48'],
  ];
  const [c1, c2] = palette[h % palette.length];
  return { ch: s[0] || '?', grad: `linear-gradient(135deg,${c1},${c2})` };
}

/* X 上 handle 那种 @xxx */
export function handleOf(name) {
  const s = String(name || 'unknown').replace(/^[Xx]：\s*/, '').replace(/[（(].*?[)）]/g, '').trim();
  const ascii = s.replace(/[^a-zA-Z0-9]/g, '');
  if (ascii.length >= 3) return '@' + ascii.slice(0, 15).toLowerCase();
  return '@' + (s.length ? encodeURIComponent(s).replace(/%/g, '').slice(0, 12).toLowerCase() : 'unknown');
}

export function ago(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return Math.floor(s) + '秒';
  if (s < 3600) return Math.floor(s / 60) + '分钟';
  if (s < 86400) return Math.floor(s / 3600) + '小时';
  if (s < 2592000) return Math.floor(s / 86400) + '天';
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function fullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 归一化：API 条目 与 快照条目 统一成同一形状 */
export function normalize(it) {
  const src = typeof it.source === 'string' ? it.source : (it.source && it.source.name) || '';
  const links = it.links || {};
  return {
    id: it.id,
    title: it.title || '',
    summary: it.summary || '',
    source: src,
    category: it.category || null,
    score: it.score ?? null,
    selected: !!it.selected,
    reason: it.reason || '',
    publishedAt: it.publishedAt || null,
    aihot: it.aihot || links.aihot || null,
    original: it.original || links.original || null,
  };
}

/* 源 A：本地快照（秒开） */
export function loadSnapshot() {
  const d = window.AIHOT_SNAPSHOT;
  if (!d) throw new Error('feeds.js 未加载，请先运行 python3 fetch_feeds.py');
  const raw = (d.archive && d.archive.length) ? d.archive
    : (d.feeds && d.feeds.selected) || [];
  const seen = new Set();
  const rows = [];
  for (const it of raw) {
    if (!it || !it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    rows.push(normalize(it));
  }
  rows.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  return {
    rows,
    meta: { src: '本地快照', at: d.generatedAt || null, live: false },
  };
}

/* 源 B：API 直连（有 CORS，但慢） */
export async function loadAPI() {
  const j = await fetch(`${API}/items?mode=all&window=24h&limit=100`);
  if (!j.ok) throw new Error('HTTP ' + j.status);
  const d = await j.json();
  const seen = new Set();
  const rows = [];
  for (const it of d.items || []) {
    if (!it || !it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    rows.push(normalize(it));
  }
  rows.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  return {
    rows,
    meta: { src: 'API 直连', at: new Date().toISOString(), live: true },
  };
}

/* 热点榜（右侧栏用） */
export async function loadHotTopics() {
  const r = await fetch(`${API}/hot-topics`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d.items || []).slice(0, 6);
}

/* ---------- 供 UI 层使用的辅助 ---------- */

/* 分类 tab 定义：[key, 中文名] */
export const CATS = [
  ['all', '全部'],
  ['ai-models', 'AI 模型'],
  ['ai-products', 'AI 产品'],
  ['industry', '行业'],
  ['paper', '论文'],
  ['tip', '技巧观点'],
];

/* 相对时间（UI 用，X 上那种「23分钟」） */
export function relTime(iso) {
  return ago(iso);
}

/* 标题按 X 的推文风格切分：首句作正文，其余作补充 */
export function splitTitle(title) {
  const t = String(title || '').trim();
  const m = t.match(/^(.{8,60}?)[：:，,。]\s*(.+)$/s);
  if (m) return { lead: m[1], rest: m[2] };
  return { lead: t, rest: '' };
}

/* 按哈希决定「配图」高矮，制造 X 媒体卡那种不等高观感 */
export function coverRatio(r) {
  const s = String(r.title || '') + String(r.source || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 3 === 0) ? 'tall' : '';
}

/* 统一加载入口：优先 API（实时），失败回退快照 */
export async function loadFeed(prefer) {
  if (prefer === 'api') {
    try { return await loadAPI(); }
    catch (e) { return { ...loadSnapshot(), warn: 'API 直连失败，已回退本地快照：' + e.message }; }
  }
  return loadSnapshot();
}
