import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOME,
  MAX,
  homeContentProblem,
  isAllowedImageUrl,
  readHomeContent,
  trimHomeContent,
} from './home-content.ts'

const clone = () => structuredClone(DEFAULT_HOME)

describe('DEFAULT_HOME', () => {
  it('is valid by every rule the editor and the page apply', () => {
    expect(homeContentProblem(DEFAULT_HOME)).toBeNull()
    expect(readHomeContent(DEFAULT_HOME)).toBe(DEFAULT_HOME)
    expect(DEFAULT_HOME.scene.images.length).toBeLessThanOrEqual(MAX.sceneImages)
    expect(DEFAULT_HOME.gallery.items.length).toBeLessThanOrEqual(MAX.galleryItems)
  })
})

describe('isAllowedImageUrl', () => {
  it('accepts only https on the allowed hosts', () => {
    expect(isAllowedImageUrl('https://images.pexels.com/photos/1/a.jpeg')).toBe(true)
    for (const url of [
      'http://images.unsplash.com/a.jpg',
      'https://example.com/a.jpg',
      'https://images.unsplash.com.evil.test/a.jpg',
      'https://u:p@images.unsplash.com/a.jpg',
      'https://images.unsplash.com:444/a.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AA',
      '',
    ]) {
      expect(isAllowedImageUrl(url), url).toBe(false)
    }
  })
})

describe('readHomeContent', () => {
  it('falls back to the default for null, wrong shapes and disallowed images', () => {
    expect(readHomeContent(null)).toBe(DEFAULT_HOME)
    expect(readHomeContent({ hero: 1 })).toBe(DEFAULT_HOME)
    const bad = clone()
    bad.gallery.items[0] = { url: 'https://example.com/a.jpg', alt: 'x', caption: 'x' }
    expect(readHomeContent(bad)).toBe(DEFAULT_HOME)
  })

  it('keeps valid saved content', () => {
    const saved = clone()
    saved.hero.title = 'عنوان جديد'
    expect(readHomeContent(saved)).toEqual(saved)
  })
})

describe('homeContentProblem', () => {
  it('names the first problem in Arabic', () => {
    const empty = clone()
    empty.hero.title = '   '
    expect(homeContentProblem(empty)).toContain('عنوان الواجهة')
    const url = clone()
    url.scene.images[0] = { url: 'https://example.com/a.jpg', alt: 'x' }
    expect(homeContentProblem(url)).toContain('صورة المجسم 1')
    const control = clone()
    control.final.button = 'a\nb'
    expect(homeContentProblem(control)).toContain('زر الدعوة الأخيرة')
  })
})

describe('trimHomeContent', () => {
  it('removes surrounding spaces everywhere', () => {
    const c = clone()
    c.hero.title = '  x  '
    c.gallery.items[0] = { ...c.gallery.items[0]!, url: ` ${c.gallery.items[0]!.url} ` }
    const out = trimHomeContent(c)
    expect(out.hero.title).toBe('x')
    expect(isAllowedImageUrl(out.gallery.items[0]!.url)).toBe(true)
  })
})
