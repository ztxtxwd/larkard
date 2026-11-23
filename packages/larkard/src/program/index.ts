export {
  PROTOCOL_VERSION,
  PROGRAM_KEYS,
  MAX_CARD_ELEMENTS,
  CARD_SIZE_BUDGET,
  compileProgram,
  loadProgram,
  renderProgram,
  dispatchAction,
  measureCard,
  type CompiledProgram,
  type CompileResult,
  type RenderResult,
  type CardStats,
} from './program.js';

export { ACTION_CONTEXT, TOAST_TYPES, type DispatchResult, type Toast, type ToastType } from './actions.js';

export {
  CALLBACK_ACTION_KEY,
  CALLBACK_ARGS_KEY,
  CALLBACK_REV_KEY,
  encodeCallbackValue,
  decodeCallbackValue,
  eventFromCallback,
  type ActionEvent,
  type ActionUser,
  type CallbackPayload,
} from './callback.js';

export { createSimulator, findInteraction, findInteractions, type Simulator, type Interaction, type ClickInput, type ClickTarget } from './simulator.js';

export { ExprError, ProgramError, RenderError, type Diagnostic, type Severity } from './errors.js';

export { parseExpr } from './expr/parser.js';
export { BUILTIN_NAMES } from './expr/builtins.js';
export { escapeMarkdown } from '../schema/markdown/escape.js';
export type { Json, JsonObject } from './expr/values.js';
