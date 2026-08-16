/**
 * 图表（chart）运行期水合（hydration）。
 *
 * 背景：网页版飞书卡片的图表是用 VChart 画到 <canvas> 上的。本渲染器保持「输出即字符串/DOM」
 * 的同步模型，无法在渲染期就跑 VChart（那要拉一个几百 KB 的图形库、且依赖真实 DOM 测量）。
 * 因此 chart 组件只渲染一个**挂载容器**，把 VChart 规格塞进 data-feishu-chart-spec 属性；
 * 真正画图交给运行期：页面加载后，由本模块的 hydrate 逻辑 + 页面里的 VChart 完成。
 *
 * 两种用法：
 *  1. 浏览器手动调用：import { hydrateFeishuCharts } from 'open-feishu-card'；
 *     自行 import VChart 后 hydrateFeishuCharts(rootEl, VChart)。
 *  2. SSR：把 feishuChartHydrateScript() 的 <script> 连同 VChart CDN 一起塞进页面 <head>/<body>，
 *     加载完成自动扫描并画图（依赖全局 window.VChart）。
 *
 * chart_spec 本身就是合法的 VChart spec（type/data/xField/yField/seriesField/stack/legends…），
 * 原样透传给 VChart 构造即可；本模块只在缺省时补默认色板、并把容器测量/renderSync 串起来。
 */
import { CHART_PALETTE } from './constants';

/** 挂载容器上承载 spec 的属性名 */
export const CHART_SPEC_ATTR = 'data-feishu-chart-spec';
/** 已水合标记属性（避免重复 render） */
export const CHART_HYDRATED_ATTR = 'data-feishu-chart-hydrated';

/**
 * 归一 VChart 构造器：既接受裸构造器（`import { VChart }`），也接受 UMD 命名空间对象
 * （CDN 全局 `window.VChart`，构造器挂在 `.VChart` 上）。取不到可用构造器返回 null。
 */
function resolveVChartCtor(
  VChart: unknown
): (new (s: unknown, opts: { dom: Element }) => { renderSync: () => void }) | null {
  if (typeof VChart === 'function') return VChart as never;
  if (VChart && typeof (VChart as { VChart?: unknown }).VChart === 'function') {
    return (VChart as { VChart: unknown }).VChart as never;
  }
  return null;
}

/**
 * 水合单张图：把 VChart 规格画进给定挂载节点。
 * @param mount   挂载 DOM 节点（chart 组件里的 __vchart 容器）
 * @param spec    VChart 规格对象
 * @param VChart  VChart 构造器（调用方注入：import { VChart } from '@visactor/vchart'，或 CDN 全局）
 * @returns       VChart 实例（可 release()）；失败返回 null
 */
export function renderFeishuChart(mount: Element, spec: Record<string, unknown>, VChart: unknown): unknown {
  const Ctor = resolveVChartCtor(VChart);
  if (!mount || !spec || !Ctor) return null;
  // 缺省补默认色板，贴近网页版飞书观感（spec 已显式给 color 则尊重之）。
  const finalSpec: Record<string, unknown> = { ...spec };
  if (finalSpec.color == null) finalSpec.color = CHART_PALETTE.slice();
  // background 透明，跟随卡片底色。
  if (finalSpec.background == null) finalSpec.background = 'transparent';
  try {
    // 清掉「图表加载中…」占位，避免与 canvas 叠加。
    if (typeof (mount as HTMLElement).innerHTML === 'string') (mount as HTMLElement).innerHTML = '';
    const inst = new Ctor(finalSpec, { dom: mount });
    inst.renderSync();
    return inst;
  } catch (e) {
    // 画不出来不该拖垮页面：留个可见提示，吞掉异常。
    if (typeof (mount as HTMLElement).innerHTML === 'string') {
      (mount as HTMLElement).innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8f959e;font-size:12px">[图表渲染失败]</div>';
    }
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.warn('[FeishuCard] chart 渲染失败', e);
    return null;
  }
}

