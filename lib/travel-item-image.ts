const OUTPUT_MAX_BYTES = 2 * 1024 * 1024;
const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const TRAVEL_ITEM_IMAGE_ASPECT = 3 / 2;

const COMPRESSION_PASSES = [
  { maxEdge: 1920, quality: 0.82 },
  { maxEdge: 1920, quality: 0.74 },
  { maxEdge: 1600, quality: 0.74 },
  { maxEdge: 1400, quality: 0.7 },
  { maxEdge: 1200, quality: 0.68 },
];

export const TRAVEL_ITEM_IMAGE_FORMATS = {
  "image/webp": { extension: "webp", acceptedExtensions: ["webp"] },
  "image/jpeg": { extension: "jpg", acceptedExtensions: ["jpg", "jpeg"] },
} as const;

export type TravelItemImageMime = keyof typeof TRAVEL_ITEM_IMAGE_FORMATS;

type DecodedImage = ImageBitmap | HTMLImageElement;
type CompressionResult = { supported: boolean; blob?: Blob };

export type TravelItemImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getTravelItemImageFormat(mime: string) {
  return TRAVEL_ITEM_IMAGE_FORMATS[mime as TravelItemImageMime];
}

export function getTravelItemImageExtensionFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const format = Object.values(TRAVEL_ITEM_IMAGE_FORMATS).find((candidate) =>
    (candidate.acceptedExtensions as readonly string[]).includes(extension ?? "")
  );
  if (!format || !extension) throw new Error("TravelItem 圖片格式不受支援");
  return extension;
}

export function validateTravelItemImageSource(source: File) {
  if (!SOURCE_TYPES.has(source.type)) return "圖片格式僅支援 JPG、PNG 或 WebP";
  if (source.size > SOURCE_MAX_BYTES) return "原始圖片大小不可超過 20 MB";
  return undefined;
}

export async function cropTravelItemImage(source: File, crop: TravelItemImageCrop) {
  const image = await decodeImage(source);
  try {
    const safeCrop = normalizeCrop(crop, image.width, image.height);
    let supportedEncoder = false;
    for (const mime of ["image/webp", "image/jpeg"] as const) {
      const result = await compressWithFormat(image, safeCrop, mime);
      supportedEncoder ||= result.supported;
      if (result.blob) {
        const baseName = source.name.replace(/\.[^.]+$/, "") || "travel-item";
        const extension = TRAVEL_ITEM_IMAGE_FORMATS[mime].extension;
        return new File([result.blob], `${baseName}.${extension}`, { type: mime, lastModified: Date.now() });
      }
    }
    if (!supportedEncoder) throw new Error("此瀏覽器無法產生 WebP 或 JPEG 圖片");
  } finally {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  }
  throw new Error("圖片壓縮後仍超過 2 MB，請改用尺寸較小的圖片");
}

function normalizeCrop(crop: TravelItemImageCrop, imageWidth: number, imageHeight: number) {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0) {
    throw new Error("裁切範圍無效，請重設後再試一次");
  }
  const x = Math.max(0, Math.min(crop.x, imageWidth - 1));
  const y = Math.max(0, Math.min(crop.y, imageHeight - 1));
  const width = Math.min(crop.width, imageWidth - x);
  const height = Math.min(crop.height, imageHeight - y);
  if (width <= 0 || height <= 0) throw new Error("裁切範圍無效，請重設後再試一次");
  return { x, y, width, height };
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Some Safari versions expose createImageBitmap but reject files that
      // HTMLImageElement can still decode successfully.
    }
  }
  return decodeHtmlImage(file);
}

async function decodeHtmlImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressWithFormat(image: DecodedImage, crop: TravelItemImageCrop, mime: TravelItemImageMime): Promise<CompressionResult> {
  for (const pass of COMPRESSION_PASSES) {
    const blob = await renderImage(image, crop, pass.maxEdge, pass.quality, mime);
    if (!blob || blob.type !== mime) return { supported: false };
    if (blob.size <= OUTPUT_MAX_BYTES) return { supported: true, blob };
  }
  return { supported: true };
}

async function renderImage(image: DecodedImage, crop: TravelItemImageCrop, maxEdge: number, quality: number, mime: TravelItemImageMime) {
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  const scaledWidth = Math.max(3, Math.round(crop.width * scale));
  const width = Math.max(3, Math.floor(scaledWidth / 3) * 3);
  const height = Math.max(2, Math.round(width / TRAVEL_ITEM_IMAGE_ASPECT));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("瀏覽器無法處理這張圖片");
  if (mime === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}
