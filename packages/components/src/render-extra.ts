import { serializeActionValue, type ActionInput } from './action.js';
import type { FeishuBehavior, FeishuElement, PlainTextObject } from './types/card.js';
import type { VNodeChild } from './types/vnode.js';

type Props = Record<string, unknown>;

function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

function plain(content: string): PlainTextObject {
  return { tag: 'plain_text', content };
}

function tips(value: unknown): PlainTextObject | undefined {
  return typeof value === 'string' ? plain(value) : undefined;
}

function icon(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') return { tag: 'standard_icon', token: value };
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return undefined;
}

function idOf(props: Props): { element_id?: string; margin?: string } {
  return compact({
    element_id: typeof props.elementId === 'string' ? props.elementId : undefined,
    margin: typeof props.margin === 'string' ? props.margin : undefined,
  });
}

function callbackOf(props: Props, url?: string): { value?: Record<string, unknown>; behaviors?: FeishuBehavior[] } {
  const action = props.action as ActionInput | undefined;
  const raw = props.value;
  const userValue = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  const value = action !== undefined || userValue !== undefined ? serializeActionValue(action, userValue) : undefined;
  const behaviors: FeishuBehavior[] = [];
  if (url) behaviors.push({ type: 'open_url', default_url: url });
  if (value && Object.keys(value).length > 0) behaviors.push({ type: 'callback', value });
  return compact({ value, behaviors: behaviors.length > 0 ? behaviors : undefined });
}

function personOptions(options: unknown): Array<{ value?: string }> | undefined {
  if (!Array.isArray(options)) return undefined;
  return options.map((item) => (typeof item === 'string' ? { value: item } : { value: (item as { value?: string }).value }));
}

function mediaFallback(fallback: unknown): unknown {
  if (fallback === 'drop') return 'drop';
  if (typeof fallback === 'string') {
    return { tag: 'fallback_text', text: plain(fallback) };
  }
  return undefined;
}

function renderImage(props: Props): FeishuElement {
  const fit = (props.scaleType ?? props.mode) as string | undefined;
  return compact({
    tag: 'img',
    img_key: props.imgKey,
    alt: plain(String(props.alt ?? '')),
    title: typeof props.title === 'string' ? plain(props.title) : undefined,
    // 飞书历史字段 mode 与文档字段 scale_type 并存，兼容原模板
    mode: fit,
    scale_type: fit,
    size: props.size,
    corner_radius: props.cornerRadius,
    preview: props.preview,
    transparent: props.transparent,
    ...idOf(props),
  }) as FeishuElement;
}

function renderImgCombination(props: Props): FeishuElement {
  const images = Array.isArray(props.images) ? props.images : [];
  return compact({
    tag: 'img_combination',
    combination_mode: props.mode,
    img_list: images.map((item) => ({
      img_key: typeof item === 'string' ? item : (item as { imgKey: string }).imgKey,
    })),
    combination_transparent: props.transparent,
    corner_radius: props.cornerRadius,
    ...idOf(props),
  }) as FeishuElement;
}

function renderPerson(props: Props): FeishuElement {
  return compact({
    tag: 'person',
    user_id: props.userId,
    size: props.size,
    show_avatar: props.showAvatar,
    show_name: props.showName,
    style: props.style,
    notation: tips(props.notation),
    ...idOf(props),
  }) as FeishuElement;
}

function renderPersonList(props: Props): FeishuElement {
  const persons = Array.isArray(props.persons) ? props.persons : [];
  return compact({
    tag: 'person_list',
    persons: persons.map((item) => ({ id: typeof item === 'string' ? item : (item as { id: string }).id })),
    show_name: props.showName,
    show_avatar: props.showAvatar,
    size: props.size,
    mode: props.mode,
    style: props.style,
    lines: props.lines,
    drop_invalid_user_id: props.dropInvalidUserId,
    icon: icon(props.icon),
    ...idOf(props),
  }) as FeishuElement;
}

function renderChart(props: Props): FeishuElement {
  return compact({
    tag: 'chart',
    chart_spec: props.spec,
    aspect_ratio: props.aspectRatio,
    color_theme: props.colorTheme,
    preview: props.preview,
    height: props.height,
    ...idOf(props),
  }) as FeishuElement;
}

function renderTable(props: Props): FeishuElement {
  const columns = Array.isArray(props.columns) ? props.columns : [];
  const header = props.headerStyle as Props | undefined;
  return compact({
    tag: 'table',
    columns: columns.map((column) => {
      const col = column as Props;
      return compact({
        name: col.name,
        display_name: col.displayName,
        data_type: col.dataType,
        width: col.width,
        vertical_align: col.verticalAlign,
        horizontal_align: col.horizontalAlign,
        format: col.format,
        date_format: col.dateFormat,
      });
    }),
    rows: props.rows,
    page_size: props.pageSize,
    row_height: props.rowHeight,
    row_max_height: props.rowMaxHeight,
    freeze_first_column: props.freezeFirstColumn,
    header_style: header
      ? compact({
          text_align: header.textAlign,
          text_size: header.textSize,
          background_style: header.backgroundStyle,
          text_color: header.textColor,
          bold: header.bold,
          lines: header.lines,
        })
      : undefined,
    ...idOf(props),
  }) as FeishuElement;
}

