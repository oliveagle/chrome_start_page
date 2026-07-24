// Chrome Extension Background Service Worker
// 处理扩展的生命周期事件和后台操作

// 引入 ops 模块（OpQueue / Trash / Snapshot / BookmarkQueue）
importScripts('ops.js');

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

// 监听 Chrome 书签变化 → 入队 pull op
// 防循环：忽略我们自己入队的 op（title 以 [op] 开头）
chrome.bookmarks.onCreated.addListener(handleChromeBookmarkCreated);
chrome.bookmarks.onRemoved.addListener(handleChromeBookmarkRemoved);
chrome.bookmarks.onChanged.addListener(handleChromeBookmarkChanged);
chrome.bookmarks.onMoved.addListener(handleChromeBookmarkMoved);

// 队列文件夹 ID 缓存，启动时填充
let cachedQueueFolderId = null;
let cachedQueueFolderRootId = null;

async function getQueueFolderIds() {
    if (cachedQueueFolderId && cachedQueueFolderRootId) {
        return { queueFolderId: cachedQueueFolderId, rootFolderId: cachedQueueFolderRootId };
    }
    // 找根文件夹
    const roots = await chrome.bookmarks.search({ title: 'Chrome Start Page Bookmarks' });
    if (!roots || roots.length === 0) return null;
    const root = roots[0];
    cachedQueueFolderRootId = root.id;
    // 在根目录下找 __op_queue__
    const subs = await chrome.bookmarks.getChildren(root.id);
    const q = subs.find(s => s.title === '__op_queue__' && !s.url);
    if (q) cachedQueueFolderId = q.id;
    return { queueFolderId: cachedQueueFolderId, rootFolderId: root.id };
}

// 快速判断一个 chrome 节点是不是"我们自己入队的 op"
async function isOwnOpBookmark(bookmarkId) {
    const ids = await getQueueFolderIds();
    if (!ids || !ids.queueFolderId) return false;
    try {
        const node = await chrome.bookmarks.get(bookmarkId);
        if (!node) return false;
        // 在队列文件夹下 → 必然是自己入队的 op
        if (node.parentId === ids.queueFolderId) return true;
        return false;
    } catch (e) { return false; }
}

function schedulePullDrain() {
    if (opDrainDebounceTimer) clearTimeout(opDrainDebounceTimer);
    opDrainDebounceTimer = setTimeout(() => {
        drainOpQueue().catch(err => console.error('[OpProcessor] drain failed', err));
    }, 500);
}

async function handleChromeBookmarkCreated(id, bookmark) {
    if (await isOwnOpBookmark(id)) return; // 忽略队列自己的 op
    console.log('[Pull] onCreated:', id, bookmark.title);
    schedulePullDrain();
}

async function handleChromeBookmarkRemoved(id, removeInfo) {
    if (await isOwnOpBookmark(id)) return;
    console.log('[Pull] onRemoved:', id, removeInfo.parentId);
    schedulePullDrain();
}

async function handleChromeBookmarkChanged(id, changeInfo) {
    if (await isOwnOpBookmark(id)) return;
    console.log('[Pull] onChanged:', id, changeInfo.title);
    schedulePullDrain();
}

