// Chrome Extension Background Service Worker
// 处理扩展的生命周期事件和后台操作

// 扩展安装或更新时初始化
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Chrome Start Page Extension installed/updated');
    
    if (details.reason === 'install') {
        // 首次安装时的初始化
        initializeDefaultData();
        console.log('Extension first install - initializing default data');
    } else if (details.reason === 'update') {
        // 更新时的数据迁移
        console.log('Extension updated - checking for data migration');
        handleDataMigration(details.previousVersion);
    }
});

// 浏览器启动时
chrome.runtime.onStartup.addListener(() => {
    console.log('Chrome browser startup');
    // 可以在这里执行清理或同步操作
});

// 处理来自content scripts和popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    switch (request.action) {
        case 'openUrl':
            // 打开URL
            chrome.tabs.create({ url: request.url });
            sendResponse({ success: true });
            break;
            
        case 'getCurrentTab':
            // 获取当前标签页信息
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                sendResponse({ 
                    success: true, 
                    tab: tabs[0] || null 
                });
            });
            return true; // 保持消息通道开放
            
        case 'fetchIcon':
            // 获取网站图标
            fetchWebsiteIcon(request.url)
                .then(iconUrl => {
                    sendResponse({ success: true, iconUrl });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放
            
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    
    return true; // 异步响应
});

// 初始化默认数据
async function initializeDefaultData() {
    try {
        // 检查是否已有数据
        const result = await chrome.storage.sync.get(['groups', 'bookmarks', 'settings']);
        
        if (!result.groups || !result.bookmarks || !result.settings) {
            // 设置默认数据结构
            await chrome.storage.sync.set({
                groups: [],
                bookmarks: [],
                settings: {
                    theme: 'default',
                    background: 'gradient',
                    showEmptyGroups: true
                }
            });
            console.log('Default data initialized');
        }
    } catch (error) {
        console.error('Failed to initialize default data:', error);
    }
}

// 处理数据迁移（当扩展更新时）
async function handleDataMigration(previousVersion) {
    console.log('Handling data migration from version:', previousVersion);
    
    try {
        // 在这里添加版本特定的迁移逻辑
        // 例如：从旧版本的数据格式升级到新版本
        
        const result = await chrome.storage.sync.get(['dataVersion']);
        if (!result.dataVersion) {
            // 首次迁移，设置数据版本
            await chrome.storage.sync.set({ dataVersion: '1.0.0' });
        }
    } catch (error) {
        console.error('Data migration failed:', error);
    }
}

// 获取网站favicon
async function fetchWebsiteIcon(url) {
    try {
        // 从URL中提取域名
        const urlObj = new URL(url);
        const origin = urlObj.origin;
        
        // 直接返回网站的 favicon.ico 路径
        // 这是最通用的方法，大部分网站都支持
        const faviconUrl = `${origin}/favicon.ico`;
        
        return faviconUrl;
        
    } catch (error) {
        console.error('Invalid URL:', error);
        throw new Error('Invalid URL: ' + error.message);
    }
}

// 错误处理
chrome.runtime.onSuspend.addListener(() => {
    console.log('Background service worker suspending');
    // 清理资源，保存状态等
});

chrome.runtime.onSuspendCanceled.addListener(() => {
    console.log('Background service worker suspend canceled');
});