function renderAudio(props: Props): FeishuElement {
  return compact({
    tag: 'audio',
    file_key: props.fileKey,
    audio_id: props.audioId,
    disabled: props.disabled,
    disabled_tips: tips(props.disabledTips),
    show_progress_bar: props.showProgressBar,
    show_time: props.showTime,
    time_display: props.timeDisplay,
    time_position: props.timePosition,
    style: props.style,
    width: props.width,
    padding: props.padding,
    fallback: mediaFallback(props.fallback),
    ...idOf(props),
  }) as FeishuElement;
}

function renderVideo(props: Props): FeishuElement {
  const cover = props.cover;
  return compact({
    tag: 'video',
    file_key: props.fileKey,
    cover:
      typeof cover === 'string'
        ? { img_key: cover }
        : cover && typeof cover === 'object'
          ? { img_key: (cover as { imgKey?: string }).imgKey }
          : undefined,
    enable_download: props.enableDownload,
    show_time: props.showTime,
    hover_tips: tips(props.hoverTips),
    fallback: mediaFallback(props.fallback),
    ...idOf(props),
  }) as FeishuElement;
}

function renderInteractive(
  props: Props,
  renderChildren: (children: VNodeChild) => FeishuElement[],
): FeishuElement {
  const url = typeof props.url === 'string' ? props.url : undefined;
  // 发消息接口不接受容器上的 value，回传数据只放在 behaviors 里。
  const { behaviors } = callbackOf(props, url);
  return compact({
    tag: 'interactive_container',
    behaviors,
    width: props.width,
    height: props.height,
    direction: props.direction,
    padding: props.padding,
    background_style: props.backgroundStyle,
    has_border: props.hasBorder,
    border_color: props.borderColor,
    corner_radius: props.cornerRadius,
    disabled: props.disabled,
    disabled_tips: tips(props.disabledTips),
    hover_tips: tips(props.hoverTips),
    ...idOf(props),
    elements: renderChildren(props.children as VNodeChild),
  }) as FeishuElement;
}

function renderPanel(
  props: Props,
  renderChildren: (children: VNodeChild) => FeishuElement[],
): FeishuElement {
  return compact({
    tag: 'collapsible_panel',
    expanded: props.expanded,
    background_color: props.backgroundColor,
    padding: props.padding,
    direction: props.direction,
    border:
      props.borderColor || props.cornerRadius
        ? compact({ color: props.borderColor, corner_radius: props.cornerRadius })
        : undefined,
    header: compact({
      title: {
        tag: props.titleMarkdown ? 'markdown' : 'plain_text',
        content: props.title,
      },
      background_color: props.headerBackgroundColor,
      icon: icon(props.icon),
      icon_position: props.iconPosition,
      icon_expanded_angle: props.iconExpandedAngle,
    }),
    ...idOf(props),
    elements: renderChildren(props.children as VNodeChild),
  }) as FeishuElement;
}

function renderOverflow(props: Props): FeishuElement {
  const options = Array.isArray(props.options) ? props.options : [];
  return compact({
    tag: 'overflow',
    text: tips(props.text),
    name: props.name,
    disabled: props.disabled,
    width: props.width,
    options: options.map((item) => {
      const option = item as Props;
      const multi = compact({
        url: option.url,
        pc_url: option.pcUrl,
        ios_url: option.iosUrl,
        android_url: option.androidUrl,
      });
      return compact({
        text: tips(option.text),
        value: option.value,
        multi_url: Object.keys(multi).length > 0 ? multi : undefined,
      });
    }),
    ...callbackOf(props),
    ...idOf(props),
  }) as FeishuElement;
}

function renderMultiSelect(props: Props): FeishuElement {
  const options = Array.isArray(props.options) ? props.options : [];
  return compact({
    tag: 'multi_select_static',
    name: props.name,
    placeholder: tips(props.placeholder),
    selected_values: props.selectedValues,
    required: props.required,
    disabled: props.disabled,
    width: props.width,
    options: options.map((item) => {
      const option = item as { label?: string; text?: string; value: string };
      return { text: plain(option.label ?? option.text ?? option.value), value: option.value };
    }),
    ...callbackOf(props),
    ...idOf(props),
  }) as FeishuElement;
}

