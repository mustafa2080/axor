import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCatalog } from './catalog.ts'
import type { Product } from './catalog.ts'
import { api } from './client.ts'

// الخادم بيرجّع الكتالوج صفحات (حد أقصى 100). اللوحة بتعرضه كله، فـ listCatalog لازم تلف على
// الصفحات وما تقفش عند أول واحدة.
vi.mock('./client.ts', () => ({ api: vi.fn() }))
const apiMock = vi.mocked(api)

const products = (count: number, from = 0): Product[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${from + index}` }) as unknown as Product)

beforeEach(() => {
  apiMock.mockReset()
})

describe('listCatalog', () => {
  it('بتقف بعد أول صفحة لو أقل من الحجم الكامل', async () => {
    apiMock.mockResolvedValueOnce(products(3))
    const result = await listCatalog()
    expect(result).toHaveLength(3)
    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(apiMock).toHaveBeenCalledWith('GET', '/admin/catalog?limit=100&offset=0')
  })

  it('بتكمّل صفحات كاملة بالترتيب لحد صفحة أقل (مفيش قص عند 50 ولا 100)', async () => {
    apiMock
      .mockResolvedValueOnce(products(100, 0))
      .mockResolvedValueOnce(products(100, 100))
      .mockResolvedValueOnce(products(5, 200))
    const result = await listCatalog()
    expect(result).toHaveLength(205)
    expect(result[0]?.id).toBe('p0')
    expect(result[204]?.id).toBe('p204')
    expect(apiMock.mock.calls.map((call) => call[1])).toEqual([
      '/admin/catalog?limit=100&offset=0',
      '/admin/catalog?limit=100&offset=100',
      '/admin/catalog?limit=100&offset=200',
    ])
  })

  it('لو الصفحة الأخيرة كاملة بالظبط بتطلب صفحة بعدها وبتقف عند الفاضية', async () => {
    apiMock.mockResolvedValueOnce(products(100)).mockResolvedValueOnce([])
    const result = await listCatalog()
    expect(result).toHaveLength(100)
    expect(apiMock).toHaveBeenCalledTimes(2)
  })

  it('بترمي الخطأ زي ما هو ومبترجّعش كتالوج ناقص', async () => {
    const failure = new Error('boom')
    apiMock.mockResolvedValueOnce(products(100)).mockRejectedValueOnce(failure)
    await expect(listCatalog()).rejects.toBe(failure)
  })
})