/**
 * 扫描 root 下所有未水合的图表容器并逐个画图（幂等：跳过已水合的）。
 * @param root    根节点（默认 document）；传卡片根或页面 body 皆可
 * @param VChart  VChart 构造器（浏览器 CDN 场景可传 window.VChart）
 * @returns       成功水合的图表数量
 */
export function hydrateFeishuCharts(root?: ParentNode | null, VChart?: unknown): number {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  // 缺省取全局 VChart（CDN 场景）；归一 UMD 命名空间 / 裸构造器两种形态。
  const Ctor = resolveVChartCtor(
    VChart ?? (typeof window !== 'undefined' ? (window as { VChart?: unknown }).VChart : undefined)
  );
  if (!scope || typeof (scope as ParentNode).querySelectorAll !== 'function' || !Ctor) return 0;
  let n = 0;
  const nodes = (scope as ParentNode).querySelectorAll(`[${CHART_SPEC_ATTR}]`);
  nodes.forEach((container) => {
    if (container.getAttribute(CHART_HYDRATED_ATTR) === '1') return;
    const raw = container.getAttribute(CHART_SPEC_ATTR);
    if (!raw) return;
    let spec: Record<string, unknown> | null = null;
    try { spec = JSON.parse(raw); } catch { spec = null; }
    if (!spec) return;
    // 挂载点：容器内的 __vchart 子节点（组件已铺好），退化到容器自身。
    const mount = container.querySelector('.universal-card-chart__vchart') || container;
    const inst = renderFeishuChart(mount, spec, Ctor);
    if (inst) { container.setAttribute(CHART_HYDRATED_ATTR, '1'); n++; }
  });
  return n;
}

/**
 * SSR 用：返回一段自执行 <script>，页面加载后自动扫描并画出全部图表。
 * 依赖页面已载入 VChart（全局 window.VChart，典型是 CDN <script>）。
 * @param opts.vchartGlobal  VChart 全局变量名（默认 'VChart'）
 */
export function feishuChartHydrateScript(opts: { vchartGlobal?: string } = {}): string {
  const g = opts.vchartGlobal || 'VChart';
  return `<script data-feishu-chart-hydrate>${feishuChartHydrateJs(g)}</script>`;
}

/**
 * SSR 用：hydrate 脚本正文（不含 <script> 包裹），便于自行拼装/加 nonce。
 * 内联了扫描逻辑（不引用打包产物），只依赖页面里的全局 VChart。
 */
export function feishuChartHydrateJs(vchartGlobal = 'VChart'): string {
  // 纯运行期字符串：等 DOM ready 且 VChart 就绪后，遍历所有容器 renderSync。
  // VChart 可能通过 async/defer CDN 晚于本脚本就绪——未就绪时按退避重试若干次（最多 ~10s）。
  return `(function(){
  var SPEC='${CHART_SPEC_ATTR}',DONE='${CHART_HYDRATED_ATTR}',PALETTE=${JSON.stringify(CHART_PALETTE)},tries=0;
  function draw(){
    var G=window['${vchartGlobal}'];
    var V=G&&(typeof G==='function'?G:G.VChart);
    if(typeof V!=='function'){if(tries++<40){setTimeout(draw,250);}return;}
    var list=document.querySelectorAll('['+SPEC+']');
    for(var i=0;i<list.length;i++){
      var c=list[i];
      if(c.getAttribute(DONE)==='1')continue;
      var raw=c.getAttribute(SPEC);if(!raw)continue;
      var spec;try{spec=JSON.parse(raw);}catch(e){continue;}
      if(spec.color==null)spec.color=PALETTE.slice();
      if(spec.background==null)spec.background='transparent';
      var m=c.querySelector('.universal-card-chart__vchart')||c;
      try{m.innerHTML='';var inst=new V(spec,{dom:m});inst.renderSync();c.setAttribute(DONE,'1');}
      catch(e){m.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8f959e;font-size:12px">[图表渲染失败]</div>';if(window.console)console.warn('[FeishuCard] chart 渲染失败',e);}
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);else draw();
})();`;
}