function renderSelectPerson(tag: 'select_person' | 'multi_select_person', props: Props): FeishuElement {
  const initial = props.initialOption ?? (typeof props.value === 'string' ? props.value : undefined);
  const callbackProps = typeof props.value === 'string' ? { ...props, value: undefined } : props;
  return compact({
    tag,
    name: props.name,
    placeholder: tips(props.placeholder),
    options: personOptions(props.options),
    initial_option: tag === 'select_person' ? initial : undefined,
    selected_values: props.selectedValues,
    required: props.required,
    disabled: props.disabled,
    width: props.width,
    ...callbackOf(callbackProps),
    ...idOf(props),
  }) as FeishuElement;
}

function renderPicker(tag: 'date_picker' | 'picker_time' | 'picker_datetime', props: Props): FeishuElement {
  return compact({
    tag,
    name: props.name,
    placeholder: tips(props.placeholder),
    initial_date: props.initialDate,
    initial_time: props.initialTime,
    initial_datetime: props.initialDatetime,
    required: props.required,
    disabled: props.disabled,
    width: props.width,
    ...callbackOf(props),
    ...idOf(props),
  }) as FeishuElement;
}

function renderSelectImg(props: Props): FeishuElement {
  const options = Array.isArray(props.options) ? props.options : [];
  return compact({
    tag: 'select_img',
    options: options.map((item) => {
      const option = item as Props;
      return compact({
        img_key: option.imgKey,
        value: option.value,
        disabled: option.disabled,
      });
    }),
    name: props.name,
    multi_select: props.multiSelect,
    layout: props.layout,
    style: props.style,
    aspect_ratio: props.aspectRatio,
    selected_values: props.selectedValues,
    required: props.required,
    disabled: props.disabled,
    width: props.width,
    can_preview: props.canPreview,
    ...callbackOf(props),
    ...idOf(props),
  }) as FeishuElement;
}

function renderChecker(
  props: Props,
  renderChildren: (children: VNodeChild) => FeishuElement[],
): FeishuElement {
  const buttons = props.buttons !== undefined ? renderChildren(props.buttons as VNodeChild) : undefined;
  return compact({
    tag: 'checker',
    name: props.name,
    checked: props.checked,
    text:
      typeof props.text === 'string'
        ? compact({
            tag: props.markdown ? 'lark_md' : 'plain_text',
            content: props.text,
          })
        : undefined,
    overall_checkable: props.overallCheckable,
    checked_style:
      props.showStrikethrough !== undefined || props.opacity !== undefined
        ? compact({ show_strikethrough: props.showStrikethrough, opacity: props.opacity })
        : undefined,
    disabled: props.disabled,
    hover_tips: tips(props.hoverTips),
    button_area: buttons ? { buttons } : undefined,
    ...callbackOf(props),
    ...idOf(props),
  }) as FeishuElement;
}

/** 渲染 JSON 2.0 概述中尚未在主渲染器里手写的组件。未识别时返回 null。 */
export function tryRenderExtra(
  type: string,
  props: Props,
  renderChildren: (children: VNodeChild) => FeishuElement[],
): FeishuElement | null {
  switch (type) {
    case 'img':
      return renderImage(props);
    case 'img_combination':
      return renderImgCombination(props);
    case 'person':
      return renderPerson(props);
    case 'person_list':
      return renderPersonList(props);
    case 'chart':
      return renderChart(props);
    case 'table':
      return renderTable(props);
    case 'audio':
      return renderAudio(props);
    case 'video':
      return renderVideo(props);
    case 'interactive_container':
      return renderInteractive(props, renderChildren);
    case 'collapsible_panel':
      return renderPanel(props, renderChildren);
    case 'collapse_divider':
      return compact({ tag: 'collapse_divider', ...idOf(props) }) as FeishuElement;
    case 'note':
      return compact({
        tag: 'note',
        is_footer: props.isFooter,
        ...idOf(props),
        elements: renderChildren(props.children as VNodeChild),
      }) as FeishuElement;
    case 'blockquote':
      return compact({
        tag: 'blockquote',
        ...idOf(props),
        elements: renderChildren(props.children as VNodeChild),
      }) as FeishuElement;
    case 'avatar':
      return compact({
        tag: 'avatar',
        user_id: props.userId,
        size: props.size,
        custom_size: props.customSize,
        ...idOf(props),
      }) as FeishuElement;
    case 'fallback_text':
      return compact({
        tag: 'fallback_text',
        text: { tag: props.markdown ? 'lark_md' : 'plain_text', content: props.text },
        name: props.name,
        ...callbackOf(props),
        ...idOf(props),
      }) as FeishuElement;
    case 'overflow':
      return renderOverflow(props);
    case 'multi_select_static':
      return renderMultiSelect(props);
    case 'select_person':
      return renderSelectPerson('select_person', props);
    case 'multi_select_person':
      return renderSelectPerson('multi_select_person', props);
    case 'date_picker':
    case 'picker_time':
    case 'picker_datetime':
      return renderPicker(type, props);
    case 'select_img':
      return renderSelectImg(props);
    case 'checker':
      return renderChecker(props, renderChildren);
    default:
      return null;
  }
}
