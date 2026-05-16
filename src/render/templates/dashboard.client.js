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

  function fmtTokens(n) {
    n = +n || 0;
    if (n === 0) return '—';
    if (n < 1000) return n + '';
    if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
    return (n / 1e6).toFixed(1) + 'M';
  }

  function fmtMs(ms) {
    ms = +ms || 0;
    if (ms === 0) return '—';
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function modelShort(model) {
    if (!model) return '';
    return model.replace(/^claude-/,'').replace(/-\d+(\.\d+)?$/, '').replace(/-/g,' ');
  }

  function renderModelBadge(models) {
    if (!models || !models.length) return '';
    var primary = models[0];
    var extra = models.length > 1 ? ' +' + (models.length - 1) : '';
    return '<span class="model-badge" title="' + escapeHtml(models.join(', ')) + '">' + escapeHtml(modelShort(primary)) + extra + '</span>';
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
      tokens: function (a, b) { return ((b.tokens && b.tokens.billable) || 0) - ((a.tokens && a.tokens.billable) || 0); },
      failures: function (a, b) { return (b.tool_failures || 0) - (a.tool_failures || 0); },
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

  function renderTags(tags) {
    if (!tags || !tags.length) return '';
    var bits = '';
    for (var i = 0; i < tags.length && i < 4; i++) {
      bits += '<span class="tag-chip">' + escapeHtml(tags[i]) + '</span>';
    }
    return '<span class="tag-row">' + bits + '</span>';
  }

  function renderTools(toolCalls, limit) {
    // Filter out mcp__* — they render in their own row.
    if (!toolCalls) return '';
    var core = {};
    for (var k in toolCalls) {
      if (k.indexOf('mcp__') === 0) continue;
      core[k] = toolCalls[k];
    }
    return renderCountMap(core, 'tool-chip', limit || 3, 'tool');
  }

  function renderMcp(map, limit) { return renderCountMap(map, 'mcp-chip', limit || 3, 'mcp'); }
  function renderBashCats(map, limit) { return renderCountMap(map, 'bash-chip', limit || 4, 'bashcat'); }
  function renderSlash(map, limit) { return renderCountMap(map, 'slash-chip', limit || 4); }
  function renderSkills(map, limit) { return renderCountMap(map, 'skill-chip', limit || 3, 'skill'); }
  function renderSubagents(map, limit) { return renderCountMap(map, 'agent-chip', limit || 3, 'agent'); }

  function renderCountMap(map, cls, limit, jumpAttr) {
    if (!map) return '';
    var entries = Object.keys(map)
      .map(function (k) { return [k, map[k] || 0]; })
      .filter(function (e) { return e[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return '';
    var top = entries.slice(0, limit);
    var totalRest = 0;
    for (var i = limit; i < entries.length; i++) totalRest += entries[i][1];
    var bits = '';
    for (var i = 0; i < top.length; i++) {
      var ja = jumpAttr ? ' data-jump-' + jumpAttr + '="' + escapeHtml(top[i][0]) + '"' : '';
      bits += '<span class="' + cls + '"' + ja + ' title="' + escapeHtml(top[i][0]) + ': ' + top[i][1] +
              (entries.length > limit ? '  ·  also ' + (entries.length - limit) + ' others (' + totalRest + ')' : '') +
              '">' +
              escapeHtml(top[i][0]) + ' <b>' + top[i][1] + '</b></span>';
    }
    return '<span class="chip-row">' + bits + '</span>';
  }

  function renderProjectCell(s) {
    var name = escapeHtml(s.project_name);
    var tip = s.project_description ? ' title="' + escapeHtml(s.project_description) + '"' : '';
    return '<span class="project"' + tip + '>' + name + '</span>';
  }

  function renderTokens(t) {
    if (!t) return '<span class="tokens">—</span>';
    var tip = 'in: ' + (t.input||0).toLocaleString() +
      ' · out: ' + (t.output||0).toLocaleString() +
      ' · cache_read: ' + (t.cache_read||0).toLocaleString() +
      ' · cache_create: ' + (t.cache_creation||0).toLocaleString() +
      ' · billable: ' + (t.billable||0).toLocaleString();
    return '<span class="tokens" title="' + escapeHtml(tip) + '">' + escapeHtml(fmtTokens(t.billable)) + '</span>';
  }

  function renderRow(s, idx) {
    var when = fmtWhen(s.started_at);
    var dur = fmtDuration(s.duration_seconds);
    var files = (s.files_touched || []).length;
    var branch = s.git_branch || '—';
    var badges = '';
    if (s.shared) {
      badges += '<span class="badge badge-shared" title="committed to this repo via prstory share">shared</span>';
    }
    if ((s.intervention_count || 0) > 0) {
      badges += '<span class="badge badge-int">' + s.intervention_count + ' int</span>';
    }
    if ((s.tool_failures || 0) > 0) {
      badges += '<span class="badge badge-fail" title="' + s.tool_failures + ' tool failures">' + s.tool_failures + ' ✗</span>';
    }
    if ((s.sidechain_messages || 0) > 0) {
      badges += '<span class="badge badge-side" title="messages from spawned subagents">⤳ ' + s.sidechain_messages + '</span>';
    }
    if ((s.plan_turn_pct || 0) > 0) {
      badges += '<span class="badge badge-plan" title="user turns in plan mode">plan ' + Math.round((s.plan_turn_pct||0)*100) + '%</span>';
    }
    if ((s.max_tokens_count || 0) > 0) {
      badges += '<span class="badge badge-fail" title="turns cut off at max_tokens">max_tok ' + s.max_tokens_count + '</span>';
    }
    if ((s.refusal_count || 0) > 0) {
      badges += '<span class="badge badge-fail" title="refusals from the model">refuse ' + s.refusal_count + '</span>';
    }
    var t = s.tokens || {};
    var cacheDenom = (t.cache_read || 0) + (t.cache_creation || 0);
    if (cacheDenom > 0) {
      var hit = Math.round(((t.cache_read || 0) / cacheDenom) * 100);
      var cls = hit >= 80 ? 'badge-ok' : hit >= 50 ? '' : 'badge-fail';
      badges += '<span class="badge ' + cls + '" title="cache_read ÷ (cache_read + cache_create)">cache ' + hit + '%</span>';
    }
    var intText = (s.first_intervention || '').trim();
    var intLine = intText ? '<span class="row-intervention" title="' + escapeHtml(intText) + '">📌 ' + escapeHtml(intText) + '</span>' : '';
    return ''
      + '<details class="session-row" data-id="' + escapeHtml(s.id) + '" data-idx="' + idx + '">'
      +   '<summary>'
      +     '<span class="when" title="' + escapeHtml(s.started_at || '') + '">' + escapeHtml(when) + '</span>'
      +     renderProjectCell(s)
      +     '<span class="branch" title="' + escapeHtml(branch) + '">' + escapeHtml(branch) + '</span>'
      +     '<span class="duration">' + escapeHtml(dur) + '</span>'
      +     renderTokens(s.tokens)
      +     '<span title="messages over time">' + renderSpark(s.activity_buckets) + '</span>'
      +     '<span class="summary">'
      +       '<span class="row-title">' + escapeHtml(s.summary || s.first_user_message || '(no summary)') + '</span>'
      +       intLine
      +       '<span class="row-meta">'
      +         renderModelBadge(s.models)
      +         renderTools(s.tool_calls, 3)
      +         renderTags(s.project_tags)
      +       '</span>'
      +     '</span>'
      +     '<span class="badges-cell">' + badges + '</span>'
      +   '</summary>'
      +   '<div class="session-detail" data-loaded="0"></div>'
      + '</details>';
  }

  function render() {
    var rows = applyFilters();
    var statsEl = document.getElementById('prstory-stats');
    if (statsEl) {
      var totalSec = rows.reduce(function (a, s) { return a + (s.duration_seconds || 0); }, 0);
      var totalTok = rows.reduce(function (a, s) { return a + ((s.tokens && s.tokens.billable) || 0); }, 0);
      var totalFail = rows.reduce(function (a, s) { return a + (s.tool_failures || 0); }, 0);
      statsEl.textContent = rows.length + ' session' + (rows.length === 1 ? '' : 's')
        + ' · ' + fmtDuration(totalSec) + ' total'
        + ' · ' + fmtTokens(totalTok) + ' tokens'
        + (totalFail > 0 ? ' · ' + totalFail + ' ✗' : '')
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

    // Delegated click → jump for any chip with data-jump-* attribute.
    document.getElementById('prstory-list').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-jump-tool], [data-jump-mcp], [data-jump-bashcat], [data-jump-skill], [data-jump-agent]');
      if (chip) {
        e.preventDefault();
        jumpFromChip(chip);
      }
      var anchor = e.target.closest('.session-toc a[href^="#"]');
      if (anchor) {
        e.preventDefault();
        var pane = anchor.closest('.session-detail');
        var id = anchor.getAttribute('href').slice(1);
        var t = pane && pane.querySelector('#' + cssEscape(id));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function loadDetail(row) {
    var pane = row.querySelector('.session-detail');
    if (!pane || pane.dataset.loaded === '1') return;
    var id = row.dataset.id;
    var session = null;
    for (var i = 0; i < DATA.sessions.length; i++) {
      if (DATA.sessions[i].id === id) { session = DATA.sessions[i]; break; }
    }
    var html = FRAGMENTS[id];
    if (html) {
      pane.innerHTML = renderTldrPanel(session) + html;
      pane.dataset.loaded = '1';
      return;
    }
    if (window.__prstory_fetch__) {
      pane.innerHTML = '<div class="meta">Loading…</div>';
      window.__prstory_fetch__(id).then(function (h) {
        pane.innerHTML = renderTldrPanel(session) + (h || '<div class="empty">No detail available.</div>');
        pane.dataset.loaded = '1';
      }).catch(function (err) {
        pane.innerHTML = '<div class="empty">Failed to load: ' + escapeHtml(err.message) + '</div>';
      });
    } else {
      pane.innerHTML = renderTldrPanel(session) + '<div class="empty">No detail available for this session.</div>';
      pane.dataset.loaded = '1';
    }
  }

  function renderTldrPanel(s) {
    if (!s) return '';
    var ask = s.first_user_message || '(no opening prompt captured)';
    var stats = [
      s.duration_seconds ? fmtDuration(s.duration_seconds) : null,
      s.message_count ? s.message_count + ' messages' : null,
      (s.tool_failures || 0) > 0 ? (s.tool_failures + ' failures') : null,
      (s.intervention_count || 0) > 0 ? (s.intervention_count + ' interventions') : null,
      (s.tokens && s.tokens.billable) ? (fmtTokens(s.tokens.billable) + ' tokens') : null,
    ].filter(Boolean);

    return ''
      + '<div class="tldr-panel">'
      +   '<div class="tldr-header">'
      +     '<h4>Session at a glance</h4>'
      +     '<span class="tldr-stats">' + stats.map(escapeHtml).join(' · ') + '</span>'
      +   '</div>'
      +   '<div class="tldr-ask"><span class="tldr-label">You asked</span> ' + escapeHtml(ask) + '</div>'
      +   '<div class="tldr-summary"><span class="tldr-label">Claude direction</span> ' + escapeHtml(s.summary || '—') + '</div>'
      +   '<div class="tldr-chips">'
      +     renderModelBadge(s.models)
      +     renderTools(s.tool_calls, 8)
      +     renderBashCats(s.bash_categories, 8)
      +     renderMcp(s.mcp_tools, 6)
      +     renderSubagents(s.subagents_used, 6)
      +     renderSkills(s.skills_used, 6)
      +     renderSlash(s.slash_commands, 6)
      +   '</div>'
      +   '<div class="tldr-hint meta">Click any chip to jump to its first occurrence in this session.</div>'
      + '</div>';
  }

  function jumpFromChip(chip) {
    var pane = chip.closest('.session-detail');
    if (!pane) return;
    var rules = ['tool', 'mcp', 'bashcat', 'skill', 'agent'];
    for (var i = 0; i < rules.length; i++) {
      var attr = 'jump' + rules[i].charAt(0).toUpperCase() + rules[i].slice(1);
      var val = chip.dataset[attr];
      if (!val) continue;
      var sel = '[data-' + rules[i] + '="' + cssEscape(val) + '"]';
      var target = pane.querySelector(sel);
      if (!target) {
        // Special case for tool=Bash → category — fallback to first action with the tool name.
        if (rules[i] === 'bashcat' || rules[i] === 'mcp') {
          target = pane.querySelector('[data-tool="Bash"]');
        }
      }
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('jump-flash');
        setTimeout(function (el) { return function () { el.classList.remove('jump-flash'); }; }(target), 1500);
      }
      return;
    }
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) {
      return '\\\\' + c.charCodeAt(0).toString(16) + ' ';
    });
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
