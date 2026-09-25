/* ============ AIHOT / X —— 主应用（React 18，X 风格） ============ */
import { React, createRoot, h } from './react-lite.js?v=5';
import { loadFeed, CAT, CATS, relTime, coverRatio, splitTitle } from './data.js?v=5';
import { Icon } from './icons.js?v=5';

const { useState, useEffect, useMemo, useCallback, useRef } = React;

/* ---------- 工具 ---------- */
const cls = (...a) => a.filter(Boolean).join(' ');
const nfmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万'
  : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

/* ---------- 单条推文（X 的核心组件） ---------- */
function Post({ p, onOpen }) {
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [saved, setSaved] = useState(false);

  // 由 score 派生一个稳定的互动数（X 每条都带数字，视觉上不能空）
  const seed = useMemo(() => {
    let h = 0; const s = p.id || p.title || '';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }, [p.id, p.title]);
  const base = Math.max(1, Math.round((p.score || 30) * 1.6));
  const nReply = (seed % 37) + base % 23;
  const nRepost = (seed % 211) + base;
  const nLike = (seed % 900) + base * 3;
  const nView = (seed % 90000) + base * 420;

  const { lead: t1, rest: t2 } = splitTitle(p.title);

  return h('article', {
    className: 'post',
    onClick: () => onOpen(p),
    onTouchEnd: (e) => { e.preventDefault(); onOpen(p); },
    role: 'button',
    tabIndex: 0
  },
    // 主体（已去掉头像列）
    h('div', { className: 'pmain' },
      // 头部：来源 + 蓝勾 + 时间 + 更多
      h('div', { className: 'phead' },
        h('span', { className: 'pname' }, p.source || '未知来源'),
        p.verified ? h('span', { className: 'verified', title: '已认证' }, Icon.verified()) : null,
        h('span', { className: 'pdot' }, '·'),
        h('span', { className: 'ptime' }, relTime(p.publishedAt)),
        h('button', { className: 'pmore', 'aria-label': '更多' }, Icon.More())
      ),

      // 正文
      h('div', { className: 'ptext' },
        t1 && h('div', { className: 'pt1' }, t1),
        t2 && h('div', { className: 'pt2' }, t2)
      ),

      // 摘要
      p.summary ? h('div', { className: 'psum' }, p.summary) : null,

      // 分类徽章
      p.category && CAT[p.category]
        ? h('div', { className: 'pcat' }, h('span', { className: 'chip ' + p.category }, CAT[p.category]))
        : null,

      // 操作栏（X 的四个按钮 + 浏览量）
      h('div', { className: 'pacts' },
        h('button', { className: 'act reply', onClick: e => e.stopPropagation() },
          Icon.Reply(), h('span', null, nfmt(nReply))),
        h('button', {
          className: cls('act repost', reposted && 'on-repost'),
          onClick: e => { e.stopPropagation(); setReposted(v => !v); }
        }, Icon.Repost(), h('span', null, nfmt(nRepost + (reposted ? 1 : 0)))),
        h('button', {
          className: cls('act like', liked && 'on-like'),
          onClick: e => { e.stopPropagation(); setLiked(v => !v); }
        }, Icon.Like({ solid: liked }), h('span', null, nfmt(nLike + (liked ? 1 : 0)))),
        h('button', {
          className: cls('act save', saved && 'on-save'),
          onClick: e => { e.stopPropagation(); setSaved(v => !v); }
        }, Icon.Bookmark({ solid: saved })),
        h('button', {
          className: 'act views', onClick: e => { e.stopPropagation(); }
        }, Icon.Views(), h('span', null, nfmt(nView)))
      )
    )
  );
}

/* ---------- 详情抽屉（X 点开推文的模态） ---------- */
function Detail({ p, onClose }) {
  
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!p) return null;
  return h('div', { className: 'sheet-wrap', onClick: onClose },
    h('div', { className: 'sheet', onClick: e => e.stopPropagation() },
      h('div', { className: 'sheet-bar' },
        h('button', { className: 'iconbtn', onClick: onClose, 'aria-label': '关闭' }, '✕')
      ),
      h('div', { className: 'sheet-body' },
        h('div', { className: 'srow' },
          h('div', null,
            h('div', { className: 'pname' }, p.source || '未知来源'),
            h('div', { className: 'ptime' }, relTime(p.publishedAt))
          )
        ),
        h('div', { className: 'stitle' }, p.title),
        p.summary ? h('div', { className: 'ssum' }, p.summary) : null,
        p.reason ? h('div', { className: 'sreason' }, h('b', null, '推荐理由'), ' · ' + p.reason) : null,
        h('div', { className: 'smeta' },
          p.category && CAT[p.category] ? h('span', { className: 'chip ' + p.category }, CAT[p.category]) : null,
          p.score != null ? h('span', { className: 'chip' }, 'score ' + p.score) : null
        ),
        h('div', { className: 'slinks' },
          p.aihot ? h('a', { className: 'btn primary', href: p.aihot, target: '_blank', rel: 'noopener' }, '站内阅读') : null,
          p.original ? h('a', { className: 'btn', href: p.original, target: '_blank', rel: 'noopener' }, '查看原文') : null
        )
      )
    )
  );
}

