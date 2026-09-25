/* ==========================================================================
   AIHOT 精选阅读器 · app.js
   --------------------------------------------------------------------------
   数据源策略（两路互为兜底）：
     A. API 直连  https://aihot.news/api/v1/*   —— 有 CORS(*)，浏览器可直接 fetch
     B. RSS 快照  ./feeds.json                  —— feed.xml 无 CORS，须先落盘
   默认走 A；A 失败或手动切换时走 B。B 的额外价值：AIHOT 只有 24h/7d 滚动窗口，
   快照是过期数据唯一的留存手段。

   授权：组织内部/个人非商业免费；对外提供须取得 AIHOT 书面授权。
        详见 https://aihot.news/terms  ·  wzglyay@virxact.com
   ========================================================================== */

const API = 'https://aihot.news/api/v1';
const CACHE_KEY = 'aihot_cache_v2';

const CAT = {
  'ai-models':    'AI 模型',
  'ai-products':  'AI 产品',
  'industry':     '行业',
  'paper':        '论文',
  'tip':          '技巧观点',
  // RSS 里的中文分类直接映射
  'AI 模型':      'ai-models',
  'AI 产品':      'ai-products',
  '行业动态':     'industry',
  '论文研究':     'paper',
  '技巧观点':     'tip',
};

const state = {
  source: 'api',          // api | snapshot
  rows: [],
  filter: 'all',
  q: '',
  loading: false,
  meta: null,
};

const $ = (id) => document.getElementById(id);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function ago(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const m = (Date.now() - t) / 60000;
  if (m < 1) return '刚刚';
  if (m < 60) return Math.floor(m) + ' 分钟前';
  if (m < 1440) return Math.floor(m / 60) + ' 小时前';
  if (m < 43200) return Math.floor(m / 1440) + ' 天前';
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/* ---------------- 数据源 A：API 直连 ---------------- */
async function loadAPI() {
  const get = async (u) => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(u, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  };

  const [sel, all] = await Promise.all([
    get(`${API}/items?mode=selected&window=24h&limit=100`),
    get(`${API}/items?mode=all&window=7d&limit=100`),
  ]);

  const seen = new Set();
  const rows = [];
  for (const it of [...sel.items, ...all.items]) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    rows.push({
      id: it.id,
      title: it.title,
      summary: it.summary,
      reason: it.reason,
      source: (it.source || {}).name,
      category: it.category,
      score: it.score,
      selected: it.selected,
      publishedAt: it.publishedAt,
      discoveredAt: it.discoveredAt,
      original: (it.links || {}).original,
      aihot: (it.links || {}).aihot,
    });
  }
  rows.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // 本地缓存兜底
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), rows })); } catch (e) {}

  return { rows, meta: { selected: sel.items.length, all: all.items.length, src: 'API 直连' } };
}

/* ---------------- 数据源 B：RSS 快照 ---------------- */
/* minis:// 下 fetch() 被禁止（任何 URL 都 TypeError），所以快照以 <script src="feeds.js">
   注入 window.AIHOT_SNAPSHOT。feeds.json 保留给命令行/外部消费者使用。 */
async function loadSnapshot() {
  const d = window.AIHOT_SNAPSHOT;
  if (!d) throw new Error('feeds.js 未加载或为空，请先运行 python3 fetch_feeds.py');

  // 优先用归档（累积最全），退回 feeds.selected
  let raw = (d.archive && d.archive.length) ? d.archive : (d.feeds && d.feeds.selected) || [];

  const rows = raw.map(x => ({
    id: x.id,
    title: x.title,
    summary: x.summary,
    reason: x.reason,
    source: x.source || x.author,
    category: CAT[x.category] || x.category,
    score: x.score,
    selected: x.selected,
    publishedAt: x.publishedAt || x.pubDate,
    discoveredAt: x.discoveredAt,
    original: x.original,
    aihot: x.aihot || x.link,
  }));
  rows.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return {
    rows,
    meta: {
      selected: (d.feeds && d.feeds.selected || []).length,
      all: rows.length,
      src: 'RSS 快照',
      generatedAt: d.generatedAt,
    },
  };
}

/* ---------------- 本地缓存（最后兜底） ---------------- */
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.rows && c.rows.length) return { rows: c.rows, meta: { src: '本地缓存', all: c.rows.length, selected: 0, at: c.t } };
  } catch (e) {}
  return null;
}