async function handleChromeBookmarkMoved(id, moveInfo) {
    if (await isOwnOpBookmark(id)) return;
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
                    tab: tabs[0] || null
                });
            });
            return true; // 保持消息通道开放

        case 'fetchIcon':
            console.log('[Background] Received fetchIcon request for:', request.url);
            fetchWebsiteIcon(request.url)
                .then(iconUrl => {
                    console.log('[Background] ✅ fetchWebsiteIcon returned:', iconUrl);
                    sendResponse({ success: true, iconUrl });
                })
                .catch(error => {
                    console.log('[Background] ❌ fetchWebsiteIcon failed:', error.message);
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
            syncBookmarksToChrome()
                .then((result) => {
                    sendResponse({ success: true, ...(result || {}) });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'syncBookmarksFromChrome':
            // 从Chrome原生书签管理器同步
            syncBookmarksFromChrome()
                .then((result) => {
                    // result 由 syncBookmarksFromChrome 返回：
                    //   { success: true, groups, bookmarks, addedGroups, addedBookmarks }
                    //   { success: false, reason: 'ROOT_FOLDER_NOT_FOUND', folderName }
                    //   { success: false, reason: 'ROOT_FOLDER_EMPTY' }
                    //   { success: false, reason: 'DUPLICATE_FOLDERS', folders: [...] }
                    sendResponse({ success: true, ...(result || {}) });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true; // 保持消息通道开放

        case 'getQueueStats':
            getQueueStats()
                .then(stats => sendResponse({ success: true, stats }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case 'clearOpQueue':
            clearOpQueue()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case 'retryFailedOps':
            retryFailedOps()
                .then(() => {
                    // 触发一次排空
                    return drainOpQueue();
                })
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

        case 'drainOpQueue':
            drainOpQueue()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.message }));
            return true;

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
        const urlObj = new URL(url);
        const origin = urlObj.origin;
        const hostname = urlObj.hostname;
        const protocol = urlObj.protocol;
        const candidateUrls = [];

        const iconFromHtml = await extractIconFromHtml(url);
        if (iconFromHtml) {
            const absoluteIconUrl = new URL(iconFromHtml, origin).toString();
            candidateUrls.push(absoluteIconUrl);
        }

        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
        const parts = hostname.split('.');

        if (!isIpAddress && parts.length > 2) {
            const mainHostname = parts.slice(1).join('.');
            const mainOrigin = `${protocol}//${mainHostname}`;
            candidateUrls.push(`${mainOrigin}/favicon.ico`);
            candidateUrls.push(`${protocol}//www.${mainHostname}/favicon.ico`);
        }

        if (hostname.startsWith('www.')) {
            const withoutWww = `${protocol}//${hostname.substring(4)}`;
            candidateUrls.push(`${withoutWww}/favicon.ico`);
        }

        candidateUrls.push(`${origin}/favicon.ico`);

        const commonFaviconPaths = [
            '/assets/favicon.ico',
            '/static/favicon.ico',
            '/img/favicon.ico',
            '/images/favicon.ico',
            '/public/favicon.ico',
            '/favicon.png',
            '/favicon.svg',
            '/apple-touch-icon.png',
            '/apple-touch-icon-precomposed.png'
        ];

        for (const path of commonFaviconPaths) {
            candidateUrls.push(`${origin}${path}`);
        }

        const uniqueUrls = [...new Set(candidateUrls)];
        console.log('[Favicon] Candidate URLs:', uniqueUrls);

        const workingUrl = await validateFaviconUrl(uniqueUrls);
        return workingUrl;

    } catch (error) {
        console.error('Invalid URL:', error);
        throw new Error('Invalid URL: ' + error.message);
    }
}

async function validateFaviconUrl(candidateUrls) {
    console.log('[Favicon] validateFaviconUrl called with', candidateUrls.length, 'candidates');

    for (const url of candidateUrls) {
        try {
            console.log('[Favicon] Trying to fetch:', url);
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-cache',
                redirect: 'follow'
            });

            console.log('[Favicon] Response status:', response.status, 'type:', response.type);

            if (response.ok && response.status >= 200 && response.status < 300) {
                const contentType = response.headers.get('content-type');
                console.log('[Favicon] Content-Type:', contentType);
                if (contentType && (contentType.includes('image/') || contentType.includes('x-icon'))) {
                    console.log('[Favicon] ✅ Found working URL:', url);
                    return url;
                }
            }
        } catch (error) {
            console.log('[Favicon] ❌ Failed to fetch:', url, error.message);
            continue;
        }
    }

    console.log('[Favicon] No valid URL found with CORS, trying no-cors mode');

    for (const url of candidateUrls) {
        try {
            console.log('[Favicon] Trying no-cors:', url);
            const response = await fetch(url, {
                method: 'GET',
                mode: 'no-cors',
                cache: 'no-cache'
            });

            console.log('[Favicon] no-cors response type:', response.type);
            if (response.type === 'opaque') {
                console.log('[Favicon] ✅ Using (opaque response):', url);
                return url;
            }
        } catch (error) {
            console.log('[Favicon] no-cors failed:', url, error.message);
            continue;
        }
    }

    console.log('[Favicon] ❌ All candidates failed, returning first candidate');
    return candidateUrls[0] || null;
}

// 从 HTML 页面中提取 favicon
async function extractIconFromHtml(url) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Chrome Extension)'
            }
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        const iconSelectors = [
            /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
            /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
            /<link[^>]*rel=["']apple-touch-icon-precomposed["'][^>]*href=["']([^"']+)["']/i,
            /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
            /<link[^>]*href=["']([^"']+\.ico|favicon[^"']+)["'][^>]*>/i
        ];

        for (const selector of iconSelectors) {
            const match = html.match(selector);
            if (match && match[1]) {
                console.log('[Favicon] Found icon in HTML:', match[1]);
                return match[1];
            }
        }

        return null;
    } catch (error) {
        console.log('[Favicon] Failed to extract icon from HTML:', error.message);
        return null;
    }
}

