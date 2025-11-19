const express = require('express');
const path = require('path');
const chokidar = require('chokidar');
const livereload = require('livereload');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');

class ChromeExtensionDevServer {
    constructor() {
        this.app = express();
        this.port = 3000;
        this.extensionDir = path.join(__dirname, '../chrome-extension');
        this.reloadServer = null;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupFileWatcher();
        this.setupLiveReload();
    }

    setupMiddleware() {
        // 启用 CORS
        this.app.use(cors());
        
        // 解析 JSON
        this.app.use(express.json());
        
        // 静态文件服务
        this.app.use('/extension', express.static(this.extensionDir));
        this.app.use('/icons', express.static(path.join(this.extensionDir, 'icons')));
        this.app.use('/css', express.static(path.join(this.extensionDir, 'css')));
        this.app.use('/js', express.static(path.join(this.extensionDir, 'js')));
        this.app.use('/assets', express.static(path.join(this.extensionDir, 'assets')));
    }

    setupRoutes() {
        // 主页面 - 重定向到扩展
        this.app.get('/', (req, res) => {
            res.redirect('/extension/new-tab.html');
        });

        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // 显示扩展信息
        this.app.get('/info', (req, res) => {
            res.json({
                name: 'Chrome Start Page Extension',
                port: this.port,
                extensionDir: this.extensionDir,
                files: this.getExtensionFiles()
            });
        });

        // 重新打包扩展
        this.app.post('/rebuild', (req, res) => {
            this.rebuildExtension().then(result => {
                res.json({ success: true, message: 'Extension rebuilt', result });
            }).catch(error => {
                res.status(500).json({ success: false, error: error.message });
            });
        });

        // 模拟 Chrome 扩展 API
        this.app.post('/chrome-api/*', (req, res) => {
            this.handleChromeAPI(req, res);
        });
    }

    setupLiveReload() {
        // 创建 LiveReload 服务器
        this.reloadServer = livereload.createServer({
            port: 35729,
            exts: ['html', 'css', 'js', 'json', 'png', 'svg', 'ico']
        });

        this.reloadServer.watch(this.extensionDir);
        console.log('🔄 LiveReload server started on port 35729');
    }

    setupFileWatcher() {
        // 监听文件变化
        const watcher = chokidar.watch(this.extensionDir, {
            ignored: /(^|[\/\\])\../, // 忽略隐藏文件
            persistent: true
        });

        watcher
            .on('add', (filePath) => {
                console.log(`📁 File added: ${path.relative(this.extensionDir, filePath)}`);
                this.reloadExtension();
            })
            .on('change', (filePath) => {
                console.log(`📝 File changed: ${path.relative(this.extensionDir, filePath)}`);
                this.reloadExtension();
            })
            .on('unlink', (filePath) => {
                console.log(`🗑️ File deleted: ${path.relative(this.extensionDir, filePath)}`);
                this.reloadExtension();
            })
            .on('ready', () => {
                console.log('👁️ Ready to watch for changes');
            })
            .on('error', (error) => {
                console.error('❌ File watcher error:', error);
            });
    }

    reloadExtension() {
        // 当文件变化时触发 LiveReload
        if (this.reloadServer) {
            this.reloadServer.refresh('/extension/new-tab.html');
        }
    }

    async rebuildExtension() {
        return new Promise((resolve, reject) => {
            exec('just rebuild', (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    handleChromeAPI(req, res) {
        const apiPath = req.path.replace('/chrome-api/', '');
        
        // 模拟一些常用的 Chrome API
        switch (apiPath) {
            case 'tabs':
                if (req.method === 'GET') {
                    // 模拟获取标签页
                    res.json([{
                        id: 1,
                        url: 'chrome://extensions/',
                        title: 'Extensions'
                    }]);
                } else if (req.method === 'POST') {
                    // 模拟创建标签页
                    res.json({ id: 2, url: req.body.url, title: 'New Tab' });
                }
                break;
                
            case 'storage':
                if (req.method === 'GET') {
                    res.json({ storage: 'simulated' });
                } else if (req.method === 'POST') {
                    res.json({ success: true, method: req.method });
                }
                break;
                
            default:
                res.status(404).json({ error: 'API not found' });
        }
    }

    getExtensionFiles() {
        const files = [];
        
        function scanDir(dir, basePath = '') {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const fullPath = path.join(dir, item);
                const relPath = path.join(basePath, item);
                
                if (fs.statSync(fullPath).isDirectory()) {
                    scanDir(fullPath, relPath);
                } else {
                    files.push(relPath);
                }
            });
        }
        
        scanDir(this.extensionDir);
        return files;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`
🚀 Chrome Start Page Dev Server Started!

📍 Extension URL: http://localhost:${this.port}/extension/new-tab.html
📍 Extension Directory: ${this.extensionDir}
📍 LiveReload: http://localhost:${this.port}/ (includes live reload)

🔧 Available endpoints:
   • GET  /extension/*         - Serve extension files
   • GET  /health              - Health check
   • GET  /info                - Extension info
   • POST /rebuild             - Rebuild extension
   • POST /chrome-api/*        - Chrome API simulation

💡 Development tips:
   1. Keep this server running while coding
   2. Your browser will auto-reload when files change
   3. Test your extension by visiting the URL above
   4. Use Ctrl+C to stop the server

📱 To install in Chrome:
   1. Open chrome://extensions/
   2. Enable "Developer mode"
   3. Click "Load unpacked"
   4. Select: ${this.extensionDir}
            `);
        });
    }
}

// 启动开发服务器
if (require.main === module) {
    const server = new ChromeExtensionDevServer();
    server.start();
}

module.exports = ChromeExtensionDevServer;