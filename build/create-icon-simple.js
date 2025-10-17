const fs = require('fs');
const path = require('path');

// Simple PNG creator - creates a minimal valid PNG file
function createSimplePNG() {
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR chunk (Image Header)
    const width = 256;
    const height = 256;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // color type (RGB)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    const ihdrChunk = createChunk('IHDR', ihdr);

    // Create simple image data (solid purple gradient)
    const imageData = [];
    for (let y = 0; y < height; y++) {
        imageData.push(0); // filter type
        for (let x = 0; x < width; x++) {
            // Gradient from purple to blue
            const r = Math.floor(102 + (118 - 102) * (x + y) / (width + height));
            const g = Math.floor(126 + (75 - 126) * (x + y) / (width + height));
            const b = Math.floor(234 + (162 - 234) * (x + y) / (width + height));

            imageData.push(r, g, b);
        }
    }

    // Use Node's zlib for compression
    const zlib = require('zlib');
    const compressed = zlib.deflateSync(Buffer.from(imageData));
    const idatChunk = createChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    // Combine all chunks
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const typeBuffer = Buffer.from(type);
    const crc = calculateCRC(Buffer.concat([typeBuffer, data]));
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function calculateCRC(data) {
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Create and save the icon
const png = createSimplePNG();
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log('Icon created successfully: build/icon.png');