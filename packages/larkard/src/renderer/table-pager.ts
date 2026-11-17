/**
 * 表格（table）翻页运行期水合。
 *
 * 真机（网页版客户端 Ql 组件）用 antd Table + pagination：
 *   pageSize 缺省 5、hideOnSinglePage、size=small、showEllipses=false、
 *   showTotal: `${当前页}/${总页数}`；卡片 CSS 再把 `.ud__pagination-item` 隐藏，
 *   所以最终只看到「1/2 + 上一页 + 下一页」。
 *
 * 本渲染器保持「输出即字符串/DOM」的同步模型：渲染期把全部行写进 DOM，
 * 第 2 页起的 <tr> 带 hidden；翻页器带 data 属性，由本模块绑点击切换 hidden。
 * - 浏览器：renderCard 后自动 hydrate；也可手动 hydrateFeishuTablePagers(root)
 * - SSR：页面塞入 feishuTablePagerHydrateScript()（无依赖，DOM ready 自动扫描）
 */

/** 翻页器根节点属性 */
export const TABLE_PAGER_ATTR = 'data-feishu-table-pager';
/** 行所属页（0 基）属性 */
export const TABLE_PAGE_ATTR = 'data-feishu-table-page';
/** 已水合标记（避免重复绑事件） */
export const TABLE_PAGER_HYDRATED_ATTR = 'data-feishu-table-pager-hydrated';

/**
 * 绑定单个表格的翻页器。返回是否新绑定。
 *
 * 刻意写成**完全自包含**（不引用模块内其它常量/函数）：SSR 脚本直接
 * `bind.toString()` 注入，避免手写两份逻辑漂移。
 */
function bindTablePager(table: Element): boolean {
  const pager = table.querySelector('[data-feishu-table-pager]');
  if (!pager || pager.getAttribute('data-feishu-table-pager-hydrated') === '1') return false;
  pager.setAttribute('data-feishu-table-pager-hydrated', '1');

  const readPage = (): number => {
    const total = Math.max(1, Number(pager.getAttribute('data-total-pages')) || 1);
    const page = Number(pager.getAttribute('data-page')) || 0;
    return Math.min(Math.max(0, page), total - 1);
  };
  const paint = (page: number): void => {
    const total = Math.max(1, Number(pager.getAttribute('data-total-pages')) || 1);
    pager.setAttribute('data-page', String(page));
    table.querySelectorAll('[data-feishu-table-page]').forEach((row) => {
      (row as HTMLElement).hidden = (Number(row.getAttribute('data-feishu-table-page')) || 0) !== page;
    });
    const totalText = pager.querySelector('.universal-card-table__pager-total.js');
    if (totalText) totalText.textContent = (page + 1) + '/' + total;
    pager.querySelectorAll('[data-feishu-table-dir]').forEach((btn) => {
      const dir = Number(btn.getAttribute('data-feishu-table-dir')) || 0;
      const disabled = dir < 0 ? page <= 0 : page >= total - 1;
      if (disabled) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
    });
  };

  pager.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    const btn = target && typeof target.closest === 'function'
      ? target.closest('[data-feishu-table-dir]')
      : null;
    if (!btn || btn.hasAttribute('disabled')) return;
    ev.preventDefault();
    ev.stopPropagation();
    const total = Math.max(1, Number(pager.getAttribute('data-total-pages')) || 1);
    const next = readPage() + (Number(btn.getAttribute('data-feishu-table-dir')) || 0);
    if (next < 0 || next >= total) return;
    paint(next);
  });

  // 首次水合按 DOM 上已有的页（SSR 输出恒为第 0 页）重新刷一遍按钮态。
  paint(readPage());
  return true;
}

/**
 * 扫描 root 下所有表格并接线翻页（幂等）。
 * @returns 成功水合的数量
 */
export function hydrateFeishuTablePagers(root?: ParentNode | null): number {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof (scope as ParentNode).querySelectorAll !== 'function') return 0;
  let n = 0;
  (scope as ParentNode).querySelectorAll('.universal-card-table.js').forEach((table) => {
    if (bindTablePager(table)) n++;
  });
  return n;
}

/** SSR：返回自执行 <script>，DOM ready 后自动水合所有表格翻页器 */
export function feishuTablePagerHydrateScript(): string {
  return `<script data-feishu-table-pager-hydrate>${feishuTablePagerHydrateJs()}</script>`;
}

/** SSR：hydrate 脚本正文（不含 <script> 包裹） */
export function feishuTablePagerHydrateJs(): string {
  return `(function(){
  var bind=${bindTablePager.toString()};
  function run(scope){
    var n=0;
    if(!scope||!scope.querySelectorAll)return n;
    scope.querySelectorAll('.universal-card-table.js').forEach(function(el){
      if(bind(el))n++;
    });
    return n;
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){run(document)});
  }else{
    run(document);
  }
})();`;
}
