/* global BookmarkSync, Favicon, OpQueue */
// Chrome Extension Background Service Worker
// 处理扩展的生命周期事件和后台操作

// 引入 ops 模块（OpQueue / Trash / Snapshot / BookmarkQueue）
importScripts('background/favicon.js');
importScripts('background/op-queue.js');
importScripts('background/bookmark-sync.js');

importScripts('ops.js');

// 扩展安装或更新时初始化
chrome.runtime.onInstalled.addListener((details) => {
    console.log('devine_tabflow Extension installed/updated');

    if (details.reason === 'install') {
        // 首次安装时的初始化
        BookmarkSync.initializeDefaultData();
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

// 防止循环同步的标志
self.isSyncing = false;
self.syncDebounceTimer = null;

// 监听 Chrome 书签变化 → 入队 pull op
// 防循环：忽略我们自己入队的 op（title 以 [op] 开头）
chrome.bookmarks.onCreated.addListener(handleChromeBookmarkCreated);
chrome.bookmarks.onRemoved.addListener(handleChromeBookmarkRemoved);
chrome.bookmarks.onChanged.addListener(handleChromeBookmarkChanged);
chrome.bookmarks.onMoved.addListener(handleChromeBookmarkMoved);

// 队列文件夹 ID 缓存，启动时填充
self.cachedQueueFolderId = null;
self.cachedQueueFolderRootId = null;

// 快速判断一个 chrome 节点是不是"我们自己入队的 op"

function schedulePullDrain() {
    if (self.opDrainDebounceTimer) clearTimeout(self.opDrainDebounceTimer);
    self.opDrainDebounceTimer = setTimeout(() => {
        OpQueue.drainOpQueue().catch((err) => console.error('[OpProcessor] drain failed', err));
    }, 500);
}

async function handleChromeBookmarkCreated(id, bookmark) {
    if (await BookmarkSync.isOwnOpBookmark(id)) return; // 忽略队列自己的 op
    console.log('[Pull] onCreated:', id, bookmark.title);
    schedulePullDrain();
}

async function handleChromeBookmarkRemoved(id, removeInfo) {
    if (await BookmarkSync.isOwnOpBookmark(id)) return;
    console.log('[Pull] onRemoved:', id, removeInfo.parentId);
    schedulePullDrain();
}

async function handleChromeBookmarkChanged(id, changeInfo) {
    if (await BookmarkSync.isOwnOpBookmark(id)) return;
    console.log('[Pull] onChanged:', id, changeInfo.title);
    schedulePullDrain();
}

async function handleChromeBookmarkMoved(id, moveInfo) {
    if (await BookmarkSync.isOwnOpBookmark(id)) return;
    console.log('[Pull] onMoved:', id, moveInfo.parentId);
    schedulePullDrain();
}

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
                    tab: tabs[0] || null,
                });
            });
            return true; // 保持消息通道开放

        case 'fetchIcon':
            console.log('[Background] Received fetchIcon request for:', request.url);
            Favicon.fetchWebsiteIcon(request.url)
                .then((iconUrl) => {
                    console.log('[Background] ✅ fetchWebsiteIcon returned:', iconUrl);
                    sendResponse({ success: true, iconUrl });
                })
                .catch((error) => {
                    console.log('[Background] ❌ fetchWebsiteIcon failed:', error.message);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'fetchPageTitle':
            // 获取网页标题
            Favicon.fetchPageTitle(request.url)
                .then((title) => {
                    sendResponse({ success: true, title });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'syncBookmarksToChrome':
            // 同步书签到Chrome原生书签管理器
            BookmarkSync.syncBookmarksToChrome()
                .then((result) => {
                    sendResponse({ success: true, ...(result || {}) });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'syncBookmarksFromChrome':
            // 从Chrome原生书签管理器同步
            BookmarkSync.syncBookmarksFromChrome()
                .then((result) => {
                    // result 由 syncBookmarksFromChrome 返回：
                    //   { success: true, groups, bookmarks, addedGroups, addedBookmarks }
                    //   { success: false, reason: 'ROOT_FOLDER_NOT_FOUND', folderName }
                    //   { success: false, reason: 'ROOT_FOLDER_EMPTY' }
                    //   { success: false, reason: 'DUPLICATE_FOLDERS', folders: [...] }
                    sendResponse({ success: true, ...(result || {}) });
                })
                .catch((error) => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'getQueueStats':
            OpQueue.getQueueStats()
                .then((stats) => sendResponse({ success: true, stats }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true;

        case 'clearOpQueue':
            OpQueue.clearOpQueue()
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true;

        case 'retryFailedOps':
            OpQueue.retryFailedOps()
                .then(() => {
                    // 触发一次排空
                    return OpQueue.drainOpQueue();
                })
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true;

        case 'drainOpQueue':
            OpQueue.drainOpQueue()
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true;

        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }

    return true; // 异步响应
});

// 初始化默认数据

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

// 获取网页标题

// 获取网站favicon

// 从 HTML 页面中提取 favicon

// 同步书签到Chrome原生书签管理器

// 从 Chrome 书签同步到扩展

// 查找或创建书签文件夹

// 创建或更新Chrome书签

// 自动同步：监听存储变更 -> 触发 op 调度器
// bookmarks 在 local，groups 在 sync（见 storage.js）
chrome.storage.onChanged.addListener((changes, areaName) => {
    const bookmarksChanged = areaName === 'local' && changes.bookmarks;
    const groupsChanged = areaName === 'sync' && changes.groups;
    // settings 变化也触发一次（开关切换时立刻排空）
    const settingsChanged = areaName === 'sync' && changes.settings;
    if (!bookmarksChanged && !groupsChanged && !settingsChanged) return;

    console.log('[OpProcessor] Storage change in', areaName, '- scheduling drain');
    if (self.opDrainDebounceTimer) clearTimeout(self.opDrainDebounceTimer);
    self.opDrainDebounceTimer = setTimeout(() => {
        OpQueue.drainOpQueue().catch((err) => console.error('[OpProcessor] drain failed', err));
    }, 500);
});

self.opDrainDebounceTimer = null;

// 错误处理
chrome.runtime.onSuspend.addListener(() => {
    console.log('Background service worker suspending');
    // 清理资源，保存状态等
});

chrome.runtime.onSuspendCanceled.addListener(() => {
    console.log('Background service worker suspend canceled');
});

// ===== 邮件书签后台窗口打开功能 =====

// 创建上下文菜单
function createContextMenu() {
    // 移除已存在的菜单，避免重复
    chrome.contextMenus.removeAll(() => {
        // 为邮件书签添加上下文菜单项
        chrome.contextMenus.create({
            id: 'openEmailInBackground',
            title: '在后台新窗口打开邮件',
            contexts: ['link'], // 只在链接上显示
            documentUrlPatterns: ['chrome-extension://*/new-tab.html'], // 只在扩展的新标签页中显示
        });

        console.log('Context menu created for email bookmarks');
    });
}

// 监听上下文菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openEmailInBackground') {
        const url = info.linkUrl;

        // 检查是否是邮件链接
        if (Favicon.isEmailUrl(url)) {
            // 在后台窗口中打开（不激活新窗口）
            chrome.windows.create({
                url: url,
                focused: false, // 不聚焦，保持在后台
                type: 'normal',
            });
            console.log('Opened email in background window:', url);
        }
    }
});

// 检查URL是否为邮件相关链接

// 监听来自内容脚本的消息，处理CMD+点击
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openEmailInBackground') {
        const url = request.url;

        if (Favicon.isEmailUrl(url)) {
            // 在后台窗口中打开
            chrome.windows.create({
                url: url,
                focused: false,
                type: 'normal',
            });
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Not an email URL' });
        }

        return true;
    }
});

