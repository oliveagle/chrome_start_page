// Bookmark Management Module
// 处理书签的所有操作

class BookmarkManager {
    constructor() {
        this.storage = storageManager;
        this.groupManager = null; // 延迟绑定，避免循环依赖
    }

    // 获取 groupManager（延迟绑定）
    getGroupManager() {
        if (!this.groupManager && window.groupManager) {
            this.groupManager = groupManager;
        }
        return this.groupManager;
    }

    // ===== 获取书签相关方法 =====

    // 获取所有书签
    async getAllBookmarks() {
        return await this.storage.getBookmarks();
    }

    // 获取单个书签
    async getBookmark(id) {
        const bookmarks = await this.getAllBookmarks();
        return bookmarks.find(bookmark => bookmark.id === id) || null;
    }

    // 根据组ID获取书签
    async getBookmarksByGroup(groupId) {
        return await this.storage.getBookmarksByGroup(groupId);
    }

    // 搜索书签
    async searchBookmarks(query) {
        const bookmarks = await this.getAllBookmarks();
        const searchTerm = query.toLowerCase().trim();

        if (!searchTerm) {
            return bookmarks;
        }

        return bookmarks.filter(bookmark =>
            bookmark.title.toLowerCase().includes(searchTerm) ||
            bookmark.url.toLowerCase().includes(searchTerm)
        );
    }

    // ===== 创建书签相关方法 =====

