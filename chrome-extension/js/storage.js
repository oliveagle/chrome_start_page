// Chrome Storage API 数据持久化管理
// 处理Groups, Bookmarks, Settings的存储和检索

class StorageManager {
    constructor() {
        // 检查 chrome.storage 是否可用
        if (typeof chrome === 'undefined' || !chrome.storage) {
            throw new Error('Chrome Storage API not available');
        }

        // 使用不同的存储类型来避免配额限制
        // bookmarks 使用 local storage (10MB 限制)
        // groups 和 settings 使用 sync storage (可跨设备同步)
        this.syncStorage = chrome.storage.sync || chrome.storage.local;
        this.localStorage = chrome.storage.local;

        console.log('Storage initialized: bookmarks -> local, groups/settings -> sync');

        // 自动迁移数据（如果需要）
        this.migrateBookmarksToLocal();
    }

    // 迁移书签从 sync storage 到 local storage
    async migrateBookmarksToLocal() {
        try {
            // 检查 local storage 是否已有书签
            const localData = await this.localStorage.get(['bookmarks']);
            if (localData.bookmarks && localData.bookmarks.length > 0) {
                console.log('[Migration] Bookmarks already in local storage, skipping migration');
                return;
            }

            // 检查 sync storage 是否有书签
            const syncData = await this.syncStorage.get(['bookmarks']);
            if (syncData.bookmarks && syncData.bookmarks.length > 0) {
                console.log(`[Migration] Migrating ${syncData.bookmarks.length} bookmarks from sync to local storage...`);

                // 复制到 local storage
                await this.localStorage.set({ bookmarks: syncData.bookmarks });

                // 从 sync storage 删除（可选，释放配额）
                await this.syncStorage.remove(['bookmarks']);

                console.log('[Migration] Migration completed successfully!');
            } else {
                console.log('[Migration] No bookmarks to migrate');
            }
        } catch (error) {
            console.error('[Migration] Failed to migrate bookmarks:', error);
        }
    }

    // ===== Groups 存储管理 =====

    // 获取所有组
    async getGroups() {
        try {
            const result = await this.syncStorage.get(['groups']);
            return result.groups || [];
        } catch (error) {
            console.error('Failed to get groups:', error);
            return [];
        }
    }

    // 保存组列表
    async saveGroups(groups) {
        try {
            await this.syncStorage.set({ groups });
            console.log('Groups saved successfully');
            return true;
        } catch (error) {
            console.error('Failed to save groups:', error);
            return false;
        }
    }