/* ---------------- 统一入口 ---------------- */
async function load(force) {
  if (state.loading) return;
  state.loading = true;
  setDot('loading');
  $('list').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  $('banner').innerHTML = '';

  const order = state.source === 'api' ? ['api', 'snapshot', 'cache'] : ['snapshot', 'api', 'cache'];
  const fns = { api: loadAPI, snapshot: loadSnapshot, cache: async () => { const c = loadCache(); if (!c) throw new Error('无缓存'); return c; } };
  let lastErr = null;

  for (const key of order) {
    try {
      const { rows, meta } = await fns[key]();
      if (!rows.length) throw new Error('返回 0 条');
      state.rows = rows;
      state.meta = meta;
      if (key === 'snapshot' && state.source === 'api') {
        banner(`API 直连失败，已自动切换到 <b>RSS 快照</b>（${rows.length} 条）。`, 'warn');
      } else if (key === 'cache') {
        banner(`在线数据源均不可用，显示 <b>本地缓存</b>（${ago(new Date(state.meta.at).toISOString())}）。`, 'warn');
      }
      state.loading = false;
      setDot('ok');
      renderMeta(); renderTabs(); render();
      return;
    } catch (e) {
      lastErr = e;
      console.warn('[aihot] ' + key + ' 失败:', e.message);
    }
  }

  state.loading = false;
  setDot('err');
  $('list').innerHTML = '';
  const c = el('div', 'center');
  c.innerHTML = `<div class="big">⚠</div><h3>所有数据源都不可用</h3>
    <p>${esc(lastErr ? lastErr.message : '未知错误')}</p>
    <button class="btn" onclick="load(true)">重试</button>`;
  $('list').appendChild(c);
  $('meta').textContent = '连接失败';
}

/* ---------------- 渲染 ---------------- */
function setDot(s) { $('dot').className = 'dot' + (s === 'ok' ? '' : ' ' + s); }

function banner(html, kind) {
  const b = el('div', 'banner', `<div>${html}</div><div class="x">✕</div>`);
  b.querySelector('.x').onclick = () => b.remove();
  $('banner').appendChild(b);
}

