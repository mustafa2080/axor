import { z } from 'zod';

/**
 * The editable content of the public home page (ADR-0027). Validated on every save, so whatever is
 * stored is already safe to hand to the public page. `null` in the database means "use the built-in
 * default", which lives in the web app.
 *
 * Images are the one thing visitors' browsers load from another site, so they are restricted twice:
 * here (only https URLs on a short host list) and by the web app's Content-Security-Policy
 * (`img-src`, frontend/src/lib/csp.ts). A test keeps the two lists identical.
 */
export const IMAGE_HOSTS = ['images.unsplash.com', 'images.pexels.com'] as const;

// Matched as text, not parsed with `new URL`: the backend never fetches these links (the visitor's
// browser does), and src/outbound-safety.test.ts keeps URL parsing out of anything a request can
// reach. The host must follow "https://" directly, so user-info ("https://x@host"), ports, look-alike
// hosts ("host.evil.test") and backslash tricks do not match; the rest is printable ASCII only.
const hostPattern = IMAGE_HOSTS.map((host) => host.replace(/\./g, '\\.')).join('|');
const allowedImage = new RegExp(`^https://(?:${hostPattern})(?:[/?#][\\u0021-\\u007e]*)?$`);

export function isAllowedImageUrl(value: string): boolean {
  return allowedImage.test(value);
}

// No control characters (including line breaks): every field here is one line of display text.
const hasNoControl = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
};
const line = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControl, 'No control characters');
const imageUrl = z
  .string()
  .max(500)
  .refine(isAllowedImageUrl, 'The image must be an https link on an allowed image host');

const image = z.strictObject({ url: imageUrl, alt: line(150) });
const galleryItem = z.strictObject({ url: imageUrl, alt: line(150), caption: line(100) });
const step = z.strictObject({ title: line(60), text: line(200) });

export const pointIcons = ['building', 'shield', 'box', 'layers', 'repeat'] as const;
const point = z.strictObject({ icon: z.enum(pointIcons), title: line(60), text: line(200) });

const images = z.array(image).max(3);
const gallery = z.array(galleryItem).max(4);
const steps = z.array(step).min(1).max(6);
const points = z.array(point).min(1).max(6);

export const homeContentSchema = z.strictObject({
  hero: z.strictObject({
    title: line(120),
    lead: line(400),
    primaryLabel: line(40),
    secondaryLabel: line(40),
  }),
  // The 3D stage next to the hero text: on/off, and up to three photos on its cards.
  scene: z.strictObject({ enabled: z.boolean(), images }),
  steps: z.strictObject({ title: line(80), items: steps }),
  points: z.strictObject({ title: line(80), items: points }),
  gallery: z.strictObject({ title: line(80), items: gallery }),
  final: z.strictObject({ title: line(80), button: line(40) }),
});

export type HomeContent = z.infer<typeof homeContentSchema>;