    // 创建新书签
    async createBookmark(bookmarkData) {
        try {
            // 验证输入数据
            const validation = this.validateBookmarkData(bookmarkData);
            if (!validation.valid) {
                throw new Error(validation.message);
            }

            // 检查组是否存在
            const groupManager = this.getGroupManager();
            if (!groupManager) {
                throw new Error('GroupManager not available');
            }

            const group = await groupManager.getGroup(bookmarkData.groupId);
            if (!group) {
                throw new Error('指定的组不存在');
            }

            // 检查重复的书签（同一组中不允许重复URL）
            const existingBookmarks = await this.getBookmarksByGroup(bookmarkData.groupId);
            const isDuplicate = existingBookmarks.some(bookmark =>
                bookmark.url.toLowerCase() === this.storage.normalizeUrl(bookmarkData.url).toLowerCase()
            );

            if (isDuplicate) {
                throw new Error('该组中已存在相同网址的书签');
            }

            // 准备书签数据
            const normalizedUrl = this.storage.normalizeUrl(bookmarkData.url);

            // 优先使用提供的图标，否则尝试从缓存获取
            let iconUrl = bookmarkData.icon || null;

            // 验证图标不是 data URL
            if (iconUrl && iconUrl.startsWith('data:')) {
                console.warn('[Bookmark] Rejecting data URL icon to prevent storage quota issues');
                iconUrl = null; // 不使用 base64 图标
            }

            if (!iconUrl) {
                iconUrl = await this.getIconFromCache(normalizedUrl);
                if (iconUrl) {
                    console.log('Reusing cached icon for new bookmark:', normalizedUrl);
                }
            }

            const newBookmark = {
                title: bookmarkData.title.trim(),
                url: normalizedUrl,
                groupId: bookmarkData.groupId,
                icon: iconUrl,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // 创建书签
            const createdBookmark = await this.storage.addBookmark(newBookmark);

            if (createdBookmark) {
                console.log('New bookmark created:', createdBookmark);

                // 只有在没有图标时才尝试获取（异步，不阻塞书签创建）
                if (!createdBookmark.icon) {
                    this.fetchAndUpdateIcon(createdBookmark.id);
                }

                return createdBookmark;
            } else {
                throw new Error('创建书签失败');
            }

        } catch (error) {
            console.error('Failed to create bookmark:', error);
            throw error;
        }
    }

    // ===== 更新书签相关方法 =====

    // 更新书签
    async updateBookmark(id, updates) {
        try {
            const bookmark = await this.getBookmark(id);
            if (!bookmark) {
                throw new Error('书签不存在');
            }

            // 验证更新数据
            if (updates.title !== undefined || updates.url !== undefined) {
                const validation = this.validateBookmarkData({
                    title: updates.title !== undefined ? updates.title : bookmark.title,
                    url: updates.url !== undefined ? updates.url : bookmark.url,
                    groupId: bookmark.groupId
                });

                if (!validation.valid) {
                    throw new Error(validation.message);
                }
            }

            // 如果URL发生变化，检查重复
            if (updates.url && updates.url !== bookmark.url) {
                const existingBookmarks = await this.getBookmarksByGroup(bookmark.groupId);
                const isDuplicate = existingBookmarks.some(b =>
                    b.id !== id && b.url.toLowerCase() === this.storage.normalizeUrl(updates.url).toLowerCase()
                );

                if (isDuplicate) {
                    throw new Error('该组中已存在相同网址的书签');
                }
            }

            // 标准化URL
            if (updates.url) {
                updates.url = this.storage.normalizeUrl(updates.url);

                // 如果URL变化且没有提供新图标，尝试从缓存获取
                if (!updates.icon) {
                    const cachedIcon = await this.getIconFromCache(updates.url);
                    if (cachedIcon) {
                        console.log('Reusing cached icon for updated bookmark:', updates.url);
                        updates.icon = cachedIcon;
                    }
                }
            }

            const updatedBookmark = await this.storage.updateBookmark(id, updates);

            if (updatedBookmark) {
                console.log('Bookmark updated:', updatedBookmark);

                // 如果URL发生变化且没有图标，尝试获取新图标
                if (updates.url && updates.url !== bookmark.url && !updatedBookmark.icon) {
                    this.fetchAndUpdateIcon(id);
                }

                return updatedBookmark;
            } else {
                throw new Error('更新书签失败');
            }

        } catch (error) {
            console.error('Failed to update bookmark:', error);
            throw error;
        }
    }

    // ===== 删除书签相关方法 =====

    // 删除书签
    async deleteBookmark(id) {
        try {
            const bookmark = await this.getBookmark(id);
            if (!bookmark) {
                throw new Error('书签不存在');
            }

            const success = await this.storage.deleteBookmark(id);

            if (success) {
                console.log('Bookmark deleted:', id);
                return true;
            } else {
                throw new Error('删除书签失败');
            }

        } catch (error) {
            console.error('Failed to delete bookmark:', error);
            throw error;
        }
    }

    // 批量删除书签
    async deleteMultipleBookmarks(bookmarkIds) {
        try {
            const results = [];

            for (const bookmarkId of bookmarkIds) {
                try {
                    await this.deleteBookmark(bookmarkId);
                    results.push({ bookmarkId, success: true });
                } catch (error) {
                    results.push({
                        bookmarkId,
                        success: false,
                        error: error.message
                    });
                }
            }

            console.log('Batch delete results:', results);
            return results;

        } catch (error) {
            console.error('Failed to delete multiple bookmarks:', error);
            throw error;
        }
    }

    // ===== 书签操作方法 =====

    // 打开书签
    async openBookmark(id, background = false) {
        try {
            const bookmark = await this.getBookmark(id);
            if (!bookmark) {
                throw new Error('书签不存在');
            }

            if (chrome.tabs) {
                if (background) {
                    // 在后台标签页打开
                    chrome.tabs.create({ url: bookmark.url, active: false });
                    console.log('Opening bookmark in background:', bookmark.url);
                } else {
                    // 在当前标签页打开
                    chrome.tabs.create({ url: bookmark.url, active: true });
                    console.log('Opening bookmark:', bookmark.url);
                }
            } else {
                // 备用方法：在新窗口中打开
                window.open(bookmark.url, '_blank');
            }

            return true;

        } catch (error) {
            console.error('Failed to open bookmark:', error);
            throw error;
        }
    }

    // 复制书签URL到剪贴板
    async copyBookmarkUrl(id) {
        try {
            const bookmark = await this.getBookmark(id);
            if (!bookmark) {
                throw new Error('书签不存在');
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(bookmark.url);
                console.log('URL copied to clipboard:', bookmark.url);
                return true;
            } else {
                // 备用方法
                const textArea = document.createElement('textarea');
                textArea.value = bookmark.url;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                textArea.remove();
                return successful;
            }

        } catch (error) {
            console.error('Failed to copy bookmark URL:', error);
            throw error;
        }
    }

    // ===== 图标相关方法 =====

    // 获取书签图标
    async getBookmarkIcon(bookmark) {
        if (bookmark.icon) {
            return bookmark.icon;
        }

        try {
            // 先检查缓存，看是否已经下载过同域名的图标
            const cachedIcon = await this.getIconFromCache(bookmark.url);
            if (cachedIcon) {
                console.log('Using cached icon for:', bookmark.url);
                return cachedIcon;
            }

            // 尝试从background service worker获取图标
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchIcon', url: bookmark.url },
                    (response) => {
                        if (response && response.success) {
                            resolve(response.iconUrl);
                        } else {
                            resolve(null);
                        }
                    }
                );
            });
        } catch (error) {
            console.error('Failed to get bookmark icon:', error);
            return null;
        }
    }

    // 从缓存中获取同域名的图标
    async getIconFromCache(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.origin;
            const hostname = urlObj.hostname; // 主域名，如 trip.larkenterprise.com
            const port = urlObj.port; // 端口号

            // 对于IP地址，我们需要包含端口信息以区分不同的服务
            const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
            const cacheKey = isIP && port ? `${hostname}:${port}` : hostname;

            console.log('[Icon Cache] Checking cache for URL:', url);
            console.log('[Icon Cache] Domain:', domain, 'Hostname:', hostname, 'Port:', port, 'CacheKey:', cacheKey);

            // 查找所有已有图标的书签
            const allBookmarks = await this.getAllBookmarks();
            const bookmarksWithIcons = allBookmarks.filter(b => b.icon);

            console.log('[Icon Cache] Total bookmarks:', allBookmarks.length);
            console.log('[Icon Cache] Bookmarks with icons:', bookmarksWithIcons.length);

            if (bookmarksWithIcons.length > 0) {
                console.log('[Icon Cache] Available icons:', bookmarksWithIcons.map(b => ({
                    url: b.url,
                    icon: b.icon
                })));
            }

            // 策略 1: 完全匹配域名 (origin)
            let cachedBookmark = allBookmarks.find(b => {
                if (!b.icon) return false;
                try {
                    const bUrlObj = new URL(b.url);
                    const match = bUrlObj.origin === domain;
                    if (match) {
                        console.log('[Icon Cache] Strategy 1 matched:', b.url, '→', b.icon);
                    }
                    return match;
                } catch (e) {
                    return false;
                }
            });

            // 策略 2: 对于IP地址，匹配IP:端口；对于域名，匹配主域名
            if (!cachedBookmark) {
                cachedBookmark = allBookmarks.find(b => {
                    if (!b.icon) return false;
                    try {
                        const bUrlObj = new URL(b.url);
                        const bHostname = bUrlObj.hostname;
                        const bPort = bUrlObj.port;

                        if (isIP) {
                            // 对于IP地址，必须匹配IP和端口
                            const bIsIP = /^\d+\.\d+\.\d+\.\d+$/.test(bHostname);
                            const match = bIsIP && bHostname === hostname && bPort === port;
                            if (match) {
                                console.log('[Icon Cache] Strategy 2 (IP) matched:', b.url, '→', b.icon);
                            }
                            return match;
                        } else {
                            // 对于域名，匹配相同的主域名或父域名
                            const match = bHostname === hostname ||
                                hostname.endsWith('.' + bHostname) ||
                                bHostname.endsWith('.' + hostname);
                            if (match) {
                                console.log('[Icon Cache] Strategy 2 (Domain) matched:', b.url, '→', b.icon);
                            }
                            return match;
                        }
                    } catch (e) {
                        return false;
                    }
                });
            }

            if (cachedBookmark) {
                console.log(`[Icon Cache] ✅ Cache HIT for ${url}, reusing icon from ${cachedBookmark.url}`);
                console.log('[Icon Cache] Icon URL:', cachedBookmark.icon);
            } else {
                console.log(`[Icon Cache] ❌ Cache MISS for ${url}`);
            }

            return cachedBookmark ? cachedBookmark.icon : null;
        } catch (error) {
            console.error('[Icon Cache] Error:', error);
            return null;
        }
    }

    // 获取并更新书签图标
    async fetchAndUpdateIcon(bookmarkId) {
        try {
            const bookmark = await this.getBookmark(bookmarkId);
            if (!bookmark) return;

            const iconUrl = await this.getBookmarkIcon(bookmark);
            if (iconUrl) {
                await this.storage.updateBookmark(bookmarkId, { icon: iconUrl });
                console.log('Icon updated for bookmark:', bookmarkId);
            }
        } catch (error) {
            console.error('Failed to fetch and update icon:', error);
        }
    }

    // 刷新书签图标
    async refreshBookmarkIcon(bookmarkId) {
        try {
            await this.storage.updateBookmark(bookmarkId, { icon: null });
            await this.fetchAndUpdateIcon(bookmarkId);
            return true;
        } catch (error) {
            console.error('Failed to refresh bookmark icon:', error);
            throw error;
        }
    }

    // ===== 数据验证方法 =====

    // 验证书签数据
    validateBookmarkData(data) {
        // 验证标题
        if (!data.title || typeof data.title !== 'string') {
            return { valid: false, message: '书签标题不能为空' };
        }

        const trimmedTitle = data.title.trim();
        if (trimmedTitle.length === 0) {
            return { valid: false, message: '书签标题不能为空' };
        }

        if (trimmedTitle.length > 100) {
            return { valid: false, message: '书签标题不能超过100个字符' };
        }

        // 验证URL
        if (!data.url || typeof data.url !== 'string') {
            return { valid: false, message: '网址不能为空' };
        }

        const normalizedUrl = this.storage.normalizeUrl(data.url);
        if (!this.storage.isValidUrl(normalizedUrl)) {
            return { valid: false, message: '请输入有效的网址' };
        }

        // 验证组ID
        if (!data.groupId) {
            return { valid: false, message: '请选择所属分组' };
        }

        return { valid: true, message: '数据有效' };
    }

    // ===== 统计数据方法 =====

    // 获取书签统计信息
    async getBookmarkStats(bookmarkId) {
        try {
            const bookmark = await this.getBookmark(bookmarkId);
            if (!bookmark) {
                return null;
            }

            const groupManager = this.getGroupManager();
            const groupName = groupManager ?
                (await groupManager.getGroup(bookmark.groupId))?.name || 'Unknown' :
                'Unknown';

            return {
                bookmark: bookmark,
                groupName: groupName,
                hasIcon: !!bookmark.icon,
                createdAt: bookmark.createdAt,
                updatedAt: bookmark.updatedAt
            };

        } catch (error) {
            console.error('Failed to get bookmark stats:', error);
            return null;
        }
    }

    // 获取所有书签统计信息
    async getAllBookmarksStats() {
        try {
            const bookmarks = await this.getAllBookmarks();
            const stats = [];

            for (const bookmark of bookmarks) {
                const bookmarkStats = await this.getBookmarkStats(bookmark.id);
                if (bookmarkStats) {
                    stats.push(bookmarkStats);
                }
            }

            return stats;

        } catch (error) {
            console.error('Failed to get all bookmarks stats:', error);
            return [];
        }
    }

    // ===== 排序和过滤方法 =====

    // 排序书签
    async getBookmarksSorted(sortBy = 'title', order = 'asc') {
        const bookmarks = await this.getAllBookmarks();

        const sortedBookmarks = bookmarks.sort((a, b) => {
            let valueA, valueB;

            switch (sortBy) {
                case 'title':
                    valueA = a.title.toLowerCase();
                    valueB = b.title.toLowerCase();
                    break;
                case 'url':
                    valueA = a.url.toLowerCase();
                    valueB = b.url.toLowerCase();
                    break;
                case 'created':
                    valueA = new Date(a.createdAt);
                    valueB = new Date(b.createdAt);
                    break;
                case 'updated':
                    valueA = new Date(a.updatedAt);
                    valueB = new Date(b.updatedAt);
                    break;
                default:
                    valueA = a.title.toLowerCase();
                    valueB = b.title.toLowerCase();
            }

            if (order === 'desc') {
                return valueA < valueB ? 1 : -1;
            } else {
                return valueA > valueB ? 1 : -1;
            }
        });

        return sortedBookmarks;
    }

    // ===== 导出导入方法 =====

    // 导出书签数据
    async exportBookmarks(bookmarkIds = null) {
        try {
            let bookmarks;
            if (bookmarkIds) {
                bookmarks = [];
                for (const bookmarkId of bookmarkIds) {
                    const bookmark = await this.getBookmark(bookmarkId);
                    if (bookmark) {
                        bookmarks.push(bookmark);
                    }
                }
            } else {
                bookmarks = await this.getAllBookmarks();
            }

            return {
                bookmarks: bookmarks,
                exportDate: new Date().toISOString(),
                count: bookmarks.length
            };

        } catch (error) {
            console.error('Failed to export bookmarks:', error);
            throw error;
        }
    }
}

// 等待 storageManager 初始化后创建书签管理器实例
function createBookmarkManager() {
    if (!window.storageManager) {
        console.error('StorageManager not available');
        return null;
    }

    const bookmarkManager = new BookmarkManager();

    // 将管理器暴露到window对象
    if (typeof window !== 'undefined') {
        window.bookmarkManager = bookmarkManager;
    }

    // 导出管理器供模块使用
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { bookmarkManager };
    }

    return bookmarkManager;
}

// 监听 storageManager 就绪事件
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createBookmarkManager);
} else if (window.storageManager) {
    createBookmarkManager();
}