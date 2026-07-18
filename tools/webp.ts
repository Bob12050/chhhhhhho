/** Read WebP canvas dimensions without decoding pixel data. */
export function readWebpSize(buf: Buffer): { width: number; height: number } | null {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const type = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + chunkSize > buf.length) return null;

    if (type === 'VP8X' && chunkSize >= 10) {
      const width = 1 + buf.readUIntLE(data + 4, 3);
      const height = 1 + buf.readUIntLE(data + 7, 3);
      return { width, height };
    }

    if (type === 'VP8L' && chunkSize >= 5 && buf[data] === 0x2f) {
      const bits = buf.readUInt32LE(data + 1);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return { width, height };
    }

    if (
      type === 'VP8 ' &&
      chunkSize >= 10 &&
      buf[data + 3] === 0x9d &&
      buf[data + 4] === 0x01 &&
      buf[data + 5] === 0x2a
    ) {
      const width = buf.readUInt16LE(data + 6) & 0x3fff;
      const height = buf.readUInt16LE(data + 8) & 0x3fff;
      return { width, height };
    }

    offset = data + chunkSize + (chunkSize & 1);
  }

  return null;
}
