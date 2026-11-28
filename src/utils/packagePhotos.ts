// Package photos (packages.photos): the flyer and sample shots shown at the kiosk; the first is
// the cover. URLs come from PocketBase's file API with the thumbs declared on the field
// (pb_migrations/1793804500_package_photos.js): 480x360 for the card, 1200x0 for the popup.
import { pb } from '../db/pocketbase';
import type { Package } from '../types';

export const MAX_PACKAGE_PHOTOS = 12;

/** A photo in the package builder: already saved (its file name), or picked and not uploaded yet. */
export type PhotoDraft =
  | { kind: 'saved'; key: string; name: string; url: string; fullUrl: string }
  | { kind: 'new'; key: string; file: File; url: string };
export type PhotoSize = 'card' | 'large' | 'full';
const THUMBS: Record<PhotoSize, string | undefined> = { card: '480x360', large: '1200x0', full: undefined };

/** The package's photo URLs in their saved order (the first is the cover). */
export function packagePhotoUrls(pkg: Pick<Package, 'id' | 'photos' | 'collectionId' | 'collectionName'>, size: PhotoSize): string[] {
  const names = Array.isArray(pkg.photos) ? pkg.photos.filter(Boolean) : [];
  if (!names.length || !pkg.collectionId) return [];
  // By collection name (PocketBase accepts the name or the id): the client-port gateway
  // (scripts/client-gateway.cjs) forwards file requests for `packages` only.
  const collection = pkg.collectionName || 'packages';
  const record = { id: pkg.id, collectionId: collection, collectionName: collection };
  return names.map((name) => pb.files.getURL(record, name, THUMBS[size] ? { thumb: THUMBS[size] } : undefined));
}

/**
 * A camera photo made kiosk-sized before upload: at most 1600 px on the long side, JPEG 85%,
 * on white (for transparent PNGs). Small files are kept as they are.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  const LONG_SIDE = 1600;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) { bitmap.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // Not decodable here (HEIC on some browsers): the server checks the type.
    return file;
  }
}