// 同步书签到Chrome原生书签管理器
async function syncBookmarksToChrome() {
    if (isSyncing) {
        return { success: false, reason: 'ALREADY_SYNCING' };
    }

    try {
        isSyncing = true;
        console.log('[Bookmark Sync] Starting bookmark sync process');

        // 检查是否启用同步功能（保留兼容：未启用也允许手工触发一次）
        const settingsResult = await chrome.storage.sync.get(['settings']);
        const settings = settingsResult.settings || {};
        const manual = settings.syncToChromeBookmarks !== true; // 通过设置面板按钮调用视为 manual
        console.log('[Bookmark Sync] Settings:', settings, 'manual:', manual);

        if (!settings.syncToChromeBookmarks && !manual) {
            console.log('[Bookmark Sync] Chrome bookmark sync is disabled');
            return { success: false, reason: 'DISABLED', hint: '请先在设置中启用"同步书签到Chrome原生书签管理器"。' };
        }

        // 获取所有自定义书签和分组（书签存在 local，分组存在 sync —— 见 storage.js）
        const syncData = await chrome.storage.sync.get(['groups']);
        const localData = await chrome.storage.local.get(['bookmarks']);
        const groups = syncData.groups || [];
        const customBookmarks = localData.bookmarks || [];

        console.log('[Bookmark Sync] Groups count:', groups.length);
        console.log('[Bookmark Sync] Bookmarks count:', customBookmarks.length);

        if (groups.length === 0 && customBookmarks.length === 0) {
            console.log('[Bookmark Sync] No groups or bookmarks to sync');
            return { success: false, reason: 'EMPTY' };
        }

        // 查找或创建根文件夹
        const rootFolderName = 'Chrome Start Page Bookmarks';
        console.log('[Bookmark Sync] Finding or creating root folder:', rootFolderName);
        const rootFolder = await findOrCreateBookmarkFolder(rootFolderName);
        console.log('[Bookmark Sync] Root folder:', rootFolder);

        let wroteGroups = 0;
        let wroteBookmarks = 0;

        // 为每个分组创建子文件夹
        for (const group of groups) {
            console.log('[Bookmark Sync] Processing group:', group.name);
            const groupFolder = await findOrCreateBookmarkFolder(group.name, rootFolder.id);
            console.log('[Bookmark Sync] Group folder for', group.name, ':', groupFolder);
            if (groupFolder.__created) wroteGroups++;

            // 获取该分组下的所有书签
            const groupBookmarks = customBookmarks.filter(b => b.groupId === group.id);
            console.log('[Bookmark Sync] Bookmarks in group', group.name, ':', groupBookmarks.length);

            // 同步书签到对应的分组文件夹
            for (const bookmark of groupBookmarks) {
                console.log('[Bookmark Sync] Creating/updating bookmark:', bookmark.title, bookmark.url);
                const res = await createOrUpdateChromeBookmark(bookmark, groupFolder.id);
                if (res && res.__created) wroteBookmarks++;
            }
        }

        console.log('[Bookmark Sync] Bookmarks synced to Chrome successfully');
        return {
            success: true,
            wroteGroups,
            wroteBookmarks,
            totalGroups: groups.length,
            totalBookmarks: customBookmarks.length
        };
    } catch (error) {
        console.error('[Bookmark Sync] Failed to sync bookmarks to Chrome:', error);
        throw error;
    } finally {
        isSyncing = false;
    }
}

