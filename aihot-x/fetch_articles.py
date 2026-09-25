#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取 AIHOT 条目的原文正文，生成 window.AIHOT_ARTICLES（本地阅读用）。
minis:// 下 fetch() 不可用，所以输出成 .js 供 <script src> 加载。"""
import json, os, re, ssl, sys, time, html
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, 'articles.js')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0 Safari/537.36')
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

DROP = re.compile(r'<(script|style|noscript|svg|head|nav|footer|form|iframe)[^>]*>.*?</\1>', re.S | re.I)


def fetch(u, retry=2):
    last = None
    for i in range(retry + 1):
        try:
            req = urllib.request.Request(u, headers={
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            })
            r = urllib.request.urlopen(req, timeout=25, context=CTX)
            raw = r.read()
            enc = 'utf-8'
            m = re.search(rb'charset=["\']?([\w-]+)', raw[:3000], re.I)
            if m:
                enc = m.group(1).decode('ascii', 'ignore')
            return raw.decode(enc, 'ignore')
        except Exception as e:
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def load_items():
    p = os.path.join(HERE, 'feeds.js')
    s = open(p, encoding='utf-8').read()
    s = s[s.index('=') + 1:].rstrip().rstrip(';')
    d = json.loads(s)
    return d.get('archive') or d['feeds']['selected']


def extract(raw, url):
    """返回 (标题, 正文段落列表, 来源摘要)"""
    # og 元信息兜底
    def meta(prop):
        m = re.search(r'<meta[^>]+(?:property|name)=["\']' + prop + r'["\'][^>]+content=["\'](.*?)["\']', raw, re.S | re.I)
        return html.unescape(m.group(1)).strip() if m else ''

    title = meta('og:title') or meta('twitter:title')
    if not title:
        m = re.search(r'<title[^>]*>(.*?)</title>', raw, re.S | re.I)
        title = html.unescape(m.group(1)).strip() if m else ''
    desc = meta('og:description') or meta('description')

    t = DROP.sub(' ', raw)
    # 候选容器，取最长
    best = ''
    for pat in [r'<article[^>]*>(.*?)</article>',
                r'<div[^>]+class="[^"]*(?:rich_media_content|article-content|post-content|entry-content|markdown-body|article)[^"]*"[^>]*>(.*?)</div>',
                r'<main[^>]*>(.*?)</main>']:
        for c in re.findall(pat, t, re.S | re.I):
            txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', c))).strip()
            if len(txt) > len(best):
                best = txt

    if len(best) < 200:
        body = re.sub(r'<[^>]+>', '\n', t)
        body = html.unescape(body)
        paras = [p.strip() for p in body.split('\n') if len(p.strip()) > 25]
        best = ' '.join(paras)

    # 切段落
    best = re.sub(r'\s+', ' ', best)
    # 剔除页面导航噪声（X / SPA 常见）
    NOISE = re.compile(
        r'(Post\s+Log in\s+Sign up|Log in\s+Sign up|Sign up\s+Log in|'
        r'Skip to (?:main )?content|Cookie(?:s)? (?:policy|settings)|'
        r'Accept all cookies|We use cookies|Privacy Policy|Terms of Service|'
        r'Subscribe\s+Sign in|登录\s*注册|注册\s*登录|跳转到主要内容)',
        re.I)
    best = NOISE.sub(' ', best)
    # 剔除 X 特有的前缀残留
    best = re.sub(r'^\s*(Article\s*)+', ' ', best, flags=re.I)
    best = re.sub(r'\b[\w.]+ \(@\w+\) on X\b', ' ', best)
    best = re.sub(r'\b[\w.]+ on X:\s*', ' ', best)
    best = re.sub(r'^\s*[\w.]+ @\w+\s+', ' ', best)
    best = re.sub(r'\s+', ' ', best).strip()
    sents = re.split(r'(?<=[。！？.!?])\s+', best)
    out, cur = [], ''
    for s in sents:
        cur += (' ' if cur else '') + s
        if len(cur) >= 110:
            out.append(cur); cur = ''
    if cur:
        out.append(cur)
    return title, out[:120], desc


def grab(url, tries=2):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            })
            r = urllib.request.urlopen(req, timeout=22, context=CTX)
            raw = r.read()
            enc = 'utf-8'
            m = re.search(rb'charset=["\']?([\w-]+)', raw[:3000], re.I)
            if m:
                enc = m.group(1).decode('ascii', 'ignore')
            return raw.decode(enc, 'ignore')
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(1.2)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    feeds = os.path.join(HERE, 'feeds.json')
    if not os.path.exists(feeds):
        feeds = '/var/minis/shared/aihot-feeds/feeds.json'
    d = json.load(open(feeds, encoding='utf-8'))
    items = d.get('archive') or d.get('feeds', {}).get('selected') or []

    # 已抓过的复用，避免重复请求
    cache = {}
    if os.path.exists(OUT):
        m = re.search(r'window\.AIHOT_ARTICLES\s*=\s*(\{.*\});?\s*$',
                      open(OUT, encoding='utf-8').read(), re.S)
        if m:
            try:
                cache = json.loads(m.group(1))
            except Exception:
                cache = {}

    ok = fail = skip = 0
    for it in items[:limit]:
        key = it.get('id') or it.get('original')
        if key in cache and cache[key].get('paras'):
            skip += 1
            continue
        u = it.get('original')
        if not u:
            fail += 1
            continue
        try:
            raw = grab(u)
            title, paras, desc = extract(raw, u)
            cache[key] = {
                'url': u,
                'title': title or it.get('title', ''),
                'paras': paras,
                'desc': desc,
                'chars': sum(len(p) for p in paras),
                'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }
            print(f"  OK  {len(paras):>3}p {cache[key]['chars']:>6}c  {u[:60]}")
            ok += 1
        except Exception as e:
            cache[key] = {'url': u, 'error': type(e).__name__, 'paras': []}
            print(f"  ERR {type(e).__name__}: {str(e)[:35]}  {u[:55]}")
            fail += 1
        time.sleep(0.4)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('/* 自动生成，勿手改 —— 由 fetch_articles.py 写入 */\n')
        f.write('/* minis:// 下 fetch() 不可用，故以 JS 形式注入 */\n')
        f.write('window.AIHOT_ARTICLES = ')
        json.dump(cache, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    print(f"\n新抓 {ok} | 失败 {fail} | 复用 {skip} | 总 {len(cache)}")
    print(f"已写入 {OUT} ({os.path.getsize(OUT)} 字节)")


if __name__ == '__main__':
    main()
