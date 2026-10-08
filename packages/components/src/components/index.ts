import { jsx } from '../jsx-runtime.js';
import type { VNode } from '../types/vnode.js';
import type {
  ActionGroupProps,
  AudioProps,
  AvatarProps,
  ButtonProps,
  CardProps,
  ChartProps,
  CheckerProps,
  CollapseDividerProps,
  CollapsiblePanelProps,
  ColumnProps,
  ColumnSetProps,
  DatePickerProps,
  DateTimePickerProps,
  DivProps,
  FallbackTextProps,
  FormProps,
  HeaderProps,
  HrProps,
  ImageProps,
  ImgCombinationProps,
  InputProps,
  InteractiveContainerProps,
  MarkdownProps,
  MultiSelectPersonProps,
  MultiSelectProps,
  OverflowProps,
  PersonListProps,
  PersonProps,
  PlainTextProps,
  SelectImgProps,
  SelectPersonProps,
  SelectProps,
  TableProps,
  TimePickerProps,
  VideoProps,
} from '../types/props.js';

export function Card(props: CardProps): VNode<CardProps> {
  return jsx('card', props);
}

export function Header(props: HeaderProps): VNode<HeaderProps> {
  return jsx('header', props);
}

export function Div(props: DivProps): VNode<DivProps> {
  return jsx('div', props);
}

/** 与 Div 相同，强调它是卡片内容块而不是 HTML div。 */
export function CardElement(props: DivProps): VNode<DivProps> {
  return jsx('div', props);
}

export function Markdown(props: MarkdownProps): VNode<MarkdownProps> {
  return jsx('markdown', props);
}

export function PlainText(props: PlainTextProps): VNode<PlainTextProps> {
  return jsx('plain_text', props);
}

export function Button(props: ButtonProps): VNode<ButtonProps> {
  return jsx('button', props);
}

export function ActionGroup(props: ActionGroupProps): VNode<ActionGroupProps> {
  return jsx('action', props);
}

export function Hr(props: HrProps = {}): VNode<HrProps> {
  return jsx('hr', props);
}

export function ColumnSet(props: ColumnSetProps): VNode<ColumnSetProps> {
  return jsx('column_set', props);
}

export function Column(props: ColumnProps): VNode<ColumnProps> {
  return jsx('column', props);
}

export function Form(props: FormProps): VNode<FormProps> {
  return jsx('form', props);
}

export function Input(props: InputProps): VNode<InputProps> {
  return jsx('input', props);
}

export function Select(props: SelectProps): VNode<SelectProps> {
  return jsx('select_static', props);
}

/** Select 的别名，对应下拉选择（select_static）。 */
export function SelectMenu(props: SelectProps): VNode<SelectProps> {
  return jsx('select_static', props);
}

export function Image(props: ImageProps): VNode<ImageProps> {
  return jsx('img', props);
}

export function ImgCombination(props: ImgCombinationProps): VNode<ImgCombinationProps> {
  return jsx('img_combination', props);
}

export function Person(props: PersonProps): VNode<PersonProps> {
  return jsx('person', props);
}

export function PersonList(props: PersonListProps): VNode<PersonListProps> {
  return jsx('person_list', props);
}

export function Chart(props: ChartProps): VNode<ChartProps> {
  return jsx('chart', props);
}

export function Table(props: TableProps): VNode<TableProps> {
  return jsx('table', props);
}

export function Audio(props: AudioProps): VNode<AudioProps> {
  return jsx('audio', props);
}

export function Video(props: VideoProps): VNode<VideoProps> {
  return jsx('video', props);
}

export function InteractiveContainer(props: InteractiveContainerProps): VNode<InteractiveContainerProps> {
  return jsx('interactive_container', props);
}

export function CollapsiblePanel(props: CollapsiblePanelProps): VNode<CollapsiblePanelProps> {
  return jsx('collapsible_panel', props);
}

export function CollapseDivider(props: CollapseDividerProps = {}): VNode<CollapseDividerProps> {
  return jsx('collapse_divider', props);
}

export function Avatar(props: AvatarProps): VNode<AvatarProps> {
  return jsx('avatar', props);
}

export function FallbackText(props: FallbackTextProps): VNode<FallbackTextProps> {
  return jsx('fallback_text', props);
}

export function Overflow(props: OverflowProps): VNode<OverflowProps> {
  return jsx('overflow', props);
}

export function MultiSelect(props: MultiSelectProps): VNode<MultiSelectProps> {
  return jsx('multi_select_static', props);
}

export function SelectPerson(props: SelectPersonProps): VNode<SelectPersonProps> {
  return jsx('select_person', props);
}

export function MultiSelectPerson(props: MultiSelectPersonProps): VNode<MultiSelectPersonProps> {
  return jsx('multi_select_person', props);
}

export function DatePicker(props: DatePickerProps): VNode<DatePickerProps> {
  return jsx('date_picker', props);
}

/** 官方与 date_picker 并存的别名标签 picker_date。 */
export function PickerDate(props: DatePickerProps): VNode<DatePickerProps> {
  return jsx('picker_date', props);
}

export function TimePicker(props: TimePickerProps): VNode<TimePickerProps> {
  return jsx('picker_time', props);
}

export function DateTimePicker(props: DateTimePickerProps): VNode<DateTimePickerProps> {
  return jsx('picker_datetime', props);
}

export function SelectImg(props: SelectImgProps): VNode<SelectImgProps> {
  return jsx('select_img', props);
}

export function Checker(props: CheckerProps): VNode<CheckerProps> {
  return jsx('checker', props);
}
