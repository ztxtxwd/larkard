(() => {
  const vscode = acquireVsCodeApi();
  const stage = document.getElementById('stage');
  const source = document.getElementById('source');
  const refresh = document.getElementById('refresh');
  let lastLocation = {};

  // Mirrors open-feishu-card's feishuChartHydrateJs / hydrateFeishuCharts
  // (palette + default padding + attribute names + mount selector kept in sync with the library).
  const CHART_SPEC_ATTR = 'data-feishu-chart-spec';
  const CHART_HYDRATED_ATTR = 'data-feishu-chart-hydrated';
  const CHART_PALETTE = [
    '#1664FF', '#1AC6FF', '#FF8A00', '#3CC780', '#7442D4',
    '#FFC400', '#304D77', '#B48DEB', '#009488', '#FF7DDA',
  ];
  // 真机 VChart 主题内边距（VChart 缺省 20 偏大）。
  const CHART_PADDING = { top: 12, right: 12, left: 12, bottom: 0 };

  source.addEventListener('click', () => vscode.postMessage({ type: 'showSource', ...lastLocation }));
  refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

  window.addEventListener('message', ({ data }) => {
    if (data.theme) document.documentElement.dataset.cardTheme = data.theme;
    if (data.maxWidth) document.documentElement.style.setProperty('--preview-max-width', `${data.maxWidth}px`);
    if (data.type === 'render') {
      lastLocation = {};
      stage.classList.remove('has-error');
      stage.innerHTML = `<section class="device"><div class="card-mount">${data.html}</div></section>`;
      syncCardTheme();
      hydrateCharts(stage);
      hydrateTablePagers(stage);
    } else if (data.type === 'error') {
      lastLocation = { line: data.line, column: data.column };
      stage.classList.add('has-error');
      stage.innerHTML = `
        <section class="error-state">
          <div class="error-icon">{ }</div>
          <h1>${escapeHtml(data.title)}</h1>
          <p>${escapeHtml(data.message)}</p>
          ${data.line ? `<button id="jump" type="button">Go to line ${data.line}${data.column ? `:${data.column}` : ''}</button>` : ''}
        </section>`;
      document.getElementById('jump')?.addEventListener('click', () =>
        vscode.postMessage({ type: 'showSource', ...lastLocation }),
      );
    }
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function syncCardTheme() {
    const setting = document.documentElement.dataset.cardTheme;
    const dark = setting === 'dark' || (setting === 'auto' && document.body.classList.contains('vscode-dark'));
    document.querySelector('.universal-card-root')?.classList.toggle('theme-dark', dark);
  }

  /**
   * Resolve VChart constructor from the UMD global (function or { VChart }).
   * @returns {Function|null}
   */
  function resolveVChart() {
    const g = window.VChart;
    if (!g) return null;
    if (typeof g === 'function') return g;
    if (typeof g.VChart === 'function') return g.VChart;
    return null;
  }

  /**
   * Hydrate all chart mounts under root (idempotent).
   * Equivalent to open-feishu-card's hydrateFeishuCharts(root, window.VChart).
   * @param {ParentNode|null} root
   * @param {number} [tries=0]
   */
  function hydrateCharts(root, tries = 0) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const V = resolveVChart();
    if (typeof V !== 'function') {
      // VChart script may still be loading; retry a few times
      if (tries < 40) setTimeout(() => hydrateCharts(root, tries + 1), 250);
      return;
    }

    const list = root.querySelectorAll(`[${CHART_SPEC_ATTR}]`);
    for (let i = 0; i < list.length; i++) {
      const container = list[i];
      if (container.getAttribute(CHART_HYDRATED_ATTR) === '1') continue;
      const raw = container.getAttribute(CHART_SPEC_ATTR);
      if (!raw) continue;

      let spec;
      try {
        spec = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!spec || typeof spec !== 'object') continue;
      if (spec.color == null) spec.color = CHART_PALETTE.slice();
      if (spec.background == null) spec.background = 'transparent';
      if (spec.padding == null) spec.padding = { ...CHART_PADDING };

      const mount = container.querySelector('.universal-card-chart__vchart') || container;
      try {
        mount.innerHTML = '';
        const inst = new V(spec, { dom: mount });
        inst.renderSync();
        container.setAttribute(CHART_HYDRATED_ATTR, '1');
      } catch (err) {
        mount.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8f959e;font-size:12px">[图表渲染失败]</div>';
        if (window.console) console.warn('[LarkCardPreview] chart hydrate failed', err);
      }
    }
  }

  /**
   * Hydrate table pagination under root (idempotent).
   * Mirrors open-feishu-card's hydrateFeishuTablePagers: rows carry
   * data-feishu-table-page; the pager flips the hidden attribute and 1/N label.
   * @param {ParentNode|null} root
   */
  function hydrateTablePagers(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const tables = root.querySelectorAll('.universal-card-table');
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const pager = table.querySelector('[data-feishu-table-pager]');
      if (!pager || pager.getAttribute('data-feishu-table-pager-hydrated') === '1') continue;
      pager.setAttribute('data-feishu-table-pager-hydrated', '1');

      const paint = (page) => {
        const total = Math.max(1, Number(pager.getAttribute('data-total-pages')) || 1);
        pager.setAttribute('data-page', String(page));
        const rows = table.querySelectorAll('[data-feishu-table-page]');
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          row.hidden = (Number(row.getAttribute('data-feishu-table-page')) || 0) !== page;
        }
        const totalText = pager.querySelector('.universal-card-table__pager-total');
        if (totalText) totalText.textContent = (page + 1) + '/' + total;
        const buttons = pager.querySelectorAll('[data-feishu-table-dir]');
        for (let j = 0; j < buttons.length; j++) {
          const btn = buttons[j];
          const dir = Number(btn.getAttribute('data-feishu-table-dir')) || 0;
          const disabled = dir < 0 ? page <= 0 : page >= total - 1;
          if (disabled) btn.setAttribute('disabled', '');
          else btn.removeAttribute('disabled');
        }
      };

      pager.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-feishu-table-dir]') : null;
        if (!btn || btn.hasAttribute('disabled')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const total = Math.max(1, Number(pager.getAttribute('data-total-pages')) || 1);
        const current = Math.min(Math.max(0, Number(pager.getAttribute('data-page')) || 0), total - 1);
        const next = current + (Number(btn.getAttribute('data-feishu-table-dir')) || 0);
        if (next >= 0 && next < total) paint(next);
      });

      paint(Math.min(Math.max(0, Number(pager.getAttribute('data-page')) || 0),
        Math.max(1, Number(pager.getAttribute('data-total-pages')) || 1) - 1));
    }
  }

  new MutationObserver(syncCardTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  vscode.postMessage({ type: 'ready' });
})();
