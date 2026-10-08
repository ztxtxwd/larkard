import { jsx } from '../jsx-runtime.js';
import type { VNode } from '../types/vnode.js';
import type {
  ActionGroupProps,
  ButtonProps,
  CardProps,
  ColumnProps,
  ColumnSetProps,
  DivProps,
  FormProps,
  HeaderProps,
  HrProps,
  InputProps,
  MarkdownProps,
  PlainTextProps,
  SelectProps,
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
