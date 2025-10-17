const fs = require('fs');
const { createCanvas } = require('canvas');

// Check if canvas is available, if not, create a simple PNG header
try {
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext('2d');

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    // Icon
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AI', 128, 128);

    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync('public/icon.png', buffer);
    console.log('Icon created successfully');
} catch (e) {
    console.log('Canvas not available, creating minimal PNG');

    // Create a minimal valid PNG file (1x1 pixel, white)
    const minimalPNG = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk size
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x01, 0x00, // width: 256
        0x00, 0x00, 0x01, 0x00, // height: 256
        0x08, 0x02, // bit depth: 8, color type: 2 (RGB)
        0x00, 0x00, 0x00, // compression, filter, interlace
        0x9A, 0x9C, 0x18, 0x00, // CRC (calculated for 256x256 RGB)
        0x00, 0x00, 0x00, 0x0C, // IDAT chunk size
        0x49, 0x44, 0x41, 0x54, // IDAT
        0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x00, 0x01, // compressed data
        0x00, 0x00, 0x05, 0x01, // CRC
        0x00, 0x00, 0x00, 0x00, // IEND chunk size
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // CRC
    ]);

    fs.writeFileSync('public/icon-backup.png', minimalPNG);
    console.log('Created backup icon');
}