/* ---------- 主应用 ---------- */
function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [src, setSrc] = useState('snapshot');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async (which) => {
    setLoading(true); setErr('');
    try {
      const r = await loadFeed(which);
      setRows(r.rows); setSrc(r.src);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load('auto'); }, [load]);

  const view = useMemo(() => {
    let r = rows;
    if (tab !== 'all') r = r.filter(x => x.category === tab);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      r = r.filter(x => (x.title + ' ' + (x.summary || '') + ' ' + (x.source || '') + ' ' + (x.reason || ''))
        .toLowerCase().includes(k));
    }
    return r;
  }, [rows, tab, q]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    CATS.forEach(([k]) => { c[k] = rows.filter(x => x.category === k).length; });
    return c;
  }, [rows]);

  return h('div', { className: 'app' },
    // ===== 左侧导航（X 的桌面侧栏；窄屏自动隐藏）=====
    h('aside', { className: 'sidenav' },
      h('div', { className: 'brand' }, Icon.Logo()),
      h('nav', { className: 'navlist' },
        [['home', '首页', Icon.Home()],
         ['explore', '探索', Icon.Search()],
         ['bell', '通知', Icon.Bell({})],
         ['book', '书签', Icon.Bookmark({})],
         ['user', '我的', Icon.User({})]].map(([k, label, ic]) =>
          h('a', { key: k, className: cls('navitem', k === 'home' && 'on'), href: '#', onClick: e => e.preventDefault() },
            h('span', { className: 'ni' }, ic),
            h('span', { className: 'nl' }, label))
        )
      ),
      h('button', { className: 'postbtn', onClick: () => load('auto') }, '刷新')
    ),

    // ===== 主列 =====
    h('div', { className: 'col' },
    // 顶部栏
    h('header', { className: 'topbar' },
      h('div', { className: 'tb-left' },
        h('span', { className: 'xlogo' }, Icon.Logo())
      ),
      h('div', { className: 'tb-title' }, 'AIHOT'),
      h('div', { className: 'tb-right' },
        h('button', {
          className: cls('iconbtn', src === 'live' && 'on'),
          title: src === 'live' ? 'API 直连' : 'RSS 快照',
          onClick: () => load(src === 'live' ? 'snapshot' : 'live')
        }, src === 'live' ? '⚡' : '⛁'),
        h('button', { className: 'iconbtn', onClick: () => load('auto'), title: '刷新' }, '⟳')
      )
    ),

    // ===== 搜索栏 =====
    h('div', { className: 'searchbar' },
      h('span', { className: 'sicon' }, Icon.Search()),
      h('input', {
        value: q, onChange: e => setQ(e.target.value),
        placeholder: '搜索 AIHOT', 'aria-label': '搜索'
      }),
      q ? h('button', { className: 'clear', onClick: () => setQ('') }, '✕') : null
    ),

    // ===== 分类 tab（X 的 For you / Following 那种）=====
    h('nav', { className: 'tabs' },
      [['all', '全部'], ...CATS].map(([k, label]) =>
        h('button', {
          key: k, className: cls('tab', tab === k && 'on'),
          onClick: () => setTab(k)
        },
          h('span', null, label),
          h('span', { className: 'tabn' }, counts[k] || 0)
        )
      )
    ),

    // ===== 状态条 =====
    h('div', { className: 'statusbar' },
      loading
        ? h('span', { className: 'st load' }, '载入中…')
        : err
          ? h('span', { className: 'st err' }, err)
          : h('span', { className: 'st' },
              h('span', { className: 'dot ' + (src === 'live' ? 'live' : 'snap') }),
              src === 'live' ? 'API 直连' : 'RSS 快照',
              ' · ', view.length, ' 条'
            )
    ),

    // ===== 信息流 =====
    h('main', { className: 'feed' },
      loading && !rows.length
        ? h('div', { className: 'boot' }, '载入中…')
        : view.length === 0
          ? h('div', { className: 'empty' },
              h('div', { className: 'ebig' }, '∅'),
              h('h3', null, '没有匹配的内容'),
              h('p', null, '换个关键词，或切回「全部」'))
          : view.map(p => h(Post, { key: p.id || p.title, p, onOpen: setOpen }))
    ),
    ),  /* /col */

    // ===== 详情抽屉 =====
    h(Detail, { p: open, onClose: () => setOpen(null) }),

    // ===== 右下浮动按钮（X 的发帖按钮位）=====
    h('button', {
      className: 'fab', title: '刷新',
      onClick: () => load('auto')
    }, Icon.Sparkle())
  );
}

createRoot(document.getElementById('root')).render(h(App));
