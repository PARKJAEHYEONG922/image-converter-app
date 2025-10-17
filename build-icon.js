const fs = require('fs');
const path = require('path');

// Create a minimal 256x256 PNG file
function createPNG() {
    const width = 256;
    const height = 256;

    // PNG file structure
    const chunks = [];

    // PNG signature
    chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    chunks.push(createChunk('IHDR', ihdr));

    // Create image data - gradient with AI text
    const imageData = [];
    for (let y = 0; y < height; y++) {
        imageData.push(0); // filter type
        for (let x = 0; x < width; x++) {
            // Create gradient background
            const gradientR = Math.floor(102 + (118 - 102) * (x + y) / (width + height));
            const gradientG = Math.floor(126 + (75 - 126) * (x + y) / (width + height));
            const gradientB = Math.floor(234 + (162 - 234) * (x + y) / (width + height));

            // Add white rectangle in center for "AI" text area
            let r = gradientR, g = gradientG, b = gradientB, a = 255;

            // Simple white square in center
            if (x >= 96 && x <= 160 && y >= 96 && y <= 160) {
                r = 255;
                g = 255;
                b = 255;
            }

            // Simple "AI" representation using blocks
            const cx = x - 128;
            const cy = y - 128;

            // Letter A (left side)
            if (cx >= -40 && cx <= -20 && cy >= -20 && cy <= 20) {
                // Vertical lines of A
                if ((cx >= -40 && cx <= -35) || (cx >= -25 && cx <= -20)) {
                    r = gradientR - 50;
                    g = gradientG - 50;
                    b = gradientB - 50;
                }
                // Horizontal line of A
                if (cy >= -3 && cy <= 3 && cx >= -40 && cx <= -20) {
                    r = gradientR - 50;
                    g = gradientG - 50;
                    b = gradientB - 50;
                }
                // Top of A
                if (cy >= -20 && cy <= -15 && cx >= -35 && cx <= -25) {
                    r = gradientR - 50;
                    g = gradientG - 50;
                    b = gradientB - 50;
                }
            }

            // Letter I (right side)
            if (cx >= 20 && cx <= 40 && cy >= -20 && cy <= 20) {
                // Top and bottom bars
                if ((cy >= -20 && cy <= -15) || (cy >= 15 && cy <= 20)) {
                    r = gradientR - 50;
                    g = gradientG - 50;
                    b = gradientB - 50;
                }
                // Vertical line
                if (cx >= 27 && cx <= 33) {
                    r = gradientR - 50;
                    g = gradientG - 50;
                    b = gradientB - 50;
                }
            }

            imageData.push(r);
            imageData.push(g);
            imageData.push(b);
            imageData.push(a);
        }
    }

    // Compress with zlib (simple uncompressed for now)
    const zlib = require('zlib');
    const compressed = zlib.deflateSync(Buffer.from(imageData));
    chunks.push(createChunk('IDAT', compressed));

    // IEND chunk
    chunks.push(createChunk('IEND', Buffer.alloc(0)));

    return Buffer.concat(chunks);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuffer, data]));
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xEDB88320 * (crc & 1));
        }
    }
    return crc ^ 0xFFFFFFFF;
}

// Create the PNG file
const png = createPNG();
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log('icon.png created successfully!');