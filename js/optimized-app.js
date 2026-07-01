/**
 * 北交所打新 — 优化版渲染逻辑
 * 依赖：BSE (bse-data.js)
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

  // ============ Section 1: Upcoming IPOs ============
  function renderUpcoming(stats) {
    var empty = document.getElementById('upcoming-empty');
    var pendingSection = document.getElementById('upcoming-pending-section');
    var subscribedSection = document.getElementById('upcoming-subscribed-section');

    // Unlisted = gain_pct == null, sorted by apply_date desc
    var upcoming = stats.unlisted.slice().sort(function(a, b) {
      return b.apply_date.localeCompare(a.apply_date);
    });

    if (upcoming.length === 0) {
      pendingSection.style.display = 'none';
      subscribedSection.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // Split: 待申购 (apply_date >= today) vs 已申购待上市 (apply_date < today)
    var todayStr = new Date().toISOString().split('T')[0];
    var pending = upcoming.filter(function(d) { return d.apply_date >= todayStr; });
    var subscribed = upcoming.filter(function(d) { return d.apply_date < todayStr; });

    var wdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    function buildCard(d) {
      var dateStr = d.apply_date || '';
      var wday = '';
      if (dateStr) {
        var dt = new Date(dateStr + 'T00:00:00');
        wday = wdays[dt.getDay()];
      }
      var isPending = d.apply_date >= todayStr;
      var cardClass = isPending ? 'pending' : '';
      var statusLabel = isPending ? '待申购' : '已申购';
      var statusColor = isPending ? '#f59e0b' : '#10a050';

      // Extra subscription metrics for subscribed stocks
      var extraMetrics = '';
      if (d.win_rate != null) {
        var wr = d.win_rate ? (d.win_rate * 10000).toFixed(1) : '-';
        var fy = d.fund_yi ? d.fund_yi.toFixed(0) : '-';
        extraMetrics =
          '<div class="uc-metric"><span class="label">中签率（万分之）</span><span class="val">' + wr + '</span></div>' +
          '<div class="uc-metric"><span class="label">冻结资金</span><span class="val">' + fy + ' 亿</span></div>';
      }

      // Prediction metrics for pending stocks
      var pendingMetrics = '';
      if (isPending) {
        // 顶格申购资金
        var maxAmt = d.max_sub_amt ? d.max_sub_amt.toFixed(0) + ' 万' : '-';
        pendingMetrics += '<div class="uc-metric"><span class="label">顶格申购资金</span><span class="val">' + maxAmt + '</span></div>';

        // 预测稳获百股门槛（四因子模型）
        if (d.predicted_funds) {
          pendingMetrics +=
            '<div class="uc-metric"><span class="label">预测稳获百股门槛</span>' +
            '<span class="val">' + d.predicted_funds.neutral + ' 万</span></div>';
        } else {
          pendingMetrics += '<div class="uc-metric"><span class="label">预测稳获百股门槛</span><span class="val">数据不足</span></div>';
        }

        // 四因子拆解（小字标注）
        var priceWayLabel = d.price_way || '未知';
        pendingMetrics +=
          '<div class="uc-metric uc-metric-full"><span class="label">模型参数</span>' +
          '<span class="val" style="font-size:0.75rem;color:#6b7280;">发行价' + (d.price ? d.price.toFixed(1) : '?') + '元 | PE ' + (d.pe ? d.pe.toFixed(1) : '?') + '倍 | ' + priceWayLabel + '</span></div>';
      }

      var discount = '';
      if (d.pe && d.ind_pe && d.ind_pe > 0) {
        var discPct = ((1 - d.pe / d.ind_pe) * 100).toFixed(0);
        discount = '<div class="uc-discount">估值折价 <strong>' + discPct + '%</strong><span>发行PE仅为行业' + (d.pe / d.ind_pe * 100).toFixed(0) + '%</span></div>';
      }

      return '<div class="upcoming-card ' + cardClass + '">' +
        '<div class="uc-header">' +
          '<div>' +
            '<div class="uc-name">' + d.name + '</div>' +
            '<div class="uc-code">' + d.code + '</div>' +
          '</div>' +
          '<div class="uc-date">' + dateStr + ' ' + wday + '</div>' +
        '</div>' +
        '<div class="uc-metrics">' +
          '<div class="uc-metric"><span class="label">发行价格</span><span class="val">' + (d.price ? d.price.toFixed(2) : '-') + ' 元</span></div>' +
          '<div class="uc-metric"><span class="label">发行市盈率</span><span class="val">' + (d.pe ? d.pe.toFixed(2) : '-') + ' 倍</span></div>' +
          '<div class="uc-metric"><span class="label">行业市盈率</span><span class="val">' + (d.ind_pe ? d.ind_pe.toFixed(2) : '-') + ' 倍</span></div>' +
          '<div class="uc-metric"><span class="label">申购状态</span><span class="val" style="color:' + statusColor + '">' + statusLabel + '</span></div>' +
          extraMetrics +
          pendingMetrics +
        '</div>' +
        discount +
      '</div>';
    }

    // Row 1: 待申购
    if (pending.length > 0) {
      pendingSection.style.display = '';
      document.getElementById('pending-count').textContent = '(' + pending.length + '只)';
      document.getElementById('upcoming-pending').innerHTML = pending.map(buildCard).join('');
    } else {
      pendingSection.style.display = 'none';
    }

    // Row 2: 已申购待上市
    if (subscribed.length > 0) {
      subscribedSection.style.display = '';
      document.getElementById('subscribed-count').textContent = '(' + subscribed.length + '只)';
      document.getElementById('upcoming-subscribed').innerHTML = subscribed.map(buildCard).join('');
    } else {
      subscribedSection.style.display = 'none';
    }
  }

  // ============ Section 2: Stat Cards ============
  function renderStats(stats) {
    var html = '';
    function card(cls, val, label, sub) {
      html += '<div class="stat-card ' + cls + '"><div class="val">' + val + '</div><div class="lbl">' + label + '</div><div class="sub">' + sub + '</div></div>';
    }
    card('green', stats.avgGainPct ? (stats.avgGainPct * 100).toFixed(0) + '%' : '-', '首日平均涨幅', stats.medGainPct ? '中位数 ' + (stats.medGainPct * 100).toFixed(0) + '%' : '');
    card('accent', stats.broken, '首日破发数量', '胜率 100%');
    card('blue', stats.avgProfit ? stats.avgProfit.toFixed(0) + ' 元' : '-', '每百股平均获利', stats.maxProfit.val ? '最高 ' + (stats.maxProfit.val).toFixed(0) + ' 元' : '');
    card('', stats.avgPE ? stats.avgPE.toFixed(1) + ' 倍' : '-', '平均发行市盈率', stats.avgIndPE ? '行业均值 ' + stats.avgIndPE.toFixed(1) + ' 倍' : '');
    card('', stats.avgWinRate ? (stats.avgWinRate * 10000).toFixed(1) : '-', '平均中签率（万分之）', stats.avgFundsNeeded ? '稳获百股需约 ' + stats.avgFundsNeeded.toFixed(0) + ' 万' : '');
    card('', stats.avgFund ? (stats.avgFund / 1).toFixed(0) + ' 亿' : '-', '平均单只冻结资金', stats.avgPeople ? '约 ' + stats.avgPeople.toFixed(0) + ' 万人参与' : '');
    document.getElementById('stat-grid').innerHTML = html;
  }

  // ============ Gain Distribution Pie ============
  function renderGainDistChart(stats) {
    var W = 500, H = 360, cx = W / 2, cy = H / 2, r = 120;
    var bins = [
      { label: '50-100%', val: stats.gainBins['50-100%'], color: '#fef3c7' },
      { label: '100-200%', val: stats.gainBins['100-200%'], color: '#fcd34d' },
      { label: '200-300%', val: stats.gainBins['200-300%'], color: '#f59e0b' },
      { label: '300-500%', val: stats.gainBins['300-500%'], color: '#ea580c' },
      { label: '>500%', val: stats.gainBins['>500%'], color: '#e8613c' }
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
      var t = svgEl('text', { x: lr * Math.cos(ma), y: lr * Math.sin(ma), 'text-anchor': Math.cos(ma) > 0 ? 'start' : 'end', 'dominant-baseline': 'middle', 'font-size': 12, fill: '#1a1a2e' });
      t.textContent = b.label + ' ' + b.val + '只';
      g.appendChild(t);
      angle += sa;
    });
    g.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 50, fill: '#fff' }));
    var ct = svgEl('text', { x: 0, y: -6, 'text-anchor': 'middle', 'font-size': 13, fill: '#6b7280' });
    ct.textContent = '已上市';
    g.appendChild(ct);
    var cv = svgEl('text', { x: 0, y: 16, 'text-anchor': 'middle', 'font-size': 18, fill: '#e8613c', 'font-weight': 'bold' });
    cv.textContent = total + '只';
    g.appendChild(cv);
    document.getElementById('chart-gain-dist').innerHTML = '';
    document.getElementById('chart-gain-dist').appendChild(svg);
  }

  // ============ Price Distribution Bar ============
  function renderPriceDistChart(stats) {
    var W = 500, H = 360, pad = { top: 30, right: 30, bottom: 60, left: 50 };
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    var labels = ['<10元', '10-20元', '20-30元', '>=30元'];
    var vals = labels.map(function(l) { return stats.priceBins[l] || 0; });
    var maxV = Math.max.apply(null, vals) + 5;
    var svg = makeSvg(W, H);
    var g = svgEl('g', { transform: 'translate(' + pad.left + ',' + pad.top + ')' });
    svg.appendChild(g);
    for (var i = 0; i <= maxV; i += 5) {
      var y = ph - (i / maxV) * ph;
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: pw, y2: y, stroke: '#f3f4f6', 'stroke-width': 1 }));
      var l = svgEl('text', { x: -10, y: y, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 11, fill: '#9ca3af' });
      l.textContent = i;
      g.appendChild(l);
    }
    var colors = ['#2b7bd6', '#10a050', '#f59e0b', '#e8613c'];
    var bw = pw / labels.length * 0.55, gap = pw / labels.length;
    labels.forEach(function(l, i) {
      var x = gap * i + (gap - bw) / 2, h = (vals[i] / maxV) * ph, y2 = ph - h;
      g.appendChild(svgEl('rect', { x: x, y: y2, width: bw, height: h, rx: 6, ry: 6, fill: colors[i], opacity: 0.85 }));
      var vl = svgEl('text', { x: x + bw / 2, y: y2 - 10, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold', fill: '#1a1a2e' });
      vl.textContent = vals[i];
      g.appendChild(vl);
      var xl = svgEl('text', { x: x + bw / 2, y: ph + 22, 'text-anchor': 'middle', 'font-size': 13, fill: '#4b5563' });
      xl.textContent = l;
      g.appendChild(xl);
    });
    document.getElementById('chart-price-dist').innerHTML = '';
    document.getElementById('chart-price-dist').appendChild(svg);
  }

  // ============ Top Gainers Table ============
  function renderTopGainersTable(stats) {
    var html = '';
    stats.topGainers.forEach(function(d, i) {
      html += '<tr><td>' + (i + 1) + '</td><td style="font-weight:600">' + d.name + '</td><td>' + (d.price ? d.price.toFixed(1) : '-') + '</td><td>' + (d.pe ? d.pe.toFixed(1) : '-') + '</td><td>' + (d.avg_price ? d.avg_price.toFixed(1) : '-') + '</td><td class="gain-up">+' + (d.gain_pct * 100).toFixed(0) + '%</td><td class="gain-up">' + (d.profit || 0).toLocaleString() + '</td><td>' + (d.annual_return ? d.annual_return.toFixed(2) : '-') + '%</td></tr>';
    });
    document.getElementById('tbody-top-gainers').innerHTML = html;
  }

  // ============ Cumulative Gain Horizontal Bar ============
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
      g.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: ph, stroke: '#f3f4f6', 'stroke-width': 1 }));
      var l = svgEl('text', { x: x, y: ph + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#9ca3af' });
      l.textContent = (i * 100).toFixed(0) + '%';
      g.appendChild(l);
    }
    var barH = 30, gap = 8;
    data.forEach(function(d, i) {
      var y = i * (barH + gap), w = (d.cum_gain || 0) / maxV * pw;
      g.appendChild(svgEl('rect', { x: 0, y: y, width: Math.max(w, 2), height: barH, rx: 4, ry: 4, fill: '#e8613c', opacity: 0.85 }));
      g.appendChild(svgEl('text', { x: -8, y: y + barH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 13, fill: '#1a1a2e', 'font-weight': 500 }).appendChild(document.createTextNode(d.name)));
      g.appendChild(svgEl('text', { x: w + 8, y: y + barH / 2, 'text-anchor': 'start', 'dominant-baseline': 'middle', 'font-size': 13, 'font-weight': 'bold', fill: '#e8613c' }).appendChild(document.createTextNode('+' + (d.cum_gain * 100).toFixed(0) + '%')));
      g.appendChild(svgEl('text', { x: w + 8, y: y + barH / 2 + 14, 'text-anchor': 'start', 'font-size': 10, fill: '#9ca3af' }).appendChild(document.createTextNode((d.price ? d.price.toFixed(1) : '?') + ' -> ' + (d.avg_price ? d.avg_price.toFixed(1) : '?'))));
    });
    document.getElementById('chart-cum-gain').innerHTML = '';
    document.getElementById('chart-cum-gain').appendChild(svg);
  }

  // ============ Monthly IPO Combo Chart ============
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
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: pw, y2: y, stroke: '#f3f4f6', 'stroke-width': 1 }));
    }
    var bw = pw / months.length * 0.4, gap = pw / months.length;
    months.forEach(function(m, i) {
      var x = gap * i + (gap - bw) / 2, h = (counts[i] / maxC) * ph, y2 = ph - h;
      g.appendChild(svgEl('rect', { x: x, y: y2, width: bw, height: h, rx: 5, ry: 5, fill: '#2b7bd6', opacity: 0.85 }));
      var vl = svgEl('text', { x: x + bw / 2, y: y2 - 8, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 'bold', fill: '#2b7bd6' });
      vl.textContent = counts[i];
      g.appendChild(vl);
    });
    var pts = '';
    months.forEach(function(m, i) {
      var x = gap * i + gap / 2, y2 = ph - (funds[i] / maxF) * ph;
      pts += (i ? ' ' : '') + x + ',' + y2;
      g.appendChild(svgEl('circle', { cx: x, cy: y2, r: 5, fill: '#e8613c', stroke: '#fff', 'stroke-width': 2 }));
    });
    g.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: '#e8613c', 'stroke-width': 2.5 }));
    months.forEach(function(m, i) {
      g.appendChild(svgEl('text', { x: gap * i + gap / 2, y: ph + 20, 'text-anchor': 'middle', 'font-size': 12, fill: '#4b5563' }).appendChild(document.createTextNode(m)));
    });
    g.appendChild(svgEl('rect', { x: 10, y: ph + 36, width: 12, height: 12, fill: '#2b7bd6', opacity: 0.85 }));
    g.appendChild(svgEl('text', { x: 26, y: ph + 47, 'font-size': 11, fill: '#4b5563', 'text-anchor': 'start' }).appendChild(document.createTextNode('发行数量(只)')));
    g.appendChild(svgEl('line', { x1: 110, x2: 130, y1: ph + 42, y2: ph + 42, stroke: '#e8613c', 'stroke-width': 2.5 }));
    g.appendChild(svgEl('text', { x: 134, y: ph + 47, 'font-size': 11, fill: '#4b5563', 'text-anchor': 'start' }).appendChild(document.createTextNode('冻结资金(亿)')));
    document.getElementById('chart-monthly-ipo').innerHTML = '';
    document.getElementById('chart-monthly-ipo').appendChild(svg);
  }

  // ============ Monthly Gain Combo Chart ============
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
      g.appendChild(svgEl('line', { x1: 0, y1: y, x2: pw, y2: y, stroke: '#f3f4f6', 'stroke-width': 1 }));
    }
    var bw = pw / months.length * 0.4, gap = pw / months.length;
    months.forEach(function(m, i) {
      var x = gap * i + (gap - bw) / 2, h = (gains[i] / maxG) * ph, y2 = ph - h;
      g.appendChild(svgEl('rect', { x: x, y: y2, width: bw, height: Math.max(h, 1), rx: 5, ry: 5, fill: '#10a050', opacity: 0.8 }));
      var vl = svgEl('text', { x: x + bw / 2, y: y2 - 8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', fill: '#10a050' });
      vl.textContent = gains[i].toFixed(0) + '%';
      g.appendChild(vl);
    });
    var pts = '';
    months.forEach(function(m, i) {
      var x = gap * i + gap / 2, y2 = ph - (profits[i] / maxP) * ph;
      pts += (i ? ' ' : '') + x + ',' + y2;
      g.appendChild(svgEl('circle', { cx: x, cy: y2, r: 5, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 2 }));
      var vl = svgEl('text', { x: x, y: y2 - 12, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', fill: '#f59e0b' });
      vl.textContent = profits[i].toFixed(0);
      g.appendChild(vl);
    });
    g.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: '#f59e0b', 'stroke-width': 2.5 }));
    months.forEach(function(m, i) {
      g.appendChild(svgEl('text', { x: gap * i + gap / 2, y: ph + 20, 'text-anchor': 'middle', 'font-size': 12, fill: '#4b5563' }).appendChild(document.createTextNode(m)));
    });
    g.appendChild(svgEl('rect', { x: 10, y: ph + 36, width: 12, height: 12, fill: '#10a050', opacity: 0.8 }));
    g.appendChild(svgEl('text', { x: 26, y: ph + 47, 'font-size': 11, fill: '#4b5563', 'text-anchor': 'start' }).appendChild(document.createTextNode('首日涨幅(%)')));
    g.appendChild(svgEl('line', { x1: 110, x2: 130, y1: ph + 42, y2: ph + 42, stroke: '#f59e0b', 'stroke-width': 2.5 }));
    g.appendChild(svgEl('text', { x: 134, y: ph + 47, 'font-size': 11, fill: '#4b5563', 'text-anchor': 'start' }).appendChild(document.createTextNode('百股获利(元)')));
    document.getElementById('chart-monthly-gain').innerHTML = '';
    document.getElementById('chart-monthly-gain').appendChild(svg);
  }

  // ============ Monthly Table ============
  function renderMonthlyTable(stats) {
    var html = '';
    stats.monthly.forEach(function(d) {
      var g = d.avg_gain_pct ? '<span class="gain-up">+' + (d.avg_gain_pct * 100).toFixed(0) + '%</span>' : '<span style="color:#9ca3af">待上市</span>';
      var p = d.avg_profit ? d.avg_profit.toFixed(0) : '-';
      html += '<tr><td style="font-weight:500">' + d.month + '</td><td>' + d.count + '</td><td>' + (d.avg_price ? d.avg_price.toFixed(1) : '-') + '</td><td>' + (d.avg_win_rate ? (d.avg_win_rate * 10000).toFixed(1) : '-') + '</td><td>' + (d.avg_fund ? d.avg_fund.toFixed(0) : '-') + '</td><td>' + g + '</td><td class="gain-up">' + p + '</td></tr>';
    });
    document.getElementById('tbody-monthly').innerHTML = html;
  }

  // ============ All Stocks Table ============
  function renderAllStocksTable(stats) {
    var html = '';
    stats.all.forEach(function(d) {
      var gain = d.gain_pct != null ? '<span class="gain-up">+' + (d.gain_pct * 100).toFixed(0) + '%</span>' : '-';
      var profit = d.profit != null ? '<span class="gain-up">' + d.profit.toLocaleString() + '</span>' : '-';
      var cum = d.cum_gain != null ? '<span class="gain-up">+' + (d.cum_gain * 100).toFixed(0) + '%</span>' : '-';
      var wr = d.win_rate != null ? (d.win_rate * 10000).toFixed(1) : '-';
      var fn = d.funds_needed != null ? d.funds_needed.toFixed(0) : '-';
      html += '<tr><td>' + d.code + '</td><td style="font-weight:500">' + d.name + '</td><td>' + d.apply_date + '</td><td>' + (d.price ? d.price.toFixed(1) : '-') + '</td><td>' + (d.pe ? d.pe.toFixed(1) : '-') + '</td><td>' + (d.ind_pe ? d.ind_pe.toFixed(1) : '-') + '</td><td>' + wr + '</td><td>' + fn + '</td><td>' + gain + '</td><td>' + profit + '</td><td>' + cum + '</td></tr>';
    });
    document.getElementById('tbody-all-stocks').innerHTML = html;
  }

  // ============ Meta ============
  function updateMeta(stats) {
    document.getElementById('hero-date-range').textContent =
      '统计区间：' + stats.dateMin + ' ~ ' + stats.dateMax + ' | 共 ' + stats.total + ' 只新股';
    document.getElementById('overview-desc').textContent =
      stats.total + '只新股全景扫描（申购日 >= ' + stats.cutoffDate + '），一张图看懂北交所打新的赚钱效应。';
    document.getElementById('table-desc').textContent =
      '申购日在 ' + stats.cutoffDate + ' 之后的全部北交所新股，按申购日倒序排列。';
    document.getElementById('footer-info').textContent =
      '数据来源：东方财富数据中心 | 自动获取 | 筛选近半年（>=' + stats.cutoffDate + '）';
  }

  // ============ Render All ============
  function renderAll(stats) {
    renderUpcoming(stats);
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

  // ============ Main ============
  function main(data, source) {
    var stats = BSE.processData(data);

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

  // ============ Bootstrap ============
  BSE.setStartDate(API_START_DATE);
  var hasCache = typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA.length > 0;

  if (hasCache) {
    main(EMBEDDED_DATA, 'cached');
  }

  function bgFetch(attempt, maxRetries) {
    var bgStart = Date.now();
    BSE.fetchAPI(function(err, apiData) {
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
  bgFetch(0, 2);

  document.getElementById('loading-overlay').classList.add('done');
})();
