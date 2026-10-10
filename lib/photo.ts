export const MAX_BYTES = 4_000_000;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export type FaceBox = { x: number; y: number; width: number; height: number };
export type Detection = {
  faces: FaceBox[];
  width: number;
  height: number;
  model: string;
  retained: false;
};
export type PhotoRecord = {
  id: string;
  hash: string;
  thumbnail: string;
  sourceUrl: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  adultConsentAttested: true;
};
export function validateFile(file: Pick<File, "size" | "type">): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photograph.");
  if (!file.size)
    throw new Error("This file is empty. Choose another photograph.");
  if (file.size > MAX_BYTES)
    throw new Error("Your photo is too large. Use an image under 4 MB.");
}
export function validateSource(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete source URL beginning with https://.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Source links must use HTTPS and contain no credentials.");
  return url.href;
}
export async function imageHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function exactMatches(
  hash: string,
  records: PhotoRecord[],
  now = Date.now(),
): PhotoRecord[] {
  return records.filter((r) => r.hash === hash && r.expiresAt > now);
}
export async function thumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error("Use a photograph under 16 megapixels.");
    const ratio = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Only a re-encoded thumbnail is persisted, without original EXIF metadata.
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
