#!/usr/bin/env node

// 调整图标尺寸脚本 - 将 assets/icon.png 调整为 Chrome Extension 所需的不同尺寸图标
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 主函数
async function main() {
    // 源图标路径
    const sourceIconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    
    // 目标图标目录
    const iconsDir = path.join(__dirname, '..', 'icons');
    
    // 确保图标目录存在
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }
    
    // 需要生成的图标尺寸
    const sizes = [16, 48, 128];
    
    // 检查源图标是否存在
    if (!fs.existsSync(sourceIconPath)) {
        console.error('错误: 源图标文件不存在:', sourceIconPath);
        process.exit(1);
    }
    
    // 为每个尺寸生成图标
    for (const size of sizes) {
        try {
            const outputPath = path.join(iconsDir, `icon${size}.png`);
            
            await sharp(sourceIconPath)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .png()
                .toFile(outputPath);
                
            console.log(`成功生成: ${outputPath}`);
        } catch (error) {
            console.error(`生成 ${size}px 图标时出错:`, error);
            process.exit(1);
        }
    }
    
    console.log('\n所有图标已成功生成！');
}

// 运行脚本
if (require.main === module) {
    main().catch(console.error);
}