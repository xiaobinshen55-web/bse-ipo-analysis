#!/usr/bin/env python3
"""
北交所新股数据更新脚本 v2
- 从东方财富API获取数据 → 更新Excel
- 同时刷新HTML报告中的嵌入式数据（离线也能打开）
"""

import requests, json, time, sys, re
import pandas as pd
from datetime import datetime

API_URL = "https://datacenter.eastmoney.com/api/data/v1/get"
REPORT_NAME = "RPT_NEEQ_ISSUEINFO_LIST"
START_DATE = "2025-08-01"
EXCEL_PATH = "/Users/jianjiandandan/Documents/AI学习/北交所新股情况.xlsx"
HTML_PATH = "/Users/jianjiandandan/Documents/AI学习/北交所打新分析报告.html"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://data.eastmoney.com/xg/xg/"}

def fetch_all():
    all_data, page = [], 1
    while True:
        params = {"reportName": REPORT_NAME, "columns": "ALL", "pageSize": "50", "pageNumber": str(page),
                  "sortColumns": "APPLY_DATE", "sortTypes": "-1", "source": "WEB", "client": "WEB",
                  "filter": f"(APPLY_DATE>='{START_DATE}')"}
        r = requests.get(API_URL, params=params, headers=HEADERS, timeout=30)
        data = r.json()
        if not data.get("success"): break
        result = data["result"]
        if not result.get("data"): break
        all_data.extend(result["data"])
        if len(all_data) >= result["count"]: break
        page += 1; time.sleep(0.3)
    return all_data

def transform(raw_data):
    rows = []
    for r in raw_data:
        def f(val):
            try: return float(val)
            except: return None
        ip = f(r.get("ISSUE_PRICE")); np_ = f(r.get("NEWEST_PRICE"))
        ap = f(r.get("AVERAGE_PRICE")); ei = f(r.get("EXPECT_ISSUE_NUM"))
        oi = f(r.get("ONLINE_ISSUE_NUM")); au = f(r.get("APPLY_NUM_UPPER"))
        aa = f(r.get("APPLY_AMT_UPPER")); a100 = f(r.get("APPLY_AMT_100"))
        ol = f(r.get("ONLINE_ISSUE_LWR")); ld = f(r.get("LD_CLOSE_CHANGE"))
        ps = f(r.get("PER_SHARES_INCOME")); cp = f(r.get("CAPTURE_PROFIT"))
        pe = f(r.get("ISSUE_PE_RATIO")); ipe = f(r.get("INDUSTRY_PE_RATIO"))
        va = f(r.get("VA_AMT")); ov = f(r.get("ORG_VAN"))

        ad = pd.to_datetime(r["APPLY_DATE"]) if pd.notna(r.get("APPLY_DATE")) else None
        ld_dt = pd.to_datetime(r["SELECT_LISTING_DATE"]) if pd.notna(r.get("SELECT_LISTING_DATE")) else None

        wr = ol / 100 if ol else None
        fdc = ld / 100 if ld else None
        cc = round(np_ / ip - 1, 6) if np_ and ip and ip > 0 else None

        wds = ["周一","周二","周三","周四","周五","周六","周日"]
        ds = ad.strftime("%m-%d ") + wds[ad.weekday()] if ad and pd.notna(ad) else None

        ls = None
        if ld_dt and pd.notna(ld_dt):
            ls = (ld_dt - datetime(1899, 12, 30)).days

        rows.append({
            "_sort_date": ad,
            "代码": r.get("SECURITY_CODE"), "简称": r.get("SECURITY_NAME_ABBR"),
            "申购代码": r.get("APPLY_CODE"),
            "发行总数(万股)": round(ei/10000,0) if ei else None,
            "网上发行数量(万股)": round(oi/10000,0) if oi else None,
            "申购上限(万股)": round(au/10000,2) if au else None,
            "顶格所需资金(万元)": round(aa/10000,2) if aa else None,
            "发行价格(元)": ip, "申购日": ds, "中签率": wr,
            "稳获百股所需资金(万元)": round(a100/10000,2) if a100 else None,
            "最新价格(元)": np_, "累计涨幅": round(cc,4) if cc is not None else None,
            "上市首日(序列)": ls, "均价(元)": ap,
            "涨幅": round(fdc,4) if fdc is not None else None,
            "每百股获利(元)": round(ps,0) if ps else None,
            "约合年化收益": round(cp,4) if cp else None,
            "发行市盈率": pe, "行业市盈率": ipe,
            "参与申购资金(亿)": round(va/1e8,2) if va else None,
            "参与申购人数(万)": round(ov/1e4,2) if ov else None,
        })
    return pd.DataFrame(rows)

