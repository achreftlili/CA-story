export const CLIENT_JS = `
(function () {
  'use strict';

  function parseEmbeddedData() {
    var el = document.getElementById('prstory-data');
    if (!el) return { sessions: [], projects: [], generated_at: '' };
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return { sessions: [], projects: [], generated_at: '' };
    }
  }

  function parseEmbeddedFragments() {
    var el = document.getElementById('prstory-fragments');
    if (!el) return {};
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return {};
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function fmtDuration(sec) {
    if (!sec) return '—';
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function fmtWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var now = Date.now();
    var diff = (now - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + ' min ago';
    if (diff < 86400) return Math.round(diff / 3600) + ' h ago';
    if (diff < 86400 * 7) return Math.round(diff / 86400) + ' d ago';
    return d.toISOString().slice(0, 10);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function withinDateRange(iso, range) {
    if (!iso || range === 'all') return true;
    var t = Date.parse(iso);
    if (isNaN(t)) return true;
    var hrs = { '24h': 24, '7d': 24*7, '30d': 24*30 }[range];
    if (!hrs) return true;
    return (Date.now() - t) <= hrs * 3600 * 1000;
  }

  function matchesSearch(s, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var hay = [
      s.summary || '',
      s.first_user_message || '',
      s.project_name || '',
      s.git_branch || '',
      (s.files_touched || []).join(' '),
    ].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function getSortKey(mode) {
    return {
      recent: function (a, b) { return (b.started_at || '').localeCompare(a.started_at || ''); },
      longest: function (a, b) { return (b.duration_seconds || 0) - (a.duration_seconds || 0); },
      interventions: function (a, b) { return (b.intervention_count || 0) - (a.intervention_count || 0); },
      files: function (a, b) { return (b.files_touched || []).length - (a.files_touched || []).length; },
    }[mode] || function () { return 0; };
  }

  var DATA = parseEmbeddedData();
  var FRAGMENTS = parseEmbeddedFragments();
  var STATE = {
    search: '',
    range: 'all',
    sort: 'recent',
    project: 'all',
    hasInt: false,
    selected: 0,
  };

  function applyFilters() {
    var rows = DATA.sessions
      .filter(function (s) {
        if (STATE.project !== 'all' && s.project_path !== STATE.project) return false;
        if (STATE.hasInt && (s.intervention_count || 0) === 0) return false;
        if (!withinDateRange(s.started_at, STATE.range)) return false;
        if (!matchesSearch(s, STATE.search)) return false;
        return true;
      })
      .slice();
    rows.sort(getSortKey(STATE.sort));
    return rows;
  }

  function renderSpark(buckets) {
    if (!buckets || !buckets.length) return '';
    var max = 1;
    for (var i = 0; i < buckets.length; i++) { if (buckets[i] > max) max = buckets[i]; }
    var w = 80, h = 18, bw = w / buckets.length;
    var bars = '';
    for (var j = 0; j < buckets.length; j++) {
      var bh = Math.max(1, Math.round((buckets[j] / max) * h));
      var x = (j * bw).toFixed(2);
      var y = (h - bh).toFixed(2);
      bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 0.4).toFixed(2) + '" height="' + bh + '" />';
    }
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + bars + '</svg>';
  }

  function renderRow(s, idx) {
    var when = fmtWhen(s.started_at);
    var dur = fmtDuration(s.duration_seconds);
    var files = (s.files_touched || []).length;
    var branch = s.git_branch || '—';
    var badge = (s.intervention_count || 0) > 0
      ? '<span class="badge badge-int">' + s.intervention_count + ' int</span>'
      : '';
    var intText = (s.first_intervention || '').trim();
    var intLine = intText ? '<span class="row-intervention" title="' + escapeHtml(intText) + '">📌 ' + escapeHtml(intText) + '</span>' : '';
    return ''
      + '<details class="session-row" data-id="' + escapeHtml(s.id) + '" data-idx="' + idx + '">'
      +   '<summary>'
      +     '<span class="when" title="' + escapeHtml(s.started_at || '') + '">' + escapeHtml(when) + '</span>'
      +     '<span class="project">' + escapeHtml(s.project_name) + '</span>'
      +     '<span class="branch" title="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</span>'
      +     '<span class="duration">' + escapeHtml(dur) + '</span>'
      +     '<span title="messages over time">' + renderSpark(s.activity_buckets) + '</span>'
      +     '<span class="summary">'
      +       '<span class="row-title">' + escapeHtml(s.summary || s.first_user_message || '(no summary)') + '</span>'
      +       intLine
      +     '</span>'
      +     '<span>' + badge + '</span>'
      +   '</summary>'
      +   '<div class="session-detail" data-loaded="0"></div>'
      + '</details>';
  }

  function render() {
    var rows = applyFilters();
    var statsEl = document.getElementById('prstory-stats');
    if (statsEl) {
      var totalSec = rows.reduce(function (a, s) { return a + (s.duration_seconds || 0); }, 0);
      statsEl.textContent = rows.length + ' session' + (rows.length === 1 ? '' : 's')
        + ' · ' + fmtDuration(totalSec) + ' total'
        + ' · last updated ' + fmtWhen(DATA.generated_at);
    }
    var list = document.getElementById('prstory-list');
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty">No sessions match these filters.</div>';
      return;
    }
    list.innerHTML = rows.map(renderRow).join('');
    STATE.selected = Math.min(STATE.selected, rows.length - 1);
    setSelection(STATE.selected);
  }

  function setSelection(idx) {
    var rows = Array.from(document.querySelectorAll('#prstory-list .session-row'));
    rows.forEach(function (r, i) { r.classList.toggle('selected', i === idx); });
    if (rows[idx]) {
      rows[idx].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    STATE.selected = idx;
  }

  function hookListeners() {
    var search = document.getElementById('prstory-search');
    search.addEventListener('input', debounce(function () {
      STATE.search = search.value.trim();
      render();
    }, 80));

    document.getElementById('prstory-range').addEventListener('change', function (e) {
      STATE.range = e.target.value; render();
    });
    document.getElementById('prstory-sort').addEventListener('change', function (e) {
      STATE.sort = e.target.value; render();
    });
    document.getElementById('prstory-project').addEventListener('change', function (e) {
      STATE.project = e.target.value; render();
    });
    document.getElementById('prstory-hasint').addEventListener('change', function (e) {
      STATE.hasInt = e.target.checked; render();
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
        if (e.key === 'Escape') { e.target.blur(); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); search.focus(); search.select(); return; }
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setSelection(STATE.selected + 1); }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setSelection(Math.max(0, STATE.selected - 1)); }
      if (e.key === 'Enter') {
        var rows = document.querySelectorAll('#prstory-list .session-row');
        var row = rows[STATE.selected];
        if (row) {
          row.open = !row.open;
          if (row.open) loadDetail(row);
        }
      }
    });

    document.getElementById('prstory-list').addEventListener('toggle', function (e) {
      if (e.target && e.target.matches('.session-row')) {
        if (e.target.open) loadDetail(e.target);
      }
    }, true);
  }

  function loadDetail(row) {
    var pane = row.querySelector('.session-detail');
    if (!pane || pane.dataset.loaded === '1') return;
    var id = row.dataset.id;
    var html = FRAGMENTS[id];
    if (html) {
      pane.innerHTML = html;
      pane.dataset.loaded = '1';
      return;
    }
    if (window.__prstory_fetch__) {
      pane.innerHTML = '<div class="meta">Loading…</div>';
      window.__prstory_fetch__(id).then(function (h) {
        pane.innerHTML = h || '<div class="empty">No detail available.</div>';
        pane.dataset.loaded = '1';
      }).catch(function (err) {
        pane.innerHTML = '<div class="empty">Failed to load: ' + escapeHtml(err.message) + '</div>';
      });
    } else {
      pane.innerHTML = '<div class="empty">No detail available for this session.</div>';
      pane.dataset.loaded = '1';
    }
  }

  function setupServeRefresh() {
    if (!window.__prstory_poll__) return;
    setInterval(function () {
      fetch('/api/index', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
        if (data && data.generated_at && data.generated_at !== DATA.generated_at) {
          DATA = data;
          render();
        }
      }).catch(function () {});
    }, 30000);

    window.__prstory_fetch__ = function (id) {
      return fetch('/api/session/' + encodeURIComponent(id), { cache: 'no-store' })
        .then(function (r) { return r.text(); });
    };
  }

  function populateProjects() {
    var sel = document.getElementById('prstory-project');
    var seen = new Set();
    DATA.projects.forEach(function (p) {
      if (seen.has(p.path)) return;
      seen.add(p.path);
      var opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = p.name + ' (' + p.session_count + ')';
      sel.appendChild(opt);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    populateProjects();
    hookListeners();
    setupServeRefresh();
    render();
  });
})();
`;
