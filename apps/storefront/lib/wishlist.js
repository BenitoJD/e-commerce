export function getWishlist() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('tw_wishlist') || '[]');
  } catch {
    return [];
  }
}

export function saveWishlist(items) {
  localStorage.setItem('tw_wishlist', JSON.stringify(items));
  window.dispatchEvent(new Event('wishlist-updated'));
}

export function addToWishlist(product) {
  const items = getWishlist();
  const slug = product.slug || product.id;
  if (!slug) return items;
  const found = items.find((i) => i.slug === slug);
  if (!found) {
    items.push({
      slug,
      name: product.name,
      price: Number(product.price),
      brand: product.brand || '',
      image: product.image || (product.images && product.images[0]) || ''
    });
    saveWishlist(items);
  }
  return items;
}

export function removeFromWishlist(slug) {
  const items = getWishlist().filter((i) => i.slug !== slug);
  saveWishlist(items);
  return items;
}

export function isWishlisted(slug) {
  if (typeof window === 'undefined') return false;
  return getWishlist().some((i) => i.slug === slug);
}

export function clearWishlist() {
  saveWishlist([]);
}
