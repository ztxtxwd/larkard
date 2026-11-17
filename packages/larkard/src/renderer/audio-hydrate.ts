/**
 * 音频（audio）运行期水合：绑定播放/暂停、进度条与时长，切换播放钮图标。
 *
 * 渲染期只输出静态壳 + 隐藏 <audio>；真机交互靠本模块在浏览器里接线。
 * - 浏览器：renderCard 后自动 hydrate；也可手动 hydrateFeishuAudios(root)
 * - SSR：页面塞入 feishuAudioHydrateScript()
 */

/** 已水合标记（避免重复绑事件） */
export const AUDIO_HYDRATED_ATTR = 'data-feishu-audio-hydrated';

/** 对齐真机 PlayRoundFilled（顶层 audio 默认） */
export const AUDIO_PLAY_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="PlayRoundFilled">'
  + '<path d="M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11ZM10.559 6.988l6.21 4.183a1 1 0 0 1 0 1.658l-6.21 4.183A1 1 0 0 1 9 16.182V7.818a1 1 0 0 1 1.559-.83Z" fill="currentColor"></path>'
  + '</svg>';

/** 对齐飞书网页版 PauseRoundFilled（圆底 + 圆角双竖条） */
export const AUDIO_PAUSE_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="PauseRoundFilled">'
  + '<path d="M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11ZM7.5 9a1.5 1.5 0 1 1 3 0v6a1.5 1.5 0 0 1-3 0V9Zm6 0a1.5 1.5 0 0 1 3 0v6a1.5 1.5 0 0 1-3 0V9Z" fill="currentColor"></path>'
  + '</svg>';

/**
 * markdown_audio（isInline）用扁平 PlayFilled / PauseFilled，无圆底。
 * 真机：style=Normal + isInline 时从 Round 切到 Flat。
 */
export const AUDIO_PLAY_FLAT_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="PlayFilled">'
  + '<path d="M21.073 13.698a2.018 2.018 0 0 0 0-3.396L7.116 1.325C5.771.459 4 1.425 4 3.023v17.954c0 1.599 1.771 2.564 3.116 1.698l13.957-8.977Z" fill="currentColor"></path>'
  + '</svg>';

export const AUDIO_PAUSE_FLAT_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="PauseFilled">'
  + '<path d="M5 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H5Zm12 0a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2Z" fill="currentColor"></path>'
  + '</svg>';

/**
 * 对齐真机 SpeakingOutlined（audio style=speak）：声波图标，播放/暂停都用它，不做双图标切换。
 * 路径取自飞书网页版 icon 模块 593659。
 */
export const AUDIO_SPEAK_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="SpeakingOutlined">'
  + '<path d="M14.625.166c6.233 6.645 6.233 17.025 0 23.67a.527.527 0 0 1-.758.006l-1.524-1.527a.558.558 0 0 1-.007-.772c4.973-5.377 4.973-13.707 0-19.084a.559.559 0 0 1 .007-.772L13.868.16a.527.527 0 0 1 .756.007Zm-4.578 4.586c3.714 4.109 3.714 10.39 0 14.497a.516.516 0 0 1-.705.052l-.047-.042L7.77 17.73a.573.573 0 0 1-.013-.778 7.578 7.578 0 0 0 0-9.905.577.577 0 0 1-.032-.726l.045-.051 1.525-1.528a.518.518 0 0 1 .752.01ZM5.459 9.35a4.332 4.332 0 0 1 0 5.302c-.182.235-.527.234-.738.023l-1.904-1.91a1.083 1.083 0 0 1 0-1.528l1.904-1.91c.21-.211.555-.213.738.023Z" fill="currentColor"></path>'
  + '</svg>';

/**
 * 真机 cn(parentFontSize)：按父级 markdown 字号缩放 inline 音频图标/时间字号与垂直偏移。
 * notation(12) → icon/time 12px；正文 14 → icon 14 / time 12。
 */
