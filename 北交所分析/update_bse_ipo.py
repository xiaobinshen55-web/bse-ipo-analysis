#!/usr/bin/env python3
"""
北交所新股数据更新脚本 v3
- 从 config.json 读取统一配置（字段映射、API参数）
- 动态计算筛选日期（近185天）
- 从东方财富API获取数据 → 更新Excel
- 同时刷新HTML报告中的嵌入式数据（离线也能打开）
"""

import requests, json, time, sys, re, os
import pandas as pd
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_config():
    config_path = os.path.join(SCRIPT_DIR, "config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)

CFG = load_config()

API_URL = CFG["api"]["url"]
REPORT_NAME = CFG["api"]["reportName"]
LOOKBACK = CFG["filter"]["lookbackDays"]
CODE_PREFIX = CFG["filter"]["codePrefix"]
START_DATE = (datetime.now() - timedelta(days=LOOKBACK)).strftime("%Y-%m-%d")

EXCEL_PATH = os.path.join(SCRIPT_DIR, CFG["paths"]["excel"])
HTML_PATHS = [os.path.join(SCRIPT_DIR, p) for p in CFG["paths"]["html"]]

HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://data.eastmoney.com/xg/xg/"}

# ---- converters from config ----
def apply_convert(val, convert):
    if convert is None or val is None:
        return val
    if convert == "div100":
        return val / 100
    if convert == "div10000":
        return val / 10000
    if convert == "div1e8":
        return val / 1e8
    if convert == "div1e4":
        return val / 1e4
    return val

# ---- Logging ----
def log(level, msg):
    ts = datetime.now().strftime("%H:%M:%S")
    tags = {"INFO": "", "OK": "✓", "WARN": "⚠", "ERROR": "✗"}
    prefix = tags.get(level, "")
    print(f"  [{ts}] {prefix} {msg}")

# ---- Retry helper ----
def with_retry(fn, fn_name, max_retries=3):
    """Call fn with exponential backoff on failure."""
    for attempt in range(1, max_retries + 1):
        try:
            result = fn()
            if attempt > 1:
                log("OK", f"{fn_name} 第{attempt}次重试成功")
            return result
        except Exception as e:
            if attempt < max_retries:
                wait = 2 ** attempt
                log("WARN", f"{fn_name} 失败: {e}，{wait}s后重试({attempt}/{max_retries})")
                time.sleep(wait)
            else:
                log("ERROR", f"{fn_name} 重试{max_retries}次后仍失败: {e}")
                raise

# ---- API fetch ----
def _fetch_page(page):
    params = {
        "reportName": REPORT_NAME,
        "columns": "ALL",
        "pageSize": str(CFG["api"]["pageSize"]),
        "pageNumber": str(page),
        "sortColumns": CFG["api"]["sortColumns"],
        "sortTypes": CFG["api"]["sortTypes"],
        "source": CFG["api"]["source"],
        "client": CFG["api"]["client"],
        "filter": f"(APPLY_DATE>='{START_DATE}')"
    }
    r = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

def fetch_all():
    all_data, page = [], 1
    while True:
        data = with_retry(lambda p=page: _fetch_page(p), f"API分页{page}")
        if not data.get("success"):
            break
        result = data["result"]
        if not result.get("data"):
            break
        all_data.extend(result["data"])
        if len(all_data) >= result["count"]:
            break
        page += 1
        time.sleep(0.3)
    return all_data

# ---- data transform following config fieldMapping ----
def transform(raw_data):
    fm = CFG["fieldMapping"]
    rows = []

    for r in raw_data:
        def fv(field):
            """extract and convert a field value from raw record"""
            mapping = fm.get(field)
            if not mapping:
                return None
            raw_val = r.get(field)
            try:
                val = float(raw_val) if raw_val is not None else None
            except (ValueError, TypeError):
                val = None
            return apply_convert(val, mapping["convert"])

        ip = fv("ISSUE_PRICE")
        np_ = fv("NEWEST_PRICE")
        ei = fv("EXPECT_ISSUE_NUM")
        oi = fv("ONLINE_ISSUE_NUM")
        au = fv("APPLY_NUM_UPPER")
        aa = fv("APPLY_AMT_UPPER")
        a100 = fv("APPLY_AMT_100")
        ol = fv("ONLINE_ISSUE_LWR")
        ld = fv("LD_CLOSE_CHANGE")
        ps = fv("PER_SHARES_INCOME")
        cp = fv("CAPTURE_PROFIT")
        pe = fv("ISSUE_PE_RATIO")
        ipe = fv("INDUSTRY_PE_RATIO")
        va = fv("VA_AMT")
        ov = fv("ORG_VAN")

        ad = pd.to_datetime(r["APPLY_DATE"]) if pd.notna(r.get("APPLY_DATE")) else None
        ld_dt = pd.to_datetime(r["SELECT_LISTING_DATE"]) if pd.notna(r.get("SELECT_LISTING_DATE")) else None

        # derived fields
        cc = round(np_ / ip - 1, 6) if np_ and ip and ip > 0 else None

        wds = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        ds = ad.strftime("%m-%d ") + wds[ad.weekday()] if ad and pd.notna(ad) else None

        ls = None
        if ld_dt and pd.notna(ld_dt):
            ls = (ld_dt - datetime(1899, 12, 30)).days

        rows.append({
            "_sort_date": ad,
            "代码": r.get("SECURITY_CODE"),
            "简称": r.get("SECURITY_NAME_ABBR"),
            "申购代码": r.get("APPLY_CODE"),
            "发行总数(万股)": round(ei, 0) if ei else None,
            "网上发行数量(万股)": round(oi, 0) if oi else None,
            "申购上限(万股)": round(au, 2) if au else None,
            "顶格所需资金(万元)": round(aa, 2) if aa else None,
            "发行价格(元)": ip,
            "申购日": ds,
            "中签率": ol,
            "稳获百股所需资金(万元)": round(a100, 2) if a100 else None,
            "最新价格(元)": np_,
            "累计涨幅": round(cc, 4) if cc is not None else None,
            "上市首日(序列)": ls,
            "均价(元)": r.get("AVERAGE_PRICE") if pd.notna(r.get("AVERAGE_PRICE")) else None,
            "涨幅": ld,
            "每百股获利(元)": round(ps, 0) if ps else None,
            "约合年化收益": round(cp, 4) if cp else None,
            "发行市盈率": pe,
            "行业市盈率": ipe,
            "参与申购资金(亿)": round(va, 2) if va else None,
            "参与申购人数(万)": round(ov, 2) if ov else None,
            "发行方式": r.get("PRICE_WAY"),
        })
    return pd.DataFrame(rows)

# ---- HTML embedded data ----
def build_html_embedded_json(df):
    records = []
    for _, r in df.iterrows():
        ad = r.get("_sort_date")
        apply_date_str = ad.strftime("%Y-%m-%d") if ad and pd.notna(ad) else None
        records.append({
            "code": str(r.get("代码", "")),
            "name": str(r.get("简称", "")),
            "apply_date": apply_date_str,
            "price": float(r["发行价格(元)"]) if pd.notna(r.get("发行价格(元)")) else None,
            "pe": float(r["发行市盈率"]) if pd.notna(r.get("发行市盈率")) else None,
            "ind_pe": float(r["行业市盈率"]) if pd.notna(r.get("行业市盈率")) else None,
            "win_rate": float(r["中签率"]) if pd.notna(r.get("中签率")) else None,
            "funds_needed": float(r["稳获百股所需资金(万元)"]) if pd.notna(r.get("稳获百股所需资金(万元)")) else None,
            "gain_pct": float(r["涨幅"]) if pd.notna(r.get("涨幅")) else None,
            "profit": float(r["每百股获利(元)"]) if pd.notna(r.get("每百股获利(元)")) else None,
            "cum_gain": float(r["累计涨幅"]) if pd.notna(r.get("累计涨幅")) else None,
            "avg_price": float(r["均价(元)"]) if pd.notna(r.get("均价(元)")) else None,
            "annual_return": float(r["约合年化收益"]) if pd.notna(r.get("约合年化收益")) else None,
            "fund_yi": float(r["参与申购资金(亿)"]) if pd.notna(r.get("参与申购资金(亿)")) else None,
            "people_wan": float(r["参与申购人数(万)"]) if pd.notna(r.get("参与申购人数(万)")) else None,
            "listing_serial": float(r["上市首日(序列)"]) if pd.notna(r.get("上市首日(序列)")) else None,
            "max_sub_amt": float(r["顶格所需资金(万元)"]) if pd.notna(r.get("顶格所需资金(万元)")) else None,
            "online_issue_num": float(r["网上发行数量(万股)"]) if pd.notna(r.get("网上发行数量(万股)")) else None,
            "price_way": str(r.get("发行方式", "")) if pd.notna(r.get("发行方式")) else None,
        })
    return records

def update_html_embedded(records, html_path):
    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            html = f.read()
    except FileNotFoundError:
        print(f"  HTML 文件不存在: {html_path}，跳过嵌入数据更新")
        return False

    json_str = json.dumps(records, ensure_ascii=False, indent=2)

    # Replace EMBEDDED_DATA
    pattern = r'(const EMBEDDED_DATA = )[\s\S]*?(; // __EMBEDDED_DATA_END__)'
    replacement = r'\1' + json_str + r'\2'
    new_html = re.sub(pattern, replacement, html)

    # Also inject the dynamic START_DATE for JS API filter
    date_pattern = r'(const API_START_DATE = )".*?"(;)'
    date_replacement = r'\1"' + START_DATE + r'"\2'
    new_html = re.sub(date_pattern, date_replacement, new_html)

    if new_html == html:
        print("  [WARN] 未找到嵌入数据占位符或START_DATE占位符")
        return False

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    return True

# ---- main ----
def main():
    t_start = datetime.now()
    print("=" * 60)
    print(f"  北交所新股数据更新 v3")
    print(f"  API: {REPORT_NAME}  |  筛选: {START_DATE} 至今（近{LOOKBACK}天）")
    print(f"  开始: {t_start.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 1. Fetch
    log("INFO", "[1/4] 从API获取数据...")
    try:
        raw = with_retry(fetch_all, "API全量获取")
    except Exception as e:
        log("ERROR", f"数据获取失败: {e}")
        sys.exit(1)

    bse = [d for d in raw if str(d.get("SECURITY_CODE", "")).startswith(CODE_PREFIX)]
    log("OK" if bse else "WARN", f"获取到 {len(bse)} 只{CODE_PREFIX}开头新股")

    if not bse:
        log("ERROR", "无有效数据，退出")
        sys.exit(1)

    # 2. Transform
    log("INFO", "[2/4] 转换格式...")
    df = transform(bse)
    df = df.sort_values("_sort_date", ascending=False)
    log("OK", f"转换完成，{len(df)} 条记录")

    # 3. Save Excel
    log("INFO", "[3/4] 保存Excel...")
    try:
        save_df = df.drop(columns=["_sort_date"])
        save_df.to_excel(EXCEL_PATH, index=False, engine="openpyxl")
        log("OK", f"已保存: {os.path.basename(EXCEL_PATH)}")
    except Exception as e:
        log("ERROR", f"保存Excel失败: {e}")

    # 4. Update HTML
    log("INFO", "[4/4] 更新HTML嵌入数据...")
    records = build_html_embedded_json(df)
    updated_count = 0
    for html_path in HTML_PATHS:
        ok = update_html_embedded(records, html_path)
        if ok:
            updated_count += 1
            log("OK", f"已更新 {len(records)} 条嵌入数据 + 筛选日期 -> {os.path.basename(html_path)}")
        else:
            log("ERROR", f"未能更新 {os.path.basename(html_path)}，请检查占位符是否存在")

    # 5. Git commit & push — handled by stefanzweifel/git-auto-commit-action in CI workflow
    if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
        log("INFO", "[5/5] HTML文件已更新，由 git-auto-commit-action 负责提交推送")
    else:
        log("INFO", "[5/5] 本地运行，HTML已更新。请手动 git add && git commit && git push 发布")

    # Summary
    listed = df[df["涨幅"].notna()]
    unlisted = df[df["涨幅"].isna()]
    elapsed = (datetime.now() - t_start).total_seconds()
    print(f"\n{'=' * 60}")
    print(f"  总计: {len(df)} 只  |  已上市: {len(listed)} 只  |  待上市: {len(unlisted)} 只")
    print(f"  日期: {df['申购日'].iloc[-1]} ~ {df['申购日'].iloc[0]}")
    print(f"  耗时: {elapsed:.1f}s")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
