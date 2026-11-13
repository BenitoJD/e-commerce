// Product-photo framing.
//
// Curated catalogue shots are square with generous white padding; letterboxing them inside
// a card (object-contain) shows the whole tool instead of cropping the chuck or cord.
// Lifestyle photos (the Gracewood furniture set) should keep filling the frame.
export function isProductShot(src) {
  return String(src || '').includes('/images/products/');
}

export function fitClass(src, base = '') {
  if (!isProductShot(src)) return base;
  // Remove object-cover rather than appending object-contain: Tailwind's generated CSS
  // orders the two utilities independently of the class attribute, so both present meant
  // cover won and the tools were cropped.
  const clean = String(base).replace(/\bobject-cover\b/g, '').replace(/\s+/g, ' ').trim();
  return `${clean} object-contain bg-white`.trim();
}
