/**
 * بيمنع تشغيل عملية تانية قبل ما الأولى تخلص. النقر المزدوج أو Enter مرتين بيوصلوا قبل ما React يعيد
 * الرسم ويعطّل الزرار، فالـ state لوحده (busy) مش كفاية؛ ده بيقفل من أول نداء.
 * لو العملية رمت خطأ، القفل بيتفك والخطأ بيوصل للي نادى.
 */
export type FlightResult<T> = { started: true; value: T } | { started: false }

export function createSingleFlight() {
  let running = false
  return async function once<T>(action: () => Promise<T>): Promise<FlightResult<T>> {
    if (running) return { started: false }
    running = true
    try {
      return { started: true, value: await action() }
    } finally {
      running = false
    }
  }
}
