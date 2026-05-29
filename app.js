/**
 * 北交所打新投资策略分析报告 — 应用逻辑
 * 数据流向：API 实时数据 → 降级至 EMBEDDED_DATA 离线缓存
 */
(function() {
  'use strict';

  // ============ SVG Helper ============
  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function makeSvg(w, h) {
    return svgEl('svg', {
      width: w, height: h,
      viewBox: '0 0 ' + w + ' ' + h,
      style: 'max-width:100%;height:auto;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif'
    });
  }

  // ============ Data Processing ============
  function processData(rawData) { return BSE.processData(rawData); }

  // ============ Render Functions ============
  function renderAll(stats) {
    renderStats(stats);
    renderGainDistChart(stats);
    renderPriceDistChart(stats);
    renderTopGainersTable(stats);
    renderCumGainChart(stats);
    renderMonthlyIPOChart(stats);
    renderMonthlyGainChart(stats);
    renderMonthlyTable(stats);
    renderAllStocksTable(stats);
    updateMeta(stats);
  }

  function updateMeta(stats) {
    document.getElementById('hero-date-range').textContent =
      '统计区间：' + stats.dateMin + ' ~ ' + stats.dateMax + ' ｜ 共 ' + stats.total + ' 只新股';
    document.getElementById('overview-desc').textContent =
      stats.total + '只新股全景扫描（申购日 ≥ ' + stats.cutoffDate + '），一张图看懂北交所打新的赚钱效应。';
    document.getElementById('table-desc').textContent =
      '申购日在 ' + stats.cutoffDate + ' 之后的全部北交所新股，按申购日倒序排列。';
    document.getElementById('footer-info').textContent =
      '数据来源：东方财富数据中心 | 自动获取 | 筛选近半年（≥' + stats.cutoffDate + '）';
  }

  function renderStats(stats) {
    var html = '';
    function card(cls, val, label, sub) {
      html += '<div class="stat-card ' + cls + '"><div class="value">' + val + '</div><div class="label">' + label + '</div><div class="sub">' + sub + '</div></div>';
    }
    card('green', stats.avgGainPct ? (stats.avgGainPct * 100).toFixed(0) + '<span style="font-size:0.5em">%</span>' : '-', '首日平均涨幅', stats.medGainPct ? '中位数 ' + (stats.medGainPct * 100).toFixed(0) + '%' : '');
    card('accent', stats.broken, '首日破发数量', '胜率 100%');
    card('blue', stats.avgProfit ? stats.avgProfit.toFixed(0) + '<span style="font-size:0.5em"> 元</span>' : '-', '每百股平均获利', stats.maxProfit.val ? '最高 ' + (stats.maxProfit.val).toFixed(0) + ' 元' : '');
    card('orange', stats.avgPE ? stats.avgPE.toFixed(1) + '<span style="font-size:0.5em"> 倍</span>' : '-', '平均发行市盈率', stats.avgIndPE ? '行业均值 ' + stats.avgIndPE.toFixed(1) + ' 倍' : '');
    card('', stats.avgWinRate ? (stats.avgWinRate * 10000).toFixed(1) : '-', '平均中签率（万分之）', stats.avgFundsNeeded ? '稳获百股需约 ' + stats.avgFundsNeeded.toFixed(0) + ' 万' : '');
    card('', stats.avgFund ? (stats.avgFund / 1).toFixed(0) + '<span style="font-size:0.5em"> 亿</span>' : '-', '平均单只冻结资金', stats.avgPeople ? '约 ' + stats.avgPeople.toFixed(0) + ' 万人参与' : '');
    document.getElementById('stat-grid').innerHTML = html;
  }

  // Pie chart - Gain Distribution
  function renderGainDistChart(stats) {
    var W = 500, H = 360, cx = W / 2, cy = H / 2, r = 120;
    var bins = [
      { label: '50-100%', val: stats.gainBins['50-100%'], color: '#f9e79f' },
      { label: '100-200%', val: stats.gainBins['100-200%'], color: '#f8c471' },
      { label: '200-300%', val: stats.gainBins['200-300%'], color: '#f0b27a' },
      { label: '300-500%', val: stats.gainBins['300-500%'], color: '#e59866' },
      { label: '>500%', val: stats.gainBins['>500%'], color: '#e74c3c' }
    ];
    var total = 0;
    bins.forEach(function(b) { total += b.val; });
    var svg = makeSvg(W, H);
    var g = svgEl('g', { transform: 'translate(' + cx + ',' + cy + ')' });
    svg.appendChild(g);
    var angle = -Math.PI / 2;
    bins.forEach(function(b) {
      var sa = (b.val / total) * 2 * Math.PI;
      var x1 = r * Math.cos(angle), y1 = r * Math.sin(angle);
      var x2 = r * Math.cos(angle + sa), y2 = r * Math.sin(angle + sa);
      var d = 'M 0 0 L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + (sa > Math.PI ? 1 : 0) + ' 1 ' + x2 + ' ' + y2 + ' Z';
      g.appendChild(svgEl('path', { d: d, fill: b.color, stroke: '#fff', 'stroke-width': 2 }));
      var ma = angle + sa / 2, lr = r + 28;
      var t = svgEl('text', { x: lr * Math.cos(ma), y: lr * Math.sin(ma), 'text-anchor': Math.cos(ma) > 0 ? 'start' : 'end', 'dominant-baseline': 'middle', 'font-size': 12, fill: '#2c3e50' });
      t.textContent = b.label + ' ' + b.val + '只';
      g.appendChild(t);
      angle += sa;
    });
    g.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 50, fill: '#fff' }));
    var ct = svgEl('text', { x: 0, y: -6, 'text-anchor': 'middle', 'font-size': 13, fill: '#7f8c8d' });
    ct.textContent = '已上市';
    g.appendChild(ct);
    var cv = svgEl('text', { x: 0, y: 16, 'text-anchor': 'middle', 'font-size': 18, fill: '#e74c3c', 'font-weight': 'bold' });
    cv.textContent = total + '只';
    g.appendChild(cv);
    document.getElementById('chart-gain-dist').innerHTML = '';
    document.getElementById('chart-gain-dist').appendChild(svg);
  }

  // Bar chart - Price Distribution
  function renderPriceDistChart(stats) {
    var W = 500, H = 360, pad = { top: 30, right: 30, bottom: 60, left: 50 };
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    var labels = ['<10元', '10-20元', '20-30元', '≥30元'];
    var vals = labels.map(function(l) { return stats.priceBins[l] || 0; });
    var maxV = Math.max.apply(null, vals) + 5;
    var svg = makeSvg(W, H);
    var g = svgEl('g', { transform: 'translate(' + pad.left + ',' + pad.top + ')' });
    svg.appendChild(g);
    for (var i = 0; i <= maxV; i += 5) {
      var y = ph - (i / maxV) * ph;
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: pw, y2: y, stroke: '#eee', 'stroke-width': 1 }));
      var l = svgEl('text', { x: -10, y: y, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 11, fill: '#999' });
      l.textContent = i;
      g.appendChild(l);
    }
    var colors = ['#2980b9', '#27ae60', '#f39c12', '#e74c3c'];
    var bw = pw / labels.length * 0.55, gap = pw / labels.length;
    labels.forEach(function(l, i) {
      var x = gap * i + (gap - bw) / 2, h = (vals[i] / maxV) * ph, y = ph - h;
      var rect = svgEl('rect', { x: x, y: y, width: bw, height: h, rx: 6, ry: 6, fill: colors[i], opacity: 0.85 });
      g.appendChild(rect);
      var vl = svgEl('text', { x: x + bw / 2, y: y - 10, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold', fill: '#2c3e50' });
      vl.textContent = vals[i];
      g.appendChild(vl);
      var xl = svgEl('text', { x: x + bw / 2, y: ph + 22, 'text-anchor': 'middle', 'font-size': 13, fill: '#555' });
      xl.textContent = l;
      g.appendChild(xl);
    });
    document.getElementById('chart-price-dist').innerHTML = '';
    document.getElementById('chart-price-dist').appendChild(svg);
  }

  // Table - Top Gainers
  function renderTopGainersTable(stats) {
    var html = '';
    stats.topGainers.forEach(function(d, i) {
      html += '<tr><td style="text-align:left">' + (i + 1) + '</td><td style="text-align:left;font-weight:600">' + d.name + '</td><td>' + (d.price ? d.price.toFixed(1) : '-') + '</td><td>' + (d.pe ? d.pe.toFixed(1) : '-') + '</td><td>' + (d.avg_price ? d.avg_price.toFixed(1) : '-') + '</td><td class="gain-up">+' + (d.gain_pct * 100).toFixed(0) + '%</td><td class="gain-up">' + (d.profit || 0).toLocaleString() + '</td><td>' + (d.annual_return ? d.annual_return.toFixed(2) : '-') + '%</td></tr>';
    });
    document.getElementById('tbody-top-gainers').innerHTML = html;
  }

  // Horizontal bar - Cumulative Gain
  function renderCumGainChart(stats) {
    var W = 780, H = 380, pad = { top: 15, right: 100, bottom: 10, left: 80 };
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    var data = stats.topCum.slice().reverse();
    var maxV = Math.max.apply(null, data.map(function(d) { return d.cum_gain || 0; })) * 1.1;
    var svg = makeSvg(W, H);
    var g = svgEl('g', { transform: 'translate(' + pad.left + ',' + pad.top + ')' });
    svg.appendChild(g);
    for (var i = 0; i <= maxV; i += Math.ceil(maxV / 5)) {
      var x = (i / maxV) * pw;
      g.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: ph, stroke: '#eee', 'stroke-width': 1 }));
      var l = svgEl('text', { x: x, y: ph + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#999' });
      l.textContent = (i * 100).toFixed(0) + '%';
      g.appendChild(l);
    }
    var barH = 30, gap = 8;
    data.forEach(function(d, i) {
      var y = i * (barH + gap), w = (d.cum_gain || 0) / maxV * pw;
      var rect = svgEl('rect', { x: 0, y: y, width: Math.max(w, 2), height: barH, rx: 4, ry: 4, fill: '#e74c3c', opacity: 0.85 });
      g.appendChild(rect);
      var nl = svgEl('text', { x: -8, y: y + barH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 13, fill: '#2c3e50', 'font-weight': 500 });
      nl.textContent = d.name;
      g.appendChild(nl);
      var vl = svgEl('text', { x: w + 8, y: y + barH / 2, 'text-anchor': 'start', 'dominant-baseline': 'middle', 'font-size': 13, 'font-weight': 'bold', fill: '#e74c3c' });
      vl.textContent = '+' + (d.cum_gain * 100).toFixed(0) + '%';
      g.appendChild(vl);
      var dl = svgEl('text', { x: w + 8, y: y + barH / 2 + 14, 'text-anchor': 'start', 'font-size': 10, fill: '#999' });
      dl.textContent = (d.price ? d.price.toFixed(1) : '?') + ' → ' + (d.avg_price ? d.avg_price.toFixed(1) : '?');
      g.appendChild(dl);
    });
    document.getElementById('chart-cum-gain').innerHTML = '';
    document.getElementById('chart-cum-gain').appendChild(svg);
  }

  // Combo chart - Monthly IPO Count + Fund
  function renderMonthlyIPOChart(stats) {
    var W = 540, H = 360, pad = { top: 20, right: 55, bottom: 55, left: 50 };
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    var months = stats.monthly.map(function(d) { return d.month.substring(5); });
    var counts = stats.monthly.map(function(d) { return d.count; });
    var funds = stats.monthly.map(function(d) { return d.avg_fund || 0; });
    var maxC = Math.max.apply(null, counts) + 3, maxF = Math.max.apply(null, funds) * 1.15;
    var svg = makeSvg(W, H);
    var g = svgEl('g', { transform: 'translate(' + pad.left + ',' + pad.top + ')' });
    svg.appendChild(g);
    for (var i = 0; i <= maxC; i += 2) {
      var y = ph - (i / maxC) * ph;
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: pw, y2: y, stroke: '#eee', 'stroke-width': 1 }));
    }
    var bw = pw / months.length * 0.4, gap = pw / months.length;
    months.forEach(function(m, i) {
      var x = gap * i + (gap - bw) / 2, h = (counts[i] / maxC) * ph, y = ph - h;
      var rect = svgEl('rect', { x: x, y: y, width: bw, height: h, rx: 5, ry: 5, fill: '#2980b9', opacity: 0.85 });
      g.appendChild(rect);
      var vl = svgEl('text', { x: x + bw / 2, y: y - 8, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 'bold', fill: '#2980b9' });
      vl.textContent = counts[i];
      g.appendChild(vl);
    });
    var pts = '';
    months.forEach(function(m, i) {
      var x = gap * i + gap / 2, y = ph - (funds[i] / maxF) * ph;
      pts += (i ? ' ' : '') + x + ',' + y;
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: 5, fill: '#e74c3c', stroke: '#fff', 'stroke-width': 2 }));
    });
    g.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: '#e74c3c', 'stroke-width': 2.5 }));
    months.forEach(function(m, i) {
      var xl = svgEl('text', { x: gap * i + gap / 2, y: ph + 20, 'text-anchor': 'middle', 'font-size': 12, fill: '#555' });
      xl.textContent = m;
      g.appendChild(xl);
    });
    var lg1 = svgEl('rect', { x: 10, y: ph + 36, width: 12, height: 12, fill: '#2980b9', opacity: 0.85 });
    g.appendChild(lg1);
    g.appendChild(svgEl('text', { x: 26, y: ph + 47, 'font-size': 11, fill: '#555', 'text-anchor': 'start' }).appendChild(document.createTextNode('发行数量(只)')));
    var lg2 = svgEl('line', { x1: 110, x2: 130, y1: ph + 42, y2: ph + 42, stroke: '#e74c3c', 'stroke-width': 2.5 });
    g.appendChild(lg2);
    g.appendChild(svgEl('text', { x: 134, y: ph + 47, 'font-size': 11, fill: '#555', 'text-anchor': 'start' }).appendChild(document.createTextNode('冻结资金(亿)')));
    document.getElementById('chart-monthly-ipo').innerHTML = '';
    document.getElementById('chart-monthly-ipo').appendChild(svg);
  }

  // Combo chart - Monthly Gain + Profit
  function renderMonthlyGainChart(stats) {
    var W = 540, H = 360, pad = { top: 20, right: 55, bottom: 55, left: 55 };
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    var months = stats.monthly.map(function(d) { return d.month.substring(5); });
    var gains = stats.monthly.map(function(d) { return (d.avg_gain_pct || 0) * 100; });
    var profits = stats.monthly.map(function(d) { return d.avg_profit || 0; });
    var maxG = Math.max.apply(null, gains) * 1.2 || 100, maxP = Math.max.apply(null, profits) * 1.2 || 100;
    var svg = makeSvg(W, H);
    var g = svgEl('g', { transform: 'translate(' + pad.left + ',' + pad.top + ')' });
    svg.appendChild(g);
    for (var i = 0; i <= maxG; i += Math.ceil(maxG / 5)) {
      var y = ph - (i / maxG) * ph;
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: pw, y2: y, stroke: '#eee', 'stroke-width': 1 }));
    }
    var bw = pw / months.length * 0.4, gap = pw / months.length;
    months.forEach(function(m, i) {
      var x = gap * i + (gap - bw) / 2, h = (gains[i] / maxG) * ph, y = ph - h;
      var rect = svgEl('rect', { x: x, y: y, width: bw, height: Math.max(h, 1), rx: 5, ry: 5, fill: '#27ae60', opacity: 0.8 });
      g.appendChild(rect);
      var vl = svgEl('text', { x: x + bw / 2, y: y - 8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', fill: '#27ae60' });
      vl.textContent = gains[i].toFixed(0) + '%';
      g.appendChild(vl);
    });
    var pts = '';
    months.forEach(function(m, i) {
      var x = gap * i + gap / 2, y = ph - (profits[i] / maxP) * ph;
      pts += (i ? ' ' : '') + x + ',' + y;
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: 5, fill: '#f39c12', stroke: '#fff', 'stroke-width': 2 }));
      var vl = svgEl('text', { x: x, y: y - 12, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', fill: '#f39c12' });
      vl.textContent = profits[i].toFixed(0);
      g.appendChild(vl);
    });
    g.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: '#f39c12', 'stroke-width': 2.5 }));
    months.forEach(function(m, i) {
      var xl = svgEl('text', { x: gap * i + gap / 2, y: ph + 20, 'text-anchor': 'middle', 'font-size': 12, fill: '#555' });
      xl.textContent = m;
      g.appendChild(xl);
    });
    var lg1 = svgEl('rect', { x: 10, y: ph + 36, width: 12, height: 12, fill: '#27ae60', opacity: 0.8 });
    g.appendChild(lg1);
    g.appendChild(svgEl('text', { x: 26, y: ph + 47, 'font-size': 11, fill: '#555', 'text-anchor': 'start' }).appendChild(document.createTextNode('首日涨幅(%)')));
    var lg2 = svgEl('line', { x1: 110, x2: 130, y1: ph + 42, y2: ph + 42, stroke: '#f39c12', 'stroke-width': 2.5 });
    g.appendChild(lg2);
    g.appendChild(svgEl('text', { x: 134, y: ph + 47, 'font-size': 11, fill: '#555', 'text-anchor': 'start' }).appendChild(document.createTextNode('百股获利(元)')));
    document.getElementById('chart-monthly-gain').innerHTML = '';
    document.getElementById('chart-monthly-gain').appendChild(svg);
  }

  // Monthly table
  function renderMonthlyTable(stats) {
    var html = '';
    stats.monthly.forEach(function(d) {
      var g = d.avg_gain_pct ? '<span class="gain-up">+' + (d.avg_gain_pct * 100).toFixed(0) + '%</span>' : '<span style="color:#999">待上市</span>';
      var p = d.avg_profit ? d.avg_profit.toFixed(0) : '-';
      html += '<tr><td style="text-align:left;font-weight:500">' + d.month + '</td><td>' + d.count + '</td><td>' + (d.avg_price ? d.avg_price.toFixed(1) : '-') + '</td><td>' + (d.avg_win_rate ? (d.avg_win_rate * 10000).toFixed(1) : '-') + '</td><td>' + (d.avg_fund ? d.avg_fund.toFixed(0) : '-') + '</td><td>' + g + '</td><td class="gain-up">' + p + '</td></tr>';
    });
    document.getElementById('tbody-monthly').innerHTML = html;
  }

  // All stocks table
  function renderAllStocksTable(stats) {
    var html = '';
    stats.all.forEach(function(d) {
      var gain = d.gain_pct != null ? '<span class="gain-up">+' + (d.gain_pct * 100).toFixed(0) + '%</span>' : '-';
      var profit = d.profit != null ? '<span class="gain-up">' + d.profit.toLocaleString() + '</span>' : '-';
      var cum = d.cum_gain != null ? '<span class="gain-up">+' + (d.cum_gain * 100).toFixed(0) + '%</span>' : '-';
      var wr = d.win_rate != null ? (d.win_rate * 10000).toFixed(1) : '-';
      var fn = d.funds_needed != null ? d.funds_needed.toFixed(0) : '-';
      html += '<tr><td style="text-align:left">' + d.code + '</td><td style="text-align:left;font-weight:500">' + d.name + '</td><td style="text-align:left">' + d.apply_date + '</td><td>' + (d.price ? d.price.toFixed(1) : '-') + '</td><td>' + (d.pe ? d.pe.toFixed(1) : '-') + '</td><td>' + (d.ind_pe ? d.ind_pe.toFixed(1) : '-') + '</td><td>' + wr + '</td><td>' + fn + '</td><td>' + gain + '</td><td>' + profit + '</td><td>' + cum + '</td></tr>';
    });
    document.getElementById('tbody-all-stocks').innerHTML = html;
  }

  // ============ API Fetch (background, non-blocking) ============
  function tryFetchAPI(callback) { BSE.fetchAPI(callback); }

  // ============ Main Render ============
  function main(data, source) {
    var stats = processData(data);

    var badge = document.getElementById('data-status');
    badge.textContent = source === 'live' ? '实时数据' : '离线缓存';
    badge.className = source === 'live' ? 'live' : 'cached';

    if (stats.total === 0) {
      badge.textContent = '无数据';
      badge.className = 'error';
      return;
    }

    renderAll(stats);
  }

  // ============ Bootstrap: cache-first + background refresh ============
  BSE.setStartDate(API_START_DATE);
  var hasCache = typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA.length > 0;

  // Step 1: Render cached data immediately (instant, no loading screen)
  if (hasCache) {
    main(EMBEDDED_DATA, 'cached');
  }

  // Step 2: Try API in background with retry
  function bgFetch(attempt, maxRetries) {
    var bgStart = Date.now();
    tryFetchAPI(function(err, apiData) {
      if (!err && apiData && apiData.length > 0) {
        var elapsed = Date.now() - bgStart;
        console.log('API refreshed: ' + apiData.length + ' records in ' + elapsed + 'ms');
        main(apiData, 'live');
      } else if (attempt < maxRetries) {
        var wait = Math.pow(2, attempt) * 1000;
        console.log('API retry ' + attempt + '/' + maxRetries + ' in ' + wait + 'ms: ' + (err ? err.message : 'nodata'));
        setTimeout(function() { bgFetch(attempt + 1, maxRetries); }, wait);
      } else {
        console.log('API skipped after ' + maxRetries + ' retries (using cached)');
        if (!hasCache) {
          document.getElementById('loading-msg').textContent = '暂无数据，请运行 update_bse_ipo.py 更新离线缓存';
          document.getElementById('data-status').textContent = '无数据';
          document.getElementById('data-status').className = 'error';
        }
      }
    });
  }
  bgFetch(0, 2);  // up to 2 retries (3 attempts total)

  // Always hide loading overlay
  document.getElementById('loading-overlay').classList.add('done');

})();
