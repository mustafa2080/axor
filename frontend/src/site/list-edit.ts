// أدوات تعديل القوائم في محررات لوحة الإدارة (ADR-0027, ADR-0028): بترجّع قائمة جديدة ومبتغيّرش الأصلية.

export const replaceAt = <T,>(list: readonly T[], index: number, item: T): T[] => list.map((x, i) => (i === index ? item : x))
export const removeAt = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index)
