// Chrome Extension Popup Script
// 处理扩展popup的交互功能

document.addEventListener('DOMContentLoaded', async () => {
    // 绑定事件监听器
    bindEventListeners();
    
    // 加载统计数据
    await loadStats();
    
    // 加载设置
    await loadSettings();
});

function bindEventListeners() {
    // 打开首页按钮
    document.getElementById('openStartPage').addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome-extension://newtab' });
        window.close();
    });

    // 快速添加书签按钮
    document.getElementById('addBookmark').addEventListener('click', async () => {
        try {
            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && tab.url) {
                // 打开首页并传递当前页面的信息
                chrome.tabs.create({ 
                    url: `chrome-extension://newtab?addBookmark=true&title=${encodeURIComponent(tab.title)}&url=${encodeURIComponent(tab.url)}`
                });
                window.close();
            }
        } catch (error) {
            console.error('Failed to add bookmark:', error);
            alert('添加书签失败，请重试');
        }
    });

    // 导出数据按钮
    document.getElementById('exportData').addEventListener('click', async () => {
        try {
            const data = await chrome.storage.sync.get(['groups', 'bookmarks', 'settings']);
            
            const exportData = {
                ...data,
                exportDate: new Date().toISOString(),
                version: '1.0.0'
            };
            
            // 创建下载链接
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `chrome-start-page-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showMessage('数据导出成功！', 'success');
        } catch (error) {
            console.error('Failed to export data:', error);
            showMessage('导出数据失败', 'error');
        }
    });

    // 导入数据按钮
    document.getElementById('importData').addEventListener('click', async () => {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const text = await file.text();
                const data = JSON.parse(text);
                
                // 验证数据格式
                if (!data.groups || !data.bookmarks || !data.settings) {
                    throw new Error('无效的数据格式');
                }
                
                // 确认导入
                if (confirm('确定要导入数据吗？这将覆盖当前的所有数据。')) {
                    await chrome.storage.sync.set({
                        groups: data.groups,
                        bookmarks: data.bookmarks,
                        settings: data.settings
                    });
                    
                    showMessage('数据导入成功！', 'success');
                }
            };
            
            input.click();
        } catch (error) {
            console.error('Failed to import data:', error);
            showMessage('导入数据失败：' + error.message, 'error');
        }
    });
}

async function loadStats() {
    try {
        const [groups, bookmarks] = await Promise.all([
            chrome.storage.sync.get(['groups']),
            chrome.storage.sync.get(['bookmarks'])
        ]);
        
        const groupCount = groups.groups ? groups.groups.length : 0;
        const bookmarkCount = bookmarks.bookmarks ? bookmarks.bookmarks.length : 0;
        
        document.getElementById('stats').textContent = `${groupCount} 个分组，${bookmarkCount} 个书签`;
    } catch (error) {
        console.error('Failed to load stats:', error);
        document.getElementById('stats').textContent = '加载统计失败';
    }
}

function showMessage(message, type = 'info') {
    // 简单的消息显示
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: ${type === 'error' ? '#e53e3e' : '#38a169'};
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        max-width: 200px;
    `;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        document.body.removeChild(messageDiv);
    }, 3000);
}

// 加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['settings']);
        const settings = result.settings || {};
        
        // 设置同步到Chrome书签的复选框状态
        const syncCheckbox = document.getElementById('syncToChromeBookmarks');
        if (syncCheckbox) {
            syncCheckbox.checked = settings.syncToChromeBookmarks || false;
            
            // 绑定事件监听器
            syncCheckbox.addEventListener('change', async (e) => {
                console.log('[Popup] Sync checkbox changed to:', e.target.checked);
                const newSettings = {
                    ...settings,
                    syncToChromeBookmarks: e.target.checked
                };
                
                console.log('[Popup] Saving new settings:', newSettings);
                await chrome.storage.sync.set({ settings: newSettings });
                console.log('[Popup] Settings saved successfully');
                
                // 如果启用了同步，立即执行一次同步
                if (e.target.checked) {
                    console.log('[Popup] Triggering bookmark sync');
                    chrome.runtime.sendMessage({ action: 'syncBookmarksToChrome' });
                }
                
                showMessage(e.target.checked ? '已启用Chrome书签同步' : '已禁用Chrome书签同步');
            });
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}