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

// 防止循环同步的标志
let isSyncing = false;
let syncDebounceTimer = null;

// 监听 Chrome 书签变化
chrome.bookmarks.onCreated.addListener(handleChromeBookmarkChange);
chrome.bookmarks.onRemoved.addListener(handleChromeBookmarkChange);
chrome.bookmarks.onChanged.addListener(handleChromeBookmarkChange);
chrome.bookmarks.onMoved.addListener(handleChromeBookmarkChange);

function handleChromeBookmarkChange() {
    console.log('[Reverse Sync] Chrome bookmark changed');
    if (isSyncing) {
        console.log('[Reverse Sync] Sync in progress, ignoring change');
        return;
    }

    // 防抖处理
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        syncBookmarksFromChrome();
    }, 1000);
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

        case 'fetchPageTitle':
            // 获取网页标题
            fetchPageTitle(request.url)
                .then(title => {
                    sendResponse({ success: true, title });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'syncBookmarksToChrome':
            // 同步书签到Chrome原生书签管理器
            syncBookmarksToChrome();
            sendResponse({ success: true });
            return true; // 保持消息通道开放

        case 'syncBookmarksFromChrome':
            // 从Chrome原生书签管理器同步
            syncBookmarksFromChrome()
                .then(() => {
                    sendResponse({ success: true });
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

// 获取网页标题
async function fetchPageTitle(url) {
    try {
        // 验证 URL
        const urlObj = new URL(url);

        // 使用 fetch 获取页面内容
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Chrome Extension)'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();

        // 提取 <title> 标签内容
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            return titleMatch[1].trim();
        }

        // 如果没有找到 title，尝试查找 og:title
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (ogTitleMatch && ogTitleMatch[1]) {
            return ogTitleMatch[1].trim();
        }

        // 都没找到，返回域名
        return urlObj.hostname;

    } catch (error) {
        console.error('Failed to fetch page title:', error);
        // 如果获取失败，返回域名作为后备
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            throw new Error('Invalid URL: ' + error.message);
        }
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

// 同步书签到Chrome原生书签管理器
async function syncBookmarksToChrome() {
    if (isSyncing) return;

    try {
        isSyncing = true;
        console.log('[Bookmark Sync] Starting bookmark sync process');

        // 检查是否启用同步功能
        const settingsResult = await chrome.storage.sync.get(['settings']);
        const settings = settingsResult.settings || {};
        console.log('[Bookmark Sync] Settings:', settings);

        if (!settings.syncToChromeBookmarks) {
            console.log('[Bookmark Sync] Chrome bookmark sync is disabled');
            return;
        }

        // 获取所有自定义书签和分组
        const result = await chrome.storage.sync.get(['groups', 'bookmarks']);
        const groups = result.groups || [];
        const customBookmarks = result.bookmarks || [];

        console.log('[Bookmark Sync] Groups count:', groups.length);
        console.log('[Bookmark Sync] Bookmarks count:', customBookmarks.length);

        if (groups.length === 0 && customBookmarks.length === 0) {
            console.log('[Bookmark Sync] No groups or bookmarks to sync');
            return;
        }

        // 查找或创建根文件夹
        const rootFolderName = 'Chrome Start Page Bookmarks';
        console.log('[Bookmark Sync] Finding or creating root folder:', rootFolderName);
        let rootFolder = await findOrCreateBookmarkFolder(rootFolderName);
        console.log('[Bookmark Sync] Root folder:', rootFolder);

        // 为每个分组创建子文件夹
        for (const group of groups) {
            console.log('[Bookmark Sync] Processing group:', group.name);
            const groupFolder = await findOrCreateBookmarkFolder(group.name, rootFolder.id);
            console.log('[Bookmark Sync] Group folder for', group.name, ':', groupFolder);

            // 获取该分组下的所有书签
            const groupBookmarks = customBookmarks.filter(b => b.groupId === group.id);
            console.log('[Bookmark Sync] Bookmarks in group', group.name, ':', groupBookmarks.length);

            // 同步书签到对应的分组文件夹
            for (const bookmark of groupBookmarks) {
                console.log('[Bookmark Sync] Creating/updating bookmark:', bookmark.title, bookmark.url);
                await createOrUpdateChromeBookmark(bookmark, groupFolder.id);
            }
        }

        console.log('[Bookmark Sync] Bookmarks synced to Chrome successfully');
    } catch (error) {
        console.error('[Bookmark Sync] Failed to sync bookmarks to Chrome:', error);
    } finally {
        isSyncing = false;
    }
}

// 从 Chrome 书签同步到扩展
async function syncBookmarksFromChrome() {
    if (isSyncing) return;

    try {
        console.log('[Reverse Sync] Starting reverse sync process');

        isSyncing = true;

        // 查找根文件夹
        const rootFolderName = 'Chrome Start Page Bookmarks';
        const existingFolders = await chrome.bookmarks.search({ title: rootFolderName });

        if (!existingFolders || existingFolders.length === 0) {
            console.log('[Reverse Sync] Root folder not found, nothing to sync');
            return;
        }

        const rootFolder = existingFolders[0];
        const subNodes = await chrome.bookmarks.getSubTree(rootFolder.id);

        if (!subNodes || subNodes.length === 0 || !subNodes[0].children) {
            console.log('[Reverse Sync] Root folder is empty');
            return;
        }

        const chromeGroups = subNodes[0].children.filter(node => !node.url); // 文件夹作为分组

        // 获取现有的扩展数据
        const syncResult = await chrome.storage.sync.get(['groups']);
        const localResult = await chrome.storage.local.get(['bookmarks']);

        let currentGroups = syncResult.groups || [];
        let currentBookmarks = localResult.bookmarks || [];

        const newGroups = [];
        const newBookmarks = [];

        // 处理分组和书签
        for (const chromeGroup of chromeGroups) {
            // 查找或创建分组
            let group = currentGroups.find(g => g.name === chromeGroup.title);
            if (!group) {
                group = {
                    id: 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: chromeGroup.title,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
            }
            newGroups.push(group);

            // 处理分组下的书签
            if (chromeGroup.children) {
                for (const chromeBookmark of chromeGroup.children) {
                    if (chromeBookmark.url) { // 只处理书签，忽略子文件夹
                        let bookmark = currentBookmarks.find(b => b.url === chromeBookmark.url && b.groupId === group.id);
                        if (!bookmark) {
                            bookmark = {
                                id: 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                                title: chromeBookmark.title,
                                url: chromeBookmark.url,
                                groupId: group.id,
                                icon: null, // 不从Chrome书签导入图标
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                        } else {
                            // 更新标题
                            bookmark.title = chromeBookmark.title;
                            bookmark.updatedAt = new Date().toISOString();
                        }
                        newBookmarks.push(bookmark);
                    }
                }
            }
        }

        // 保存更新后的数据 - groups 到 sync, bookmarks 到 local
        await chrome.storage.sync.set({ groups: newGroups });
        await chrome.storage.local.set({ bookmarks: newBookmarks });

        console.log('[Reverse Sync] Synced from Chrome successfully');
        console.log('[Reverse Sync] Groups:', newGroups.length);
        console.log('[Reverse Sync] Bookmarks:', newBookmarks.length);

    } catch (error) {
        console.error('[Reverse Sync] Failed to sync from Chrome:', error);
        throw error;
    } finally {
        isSyncing = false;
    }
}

// 查找或创建书签文件夹
async function findOrCreateBookmarkFolder(folderName, parentId = null) {
    try {
        console.log('[Bookmark Folder] Finding or creating folder:', folderName, 'with parentId:', parentId);

        // 查找现有的文件夹
        // 注意：chrome.bookmarks.search 对 parentId 参数有一些限制，我们只按标题搜索
        const existingFolders = await chrome.bookmarks.search({ title: folderName });

        // 如果指定了 parentId，需要进一步过滤结果
        let filteredFolders = existingFolders;
        if (parentId) {
            filteredFolders = existingFolders.filter(folder => folder.parentId === parentId);
        }

        console.log('[Bookmark Folder] Found existing folders:', existingFolders);
        console.log('[Bookmark Folder] Filtered folders:', filteredFolders);
        // 如果找到了，返回第一个匹配的文件夹
        if (filteredFolders && filteredFolders.length > 0) {
            console.log('[Bookmark Folder] Using existing folder:', filteredFolders[0]);
            return filteredFolders[0];
        }

        // 如果没有找到，创建新文件夹
        console.log('[Bookmark Folder] Creating new folder:', folderName);
        const newFolder = await chrome.bookmarks.create({
            title: folderName,
            parentId: parentId
        });
        console.log('[Bookmark Folder] Created new folder:', newFolder);

        return newFolder;
    } catch (error) {
        console.error('[Bookmark Folder] Failed to find or create bookmark folder:', error);
        throw error;
    }
}

// 创建或更新Chrome书签
async function createOrUpdateChromeBookmark(bookmark, parentId) {
    try {
        console.log('[Bookmark Item] Creating or updating bookmark:', bookmark.title, bookmark.url, 'in folder:', parentId);

        // 查找是否已存在相同的书签
        const existingBookmarks = await chrome.bookmarks.search({
            url: bookmark.url
        });
        console.log('[Bookmark Item] Found existing bookmarks with same URL:', existingBookmarks);

        // 过滤出在指定父文件夹中的书签
        const bookmarksInFolder = existingBookmarks.filter(b => b.parentId === parentId);
        console.log('[Bookmark Item] Found bookmarks in same folder:', bookmarksInFolder);

        if (bookmarksInFolder.length > 0) {
            // 更新现有书签
            console.log('[Bookmark Item] Updating existing bookmark:', bookmarksInFolder[0].id);
            await chrome.bookmarks.update(bookmarksInFolder[0].id, {
                title: bookmark.title
            });
            console.log('[Bookmark Item] Updated bookmark successfully');
        } else {
            // 创建新书签
            console.log('[Bookmark Item] Creating new bookmark');
            await chrome.bookmarks.create({
                title: bookmark.title,
                url: bookmark.url,
                parentId: parentId
            });
            console.log('[Bookmark Item] Created bookmark successfully');
        }
    } catch (error) {
        console.error('[Bookmark Item] Failed to create or update Chrome bookmark:', error);
    }
}

// 监听书签和分组的变化
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && (changes.bookmarks || changes.groups)) {
        // 延迟执行同步，避免频繁操作
        setTimeout(() => {
            syncBookmarksToChrome();
        }, 1000);
    }
});

// 错误处理
chrome.runtime.onSuspend.addListener(() => {
    console.log('Background service worker suspending');
    // 清理资源，保存状态等
});

chrome.runtime.onSuspendCanceled.addListener(() => {
    console.log('Background service worker suspend canceled');
});