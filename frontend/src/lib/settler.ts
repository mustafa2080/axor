/**
 * يحسم نتيجة واحدة بس: أول نتيجة توصل أو انتهاء المهلة، أيهما أسبق.
 * أي نتيجة بعد كده (أو بعد dispose) بتتجاهل، فالمهلة ما تقدرش تكتب فوق نتيجة وصلت قبلها.
 */
export interface Settler<T> {
  /** يسلّم النتيجة لو لسه ما اتحسمتش. */
  settle: (value: T) => void
  /** يلغي المهلة ويمنع أي تسليم بعد كده. */
  dispose: () => void
}

export function createSettler<T>(onSettle: (value: T) => void, timeoutMs: number, onTimeout: () => T): Settler<T> {
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const settle = (value: T) => {
    if (done) return
    done = true
    clearTimeout(timer)
    onSettle(value)
  }

  timer = setTimeout(() => settle(onTimeout()), timeoutMs)

  return {
    settle,
    dispose: () => {
      done = true
      clearTimeout(timer)
    },
  }
}