function renderMeta() {
  const m = state.meta || {};
  const badge = state.source === 'api'
    ? '<span class="badge live">LIVE</span>'
    : '<span class="badge snap">SNAPSHOT</span>';
  const newest = state.rows[0] ? ago(state.rows[0].publishedAt) : '—';
  const gen = m.generatedAt ? '· 快照 ' + new Date(m.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  $('meta').innerHTML =
    `${badge} <span class="pill">${m.src || ''}</span>` +
    `<span>${state.rows.length} 条</span><span>最新 ${newest}</span><span>${gen}</span>`;
}

function cats() {
  const c = {};
  state.rows.forEach(r => { const k = r.category; if (k) c[k] = (c[k] || 0) + 1; });
  return c;
}

function renderTabs() {
  const c = cats();
  const order = ['ai-models', 'ai-products', 'industry', 'paper', 'tip'];
  const tabs = [['all', '全部', state.rows.length]];
  order.forEach(k => { if (c[k]) tabs.push([k, CAT[k] || k, c[k]]); });
  // 未归类的也算
  Object.keys(c).forEach(k => { if (!order.includes(k) && k) tabs.push([k, CAT[k] || k, c[k]]); });

  $('tabs').innerHTML = '';
  tabs.forEach(([k, label, n]) => {
    const t = el('button', 'tab' + (state.filter === k ? ' on' : ''), `${esc(label)} <span style="opacity:.6">${n}</span>`);
    t.onclick = () => { state.filter = k; renderTabs(); render(); };
    $('tabs').appendChild(t);
  });
  renderFooter();
}

function render() {
  const q = state.q.trim().toLowerCase();
  let rows = state.rows;
  if (state.filter !== 'all') rows = rows.filter(r => r.category === state.filter);
  if (q) rows = rows.filter(r =>
    (r.title || '').toLowerCase().includes(q) ||
    (r.summary || '').toLowerCase().includes(q) ||
    (r.source || '').toLowerCase().includes(q));

  const box = $('list');
  box.innerHTML = '';

  if (!rows.length) {
    const c = el('div', 'center');
    c.innerHTML = `<div class="big">∅</div><h3>没有匹配的内容</h3><p>试试换个关键词或切回「全部」</p>`;
    box.appendChild(c);
    $('count') && ($('count').textContent = '0 条');
    return;
  }

  // 瀑布流：按列数建桶，每次塞进当前最矮的那列（IG / 视频号 那种错落效果）
  const ncol = window.innerWidth >= 680 ? 3 : 2;
  const cols = [], heights = new Array(ncol).fill(0);
  for (let i = 0; i < ncol; i++) {
    const c = el('div', 'col');
    cols.push(c); box.appendChild(c);
  }
  rows.forEach(r => {
    // 用稳定哈希预估高度（真实高度要等布局，先按封面比例+标题长度估）
    const est = (coverRatio(r) ? 246 : 197) + 60 + Math.min((r.title || '').length, 60) * 0.7;
    let k = 0;
    for (let i = 1; i < ncol; i++) if (heights[i] < heights[k]) k = i;
    cols[k].appendChild(card(r));
    heights[k] += est;
  });

  const f = el('div', '', `<div style="text-align:center;color:var(--tx3);font-size:12px;padding:16px 0">— 共 ${rows.length} 条 —</div>`);
  box.appendChild(f);
}

/* 窗口宽度跨过断点时重排（列数会变） */
let _lastCols = window.innerWidth >= 680 ? 3 : 2;
window.addEventListener('resize', () => {
  const n = window.innerWidth >= 680 ? 3 : 2;
  if (n !== _lastCols) { _lastCols = n; render(); }
});

/* 从来源名生成稳定的封面渐变 + 首字（IG 那种每张图不同色的观感） */
function avatarOf(name) {
  const s = String(name || '?').replace(/^[Xx]：\s*/, '').replace(/[（(].*?[)）]/g, '').trim() || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const palette = [
    ['#5b8cff', '#3d63cc'], ['#3ecf8e', '#2a9d6b'], ['#f5a524', '#c47f12'],
    ['#7c5cff', '#5a3fd6'], ['#f0616d', '#c9404f'], ['#38bdf8', '#0e8fc4'],
    ['#f094b8', '#c96a91'], ['#a78bfa', '#7f5fe0'], ['#5fd6c4', '#33a394'],
    ['#ff8a5c', '#d95f34'], ['#e8b04b', '#b8862b'], ['#6ee7b7', '#34a87e'],
  ];
  const [c1, c2] = palette[h % palette.length];
  return { ch: s[0] || '?', grad: `linear-gradient(135deg,${c1},${c2})` };
}

/* 用标题哈希决定封面高矮（IG 瀑布流的关键：不等高） */
function coverRatio(r) {
  let h = 0;
  const s = String(r.title || '') + String(r.source || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 3 === 0) ? 'tall' : '';
}

function card(r) {
  const catKey = CAT[r.category] || '';
  const av = avatarOf(r.source);
  const c = el('div', 'card');
  c.innerHTML = `
    <div class="cover ${coverRatio(r)}" style="background:${av.grad}">
      <span class="glyph">${esc(av.ch)}</span>
      ${catKey ? `<span class="tag">${esc(catKey)}</span>` : ''}
      ${r.score != null && r.score >= 60 ? `<span class="hot">★ ${esc(r.score)}</span>` : ''}
    </div>
    <div class="cbody">
      <div class="ctitle">${esc(r.title)}</div>
      ${r.summary ? `<div class="csum">${esc(r.summary)}</div>` : ''}
      <div class="cfoot">
        <span class="cavatar" style="background:${av.grad}">${esc(av.ch)}</span>
        <span class="src">${esc(r.source || '未知来源')}</span>
        <span class="time">${ago(r.publishedAt)}</span>
      </div>
      <div class="cmeta">
        ${r.aihot ? `<a class="lk" href="${esc(r.aihot)}" target="_blank" rel="noopener">站内阅读 →</a>` : ''}
        ${r.original ? `<a class="lk dim" href="${esc(r.original)}" target="_blank" rel="noopener">原文</a>` : ''}
      </div>
      ${r.reason ? `<div class="reason"><b>推荐理由</b> · ${esc(r.reason)}</div>` : ''}
    </div>`;

  // 点图或标题展开/收起（链接不触发）
  const toggle = (e) => {
    if (e.target.closest('a')) return;
    c.classList.toggle('open');
  };
  c.querySelector('.cover').onclick = toggle;
  c.querySelector('.ctitle').onclick = toggle;
  return c;
}

/* ---------------- 交互 ---------------- */
$('refresh').onclick = () => load(true);
$('theme').onclick = () => {
  state.source = state.source === 'api' ? 'snapshot' : 'api';
  $('theme').classList.toggle('on', state.source === 'snapshot');
  load(true);
};
let qt = null;
$('q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; render(); }, 180); };

/* ---------------- 页脚 ---------------- */
function renderFooter() {
  const bar = $('srcbar');
  bar.innerHTML = '';
  [['api', 'API 直连'], ['snapshot', 'RSS 快照']].forEach(([k, label]) => {
    const b = el('div', 'srcbtn' + (state.source === k ? ' on' : ''), label);
    b.onclick = () => { state.source = k; $('theme').classList.toggle('on', k === 'snapshot'); load(true); };
    bar.appendChild(b);
  });
  $('ftinfo').innerHTML = `数据源：<b>${esc((state.meta || {}).src || '—')}</b>`;
}

/* ---------------- 启动 ---------------- */
renderFooter();
load();