export function audioInlineMetrics(parentFontSize: number): {
  iconSize: number; fontSize: number; top: number;
} {
  let iconSize = 20;
  let fontSize = 20;
  let top = 0;
  if (parentFontSize >= 30) { iconSize = 28; fontSize = 24; top = 6; }
  else if (parentFontSize >= 24) { iconSize = 20; fontSize = 20; top = 3; }
  else if (parentFontSize >= 20) { iconSize = 16; fontSize = 16; top = 2; }
  else if (parentFontSize >= 18) { iconSize = 14; fontSize = 16; top = 2; }
  else if (parentFontSize >= 14) { iconSize = 14; fontSize = 12; top = 0; }
  else if (parentFontSize >= 12) { iconSize = 12; fontSize = 12; top = 0; }
  return { iconSize, fontSize, top };
}

/**
 * 时长格式化，对齐真机 B(s, isLong)：
 * - 不足 1 小时 → MM:SS；≥1 小时（或 isLong）→ HH:MM:SS；小时上限 99。
 */
function fmtTime(s: number, long = false): string {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  let h = Math.floor(s / 3600);
  let m = Math.floor((s % 3600) / 60);
  let sec = Math.floor(s % 60);
  if (sec === 60) { m += 1; sec = 0; }
  if (m === 60) { h += 1; m = 0; }
  if (h > 99) { h = 99; m = 59; sec = 59; }
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  if (long || h > 0) return String(h).padStart(2, '0') + ':' + mm + ':' + ss;
  return mm + ':' + ss;
}

/** 切换播放态：靠 wrapper 上的 --playing 类 + CSS 显隐双图标（不改 innerHTML，避免 SVG 被吞） */
function setPlaying(wrap: Element, playing: boolean): void {
  wrap.classList.toggle('universal-card-audio__wrapper--playing', playing);
}

/**
 * 扫描 root 下音频壳并绑定交互（幂等）。
 * @returns 成功水合的数量
 */
export function hydrateFeishuAudios(root?: ParentNode | null): number {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof (scope as ParentNode).querySelectorAll !== 'function') return 0;

  let n = 0;
  const wraps = (scope as ParentNode).querySelectorAll('.universal-card-audio__wrapper.js');
  wraps.forEach((wrap) => {
    if (wrap.getAttribute(AUDIO_HYDRATED_ATTR) === '1') return;
    if (wrap.classList.contains('universal-card-audio__wrapper--disabled')) return;

    const audio = wrap.querySelector('audio.universal-card-audio__native') as HTMLAudioElement | null;
    if (!audio) return;

    const process = wrap.querySelector('.universal-card-audio__process.js') as HTMLElement | null;
    const strip = wrap.querySelector('.universal-card-audio__slider-strip.js') as HTMLElement | null;
    const slider = wrap.querySelector('.universal-card-audio__slider.js') as HTMLElement | null;
    const timeEls = wrap.querySelectorAll('.universal-card-audio__time.js');
    const ctrl = wrap.querySelector('.universal-card-audio__ctrl.js') as HTMLElement | null;

    const paint = (): void => {
      const d = audio.duration || 0;
      const c = audio.currentTime || 0;
      const pct = d ? (c / d) * 100 : 0;
      const long = d >= 3600;
      if (process) process.style.width = pct + '%';
      if (strip) strip.style.left = pct + '%';
      // time_display/time_position 决定有几个时间槽：auto（未播放显示总时长）/
      // current（只显示当前）/ total（只显示总时长）。
      timeEls.forEach((node) => {
        const el = node as HTMLElement;
        const role = el.getAttribute('data-audio-time');
        const seconds = role === 'total' ? d : role === 'current' ? c : (c || d);
        el.textContent = fmtTime(seconds, long);
        el.classList.toggle('universal-card-audio__time--long', long);
      });
      setPlaying(wrap, !audio.paused);
    };

    ctrl?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (audio.paused) {
        void audio.play().catch(() => { /* 自动播放被拦时保持播放钮 */ });
      } else {
        audio.pause();
      }
    });

    // 点击进度条跳转
    slider?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!audio.duration) return;
      const rect = slider.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * audio.duration;
      paint();
    });

    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('play', paint);
    audio.addEventListener('pause', paint);
    audio.addEventListener('ended', () => {
      audio.currentTime = 0;
      paint();
    });

    setPlaying(wrap, false);
    paint();
    wrap.setAttribute(AUDIO_HYDRATED_ATTR, '1');
    n++;
  });
  return n;
}

