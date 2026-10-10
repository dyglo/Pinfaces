export const MAX_BYTES = 4_000_000;
export type FaceBox = { x: number; y: number; width: number; height: number };
export type Detection = {
  faces: FaceBox[];
  width: number;
  height: number;
  model: string;
  retained: false;
};
export function validateFile(file: Pick<File, "size" | "type">): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photograph.");
  if (!file.size)
    throw new Error("This file is empty. Choose another photograph.");
  if (file.size > MAX_BYTES)
    throw new Error("Your photo is too large. Use an image under 4 MB.");
}
