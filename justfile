# Chrome Start Page Extension Build System
# 使用 just 命令来管理扩展的构建、打包和部署

# 扩展基本信息
EXT_NAME := "chrome-start-page"
VERSION := "$(git rev-parse --short HEAD 2>/dev/null || echo '1.0.0')"
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
    @./package-extension.sh {{VERSION}}
    @echo "✅ 打包完成: build/{{ZIP_NAME}}"

# 使用指定版本号打包扩展
package-version VERSION:
    @echo "📦 使用版本号 {{VERSION}} 打包 Chrome 扩展..."
    @./package-extension.sh {{VERSION}}
    @echo "✅ 打包完成: build/{{EXT_NAME}}-v{{VERSION}}.zip"

# 验证打包文件
verify: 
    @echo "🔍 验证打包文件..."
    @if [ -f build/{{ZIP_NAME}} ]; then \
        echo "✅ 打包文件存在: build/{{ZIP_NAME}}"; \
        echo "📊 文件大小: $$(du -h build/{{ZIP_NAME}} | cut -f1)"; \
        echo "🗂️  文件内容:"; \
        unzip -l build/{{ZIP_NAME}} | head -20; \
    else \
        echo "❌ 打包文件不存在: build/{{ZIP_NAME}}"; \
        exit 1; \
    fi


# 完整构建流程
build: clean package verify
    @echo "🎉 完整构建流程完成!"


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


# 更新扩展图标
update-icons:
    @echo "🖼️ 更新扩展图标..."
    @cd {{SOURCE_DIR}} && node scripts/resize-icon.js
    @echo "✅ 图标更新完成!"