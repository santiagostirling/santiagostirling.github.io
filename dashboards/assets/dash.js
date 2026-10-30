/* Mini motor de dashboards interactivos (ECharts + vanilla JS) */
(function () {
  'use strict';
  var H = {};               // helpers públicos
  window.DashH = H;

  // ---------- formato ----------
  var nf = function (d) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  H.n0 = function (v) { return v == null || isNaN(v) ? '–' : nf(0).format(v); };
  H.n1 = function (v) { return v == null || isNaN(v) ? '–' : nf(1).format(v); };
  H.pct = function (v, d) { return v == null || isNaN(v) ? '–' : nf(d == null ? 1 : d).format(v * 100) + '%'; };
  H.usd = function (v) { return v == null || isNaN(v) ? '–' : '$' + nf(0).format(v); };
  H.compact = function (v, pre) {
    if (v == null || isNaN(v)) return '–';
    var a = Math.abs(v), s = pre || '';
    if (a >= 1e6) return s + nf(a >= 1e7 ? 1 : 2).format(v / 1e6) + 'M';
    if (a >= 1e3) return s + nf(a >= 1e5 ? 0 : 1).format(v / 1e3) + 'K';
    return s + nf(0).format(v);
  };
  H.delta = function (v, unit) {
    if (v == null || isNaN(v)) return '–';
    return (v >= 0 ? '▲ ' : '▼ ') + (unit === 'pp' ? nf(1).format(Math.abs(v)) + ' pp' : nf(1).format(Math.abs(v * 100)) + '%');
  };
  H.good = '#1E9E6A'; H.warn = '#E0A526'; H.bad = '#D64545';
  H.MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- agregaciones ----------
  H.sum = function (rows, f) { var s = 0; for (var i = 0; i < rows.length; i++) s += (typeof f === 'function' ? f(rows[i]) : rows[i][f]) || 0; return s; };
  H.group = function (rows, key, val) {
    var m = new Map();
    rows.forEach(function (r) {
      var k = typeof key === 'function' ? key(r) : r[key];
      m.set(k, (m.get(k) || 0) + (val ? (typeof val === 'function' ? val(r) : r[val]) : 1));
    });
    return m;
  };
  H.groupRows = function (rows, key) {
    var m = new Map();
    rows.forEach(function (r) { var k = typeof key === 'function' ? key(r) : r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return m;
  };
  H.distinct = function (rows, f) { return Array.from(new Set(rows.map(function (r) { return r[f]; }))); };
  H.sortedEntries = function (map, desc) {
    return Array.from(map.entries()).sort(function (a, b) { return desc === false ? a[1] - b[1] : b[1] - a[1]; });
  };

  // ---------- motor ----------
  function Dash(cfg) {
    this.cfg = cfg; this.page = 0; this.state = {}; this.cross = null; this.charts = [];
  }

  Dash.prototype.load = function () {
    var self = this;
    fetch(self.cfg.data).then(function (r) { return r.json(); }).then(function (raw) {
      self.data = {};
      Object.keys(raw).forEach(function (k) {
        var cols = raw[k].cols;
        self.data[k] = raw[k].rows.map(function (a) { var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = a[i]; return o; });
      });
      self.shared = {};
      (self.cfg.sharedSlicers || []).forEach(function (f) { self.shared[f] = true; });
      self.renderShell();
      var hash = (location.hash || '').replace('#', '');
      var idx = self.cfg.pages.findIndex(function (p) { return p.key === hash; });
      self.showPage(idx >= 0 ? idx : 0);
      window.addEventListener('resize', function () { self.charts.forEach(function (c) { c.resize(); }); });
    });
  };

  Dash.prototype.renderShell = function () {
    var c = this.cfg, self = this;
    var root = document.getElementById('app');
    root.innerHTML =
      '<header class="d-top"><div class="d-top-in">' +
      '<img class="d-logo" src="' + c.logo + '" alt="">' +
      '<div class="d-titles"><h1 id="d-title"></h1><p id="d-sub"></p></div>' +
      '<nav class="d-tabs" id="d-tabs"></nav>' +
      '<a class="d-back" href="../index.html#dashboards">← Portfolio</a>' +
      '</div></header>' +
      '<div class="d-wrap"><aside class="d-side" id="d-side"></aside><main class="d-main">' +
      '<section class="kpis" id="d-kpis"></section><section class="vis-grid" id="d-vis"></section></main></div>' +
      '<footer class="d-foot">Interactive web version of a Power BI report · sample data · built by ' +
      '<a href="../index.html">Santiago Stirling</a> · <a href="../index.html#contact">Hire me</a></footer>';
    var tabs = document.getElementById('d-tabs');
    c.pages.forEach(function (p, i) {
      var b = document.createElement('button');
      b.className = 'd-tab'; b.textContent = p.title;
      b.onclick = function () { self.showPage(i); };
      tabs.appendChild(b);
    });
  };

  Dash.prototype.showPage = function (i) {
    var self = this, p = this.cfg.pages[i];
    this.page = i; this.cross = null;
    history.replaceState(null, '', '#' + p.key);
    document.querySelectorAll('.d-tab').forEach(function (b, j) { b.classList.toggle('active', j === i); });
    document.getElementById('d-title').textContent = p.title;
    document.getElementById('d-sub').textContent = p.subtitle || '';
    document.title = p.title + ' · ' + this.cfg.brand;
    // estado de slicers (los compartidos se conservan entre páginas)
    var st = {};
    p.slicers.forEach(function (s) {
      if (self.shared[s.field] && self.state[s.field] !== undefined) st[s.field] = self.state[s.field];
      else st[s.field] = s.default !== undefined ? s.default : null;
    });
    this.state = st;
    this.renderSlicers();
    this.renderVisualShells();
    this.refresh();
  };

  Dash.prototype.renderSlicers = function () {
    var self = this, p = this.cfg.pages[this.page], side = document.getElementById('d-side');
    side.innerHTML = '';
    var fact = this.data[p.fact];
    p.slicers.forEach(function (s) {
      var vals = s.values || H.distinct(fact, s.field).filter(function (v) { return v != null; }).sort(function (a, b) { return a > b ? 1 : -1; });
      var box = document.createElement('div'); box.className = 'card slicer';
      box.innerHTML = '<h4>' + s.label + '</h4>';
      if (s.mode === 'chips') {
        var wrap = document.createElement('div'); wrap.className = 'chips';
        vals.forEach(function (v) {
          var b = document.createElement('button'); b.className = 'chip'; b.textContent = v; b.dataset.v = v;
          b.onclick = function () {
            var cur = self.state[s.field];
            if (s.single) self.state[s.field] = (cur === v && !s.required) ? null : v;
            else {
              var set = new Set(cur || []);
              if (set.has(v)) set.delete(v); else set.add(v);
              self.state[s.field] = set.size ? Array.from(set) : null;
            }
            self.paintSlicers(); self.refresh();
          };
          wrap.appendChild(b);
        });
        box.appendChild(wrap);
      } else {
        var sel = document.createElement('select');
        sel.innerHTML = '<option value="">All</option>' + vals.map(function (v) { return '<option>' + v + '</option>'; }).join('');
        sel.onchange = function () { self.state[s.field] = sel.value || null; self.refresh(); };
        sel.dataset.f = s.field;
        box.appendChild(sel);
      }
      box.dataset.field = s.field;
      side.appendChild(box);
    });
    var reset = document.createElement('button'); reset.className = 'd-reset'; reset.textContent = 'Reset filters';
    reset.onclick = function () {
      p.slicers.forEach(function (s) { self.state[s.field] = s.default !== undefined ? s.default : null; });
      self.cross = null; self.paintSlicers(); self.refresh();
    };
    side.appendChild(reset);
    var cross = document.createElement('div'); cross.className = 'd-cross'; cross.id = 'd-cross'; side.appendChild(cross);
    var note = document.createElement('div'); note.className = 'd-note';
    note.textContent = 'Tip: click any bar, slice or row to filter the rest of the page.';
    side.appendChild(note);
    this.paintSlicers();
  };

  Dash.prototype.paintSlicers = function () {
    var self = this;
    document.querySelectorAll('.slicer').forEach(function (box) {
      var f = box.dataset.field, cur = self.state[f];
      box.querySelectorAll('.chip').forEach(function (b) {
        var v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        var on = cur != null && (Array.isArray(cur) ? cur.indexOf(v) >= 0 || cur.indexOf(String(v)) >= 0 : cur == v);
        b.classList.toggle('on', on);
      });
      var sel = box.querySelector('select'); if (sel) sel.value = cur || '';
    });
  };

  // filtra filas de cualquier tabla con los slicers + cross-filter (solo por campos que existan)
  Dash.prototype.filter = function (rows, opt) {
    opt = opt || {};
    var st = this.state, cross = opt.noCross ? null : this.cross, override = opt.override || {};
    var keys = Object.keys(st);
    return rows.filter(function (r) {
      for (var i = 0; i < keys.length; i++) {
        var f = keys[i], v = f in override ? override[f] : st[f];
        if (v == null || !(f in r)) continue;
        if (typeof v === 'function') { if (!v(r[f], r)) return false; }
        else if (Array.isArray(v)) { if (v.indexOf(r[f]) < 0 && v.indexOf(String(r[f])) < 0) return false; }
        else if (r[f] != v) return false;
      }
      if (cross && cross.field in r && r[cross.field] !== cross.value) return false;
      return true;
    });
  };

  Dash.prototype.ctx = function (visId) {
    var self = this, p = this.cfg.pages[this.page];
    var noCross = this.cross && this.cross.src === visId;
    var ctx = {
      state: this.state, cross: this.cross,
      rows: this.filter(this.data[p.fact], { noCross: noCross }),
      table: function (name, o) { return self.filter(self.data[name], Object.assign({ noCross: noCross }, o || {})); },
      // mismo período del año anterior (respeta el último mes con datos)
      prior: function (name, o) {
        var y = self.state.year;
        if (y == null) return [];
        var ys = (Array.isArray(y) ? y : [y]).map(Number);
        var lastY = self.cfg.lastYear, lastM = self.cfg.lastMonth || 12;
        var prevYs = ys.map(function (v) { return v - 1; });
        return self.filter(self.data[name || p.fact], {
          noCross: noCross || !!(o && o.noCross),
          override: { year: function (val, r) { return prevYs.indexOf(val) >= 0 && (ys.indexOf(lastY) < 0 || val !== lastY - 1 || r.month <= lastM); } }
        });
      },
      all: function (name) { return self.data[name || p.fact]; }
    };
    return ctx;
  };

  Dash.prototype.renderVisualShells = function () {
    var self = this, p = this.cfg.pages[this.page];
    this.charts.forEach(function (c) { c.dispose(); }); this.charts = [];
    var grid = document.getElementById('d-vis'); grid.innerHTML = '';
    p.visuals.forEach(function (v, i) {
      var box = document.createElement('div'); box.className = 'card vis span-' + (v.span || 6);
      box.innerHTML = '<h3>' + v.title + (v.click ? '<small>click to filter</small>' : '') + '</h3>';
      var body = document.createElement('div');
      if (v.type === 'table') { body.className = 'tbl-wrap'; if (v.height) body.style.maxHeight = v.height + 'px'; }
      else { body.className = 'chart'; body.style.height = (v.height || 260) + 'px'; }
      box.appendChild(body); grid.appendChild(box);
      v._el = body; v._id = 'v' + i;
      if (v.type !== 'table') {
        var ch = echarts.init(body, null, { renderer: 'canvas' });
        v._chart = ch; self.charts.push(ch);
        if (v.click) ch.on('click', function (e) {
          var val = v.clickValue ? v.clickValue(e) : (v.clickSeries ? e.seriesName : e.name);
          self.toggleCross(v.click, val, v._id);
        });
      }
    });
  };

  Dash.prototype.toggleCross = function (field, value, src) {
    if (this.cross && this.cross.field === field && this.cross.value === value) this.cross = null;
    else this.cross = { field: field, value: value, src: src };
    this.refresh();
  };

  Dash.prototype.baseOption = function () {
    var t = this.cfg.theme;
    return {
      color: t.colors, textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: t.muted },
      grid: { left: 8, right: 28, top: 34, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: t.card, borderColor: t.grid, textStyle: { color: t.fg } },
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: t.muted, fontSize: 11 } },
      animationDuration: 400
    };
  };

  Dash.prototype.refresh = function () {
    var self = this, p = this.cfg.pages[this.page], t = this.cfg.theme;
    var k = document.getElementById('d-kpis'); k.innerHTML = '';
    var c0 = this.ctx('kpi');
    p.kpis.forEach(function (kp) {
      var val = kp.value(c0);
      var color = kp.color ? kp.color(val, c0) : null;
      var d = document.createElement('div'); d.className = 'card kpi';
      d.innerHTML = '<div class="v"' + (color ? ' style="color:' + color + '"' : '') + '>' + kp.format(val, c0) + '</div><div class="l">' + kp.label + '</div>';
      k.appendChild(d);
    });
    p.visuals.forEach(function (v) {
      var ctx = self.ctx(v._id);
      var sel = self.cross && self.cross.src === v._id ? self.cross.value : null;
      if (v.type === 'table') {
        v._el.innerHTML = v.build(ctx, sel);
        if (v.click) v._el.querySelectorAll('tr[data-k]').forEach(function (tr) {
          tr.classList.add('click');
          tr.onclick = function () { self.toggleCross(v.click, tr.dataset.k, v._id); };
        });
      } else {
        var opt = v.build(ctx, sel, t);
        var base = self.baseOption();
        Object.keys(opt).forEach(function (key) {
          base[key] = (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) && typeof opt[key] === 'object' && !Array.isArray(opt[key]))
            ? Object.assign({}, base[key], opt[key]) : opt[key];
        });
        v._chart.setOption(base, true);
      }
    });
    var cr = document.getElementById('d-cross');
    cr.innerHTML = this.cross ? 'Filtered by <b>' + this.cross.value + '</b> · <a href="#" id="d-clear">clear</a>' : '';
    var cl = document.getElementById('d-clear');
    if (cl) cl.onclick = function (e) { e.preventDefault(); self.cross = null; self.refresh(); };
  };

  // ---------- builders de gráficos reutilizables ----------
  var axisStyle = function (t) {
    return { axisLine: { lineStyle: { color: t.grid } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: t.grid, type: 'dashed' } } };
  };
  H.dim = function (color, on) { return on ? color : color + '55'; };

  H.bar = function (t, cats, values, o) {
    o = o || {};
    var horiz = o.horizontal !== false;
    var ax = axisStyle(t);
    var catAxis = Object.assign({ type: 'category', data: cats, inverse: horiz }, ax, { splitLine: { show: false } });
    var valAxis = Object.assign({ type: 'value' }, ax, o.pct ? { axisLabel: { color: t.muted, fontSize: 11, formatter: function (v) { return Math.round(v * 100) + '%'; } } } : {});
    return {
      grid: { left: 8, right: 40, top: 8, bottom: 4, containLabel: true },
      xAxis: horiz ? valAxis : catAxis, yAxis: horiz ? catAxis : valAxis, legend: { show: false },
      tooltip: { valueFormatter: o.fmt || H.n0 },
      series: [{
        type: 'bar', data: values.map(function (v, i) {
          var base = o.colorBy ? o.colorBy(cats[i], i) : (o.color || t.colors[0]);
          return { value: v, itemStyle: { color: o.sel == null || o.sel === cats[i] ? base : base + '40', borderRadius: horiz ? [0, 4, 4, 0] : [4, 4, 0, 0] } };
        }),
        barMaxWidth: 26, label: { show: true, position: horiz ? 'right' : 'top', color: t.fg, fontSize: 11, formatter: function (p) { return (o.labelFmt || o.fmt || H.n0)(p.value); } }
      }]
    };
  };

  H.donut = function (t, entries, o) {
    o = o || {};
    return {
      tooltip: { trigger: 'item', valueFormatter: o.fmt || H.n0 }, legend: { show: false },
      series: [{
        type: 'pie', radius: ['48%', '72%'], center: ['50%', '54%'], avoidLabelOverlap: true,
        itemStyle: { borderColor: t.card, borderWidth: 2 },
        label: { color: t.fg, fontSize: 11, formatter: '{b}\n{d}%' },
        data: entries.map(function (e, i) {
          var c = o.colorBy ? o.colorBy(e[0], i) : t.colors[i % t.colors.length];
          return { name: e[0], value: e[1], itemStyle: { color: o.sel == null || o.sel === e[0] ? c : c + '40' } };
        })
      }]
    };
  };

  H.lines = function (t, cats, series, o) {
    o = o || {}; var ax = axisStyle(t);
    return {
      xAxis: Object.assign({ type: 'category', data: cats, boundaryGap: false }, ax, { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', scale: !!o.scale }, ax, o.pct ? { axisLabel: { color: t.muted, fontSize: 11, formatter: function (v) { return Math.round(v * 100) + '%'; } } } : { axisLabel: { color: t.muted, fontSize: 11, formatter: function (v) { return H.compact(v, o.pre); } } }),
      tooltip: { trigger: 'axis', valueFormatter: o.fmt || H.n0 },
      series: series.map(function (s, i) {
        return { name: s.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: s.data,
          lineStyle: { width: 2.5, color: s.color }, itemStyle: { color: s.color }, emphasis: { focus: 'series' } };
      })
    };
  };

  H.table = function (head, rows, o) {
    o = o || {};
    var h = '<table class="tbl"><thead><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var cls = (r.cls || '') + (o.sel != null && r.key === o.sel ? ' sel' : '');
      h += '<tr' + (r.key != null ? ' data-k="' + String(r.key).replace(/"/g, '&quot;') + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' +
        r.cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  };

  window.Dash = function (cfg) {
    var r = document.documentElement.style, t = cfg.theme;
    var map = { bg: '--bg', card: '--card', hdr: '--hdr', accent: '--accent', fg: '--fg', muted: '--muted', grid: '--grid', alt: '--alt', th: '--th', value: '--value', radius: '--radius', font: '--font' };
    Object.keys(map).forEach(function (k) { if (t[k] != null) r.setProperty(map[k], t[k]); });
    var d = new Dash(cfg); d.load(); return d;
  };
})();
