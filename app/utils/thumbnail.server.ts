import sharp from "sharp";

const MAX_THUMB_SOURCE_BYTES = 50 * 1024 * 1024; // 50MB (proteção RAM)

export type ThumbnailMeta = {
  objectPath: string;
  publicUrl: string;
  width: number;
  height: number;
  mime_type: "image/webp";
  variant: "w320-webp";
  generated_at: string;
};

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

export async function generateThumbnailWebp(file: File, width = 320): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const mime = file.type || "";
  if (!isImageMime(mime)) return null;

  const size = file.size ?? 0;
  if (size <= 0) return null;
  if (size > MAX_THUMB_SOURCE_BYTES) return null;

  const ab = await file.arrayBuffer();
  const input = Buffer.from(ab);

  const pipeline = sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 });

  const meta = await pipeline.metadata();
  const out = await pipeline.toBuffer();

  return {
    buffer: out,
    width: meta.width ?? width,
    height: meta.height ?? 0,
  };
}