/** SSR：返回自执行 <script>，DOM ready 后自动水合全部音频 */
export function feishuAudioHydrateScript(): string {
  return `<script data-feishu-audio-hydrate>${feishuAudioHydrateJs()}</script>`;
}

/** SSR：hydrate 脚本正文（不含 <script> 包裹） */
export function feishuAudioHydrateJs(): string {
  // 只切换 --playing 类；播放/暂停 SVG 已由渲染期双图标输出，靠 CSS 显隐。
  // 注意：循环内必须用 let / forEach 闭包，不能用 var——否则所有播放钮都绑到最后一个 audio。
  return `(function(){
  var DONE='${AUDIO_HYDRATED_ATTR}';
  function fmt(s,long){
    if(!isFinite(s)||s<0)return '--:--';
    var h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=Math.floor(s%60);
    if(sec===60){m+=1;sec=0}if(m===60){h+=1;m=0}if(h>99){h=99;m=59;sec=59}
    var mm=String(m).padStart(2,'0'),ss=String(sec).padStart(2,'0');
    if(long||h>0)return String(h).padStart(2,'0')+':'+mm+':'+ss;
    return mm+':'+ss;
  }
  function bindOne(wrap){
    if(wrap.getAttribute(DONE)==='1')return;
    if(wrap.classList.contains('universal-card-audio__wrapper--disabled'))return;
    var audio=wrap.querySelector('audio.universal-card-audio__native');
    if(!audio)return;
    var process=wrap.querySelector('.universal-card-audio__process.js');
    var strip=wrap.querySelector('.universal-card-audio__slider-strip.js');
    var slider=wrap.querySelector('.universal-card-audio__slider.js');
    var timeEls=wrap.querySelectorAll('.universal-card-audio__time.js');
    var ctrl=wrap.querySelector('.universal-card-audio__ctrl.js');
    var paint=function(){
      var d=audio.duration||0,c=audio.currentTime||0;
      var pct=d?(c/d)*100:0,long=d>=3600;
      if(process)process.style.width=pct+'%';
      if(strip)strip.style.left=pct+'%';
      for(var i=0;i<timeEls.length;i++){
        var el=timeEls[i],role=el.getAttribute('data-audio-time');
        var seconds=role==='total'?d:role==='current'?c:(c||d);
        el.textContent=fmt(seconds,long);
        if(long)el.classList.add('universal-card-audio__time--long');else el.classList.remove('universal-card-audio__time--long');
      }
      wrap.classList.toggle('universal-card-audio__wrapper--playing',!audio.paused);
    };
    if(ctrl)ctrl.addEventListener('click',function(e){
      e.stopPropagation();e.preventDefault();
      if(audio.paused)audio.play().catch(function(){});else audio.pause();
    });
    if(slider)slider.addEventListener('click',function(e){
      e.stopPropagation();
      if(!audio.duration)return;
      var rect=slider.getBoundingClientRect();
      var ratio=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
      audio.currentTime=ratio*audio.duration;paint();
    });
    audio.addEventListener('timeupdate',paint);
    audio.addEventListener('loadedmetadata',paint);
    audio.addEventListener('play',paint);
    audio.addEventListener('pause',paint);
    audio.addEventListener('ended',function(){audio.currentTime=0;paint();});
    wrap.classList.remove('universal-card-audio__wrapper--playing');
    paint();
    wrap.setAttribute(DONE,'1');
  }
  function bind(){
    var list=document.querySelectorAll('.universal-card-audio__wrapper.js');
    for(var i=0;i<list.length;i++)bindOne(list[i]);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();`;
}
