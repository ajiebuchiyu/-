let counter = 0
/** 生成短唯一 id */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 100000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`
}