// 扩展安装或启动时创建上下文菜单
chrome.runtime.onInstalled.addListener((details) => {
    createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
    createContextMenu();
});
// ============================================================================
// OpProcessor —— 操作意图调度器
// ============================================================================
// 队列存在 Chrome 书签的 __op_queue__ 文件夹下，每条 op 是一个真实 bookmark
// 消费顺序：按 op URL 里的 ts 升序
// push 方向：扩展 storage 改 → 写到 chrome.bookmarks（成文件夹/书签）
// pull 方向：chrome.bookmarks 改 → 写到扩展 storage（按 refId 匹配）
//
// 冲突解决：last-write-wins（比较 updatedAt 时间戳）
// 失败处理：保留 op 在队列里（改名 [op-failed] 前缀），下次重试
// ============================================================================

self.opProcessorRunning = false;

// 工具：拿扩展 storage 里最新数据

// 工具：通过 name 找 chrome 书签文件夹（区分根文件夹 vs 分组文件夹）

// 通过 url + parentId 找 chrome 书签（pull 方向用：定位刚在 Chrome 里改的书签）

// 把扩展侧的 group 同步到 chrome 侧（用 refId 关联）
// 内部小工具：处理 push group

// 把 chrome folder 移到父文件夹下指定 index 位置（order == index）

// push bookmark

// pull 方向：把 chrome 侧的改动写入扩展 storage

// 真实扫描 chrome 书签树，捕获当前所有 group/bookmark 的 chromeId
// 用于在初始化时把 chrome 那边已有的书签"拉"进来

// 排空队列

// 启动时排空 + 周期排空（防 worker 长时间休眠后队列堆积）
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[OpProcessor] onInstalled - cleanup + drain');
    setTimeout(async () => {
        try {
            await BookmarkSync.cleanupInternalGroups();
            await OpQueue.drainOpQueue();
        } catch (err) {
            console.error(err);
        }
    }, 1000);
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('[OpProcessor] onStartup - cleanup + drain');
    setTimeout(async () => {
        try {
            await BookmarkSync.cleanupInternalGroups();
            await OpQueue.drainOpQueue();
        } catch (err) {
            console.error(err);
        }
    }, 1000);
});

// 清理扩展 storage 里误存的内部 group（如 __op_queue__）

// 用 chrome.alarms 做定期唤醒 + 排空（防 worker 长时间休眠丢触发）
if (chrome.alarms) {
    chrome.alarms.create('op-drain', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'op-drain') {
            console.log('[OpProcessor] alarm triggered - drain');
            OpQueue.drainOpQueue().catch((err) => console.error(err));
        }
    });
}

// 暴露给 UI 用的工具方法
