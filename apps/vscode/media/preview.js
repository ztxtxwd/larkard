(() => {
  const vscode = acquireVsCodeApi();
  const stage = document.getElementById('stage');
  const source = document.getElementById('source');
  const refresh = document.getElementById('refresh');
  let lastLocation = {};

  // Mirrors open-feishu-card's feishuChartHydrateJs / hydrateFeishuCharts
  // (palette + attribute names + mount selector kept in sync with the library).
  const CHART_SPEC_ATTR = 'data-feishu-chart-spec';
  const CHART_HYDRATED_ATTR = 'data-feishu-chart-hydrated';
  const CHART_PALETTE = [
    '#1664FF', '#1AC6FF', '#FF8A00', '#3CC780', '#7442D4',
    '#FFC400', '#304D77', '#B48DEB', '#009488', '#FF7DDA',
  ];

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

  new MutationObserver(syncCardTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  vscode.postMessage({ type: 'ready' });
})();