    // 添加新组
    async addGroup(name) {
        const groups = await this.getGroups();
        const newGroup = {
            id: this.generateId(),
            name: name.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        groups.push(newGroup);
        const success = await this.saveGroups(groups);

        if (success) {
            return newGroup;
        }
        return null;
    }

    // 更新组信息
    async updateGroup(id, updates) {
        const groups = await this.getGroups();
        const groupIndex = groups.findIndex(group => group.id === id);

        if (groupIndex === -1) {
            throw new Error('Group not found');
        }

        groups[groupIndex] = {
            ...groups[groupIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        const success = await this.saveGroups(groups);

        if (success) {
            return groups[groupIndex];
        }
        return null;
    }

    // 删除组及其所有书签
    async deleteGroup(id) {
        const groups = await this.getGroups();
        const bookmarks = await this.getBookmarks();

        // 过滤出要删除的组
        const filteredGroups = groups.filter(group => group.id !== id);

        // 删除该组的所有书签
        const filteredBookmarks = bookmarks.filter(bookmark => bookmark.groupId !== id);

        // 同时保存两组数据
        const success = await Promise.all([
            this.saveGroups(filteredGroups),
            this.saveBookmarks(filteredBookmarks)
        ]);

        return success.every(s => s);
    }

    // ===== Bookmarks 存储管理 =====

    // 获取所有书签
    async getBookmarks() {
        try {
            const result = await this.localStorage.get(['bookmarks']);
            return result.bookmarks || [];
        } catch (error) {
            console.error('Failed to get bookmarks:', error);
            return [];
        }
    }

    // 保存书签列表
    async saveBookmarks(bookmarks) {
        try {
            const size = this.estimateStorageSize(bookmarks);
            console.log(`[Storage] Saving ${bookmarks.length} bookmarks to LOCAL storage, size: ${size} bytes (${(size / 1024).toFixed(2)} KB)`);

            await this.localStorage.set({ bookmarks });
            console.log('Bookmarks saved successfully to local storage');
            return true;
        } catch (error) {
            console.error('Failed to save bookmarks:', error);

            // 如果是配额错误，提供详细信息
            if (error.message && error.message.includes('quota')) {
                const size = this.estimateStorageSize(bookmarks);
                console.error(`[Storage] Quota exceeded! Bookmarks size: ${size} bytes (${(size / 1024).toFixed(2)} KB)`);
                console.error('[Storage] Tip: Check for bookmarks with data URL icons or very long URLs');

                // 列出最大的书签
                const bookmarkSizes = bookmarks.map(b => ({
                    title: b.title,
                    size: this.estimateStorageSize(b),
                    hasDataUrl: this.isDataUrl(b.icon)
                })).sort((a, b) => b.size - a.size);

                console.error('[Storage] Largest bookmarks:', bookmarkSizes.slice(0, 5));
            }

            return false;
        }
    }

    // 添加新书签
    async addBookmark(bookmarkData) {
        const bookmarks = await this.getBookmarks();

        // 验证并清理图标数据
        let iconUrl = bookmarkData.icon || null;
        if (iconUrl && this.isDataUrl(iconUrl)) {
            console.warn('[Storage] Rejecting data URL for icon, too large for storage:', iconUrl.substring(0, 50) + '...');
            iconUrl = null; // 不存储 base64 data URLs
        }

        const newBookmark = {
            id: this.generateId(),
            title: bookmarkData.title.trim(),
            url: this.normalizeUrl(bookmarkData.url),
            groupId: bookmarkData.groupId,
            icon: iconUrl,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        bookmarks.push(newBookmark);

        const success = await this.saveBookmarks(bookmarks);

        if (success) {
            return newBookmark;
        }
        return null;
    }

    // 更新书签信息
    async updateBookmark(id, updates) {
        const bookmarks = await this.getBookmarks();
        const bookmarkIndex = bookmarks.findIndex(bookmark => bookmark.id === id);

        if (bookmarkIndex === -1) {
            throw new Error('Bookmark not found');
        }

        bookmarks[bookmarkIndex] = {
            ...bookmarks[bookmarkIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        const success = await this.saveBookmarks(bookmarks);

        if (success) {
            return bookmarks[bookmarkIndex];
        }
        return null;
    }

    // 删除书签
    async deleteBookmark(id) {
        const bookmarks = await this.getBookmarks();
        const filteredBookmarks = bookmarks.filter(bookmark => bookmark.id !== id);

        const success = await this.saveBookmarks(filteredBookmarks);
        return success;
    }

    // 根据组ID获取书签
    async getBookmarksByGroup(groupId) {
        const bookmarks = await this.getBookmarks();
        return bookmarks.filter(bookmark => bookmark.groupId === groupId);
    }

    // ===== Settings 存储管理 =====

    // 获取设置
    async getSettings() {
        try {
            const result = await this.syncStorage.get(['settings']);
            return result.settings || this.getDefaultSettings();
        } catch (error) {
            console.error('Failed to get settings:', error);
            return this.getDefaultSettings();
        }
    }

    // 保存设置
    async saveSettings(settings) {
        try {
            const currentSettings = await this.getSettings();
            const newSettings = { ...currentSettings, ...settings };
            await this.syncStorage.set({ settings: newSettings });
            console.log('Settings saved successfully');
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            return false;
        }
    }

    // 默认设置
    getDefaultSettings() {
        return {
            theme: 'default',
            background: 'gradient',
            backgroundImage: null,
            showEmptyGroups: true,
            iconSize: '16px',
            layout: 'grid',
            autoFetchIcons: true,
        };
    }

    // ===== 工具方法 =====

    // 检查是否为 data URL (base64)
    isDataUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return url.startsWith('data:');
    }

    // 估算对象的存储大小（字节）
    estimateStorageSize(obj) {
        return new Blob([JSON.stringify(obj)]).size;
    }

    // 生成唯一ID
    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // 标准化URL
    normalizeUrl(url) {
        if (!url) return '';

        let normalized = url.trim();

        // 如果没有协议，添加https://
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'https://' + normalized;
        }

        return normalized;
    }

    // 验证URL格式
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch {
            return false;
        }
    }

    // ===== 数据导出/导入 =====

    // 导出所有数据
    async exportData() {
        const data = {
            groups: await this.getGroups(),
            bookmarks: await this.getBookmarks(),
            settings: await this.getSettings(),
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };

        return data;
    }

    // 导入数据
    async importData(data) {
        try {
            // 验证导入数据的结构
            if (!data.groups || !data.bookmarks || !data.settings) {
                throw new Error('Invalid data structure');
            }

            // 保存数据
            await Promise.all([
                this.saveGroups(data.groups),
                this.saveBookmarks(data.bookmarks),
                this.saveSettings(data.settings)
            ]);

            console.log('Data imported successfully');
            return true;
        } catch (error) {
            console.error('Failed to import data:', error);
            return false;
        }
    }

    // ===== 清理和重置 =====

    // 清空所有数据
    async clearAllData() {
        try {
            await chrome.storage[this.storageType].clear();
            console.log('All data cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear data:', error);
            return false;
        }
    }

    // 重置为默认设置
    async resetToDefaults() {
        try {
            await this.saveSettings(this.getDefaultSettings());
            console.log('Settings reset to defaults');
            return true;
        } catch (error) {
            console.error('Failed to reset settings:', error);
            return false;
        }
    }

    // ===== 监听存储变化 =====

    // 设置存储变化监听器
    onStorageChange(callback) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            // 监听 sync storage (groups, settings) 和 local storage (bookmarks)
            if (areaName === 'sync' || areaName === 'local') {
                callback(changes);
            }
        });
    }
}

// 等待 DOM 加载完成后创建实例
function createStorageManager() {
    try {
        const manager = new StorageManager();

        // 将管理器暴露到 window 对象
        if (typeof window !== 'undefined') {
            window.storageManager = manager;
        }

        // 导出管理器供模块使用
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = { storageManager: manager };
        }

        return manager;
    } catch (error) {
        console.error('Failed to create StorageManager:', error);

        // 返回一个模拟的管理器，避免应用崩溃
        const mockManager = {
            getGroups: () => Promise.resolve([]),
            getBookmarks: () => Promise.resolve([]),
            getSettings: () => Promise.resolve({}),
            addGroup: () => Promise.reject(new Error('Storage not available')),
            addBookmark: () => Promise.reject(new Error('Storage not available')),
            onStorageChange: () => { }
        };

        if (typeof window !== 'undefined') {
            window.storageManager = mockManager;
        }

        return mockManager;
    }
}

// 立即初始化 StorageManager (在 Chrome Extension 环境中)
if (typeof chrome !== 'undefined' && chrome.storage) {
    createStorageManager();
} else {
    // 在普通浏览器环境中等待 DOM 加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createStorageManager);
    } else {
        createStorageManager();
    }
}