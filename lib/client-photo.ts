import { validateFile } from "./photo";
export type CapturedPhoto = Pick<File, "name" | "size" | "type"> & {
  bytes: ArrayBuffer;
};
export async function capturePhoto(file: File): Promise<CapturedPhoto> {
  validateFile(file);
  const unreadable =
    "This photo could not be read from your phone. Save it to Downloads or device storage, then select that saved copy.";
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error(unreadable));
    reader.onerror = () => reject(new Error(unreadable));
    reader.onabort = () => reject(new Error("Photo selection was cancelled."));
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      reject(new Error(unreadable));
    }
  });
  validateFile({ size: bytes.byteLength, type: file.type });
  return { name: file.name, size: bytes.byteLength, type: file.type, bytes };
}
