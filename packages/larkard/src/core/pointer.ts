/**
 * JSON Pointer（RFC 6901）工具。
 *
 * validator / check / device / compile 原先各写一份转义逻辑；现在统一到这里。
 */
export function toPointer(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '/';
  return '/' + path.map((seg) => String(seg).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}
