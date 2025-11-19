#!/usr/bin/env node

// 图标生成脚本 - 生成Chrome Extension所需的不同尺寸图标
const fs = require('fs');
const path = require('path');

// 图标配置
const ICON_CONFIG = {
    size: 16,
    colors: {
        primary: '#667eea',
        secondary: '#764ba2',
        background: '#ffffff',
        text: '#ffffff'
    },
    text: 'SP' // Start Page缩写
};

// 生成SVG图标
function generateSVG(size, config) {
    const { primary, secondary, background, text } = config.colors;
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <!-- 背景渐变 -->
    <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${primary};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${secondary};stop-opacity:1" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.3"/>
        </filter>
    </defs>
    
    <!-- 圆角矩形背景 -->
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="3" ry="3" 
          fill="url(#bgGradient)" filter="url(#shadow)"/>
    
    <!-- 图标文字 -->
    <text x="${size/2}" y="${size/2 + size/6}" 
          font-family="Arial, sans-serif" 
          font-size="${size/3}" 
          font-weight="bold" 
          fill="${text}" 
          text-anchor="middle" 
          dominant-baseline="middle">
        ${text}
    </text>
</svg>`;
}

// 生成简单的PNG图标数据
function generatePNGData(size) {
    // 创建简单的RGBA像素数据
    const width = size;
    const height = size;
    const data = new Uint8Array(width * height * 4); // RGBA
    
    // 渐变色彩
    const primaryColor = [102, 126, 234]; // #667eea
    const secondaryColor = [118, 75, 162]; // #764ba2
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            
            // 简单的径向渐变
            const centerX = width / 2;
            const centerY = height / 2;
            const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);
            const ratio = Math.min(distance / maxDistance, 1);
            
            // 混合两种颜色
            const r = Math.round(primaryColor[0] * (1 - ratio) + secondaryColor[0] * ratio);
            const g = Math.round(primaryColor[1] * (1 - ratio) + secondaryColor[1] * ratio);
            const b = Math.round(primaryColor[2] * (1 - ratio) + secondaryColor[2] * ratio);
            
            data[index] = r;     // R
            data[index + 1] = g; // G
            data[index + 2] = b; // B
            data[index + 3] = 255; // A (完全不透明)
        }
    }
    
    return { width, height, data };
}

// 创建PNG文件的简化版本（仅为演示）
function createSimplePNGBinary(size) {
    // 这是一个极度简化的PNG创建，只包含最小的PNG文件头
    const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >> 24) & 0xFF, // Width
        0x00, 0x00, 0x00, size & 0xFF, (size >> 8) & 0xFF, (size >> 16) & 0xFF, (size >> 24) & 0xFF, // Height
        0x08, 0x06, 0x00, 0x00, 0x00, // Bit depth, color type, compression, filter, interlace
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 // CRC placeholder
    ]);
    
    return pngHeader;
}

// 主函数
function main() {
    const iconsDir = path.join(__dirname, '..', 'icons');
    
    // 确保图标目录存在
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }
    
    const sizes = [16, 48, 128];
    
    sizes.forEach(size => {
        // 生成SVG图标
        const svgContent = generateSVG(size, ICON_CONFIG);
        const svgPath = path.join(iconsDir, `icon${size}.svg`);
        fs.writeFileSync(svgPath, svgContent);
        console.log(`Generated: ${svgPath}`);
        
        // 生成简化PNG占位符
        const pngData = createSimplePNGBinary(size);
        const pngPath = path.join(iconsDir, `icon${size}.png`);
        fs.writeFileSync(pngPath, pngData);
        console.log(`Generated: ${pngPath}`);
    });
    
    console.log('\n图标生成完成！');
    console.log('注意：PNG文件是占位符，您应该使用专业的图像编辑器创建真正的图标文件。');
    console.log('建议：');
    console.log('1. 使用生成的SVG文件作为模板');
    console.log('2. 在Figma、Adobe Illustrator或类似工具中打开SVG');
    console.log('3. 导出为所需尺寸的PNG文件');
    console.log('4. 替换生成的占位符PNG文件');
}

// 运行脚本
if (require.main === module) {
    main();
}

module.exports = { generateSVG, generatePNGData };