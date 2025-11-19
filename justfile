# Chrome Start Page Extension Build System
# 使用 just 命令来管理扩展的构建、打包和部署

# 扩展基本信息
EXT_NAME := "chrome-start-page"
VERSION := "1.0.0"
ZIP_NAME := EXT_NAME + "-v" + VERSION + ".zip"
SOURCE_DIR := "chrome-extension"

# 默认任务 - 显示可用命令
default:
    @just --list

# 清理构建文件
clean:
    @echo "🧹 清理构建文件..."
    @rm -f {{ZIP_NAME}}
    @echo "✅ 清理完成"

# 打包扩展
package: clean
    @echo "📦 打包 Chrome 扩展..."
    @cd {{SOURCE_DIR}} && zip -r ../{{ZIP_NAME}} . -x "*.DS_Store" "**/.git/**" "**/node_modules/**" "**/scripts/**"
    @echo "✅ 打包完成: {{ZIP_NAME}}"

# 重新打包 (不清理)
repackage:
    @echo "📦 重新打包 Chrome 扩展..."
    @cd {{SOURCE_DIR}} && zip -r ../{{ZIP_NAME}} . -x "*.DS_Store" "**/.git/**" "**/node_modules/**" "**/scripts/**"
    @echo "✅ 重新打包完成: {{ZIP_NAME}}"

# 清理并重新打包
rebuild: clean package
    @echo "🔨 构建完成!"

# 验证打包文件
verify: 
    @echo "🔍 验证打包文件..."
    @if [ -f {{ZIP_NAME}} ]; then \
        echo "✅ 打包文件存在: {{ZIP_NAME}}"; \
        echo "📊 文件大小: $$(du -h {{ZIP_NAME}} | cut -f1)"; \
        echo "🗂️  文件内容:"; \
        unzip -l {{ZIP_NAME}} | head -20; \
    else \
        echo "❌ 打包文件不存在: {{ZIP_NAME}}"; \
        exit 1; \
    fi

# 开发模式 - 监听文件变化并自动重新打包 (需要安装 entr)
dev-watch:
    @echo "👀 开发模式 - 监听文件变化..."
    @echo "安装 entr: brew install entr 或 apt-get install entr"
    @find {{SOURCE_DIR}} -name "*.js" -o -name "*.html" -o -name "*.css" -o -name "*.json" -o -name "*.png" -o -name "*.svg" | entr -c just rebuild

# 安装到 Chrome (需要手动安装)
install: package
    @echo "📱 安装说明:"
    @echo "1. 打开 Chrome 浏览器"
    @echo "2. 访问 chrome://extensions/"
    @echo "3. 开启'开发者模式'"
    @echo "4. 点击'加载已解压的扩展程序'"
    @echo "5. 选择目录: {{SOURCE_DIR}}"
    @echo "6. 或者直接安装: {{ZIP_NAME}}"

# 显示扩展信息
info:
    @echo "📋 扩展信息:"
    @echo "名称: {{EXT_NAME}}"
    @echo "版本: {{VERSION}}"
    @echo "源码目录: {{SOURCE_DIR}}"
    @echo "打包文件: {{ZIP_NAME}}"
    @echo "文件大小: $$(du -h {{ZIP_NAME}} 2>/dev/null || echo '文件不存在')"

# 完整构建流程
build: clean package verify
    @echo "🎉 完整构建流程完成!"

# 快速重新构建
quick: rebuild verify
    @echo "⚡ 快速重新构建完成!"

# 打开扩展目录
open-ext:
    @echo "📁 打开扩展目录..."
    @if command -v open >/dev/null 2>&1; then \
        open {{SOURCE_DIR}}; \
    elif command -v xdg-open >/dev/null 2>&1; then \
        xdg-open {{SOURCE_DIR}}; \
    else \
        echo "请手动打开目录: {{SOURCE_DIR}}"; \
    fi

# 显示 manifest 内容
show-manifest:
    @echo "📄 Manifest 内容:"
    @cat {{SOURCE_DIR}}/manifest.json
# 开发服务器相关命令

# 启动开发服务器
dev-server:
    @echo "🚀 启动开发服务器..."
    @cd dev-server && npm start

# 在后台启动开发服务器
dev-server-bg:
    @echo "🚀 在后台启动开发服务器..."
    @nohup cd dev-server && npm start > dev-server.log 2>&1 &
    @sleep 2
    @echo "📱 开发服务器已启动"
    @echo "🔗 URL: http://localhost:3000/extension/new-tab.html"
    @echo "📋 查看日志: tail -f dev-server.log"

# 停止开发服务器
dev-stop:
    @echo "🛑 停止开发服务器..."
    @pkill -f "node dev-server.js" || true
    @echo "✅ 开发服务器已停止"

# 重启开发服务器
dev-restart: dev-stop dev-server

# 开发模式 (启动服务器 + 自动重新打包)
dev: dev-server-bg
    @echo "👨‍💻 开发模式已启动!"
    @echo "📝 编辑代码后浏览器会自动刷新"
    @echo "🛑 按 Ctrl+C 停止服务器"

# 清理开发服务器日志
dev-clean:
    @rm -f dev-server.log
    @echo "🧹 开发服务器日志已清理"