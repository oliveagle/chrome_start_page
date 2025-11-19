# Chrome Start Page - Live Reload 开发服务器

这个开发服务器为 Chrome Start Page 扩展提供了 **实时重载** 功能，让你在开发过程中能够立即看到代码更改的效果。

## 🚀 快速开始

### 1. 启动开发服务器

```bash
# 启动开发服务器 (前台)
just dev-server

# 或者在后台启动
just dev-server-bg

# 最简单的开发模式
just dev
```

### 2. 访问扩展

打开浏览器访问：http://localhost:3000/extension/new-tab.html

## 🔥 主要功能

### ✨ Live Reload
- **实时刷新**: 当你修改任何扩展文件时，浏览器会自动刷新
- **自动监听**: 监听 HTML, CSS, JavaScript, JSON, PNG, SVG 等文件变化
- **即时反馈**: 修改代码后立即看到效果

### 🛠️ 开发工具
- **静态文件服务**: 直接在浏览器中预览扩展
- **API 模拟**: 提供 Chrome API 的模拟实现
- **健康检查**: `/health` 端点检查服务器状态
- **扩展信息**: `/info` 端点显示扩展文件信息

## 📋 可用命令

### 开发服务器管理
```bash
just dev-server      # 启动开发服务器 (前台)
just dev-server-bg   # 在后台启动开发服务器
just dev-stop        # 停止开发服务器
just dev-restart     # 重启开发服务器
just dev-clean       # 清理开发服务器日志
```

### 开发工作流
```bash
just dev             # 启动完整的开发环境
just dev-watch       # 使用 entr 监听文件变化 (需要安装 entr)
```

### 扩展构建
```bash
just rebuild         # 清理并重新打包扩展
just quick           # 快速重新构建
just verify          # 验证打包文件
```

## 🌐 API 端点

开发服务器提供以下 HTTP 端点：

- `GET /` - 重定向到扩展页面
- `GET /extension/*` - 静态文件服务
- `GET /health` - 健康检查
- `GET /info` - 扩展信息
- `POST /rebuild` - 重新打包扩展
- `POST /chrome-api/*` - Chrome API 模拟

## 💡 使用技巧

### 1. 最佳开发流程

```bash
# 1. 启动开发服务器
just dev

# 2. 在浏览器中访问扩展
# 打开 http://localhost:3000/extension/new-tab.html

# 3. 开始编辑代码
# 修改 chrome-extension/ 目录下的任何文件

# 4. 浏览器会自动刷新
```

### 2. 集成 Chrome 扩展

虽然开发服务器提供了预览功能，但要完整测试 Chrome 扩展功能，你仍然需要：

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `chrome-extension` 目录

### 3. 日志查看

```bash
# 查看开发服务器日志
tail -f dev-server.log

# 清理日志文件
just dev-clean
```

## 🔧 自定义配置

### 修改端口
编辑 `dev-server/dev-server.js`：
```javascript
this.port = 3000; // 修改为你想要的端口
```

### 添加文件监听
编辑 `dev-server/dev-server.js` 中的 `setupFileWatcher` 方法。

## 🐛 故障排除

### 端口被占用
```bash
# 查看端口占用
lsof -i :3000

# 杀死占用进程
kill -9 <PID>
```

### 依赖问题
```bash
# 重新安装依赖
cd dev-server && rm -rf node_modules && npm install
```

### LiveReload 不工作
1. 确保浏览器支持 LiveReload
2. 检查开发服务器是否在运行
3. 查看浏览器控制台是否有错误

## 📱 安装说明

开发服务器只是预览工具。要安装到 Chrome：

```bash
# 1. 打包扩展
just rebuild

# 2. 查看安装说明
just install
```

## 🎯 优势

✅ **即时反馈**: 修改代码后立即看到效果
✅ **无需重装**: 不需要每次都重新加载扩展
✅ **Chrome API 模拟**: 在非扩展环境下也能测试基础功能
✅ **完整构建**: 集成扩展打包功能
✅ **易于使用**: 简单的 just 命令

现在你可以享受现代化的开发体验了！🚀