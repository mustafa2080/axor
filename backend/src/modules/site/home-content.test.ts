import { describe, expect, it } from 'vitest';
import { IMAGE_HOSTS, homeContentSchema, isAllowedImageUrl } from './home-content.js';

const photo = 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=70';

function valid() {
  return {
    hero: { title: 'Title', lead: 'Lead', primaryLabel: 'Plans', secondaryLabel: 'Login' },
    scene: { enabled: true, images: [{ url: photo, alt: 'Warehouse' }] },
    steps: { title: 'Steps', items: [{ title: 'One', text: 'First' }] },
    points: { title: 'Why', items: [{ icon: 'shield' as const, title: 'Safe', text: 'Isolated' }] },
    gallery: { title: 'Gallery', items: [{ url: photo, alt: 'Warehouse', caption: 'Warehouse' }] },
    final: { title: 'Ready?', button: 'Start' },
  };
}

describe('isAllowedImageUrl', () => {
  it('accepts https links on the allowed hosts only', () => {
    expect(isAllowedImageUrl(photo)).toBe(true);
    for (const host of IMAGE_HOSTS) expect(isAllowedImageUrl(`https://${host}/a.jpg`)).toBe(true);
  });

  it('rejects other hosts, schemes, credentials, ports and look-alike hosts', () => {
    for (const url of [
      'http://images.unsplash.com/a.jpg',
      'https://example.com/a.jpg',
      'https://images.unsplash.com.evil.test/a.jpg',
      'https://evil.test/images.unsplash.com/a.jpg',
      'https://user:pass@images.unsplash.com/a.jpg',
      'https://images.unsplash.com:8443/a.jpg',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      '//images.unsplash.com/a.jpg',
      'not a url',
      '',
    ]) {
      expect(isAllowedImageUrl(url), url).toBe(false);
    }
  });
});

describe('homeContentSchema', () => {
  it('accepts valid content', () => {
    expect(homeContentSchema.safeParse(valid()).success).toBe(true);
  });

  it('accepts a scene with no images and the scene switched off', () => {
    const content = { ...valid(), scene: { enabled: false, images: [] } };
    expect(homeContentSchema.safeParse(content).success).toBe(true);
  });

  it('rejects an image from a host that is not allowed', () => {
    const content = valid();
    content.gallery.items[0] = { url: 'https://example.com/a.jpg', alt: 'x', caption: 'x' };
    expect(homeContentSchema.safeParse(content).success).toBe(false);
  });

  it('rejects unknown fields, unknown icons and control characters', () => {
    expect(homeContentSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false);
    const icon = valid();
    (icon.points.items[0] as { icon: string }).icon = 'skull';
    expect(homeContentSchema.safeParse(icon).success).toBe(false);
    const control = valid();
    control.hero.title = 'one\ntwo';
    expect(homeContentSchema.safeParse(control).success).toBe(false);
  });

  it('enforces the size limits', () => {
    const tooMany = valid();
    tooMany.scene.images = Array.from({ length: 4 }, () => ({ url: photo, alt: 'x' }));
    expect(homeContentSchema.safeParse(tooMany).success).toBe(false);
    const empty = valid();
    empty.steps.items = [];
    expect(homeContentSchema.safeParse(empty).success).toBe(false);
    const long = valid();
    long.hero.title = 'x'.repeat(121);
    expect(homeContentSchema.safeParse(long).success).toBe(false);
  });
});
