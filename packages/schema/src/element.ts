import { z } from 'zod';

import {
  CollapsiblePanelSchema,
  ColumnSetSchema,
  FormSchema,
  InteractiveContainerSchema,
} from './containers/index.js';
import {
  AudioSchema,
  ChartSchema,
  DivSchema,
  HrSchema,
  ImageSchema,
  ImgCombinationSchema,
  PersonListSchema,
  PersonSchema,
  TableSchema,
  VideoSchema,
} from './content/index.js';
import { MarkdownSchema } from './markdown/component.js';
import { registerElementSchema } from './element-ref.js';
import {
  ButtonSchema,
  CheckerSchema,
  DatePickerSchema,
  InputSchema,
  MultiSelectPersonSchema,
  MultiSelectStaticSchema,
  OverflowSchema,
  PickerDatetimeSchema,
  PickerTimeSchema,
  SelectImgSchema,
  SelectPersonSchema,
  SelectStaticSchema,
} from './interactive/index.js';

/**
 * 卡片正文元素判别联合（基于 tag）。
 * 容器类组件通过 z.lazy + registerElementSchema 处理递归嵌套。
 */
export const ElementSchema = z
  .discriminatedUnion('tag', [
    // 容器
    ColumnSetSchema,
    FormSchema,
    InteractiveContainerSchema,
    CollapsiblePanelSchema,
    // 展示
    DivSchema,
    MarkdownSchema,
    ImageSchema,
    ImgCombinationSchema,
    PersonSchema,
    PersonListSchema,
    ChartSchema,
    TableSchema,
    HrSchema,
    AudioSchema,
    VideoSchema,
    // 交互
    ButtonSchema,
    InputSchema,
    OverflowSchema,
    SelectStaticSchema,
    MultiSelectStaticSchema,
    SelectPersonSchema,
    MultiSelectPersonSchema,
    DatePickerSchema,
    PickerTimeSchema,
    PickerDatetimeSchema,
    SelectImgSchema,
    CheckerSchema,
  ])
  .describe(
    '卡片正文元素（基于 tag 的判别联合）。form/table 仅允许在 body.elements 根级；column 内不支持二者',
  );

export type Element = z.infer<typeof ElementSchema>;

registerElementSchema(ElementSchema);
