# Chrome Start Page Extension - 构建系统

这个项目使用 `just` 命令来管理 Chrome 扩展的构建、打包和部署过程。

## 🚀 快速开始

### 安装 just

**macOS:**
```bash
brew install just
```

**Ubuntu/Debian:**
```bash
wget https://github.com/casey/just/releases/download/1.28.0/just-1.28.0-x86_64-unknown-linux-musl.tar.gz
tar -xzf just-1.28.0-x86_64-unknown-linux-musl.tar.gz
sudo mv just /usr/local/bin/
```

**Windows:**
```powershell
winget install just.just
```

### 查看可用命令

```bash
just
```

或

```bash
just --list
```

## 📋 主要命令

### 清理和重新打包

```bash
# 删除 chrome-start-page-v1.0.0.zip 然后重新打包
just rebuild

# 或分步执行
just clean     # 删除 ZIP 文件
just package   # 重新打包
```

### 其他有用命令

```bash
# 显示扩展信息
just info

# 验证打包文件
just verify

# 完整构建流程
just build

# 快速重新构建
just quick

# 打开扩展目录
just open-ext

# 显示 manifest 内容
just show-manifest
```

## 🛠️ 开发工作流

1. **日常开发**: 修改代码后执行 `just quick`
2. **完整构建**: 执行 `just build`
3. **清理重建**: 执行 `just rebuild`
4. **验证**: 执行 `just verify`

## 📦 输出文件

- **打包文件**: `chrome-start-page-v1.0.0.zip`
- **源目录**: `chrome-extension/`

## 🔧 自定义配置

在 `justfile` 中可以修改：

- `EXT_NAME`: 扩展名称
- `VERSION`: 版本号
- `SOURCE_DIR`: 源码目录
- `ZIP_NAME`: 打包文件名

## 📱 安装到 Chrome

执行 `just install` 获取详细的安装说明。

---

这个构建系统提供了完整的管理功能，包括清理、打包、验证等，让扩展的开发和管理变得更加高效。