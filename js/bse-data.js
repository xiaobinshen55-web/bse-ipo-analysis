/**
 * 北交所打新 — 共享数据层
 * 提供：API获取、数据转换、统计加工，两个版本共用
 */
var BSE = (function() {
  'use strict';

  // ---- 可由外部覆盖的配置 ----
  var API_START_DATE = '2025-11-23';
  var LOOKBACK_DAYS = 185;
  var CODE_PREFIX = '920';
  var API_URL = 'https://datacenter.eastmoney.com/api/data/v1/get';
  var REPORT_NAME = 'RPT_NEEQ_ISSUEINFO_LIST';

  // ============ API 数据转换 ============
  function transformAPIData(rawList) {
    return rawList.map(function(r) {
      var ip = parseFloat(r.ISSUE_PRICE) || null;
      var np = parseFloat(r.NEWEST_PRICE) || null;
      var ap = parseFloat(r.AVERAGE_PRICE) || null;
      var ol = parseFloat(r.ONLINE_ISSUE_LWR) || null;
      var ld = parseFloat(r.LD_CLOSE_CHANGE) || null;
      var ps = parseFloat(r.PER_SHARES_INCOME) || null;
      var cp = parseFloat(r.CAPTURE_PROFIT) || null;
      var ad = r.APPLY_DATE ? r.APPLY_DATE.trim().split(' ')[0] : null;
      var cc = null;
      if (np && ip && ip > 0) cc = np / ip - 1;

      return {
        code: r.SECURITY_CODE,
        name: r.SECURITY_NAME_ABBR,
        apply_date: ad,
        price: ip,
        pe: parseFloat(r.ISSUE_PE_RATIO) || null,
        ind_pe: parseFloat(r.INDUSTRY_PE_RATIO) || null,
        win_rate: ol ? ol / 100 : null,
        funds_needed: parseFloat(r.APPLY_AMT_100) ? parseFloat(r.APPLY_AMT_100) / 10000 : null,
        gain_pct: ld ? ld / 100 : null,
        profit: ps || null,
        cum_gain: cc,
        avg_price: ap,
        annual_return: cp || null,
        fund_yi: parseFloat(r.VA_AMT) ? parseFloat(r.VA_AMT) / 1e8 : null,
        people_wan: parseFloat(r.ORG_VAN) ? parseFloat(r.ORG_VAN) / 1e4 : null,
        listing_serial: null
      };
    });
  }

  // ============ API 获取（带重试） ============
  function fetchAPI(callback) {
    var apiUrl = API_URL +
      '?reportName=' + encodeURIComponent(REPORT_NAME) +
      '&columns=ALL' +
      '&pageSize=100' +
      '&pageNumber=1' +
      '&sortColumns=APPLY_DATE' +
      '&sortTypes=-1' +
      '&source=WEB' +
      '&client=WEB' +
      '&filter=(APPLY_DATE%3E%3D%27' + encodeURIComponent(API_START_DATE) + '%27)';

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', apiUrl, true);
      xhr.timeout = 3000;

      xhr.onload = function() {
        if (xhr.status === 200) {
          try {
            var d = JSON.parse(xhr.responseText);
            if (d.success && d.result && d.result.data) {
              callback(null, transformAPIData(d.result.data));
              return;
            }
          } catch (e) { /* fall through */ }
        }
        callback(new Error('API unavailable'));
      };

      xhr.onerror = function() { callback(new Error('Network error')); };
      xhr.ontimeout = function() { callback(new Error('Timeout')); };
      xhr.send();
    } catch (e) {
      callback(e);
    }
  }

  // ============ 数据处理（统计、分组、分箱） ============
  function processData(rawData) {
    var now = new Date();
    var cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    var cutoffStr = cutoff.toISOString().split('T')[0];

    var filtered = rawData.filter(function(d) {
      return d.apply_date && d.apply_date >= cutoffStr && String(d.code).startsWith(CODE_PREFIX);
    });

    filtered.sort(function(a, b) { return b.apply_date.localeCompare(a.apply_date); });

    var listed = filtered.filter(function(d) { return d.gain_pct != null; });
    var unlisted = filtered.filter(function(d) { return d.gain_pct == null; });

    function avg(arr, field) {
      var vals = arr.map(function(d) { return d[field]; }).filter(function(v) { return v != null && !isNaN(v); });
      if (vals.length === 0) return null;
      return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
    }

    function med(arr, field) {
      var vals = arr.map(function(d) { return d[field]; }).filter(function(v) { return v != null && !isNaN(v); });
      if (vals.length === 0) return null;
      vals.sort(function(a, b) { return a - b; });
      return vals[Math.floor(vals.length / 2)];
    }

    function max(arr, field) {
      var best = null, bestD = null;
      arr.forEach(function(d) {
        if (d[field] != null && (best == null || d[field] > best)) { best = d[field]; bestD = d; }
      });
      return { val: best, item: bestD };
    }

    function min(arr, field) {
      var best = null, bestD = null;
      arr.forEach(function(d) {
        if (d[field] != null && (best == null || d[field] < best)) { best = d[field]; bestD = d; }
      });
      return { val: best, item: bestD };
    }

    // 月度分组
    var monthlyMap = {};
    filtered.forEach(function(d) {
      if (!d.apply_date) return;
      var m = d.apply_date.substring(0, 7);
      if (!monthlyMap[m]) monthlyMap[m] = [];
      monthlyMap[m].push(d);
    });

    var monthlyArr = Object.keys(monthlyMap).sort().map(function(m) {
      var arr = monthlyMap[m];
      var list = arr.filter(function(d) { return d.gain_pct != null; });
      return {
        month: m,
        count: arr.length,
        avg_price: avg(arr, 'price'),
        avg_win_rate: avg(arr, 'win_rate'),
        avg_fund: avg(arr, 'fund_yi'),
        avg_gain_pct: avg(list, 'gain_pct'),
        avg_profit: avg(list, 'profit')
      };
    });

    // 涨幅分布
    var gainBins = { '50-100%': 0, '100-200%': 0, '200-300%': 0, '300-500%': 0, '>500%': 0 };
    listed.forEach(function(d) {
      var g = d.gain_pct * 100;
      if (g < 100) gainBins['50-100%']++;
      else if (g < 200) gainBins['100-200%']++;
      else if (g < 300) gainBins['200-300%']++;
      else if (g < 500) gainBins['300-500%']++;
      else gainBins['>500%']++;
    });

    // 价格分布
    var priceBins = { '<10元': 0, '10-20元': 0, '20-30元': 0, '≥30元': 0 };
    filtered.forEach(function(d) {
      if (!d.price) return;
      if (d.price < 10) priceBins['<10元']++;
      else if (d.price < 20) priceBins['10-20元']++;
      else if (d.price < 30) priceBins['20-30元']++;
      else priceBins['≥30元']++;
    });

    var topGainers = listed.slice().sort(function(a, b) { return (b.profit || 0) - (a.profit || 0); }).slice(0, 10);
    var topCum = listed.slice().sort(function(a, b) { return (b.cum_gain || 0) - (a.cum_gain || 0); }).slice(0, 8);
    var broken = listed.filter(function(d) { return d.gain_pct < 0; }).length;

    return {
      all: filtered, listed: listed, unlisted: unlisted,
      total: filtered.length, nListed: listed.length, nUnlisted: unlisted.length,
      dateMin: filtered.length > 0 ? filtered[filtered.length - 1].apply_date : '',
      dateMax: filtered.length > 0 ? filtered[0].apply_date : '',
      cutoffDate: cutoffStr,
      avgPrice: avg(filtered, 'price'), avgPE: avg(filtered, 'pe'),
      avgIndPE: avg(filtered, 'ind_pe'), avgWinRate: avg(filtered, 'win_rate'),
      avgFundsNeeded: avg(filtered, 'funds_needed'),
      avgGainPct: avg(listed, 'gain_pct'), medGainPct: med(listed, 'gain_pct'),
      avgProfit: avg(listed, 'profit'), maxProfit: max(listed, 'profit'),
      maxGain: max(listed, 'gain_pct'), minGain: min(listed, 'gain_pct'),
      avgFund: avg(filtered, 'fund_yi'), avgPeople: avg(filtered, 'people_wan'),
      maxFund: max(filtered, 'fund_yi'), broken: broken,
      avgAnnual: avg(listed, 'annual_return'), avgCumGain: avg(listed, 'cum_gain'),
      monthly: monthlyArr, gainBins: gainBins, priceBins: priceBins,
      topGainers: topGainers, topCum: topCum
    };
  }

  // ============ 公共接口 ============
  return {
    setStartDate: function(d) { API_START_DATE = d; },
    getStartDate: function() { return API_START_DATE; },
    transformAPIData: transformAPIData,
    fetchAPI: fetchAPI,
    processData: processData
  };
})();