def build_html_embedded_json(df):
    """从 DataFrame 构建嵌入 HTML 的 JSON 数据"""
    records = []
    for _, r in df.iterrows():
        ad = r.get("_sort_date")
        apply_date_str = ad.strftime("%Y-%m-%d") if ad and pd.notna(ad) else None
        records.append({
            "code": str(r.get("代码","")),
            "name": str(r.get("简称","")),
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
        })
    return records

def update_html_embedded(records):
    """更新 HTML 文件中的嵌入式数据"""
    try:
        with open(HTML_PATH, 'r', encoding='utf-8') as f:
            html = f.read()
    except FileNotFoundError:
        print(f"  HTML 文件不存在: {HTML_PATH}，跳过嵌入数据更新")
        return False

    json_str = json.dumps(records, ensure_ascii=False, indent=2)
    # 替换 __EMBEDDED_DATA_PLACEHOLDER__ 之间的内容
    pattern = r'(const EMBEDDED_DATA = )[\s\S]*?(; // __EMBEDDED_DATA_END__)'
    replacement = r'\1' + json_str + r'\2'
    new_html = re.sub(pattern, replacement, html)

    if new_html == html:
        print("  [WARN] 未找到嵌入数据占位符，请确认 HTML 中包含 EMBEDDED_DATA")
        return False

    with open(HTML_PATH, 'w', encoding='utf-8') as f:
        f.write(new_html)
    return True

def main():
    print("=" * 60)
    print("  北交所新股数据更新 v2")
    print(f"  API: {REPORT_NAME}")
    print("=" * 60)

    # 1. 获取数据
    print("\n[1/4] 从API获取数据...")
    raw = fetch_all()
    bse = [d for d in raw if str(d.get("SECURITY_CODE","")).startswith("920")]
    print(f"  获取到 {len(bse)} 只北交所新股")

    if not bse:
        print("  [ERROR] 无数据"); sys.exit(1)

    # 2. 转换
    print("\n[2/4] 转换格式...")
    df = transform(bse)
    df = df.sort_values("_sort_date", ascending=False)

    # 3. 保存Excel
    print(f"\n[3/4] 保存Excel...")
    save_df = df.drop(columns=["_sort_date"])
    save_df.to_excel(EXCEL_PATH, index=False, engine="openpyxl")
    print(f"  已保存: {EXCEL_PATH}")

    # 4. 更新HTML嵌入数据
    print(f"\n[4/4] 更新HTML嵌入数据...")
    records = build_html_embedded_json(df)
    ok = update_html_embedded(records)
    if ok:
        print(f"  已更新 {len(records)} 条嵌入数据 → {HTML_PATH}")
    else:
        print(f"  未能更新HTML，请手动生成")

    # 摘要
    listed = df[df["涨幅"].notna()]
    unlisted = df[df["涨幅"].isna()]
    print(f"\n{'=' * 60}")
    print(f"  总计: {len(df)} 只")
    print(f"  已上市: {len(listed)} 只, 待上市: {len(unlisted)} 只")
    print(f"  日期: {df['申购日'].iloc[-1]} ~ {df['申购日'].iloc[0]}")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
