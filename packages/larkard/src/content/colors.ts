/**
 * 飞书官方色阶真源（light 主题 `:root` 全局默认）。
 *
 * 逆向自网页版飞书 4699.*.css 的 `:root{}`（144+ token）。键形如 B500/N600/N00。
 * 这是本库所有命名色/背景色的唯一 light hex 事实源——正文 `<font color>`、
 * header、text_tag、容器背景最终都解析到这里的某个色阶值。
 *
 * 注：飞书还存在 `div[_pp-theme]`（Lark 容器）另一套 light 值（如 B600=#245bdb），
 * 本库统一采用 `:root` 全局默认套系。
 *
 * 深色模式色对由 `content/official-colors.ts` 提供；renderer 继续从这里取 light 值。
 */

export const PALETTE: Record<string, string> = {
  B50: '#f0f4ff', B100: '#e0e9ff', B200: '#c2d4ff', B300: '#94b4ff', B350: '#7aa2ff',
  B400: '#5083fb', B500: '#336df4', B600: '#1456f0', B700: '#0442d2', B800: '#002f9e', B900: '#002270',
  C50: '#fef0f8', C100: '#fee2f2', C200: '#f8c4e1', C300: '#f598cc', C350: '#eb78b8',
  C400: '#df58a5', C500: '#cc398c', C600: '#b82879', C700: '#9d1562', C800: '#730744', C900: '#550c35',
  G50: '#e4fae1', G100: '#d0f5ce', G200: '#95e599', G300: '#5cd168', G350: '#35bd4b',
  G400: '#32a645', G500: '#258832', G600: '#1a7526', G700: '#0b6017', G800: '#04430c', G900: '#022c07',
  I50: '#f2f3fd', I100: '#e9eafb', I200: '#cccff9', I300: '#abb0f2', I350: '#959bee',
  I400: '#757df0', I500: '#5b65f5', I600: '#4752e6', I700: '#333dcc', I800: '#1e27a4', I900: '#151b70',
  L50: '#f2f8d3', L100: '#e3f0a3', L200: '#c8dd5f', L300: '#a2c10b', L350: '#91ad00',
  L400: '#7b9207', L500: '#6b7f06', L600: '#5c6d08', L700: '#4a5804', L800: '#333d00', L900: '#262e00',
  N00: '#ffffff', N50: '#f5f6f7', N100: '#f2f3f5', N200: '#eff0f1', N300: '#dee0e3', N350: '#d0d3d6',
  N400: '#bbbfc4', N500: '#8f959e', N600: '#646a73', N650: '#51565d', N700: '#373c43',
  N800: '#2b2f36', N900: '#1f2329', N950: '#0f1114', N1000: '#000000',
  O50: '#fff3e5', O100: '#fee7cd', O200: '#fec48b', O300: '#ff9d4c', O350: '#ff811a',
  O400: '#ed6d0c', O500: '#c25705', O600: '#a44904', O700: '#853a05', O800: '#642b02', O900: '#3b1a02',
  P50: '#f5f0fe', P100: '#efe6fe', P200: '#dcc9fd', P300: '#c8a9fc', P350: '#b791fa',
  P400: '#9f6ff1', P500: '#8d55ed', P600: '#7a35f0', P700: '#611fd6', P800: '#4811a6', P900: '#2f0080',
  R50: '#fef0f0', R100: '#fee3e2', R200: '#fdc6c4', R300: '#f89e9b', R350: '#ff7570',
  R400: '#f54a45', R500: '#e22e28', R600: '#c02a26', R700: '#a11c17', R800: '#741915', R900: '#590603',
  S50: '#ffffdb', S100: '#fffca3', S200: '#fff67a', S300: '#fff258', S350: '#ffe928',
  S400: '#e5ce00', S500: '#c2a800', S600: '#8f7c00', S700: '#5c4f00', S800: '#423700', S900: '#2c2502',
  T50: '#e2f8f5', T100: '#c4f2ec', T200: '#6fe8d8', T300: '#33d6c0', T350: '#2dbeab',
  T400: '#10a893', T500: '#0f8575', T600: '#067062', T700: '#045d51', T800: '#03443b', T900: '#02312a',
  V50: '#fceefc', V100: '#f9e2f9', V200: '#f3c4f3', V300: '#e59ce5', V350: '#de81de',
  V400: '#cf5ecf', V500: '#bf3dbf', V600: '#a630a6', V700: '#872787', V800: '#6a116a', V900: '#520052',
  W50: '#e7f8fe', W100: '#caeffc', W200: '#97dcfc', W300: '#3ec3f7', W350: '#25b0e7',
  W400: '#1295ca', W500: '#047fb0', W600: '#076a94', W700: '#0f587a', W800: '#06415c', W900: '#072b3d',
  Y50: '#fbf4df', Y100: '#faedc2', Y200: '#fcdf7e', Y300: '#fad355', Y350: '#ffc60a',
  Y400: '#d99904', Y500: '#ad7a03', Y600: '#865b03', Y700: '#6f4a01', Y800: '#573601', Y900: '#382201',
};

/** 颜色族名 -> 色阶字母前缀（逆向自引擎 JS 颜色名→token 映射表） */
export const COLOR_FAMILY: Record<string, string> = {
  blue: 'B', carmine: 'C', green: 'G', indigo: 'I', lime: 'L',
  orange: 'O', purple: 'P', red: 'R', sunflower: 'S', turquoise: 'T',
  violet: 'V', wathet: 'W', yellow: 'Y', grey: 'N', neutral: 'N',
};

/**
 * 颜色名 -> 色阶 token（引擎权威映射，逆向自网页版飞书引擎 JS）。
 * 规则：`<族名>-<档位>` 直映到 `<字母><档位>`（如 blue-500→B500、grey-50→N50）；
 * 无档位的族名默认落 `-600`（blue→B600、green→G600 …），唯 grey→N600（同 -600 档）。
 * 生成时覆盖 50/100/200/300/350/400/500/600/700/800/900 全档 + 无后缀默认。
 */
export const COLOR_NAME_TO_TOKEN: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const scales = ['50', '100', '200', '300', '350', '400', '500', '600', '700', '800', '900'];
  for (const [name, letter] of Object.entries(COLOR_FAMILY)) {
    map[name] = letter + '600'; // 无后缀默认 -600
    for (const s of scales) map[`${name}-${s}`] = letter + s;
  }
  // grey 特有的额外档位（引擎表里 grey-00/650/950/1000 等，映射到 N 系）
  map['grey-00'] = 'N00';
  map['grey-650'] = 'N650';
  map['grey-950'] = 'N950';
  map['grey-1000'] = 'N1000';
  // 引擎 default_color_tokens / markdown.font_color：white → static-white（#fff）。
  // 本库无 --static-white，等价落到 N00；否则 <font color='white'> 解析失败继承深色正文。
  map.white = 'N00';
  // icon_color.black → icon-n1（N800）；正文偶发 color='black' 与之对齐
  map.black = 'N800';
  return map;
})();

/** 颜色名/色阶 token/自定义色 -> light hex。解析不出则返回 undefined（不污染 style）。 */
export function paletteColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const token = COLOR_NAME_TO_TOKEN[raw];
  if (token && PALETTE[token]) return PALETTE[token];
  if (PALETTE[raw]) return PALETTE[raw]; // raw 本身是色阶 token（如 B600）
  return undefined;
}
