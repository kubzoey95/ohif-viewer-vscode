import * as dcmjs from 'dcmjs';
const fs = require('fs').promises;

// Keep a bounded in-memory header cache when opening another slice of a series.
const cache = new Map();
const cacheLimit = 512;
const pixelDataTag = '7FE00010';

function checkCancellation(isCancelled) {
    if (isCancelled?.()) {
        const error = new Error('DICOM indexing cancelled');
        error.name = 'AbortError';
        throw error;
    }
}

export async function readDicomMetadata(file, isCancelled) {
    checkCancellation(isCancelled);
    const stat = await fs.stat(file);
    if (!stat.isFile()) { return undefined; }
    const cached = cache.get(file);
    if (cached && cached.size === stat.size && cached.mtime === stat.mtimeMs && cached.ctime === stat.ctimeMs) {
        return cached.instance;
    }
    const handle = await fs.open(file, 'r');
    let instance;
    try {
        let length = Math.min(16 * 1024, stat.size);
        while (true) {
            checkCancellation(isCancelled);
            const bytes = Buffer.alloc(length);
            let offset = 0;
            while (offset < length) {
                const result = await handle.read(bytes, offset, length - offset, offset);
                if (!result.bytesRead) { break; }
                offset += result.bytesRead;
            }
            if (offset < 132 || bytes.toString('ascii', 128, 132) !== 'DICM') { return undefined; }
            try {
                const dicom = dcmjs.data.DicomMessage.readFile(
                    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + offset),
                    { untilTag: pixelDataTag, includeUntilTagValue: false, noCopy: true });
                // A partial header can end exactly between tags. Keep reading until
                // Pixel Data is reached, or the complete non-image object is read.
                if (dicom.dict[pixelDataTag] || offset >= stat.size) {
                    delete dicom.dict[pixelDataTag];
                    instance = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicom.dict);
                    break;
                }
            } catch (error) {
                if (offset >= stat.size) { throw error; }
            }
            length = Math.min(length * 2, stat.size);
            if (offset < bytes.length) { throw new Error('DICOM file changed while being indexed'); }
        }
    } finally {
        await handle.close();
    }
    cache.delete(file);
    cache.set(file, { size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, instance });
    if (cache.size > cacheLimit) { cache.delete(cache.keys().next().value); }
    return instance;
}
