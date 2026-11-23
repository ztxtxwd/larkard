/**
 * `larkard/program/preview`
 *
 * 多虚拟用户的内存预览会话（无 DOM）。浏览器里渲染并绑定点击用
 * `larkard/program/preview/browser`。
 */
export {
  PREVIEW_USER_COLORS,
  PREVIEW_USER_NAMES,
  buildPreviewActionEvent,
  createProgramPreview,
  createVirtualUser,
  virtualUserAvatar,
  virtualUserToActionUser,
  type PreviewActionEvent,
  type PreviewControlState,
  type ProgramPreview,
  type ProgramPreviewChange,
  type ProgramPreviewOptions,
  type VirtualUser,
  type VirtualUserFactoryContext,
  type VirtualUserInput,
} from './core.js';
