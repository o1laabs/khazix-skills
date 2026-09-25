#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIHOT Feed 本地快照抓取器
=========================
用途：把 AIHOT 的 RSS feed 抓成本地 JSON 快照，供前端页面离线读取。
为什么要这么做：
  1. aihot.news/feed.xml 没有 CORS 头 -> 浏览器无法跨域直接 fetch
  2. AIHOT 只有 24h/7d 滚动窗口 -> 过期数据永久消失，快照是唯一的留存手段
  3. 授权条款：组织内部使用免费；对外提供需书面授权 (wzglyay@virxact.com)

用法：
    python3 fetch_feeds.py              # 抓取并合并进快照
    python3 fetch_feeds.py --stats      # 只看统计
"""
import json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

BASE = "https://aihot.news"
FEEDS = {
    "selected": f"{BASE}/feed.xml",        # 精选 50 条（摘要）
    "full":     f"{BASE}/feed/full.xml",   # 精选 50 条（含全文 HTML）
}
API_ITEMS = f"{BASE}/api/v1/items?mode=all&window=7d&limit=100"
API_SEL   = f"{BASE}/api/v1/items?mode=selected&window=24h&limit=100"

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, "feeds.json")
OUT_JS = os.path.join(HERE, "feeds.js")
UA   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"


def fetch(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def cdata(s):
    if s is None:
        return ""
    m = re.search(r"<!\[CDATA\[(.*?)\]\]>", s, re.S)
    return (m.group(1) if m else s).strip()


def tag(block, name):
    m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", block, re.S)
    return m.group(1) if m else ""


def parse_rss(xml):
    """解析 RSS 2.0，返回 item 列表"""
    out = []
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
        b = m.group(1)
        desc = cdata(tag(b, "description"))
        # 从 description 里抽原文链接
        om = re.search(r'<a href="([^"]+)"[^>]*>阅读原文</a>', desc)
        # 去掉尾部 via AIHOT 那一段
        clean = re.sub(r"<p>via AIHOT.*?</p>", "", desc, flags=re.S)
        clean = re.sub(r'<p>🔗.*?</p>', "", clean, flags=re.S)
        clean = re.sub(r"<[^>]+>", "", clean)
        clean = re.sub(r"\s+", " ", clean).strip()
        out.append({
            "id":         cdata(tag(b, "guid")) or "",
            "title":      cdata(tag(b, "title")),
            "link":       cdata(tag(b, "link")),
            "summary":    clean,
            "original":   om.group(1) if om else None,
            "category":   cdata(tag(b, "category")),
            "pubDate":    cdata(tag(b, "pubDate")),
            "author":     re.sub(r"^noreply@aihot\.news\s*", "", cdata(tag(b, "author"))).strip("()"),
        })
    return out


def parse_items_json(js):
    """解析 API items 响应"""
    out = []
    for it in js.get("items", []):
        out.append({
            "id":       it.get("id"),
            "title":    it.get("title"),
            "summary":  it.get("summary"),
            "source":   (it.get("source") or {}).get("name"),
            "category": it.get("category"),
            "score":    it.get("score"),
            "selected": it.get("selected"),
            "reason":   it.get("reason"),
            "publishedAt":  it.get("publishedAt"),
            "discoveredAt": it.get("discoveredAt"),
            "original": (it.get("links") or {}).get("original"),
            "aihot":    (it.get("links") or {}).get("aihot"),
        })
    return out


def main():
    stats = "--stats" in sys.argv
    if stats and os.path.exists(OUT):
        d = json.load(open(OUT, encoding="utf-8"))
        print(f"快照文件: {OUT}")
        print(f"生成时间: {d.get('generatedAt')}")
        for k, v in d.get("feeds", {}).items():
            print(f"  {k}: {len(v)} 条")
        print(f"  归档总数: {len(d.get('archive', []))}")
        return

    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}

    data = {"generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": BASE, "feeds": {}, "items": [], "selected": [],
            "archive": old.get("archive", [])}
    errs = []

    # 1) RSS feeds
    for name, url in FEEDS.items():
        try:
            xml = fetch(url)
            items = parse_rss(xml)
            data["feeds"][name] = items
            print(f"[OK] RSS {name}: {len(items)} 条")
        except Exception as e:
            data["feeds"][name] = (old.get("feeds") or {}).get(name, [])
            errs.append(f"RSS {name}: {e}")
            print(f"[FAIL] RSS {name}: {e} (沿用旧数据)")

    # 2) API items
    for key, url in (("items", API_ITEMS), ("selected", API_SEL)):
        try:
            js = json.loads(fetch(url))
            rows = parse_items_json(js)
            data[key] = rows
            print(f"[OK] API {key}: {len(rows)} 条")
        except Exception as e:
            data[key] = old.get(key, [])
            errs.append(f"API {key}: {e}")
            print(f"[FAIL] API {key}: {e} (沿用旧数据)")

    # 3) 归档：把本次所有条目按 id 去重累积（对抗 7 天滚动窗口）
    seen = {a["id"] for a in data["archive"] if a.get("id")}
    added = 0
    for row in data["items"] + data["selected"]:
        if row.get("id") and row["id"] not in seen:
            data["archive"].append({
                "id": row["id"], "title": row.get("title"),
                "source": row.get("source"), "category": row.get("category"),
                "score": row.get("score"), "publishedAt": row.get("publishedAt"),
                "original": row.get("original"), "aihot": row.get("aihot"),
                "summary": row.get("summary"),
            })
            seen.add(row["id"]); added += 1
    data["archive"].sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    data["archive"] = data["archive"][:5000]      # 上限
    data["errors"] = errs
    print(f"[OK] 归档累积: 新增 {added} 条，总计 {len(data['archive'])} 条")

    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n已写入 {OUT} ({os.path.getsize(OUT)} 字节)")

    # 同步写一份 JS 版：minis:// 下 fetch() 被禁止，只能用 <script src> 加载
    # 所以把同一份数据包成 window.AIHOT_SNAPSHOT = {...};
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("/* 自动生成，请勿手改 —— 由 fetch_feeds.py 写入 */\n")
        f.write("/* minis:// 下 fetch() 不可用，故以 JS 形式注入同一份数据 */\n")
        f.write("window.AIHOT_SNAPSHOT = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"已写入 {OUT_JS} ({os.path.getsize(OUT_JS)} 字节)")
    if errs:
        print("警告:", "; ".join(errs))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