// 从 Chrome 书签同步到扩展
async function syncBookmarksFromChrome() {
    if (isSyncing) {
        return { success: false, reason: 'ALREADY_SYNCING' };
    }

    try {
        console.log('[Reverse Sync] Starting reverse sync process');

        isSyncing = true;

        // 查找根文件夹（按名字搜，若有多个同名文件夹则返回所有让用户选）
        const rootFolderName = 'Chrome Start Page Bookmarks';
        const existingFolders = await chrome.bookmarks.search({ title: rootFolderName });

        if (!existingFolders || existingFolders.length === 0) {
            console.log('[Reverse Sync] Root folder not found, nothing to sync');
            return {
                success: false,
                reason: 'ROOT_FOLDER_NOT_FOUND',
                folderName: rootFolderName,
                hint: '请确认 Chrome 书签中存在名为 "Chrome Start Page Bookmarks" 的文件夹（注意大小写、空格、特殊字符必须完全一致），或在 chrome://bookmarks 中新建该文件夹后重试。'
            };
        }

        if (existingFolders.length > 1) {
            console.log('[Reverse Sync] Multiple folders with same name found:', existingFolders.length);
            return {
                success: false,
                reason: 'DUPLICATE_FOLDERS',
                folderName: rootFolderName,
                folders: existingFolders.map(f => ({ id: f.id, title: f.title, parentId: f.parentId })),
                hint: '检测到多个同名文件夹，请先在 chrome://bookmarks 中重命名其中之一或删除多余项。'
            };
        }

        const rootFolder = existingFolders[0];
        const subNodes = await chrome.bookmarks.getSubTree(rootFolder.id);

        if (!subNodes || subNodes.length === 0 || !subNodes[0].children) {
            console.log('[Reverse Sync] Root folder is empty');
            return { success: false, reason: 'ROOT_FOLDER_EMPTY' };
        }

        // 取所有子节点，带上原始索引（在父文件夹下的位置）
        // 排除内部队列文件夹 __op_queue__
        const QUEUE_FOLDER = '__op_queue__';
        const allChildren = subNodes[0].children.map((node, idx) => ({ ...node, _chromeIndex: idx }));
        const chromeGroups = allChildren.filter(node => !node.url && node.title !== QUEUE_FOLDER); // 文件夹作为分组

        // 获取现有的扩展数据
        const syncResult = await chrome.storage.sync.get(['groups']);
        const localResult = await chrome.storage.local.get(['bookmarks']);

        let currentGroups = syncResult.groups || [];
        let currentBookmarks = localResult.bookmarks || [];

        // 用于追踪新增数量
        let addedGroups = 0;
        let addedBookmarks = 0;

        // 处理分组和书签（增量更新，不删除现有数据）
        for (const chromeGroup of chromeGroups) {
            // 查找或创建分组
            let group = currentGroups.find(g => g.name === chromeGroup.title);
            if (!group) {
                group = {
                    id: self.uuidv4(),
                    name: chromeGroup.title,
                    order: chromeGroup._chromeIndex,  // 沿用 Chrome 那边的位置
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                currentGroups.push(group);
                addedGroups++;
            } else {
                // 更新顺序
                if (group.order !== chromeGroup._chromeIndex) {
                    group.order = chromeGroup._chromeIndex;
                    group.updatedAt = new Date().toISOString();
                }
            }

            // 处理分组下的书签
            if (chromeGroup.children) {
                for (const chromeBookmark of chromeGroup.children) {
                    if (chromeBookmark.url) { // 只处理书签，忽略子文件夹
                        let bookmark = currentBookmarks.find(b => b.url === chromeBookmark.url && b.groupId === group.id);

                        if (!bookmark) {
                            bookmark = {
                                id: self.uuidv4(),
                                title: chromeBookmark.title,
                                url: chromeBookmark.url,
                                groupId: group.id,
                                icon: null, // 不从Chrome书签导入图标
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString()
                            };
                            currentBookmarks.push(bookmark);
                            addedBookmarks++;
                        } else {
                            // 更新标题
                            bookmark.title = chromeBookmark.title;
                            bookmark.updatedAt = new Date().toISOString();
                        }
                    }
                }
            }
        }

        // 保存更新后的数据 - 保留所有现有数据，只是添加或更新从Chrome同步来的数据
        // 兜底：清理之前 sync 误拉进来的内部文件夹（防御性，历史数据保护）
        const internalTitles = new Set(['__op_queue__']);
        currentGroups = currentGroups.filter(g => !internalTitles.has(g.name));
        await chrome.storage.sync.set({ groups: currentGroups });
        await chrome.storage.local.set({ bookmarks: currentBookmarks });

        console.log('[Reverse Sync] Synced from Chrome successfully');
        console.log('[Reverse Sync] Total Groups:', currentGroups.length);
        console.log('[Reverse Sync] Total Bookmarks:', currentBookmarks.length);
        console.log('[Reverse Sync] Added Groups:', addedGroups);
        console.log('[Reverse Sync] Added Bookmarks:', addedBookmarks);

        return {
            success: true,
            totalGroups: currentGroups.length,
            totalBookmarks: currentBookmarks.length,
            addedGroups,
            addedBookmarks
        };

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
            return { ...filteredFolders[0], __created: false };
        }

        // 如果没有找到，创建新文件夹
        console.log('[Bookmark Folder] Creating new folder:', folderName);
        const newFolder = await chrome.bookmarks.create({
            title: folderName,
            parentId: parentId
        });
        console.log('[Bookmark Folder] Created new folder:', newFolder);

        return { ...newFolder, __created: true };
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
            const updated = await chrome.bookmarks.update(bookmarksInFolder[0].id, {
                title: bookmark.title
            });
            console.log('[Bookmark Item] Updated bookmark successfully');
            return { ...updated, __created: false };
        } else {
            // 创建新书签
            console.log('[Bookmark Item] Creating new bookmark');
            const created = await chrome.bookmarks.create({
                title: bookmark.title,
                url: bookmark.url,
                parentId: parentId
            });
            console.log('[Bookmark Item] Created bookmark successfully');
            return { ...created, __created: true };
        }
    } catch (error) {
        console.error('[Bookmark Item] Failed to create or update Chrome bookmark:', error);
        return null;
    }
}

// 自动同步：监听存储变更 -> 触发 op 调度器
// bookmarks 在 local，groups 在 sync（见 storage.js）
chrome.storage.onChanged.addListener((changes, areaName) => {
    const bookmarksChanged = areaName === 'local' && changes.bookmarks;
    const groupsChanged = areaName === 'sync' && changes.groups;
    // settings 变化也触发一次（开关切换时立刻排空）
    const settingsChanged = areaName === 'sync' && changes.settings;
    if (!bookmarksChanged && !groupsChanged && !settingsChanged) return;

    console.log('[OpProcessor] Storage change in', areaName, '- scheduling drain');
    if (opDrainDebounceTimer) clearTimeout(opDrainDebounceTimer);
    opDrainDebounceTimer = setTimeout(() => {
        drainOpQueue().catch(err => console.error('[OpProcessor] drain failed', err));
    }, 500);
});

let opDrainDebounceTimer = null;

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
            documentUrlPatterns: ['chrome-extension://*/new-tab.html'] // 只在扩展的新标签页中显示
        });

        console.log('Context menu created for email bookmarks');
    });
}

// 监听上下文菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openEmailInBackground') {
        const url = info.linkUrl;

        // 检查是否是邮件链接
        if (isEmailUrl(url)) {
            // 在后台窗口中打开（不激活新窗口）
            chrome.windows.create({
                url: url,
                focused: false, // 不聚焦，保持在后台
                type: 'normal'
            });
            console.log('Opened email in background window:', url);
        }
    }
});

// 检查URL是否为邮件相关链接
function isEmailUrl(url) {
    if (!url) return false;

    try {
        const urlObj = new URL(url);

        // 检查协议是否为 mailto
        if (urlObj.protocol === 'mailto:') {
            return true;
        }

        // 检查常见邮件服务域名
        const emailDomains = [
            'gmail.com',
            'outlook.com',
            'hotmail.com',
            'yahoo.com',
            'protonmail.com',
            'mail.qq.com',
            '163.com',
            '126.com',
            'sina.com',
            'foxmail.com'
        ];

        const hostname = urlObj.hostname.toLowerCase();

        // 检查域名是否匹配
        for (const domain of emailDomains) {
            if (hostname.includes(domain)) {
                return true;
            }
        }

        // 检查是否包含邮件相关路径或参数
        const path = urlObj.pathname.toLowerCase();
        const search = urlObj.search.toLowerCase();

        if (path.includes('mail') ||
            path.includes('message') ||
            search.includes('mail') ||
            search.includes('email')) {
            return true;
        }

        return false;

    } catch (error) {
        console.error('Error parsing URL:', error);
        return false;
    }
}

// 监听来自内容脚本的消息，处理CMD+点击
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openEmailInBackground') {
        const url = request.url;

        if (isEmailUrl(url)) {
            // 在后台窗口中打开
            chrome.windows.create({
                url: url,
                focused: false,
                type: 'normal'
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

let opProcessorRunning = false;

// 工具：拿扩展 storage 里最新数据
async function _getExtGroups() {
    const r = await chrome.storage.sync.get(['groups']);
    return r.groups || [];
}
async function _getExtBookmarks() {
    const r = await chrome.storage.local.get(['bookmarks']);
    return r.bookmarks || [];
}
async function _saveExtGroups(groups) {
    await chrome.storage.sync.set({ groups });
}
async function _saveExtBookmarks(bookmarks) {
    await chrome.storage.local.set({ bookmarks });
}

// 工具：通过 name 找 chrome 书签文件夹（区分根文件夹 vs 分组文件夹）
async function findChromeFolderByName(name, parentId) {
    try {
        const query = parentId !== undefined ? { title: name } : { title: name };
        const found = await chrome.bookmarks.search(query);
        if (!found || found.length === 0) return null;
        // 过滤：在指定 parent 下的文件夹
        const matches = parentId !== undefined
            ? found.filter(f => f.parentId === parentId && !f.url)
            : found.filter(f => !f.url);
        return matches.length > 0 ? matches[0] : null;
    } catch (e) {
        return null;
    }
}

// 通过 url + parentId 找 chrome 书签（pull 方向用：定位刚在 Chrome 里改的书签）
async function findChromeBookmarkByUrl(url, parentId) {
    try {
        const found = await chrome.bookmarks.search({ url });
        if (!found) return null;
        const matches = parentId !== undefined
            ? found.filter(b => b.parentId === parentId && b.url)
            : found.filter(b => b.url);
        return matches.length > 0 ? matches[0] : null;
    } catch (e) { return null; }
}

// 拿根文件夹 id
async function ensureRootFolder() {
    let roots = await chrome.bookmarks.search({ title: 'Chrome Start Page Bookmarks' });
    if (!roots || roots.length === 0) {
        const created = await chrome.bookmarks.create({ title: 'Chrome Start Page Bookmarks' });
        roots = [created];
    }
    return roots[0];
}

// 把扩展侧的 group 同步到 chrome 侧（用 refId 关联）
// 内部小工具：处理 push group
async function pushGroupAdd(op) {
    const ids = await getQueueFolderIds();
    if (!ids) throw new Error('root folder not ready');
    const rootId = ids.rootFolderId;
    // 找一个未占用的 group folder 名称（同 name 可能有多个 add op）
    const group = op.payload;
    const existing = await findChromeFolderByName(group.name, rootId);
    if (existing) {
        console.log('[OpProcessor] push group add: folder already exists', group.name, existing.id);
        return existing.id;
    }
    // 创建后按 order 移到目标位置（chrome.bookmarks.move index = 目标 index）
    const created = await chrome.bookmarks.create({ title: group.name, parentId: rootId });
    console.log('[OpProcessor] push group add: created folder', created.title, created.id);
    // 移动到正确位置
    if (typeof group.order === 'number') {
        await moveChromeFolderToOrder(rootId, created.id, group.order);
    }
    return created.id;
}

// 把 chrome folder 移到父文件夹下指定 index 位置（order == index）
async function moveChromeFolderToOrder(rootId, folderId, targetOrder) {
    try {
        const siblings = await chrome.bookmarks.getChildren(rootId);
        // 过滤出非 __op_queue__ 的 group folder
        const groupFolders = siblings.filter(s => !s.url && s.title !== '__op_queue__');
        const currentIdx = groupFolders.findIndex(s => s.id === folderId);
        if (currentIdx === -1) return;
        const desiredIdx = Math.max(0, Math.min(targetOrder, groupFolders.length - 1));
        if (currentIdx === desiredIdx) return;
        // chrome.bookmarks.move 的 parentId+index 接受 index 为 0..N
        await chrome.bookmarks.move(folderId, { parentId: rootId, index: desiredIdx });
        console.log('[OpProcessor] moved folder to order', desiredIdx);
    } catch (e) {
        console.warn('[OpProcessor] moveChromeFolderToOrder failed:', e.message);
    }
}

async function pushGroupUpdate(op) {
    const ids = await getQueueFolderIds();
    if (!ids) throw new Error('root folder not ready');
    const rootId = ids.rootFolderId;
    const payload = op.payload;
    // 用旧名找，再 update
    const oldName = payload.__oldName || payload.name;
    const newName = payload.name;
    const folder = await findChromeFolderByName(oldName, rootId);
    if (!folder) {
        // 旧名找不到，可能已经被改了或被删，直接用新名建
        const created = await chrome.bookmarks.create({ title: newName, parentId: rootId });
        if (typeof payload.order === 'number') {
            await moveChromeFolderToOrder(rootId, created.id, payload.order);
        }
        return created.id;
    }
    if (oldName !== newName) {
        await chrome.bookmarks.update(folder.id, { title: newName });
    }
    // order 变了 → 移动
    if (typeof payload.order === 'number') {
        await moveChromeFolderToOrder(rootId, folder.id, payload.order);
    }
    return folder.id;
}

async function pushGroupRemove(op) {
    const ids = await getQueueFolderIds();
    if (!ids) return; // 没初始化就不管
    const rootId = ids.rootFolderId;
    const folder = await findChromeFolderByName(op.payload.name || '', rootId);
    // 注意：payload 里只有 id，没有 name；这里需要在 storage 里再查一次
    if (folder) {
        try { await chrome.bookmarks.removeTree(folder.id); } catch (e) { /* ignore */ }
    }
}

// push bookmark
async function pushBookmarkAdd(op) {
    const ids = await getQueueFolderIds();
    if (!ids) throw new Error('root folder not ready');
    const rootId = ids.rootFolderId;
    const bookmark = op.payload;
    // 找到 group 对应的 chrome folder
    const groups = await _getExtGroups();
    const group = groups.find(g => g.id === bookmark.groupId);
    if (!group) {
        console.warn('[OpProcessor] push bookmark add: group not found', bookmark.groupId);
        return;
    }
    const groupFolder = await findChromeFolderByName(group.name, rootId);
    if (!groupFolder) {
        // group folder 还没建，先建
        const created = await chrome.bookmarks.create({ title: group.name, parentId: rootId });
        // 顺便记一下 group folder 创建
        console.log('[OpProcessor] push bookmark add: created missing group folder', group.name);
        await chrome.bookmarks.create({
            title: bookmark.title,
            url: bookmark.url,
            parentId: created.id
        });
        return;
    }
    // 检查是否已存在（避免重复创建）
    const existing = await findChromeBookmarkByUrl(bookmark.url, groupFolder.id);
    if (existing) {
        // 已存在 → 当 update 处理
        if (existing.title !== bookmark.title) {
            await chrome.bookmarks.update(existing.id, { title: bookmark.title });
        }
        return;
    }
    await chrome.bookmarks.create({
        title: bookmark.title,
        url: bookmark.url,
        parentId: groupFolder.id
    });
}

async function pushBookmarkUpdate(op) {
    const ids = await getQueueFolderIds();
    if (!ids) throw new Error('root folder not ready');
    const rootId = ids.rootFolderId;
    const bookmark = op.payload;
    const groups = await _getExtGroups();
    const group = groups.find(g => g.id === bookmark.groupId);
    if (!group) return;
    const groupFolder = await findChromeFolderByName(group.name, rootId);
    if (!groupFolder) return;
    const existing = await findChromeBookmarkByUrl(bookmark.url, groupFolder.id);
    if (existing) {
        await chrome.bookmarks.update(existing.id, { title: bookmark.title });
    } else {
        // 找不到 → 当 add 处理
        await chrome.bookmarks.create({
            title: bookmark.title,
            url: bookmark.url,
            parentId: groupFolder.id
        });
    }
}

async function pushBookmarkRemove(op) {
    const ids = await getQueueFolderIds();
    if (!ids) return;
    const rootId = ids.rootFolderId;
    const bookmarks = await _getExtBookmarks();
    // pull 时已经移除，这里直接尝试按 url 找
    const all = await chrome.bookmarks.getRecent(1000);
    // 更稳：通过 trash 里有 payload
    return; // trash 已经处理了真实删除（如果 chrome 那边被删过的话）
}

// pull 方向：把 chrome 侧的改动写入扩展 storage
async function pullGroupFromChrome(op) {
    const payload = op.payload || {};
    const groups = await _getExtGroups();
    const chromeId = payload.chromeId;

    if (op.type === 'add') {
        // payload 包含 name
        let g = groups.find(x => x.chromeId === chromeId);
        if (!g) {
            g = {
                id: self.uuidv4(),
                name: payload.name || 'Untitled',
                chromeId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            groups.push(g);
            await _saveExtGroups(groups);
        }
    } else if (op.type === 'update') {
        const g = groups.find(x => x.chromeId === chromeId);
        if (g) {
            // last-write-wins
            if (g.updatedAt && payload.updatedAt && payload.updatedAt > g.updatedAt) {
                g.name = payload.name || g.name;
                g.updatedAt = payload.updatedAt;
                await _saveExtGroups(groups);
            }
        } else {
            // 不存在 → 当 add
            groups.push({
                id: self.uuidv4(),
                name: payload.name || 'Untitled',
                chromeId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            await _saveExtGroups(groups);
        }
    } else if (op.type === 'remove') {
        const newGroups = groups.filter(x => x.chromeId !== chromeId);
        await _saveExtGroups(newGroups);
    }
}

async function pullBookmarkFromChrome(op) {
    const payload = op.payload || {};
    const bookmarks = await _getExtBookmarks();
    const chromeId = payload.chromeId;

    if (op.type === 'add' || op.type === 'update') {
        let b = bookmarks.find(x => x.chromeId === chromeId);
        if (!b) {
            b = {
                id: self.uuidv4(),
                title: payload.title || '',
                url: payload.url || '',
                groupChromeId: payload.groupChromeId || null,
                chromeId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            bookmarks.push(b);
        } else {
            // last-write-wins
            if (!b.updatedAt || (payload.updatedAt && payload.updatedAt > b.updatedAt)) {
                b.title = payload.title || b.title;
                b.url = payload.url || b.url;
                b.groupChromeId = payload.groupChromeId || b.groupChromeId;
                b.updatedAt = payload.updatedAt || new Date().toISOString();
            }
        }
        await _saveExtBookmarks(bookmarks);
    } else if (op.type === 'remove') {
        const newBookmarks = bookmarks.filter(x => x.chromeId !== chromeId);
        await _saveExtBookmarks(newBookmarks);
    }
}

// 真实扫描 chrome 书签树，捕获当前所有 group/bookmark 的 chromeId
// 用于在初始化时把 chrome 那边已有的书签"拉"进来
async function scanChromeBookmarkTree() {
    const ids = await getQueueFolderIds();
    if (!ids) return { groups: [], bookmarks: [] };

    // 找根文件夹
    const roots = await chrome.bookmarks.search({ title: 'Chrome Start Page Bookmarks' });
    if (!roots || roots.length === 0) return { groups: [], bookmarks: [] };
    const root = roots[0];

    const subTree = await chrome.bookmarks.getSubTree(root.id);
    if (!subTree || !subTree[0] || !subTree[0].children) return { groups: [], bookmarks: [] };

    const groups = [];
    const bookmarks = [];

    for (const child of subTree[0].children) {
        if (child.title === '__op_queue__') continue; // 跳过队列文件夹
        if (!child.url) {
            // 是 group 文件夹
            groups.push({ chromeId: child.id, name: child.title });
            if (child.children) {
                for (const b of child.children) {
                    if (b.url && b.title !== '__op_queue__') {
                        bookmarks.push({
                            chromeId: b.id,
                            title: b.title,
                            url: b.url,
                            groupChromeId: child.id
                        });
                    }
                }
            }
        }
    }
    return { groups, bookmarks };
}

// 排空队列
async function drainOpQueue() {
    if (opProcessorRunning) return;
    opProcessorRunning = true;
    try {
        const queue = new BookmarkQueue();
        // 队列健康检查
        const healthy = await queue.isHealthy();
        if (!healthy) {
            console.warn('[OpProcessor] queue unhealthy (overflow?), pausing drain');
            return;
        }

        // 先处理 failed（重试）
        const failed = await queue.failed();
        const pending = await queue.pending();
        let all = [...failed, ...pending];

        // 跨设备同步后去重：
        // 1. 跳过 __applied__ 墓簿里已经执行过的 opId
        // 2. 同 opId 在当前 pending/failed 里多次出现只执行一次
        const appliedOpIds = await queue.appliedOpIds();
        const seenOpIds = new Set();
        const deduped = [];
        let skippedApplied = 0;
        let skippedDup = 0;
        for (const op of all) {
            if (op.opId && appliedOpIds.has(op.opId)) {
                // 同步后看到自己已经执行过的 op → 静默删除
                await queue.remove(op.chromeId);
                skippedApplied++;
                continue;
            }
            if (op.opId && seenOpIds.has(op.opId)) {
                // 同 opId 在本批重复 → 跳过第二个
                await queue.remove(op.chromeId);
                skippedDup++;
                continue;
            }
            if (op.opId) seenOpIds.add(op.opId);
            deduped.push(op);
        }
        all = deduped;

        if (all.length === 0) {
            if (skippedApplied || skippedDup) {
                console.log(`[OpProcessor] queue drained by dedup (skipped ${skippedApplied} applied, ${skippedDup} duplicate)`);
            } else {
                console.log('[OpProcessor] queue empty');
            }
            return;
        }
        console.log(`[OpProcessor] draining ${all.length} ops (${failed.length} failed, ${pending.length} pending; skipped ${skippedApplied} applied, ${skippedDup} duplicate)`);

        for (const op of all) {
            try {
                await executeOp(op);
                // 成功：把 op 移到 __applied__ 墓簿（跨设备去重依据）
                await queue.markApplied(op.chromeId, op.opId);
                console.log('[OpProcessor] ✓ executed:', op.direction, op.type, op.target, op.refId, 'opId=', op.opId);
            } catch (e) {
                console.error('[OpProcessor] ✗ failed:', op.direction, op.type, op.target, e.message);
                await queue.markFailed(op.chromeId, e.message || 'unknown');
            }
        }
    } catch (e) {
        console.error('[OpProcessor] drain error', e);
    } finally {
        opProcessorRunning = false;
    }
}

async function executeOp(op) {
    if (op.direction === 'push') {
        if (op.target === 'group') {
            if (op.type === 'add') return await pushGroupAdd(op);
            if (op.type === 'update') return await pushGroupUpdate(op);
            if (op.type === 'remove') return await pushGroupRemove(op);
        } else if (op.target === 'bookmark') {
            if (op.type === 'add') return await pushBookmarkAdd(op);
            if (op.type === 'update') return await pushBookmarkUpdate(op);
            if (op.type === 'remove') return await pushBookmarkRemove(op);
        }
    } else if (op.direction === 'pull') {
        if (op.target === 'group') return await pullGroupFromChrome(op);
        if (op.target === 'bookmark') return await pullBookmarkFromChrome(op);
    }
    console.warn('[OpProcessor] unknown op shape', op);
}

// 启动时排空 + 周期排空（防 worker 长时间休眠后队列堆积）
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[OpProcessor] onInstalled - cleanup + drain');
    setTimeout(async () => {
        await cleanupInternalGroups();
        return drainOpQueue();
    }, 1000).catch(err => console.error(err));
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('[OpProcessor] onStartup - cleanup + drain');
    setTimeout(async () => {
        await cleanupInternalGroups();
        return drainOpQueue();
    }, 1000).catch(err => console.error(err));
});

// 清理扩展 storage 里误存的内部 group（如 __op_queue__）
async function cleanupInternalGroups() {
    const INTERNAL_TITLES = ['__op_queue__'];
    try {
        const r = await chrome.storage.sync.get(['groups']);
        const groups = r.groups || [];
        const filtered = groups.filter(g => !INTERNAL_TITLES.includes(g.name));
        if (filtered.length !== groups.length) {
            await chrome.storage.sync.set({ groups: filtered });
            console.log('[Cleanup] Removed', groups.length - filtered.length, 'internal groups');
            return groups.length - filtered.length;
        }
    } catch (e) {
        console.error('[Cleanup] error:', e);
    }
    return 0;
}

// 用 chrome.alarms 做定期唤醒 + 排空（防 worker 长时间休眠丢触发）
if (chrome.alarms) {
    chrome.alarms.create('op-drain', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'op-drain') {
            console.log('[OpProcessor] alarm triggered - drain');
            drainOpQueue().catch(err => console.error(err));
        }
    });
}

// 暴露给 UI 用的工具方法
async function getQueueStats() {
    const queue = new BookmarkQueue();
    const pending = await queue.pending();
    const failed = await queue.failed();
    const applied = await queue.appliedOpIds();
    return {
        pending: pending.length,
        failed: failed.length,
        applied: applied.size,
        total: pending.length + failed.length
    };
}

async function clearOpQueue() {
    const queue = new BookmarkQueue();
    await queue.clear();
}

async function retryFailedOps() {
    // 把 [op-failed] 标题改回 [op]
    const queue = new BookmarkQueue();
    const failed = await queue.failed();
    for (const op of failed) {
        try {
            const node = await chrome.bookmarks.get(op.chromeId);
            if (node) {
                await chrome.bookmarks.update(op.chromeId, {
                    title: node.title.replace('[op-failed]', '[op]')
                });
            }
        } catch (e) { /* ignore */ }
    }
}
