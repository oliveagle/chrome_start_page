// Chrome Storage API 数据持久化管理
// 处理Groups, Bookmarks, Settings的存储和检索

class StorageManager {
    constructor() {
        this.storageType = chrome.storage.sync ? 'sync' : 'local';
        console.log(`Using ${this.storageType} storage`);
    }

    // ===== Groups 存储管理 =====
    
    // 获取所有组
    async getGroups() {
        try {
            const result = await chrome.storage[this.storageType].get(['groups']);
            return result.groups || [];
        } catch (error) {
            console.error('Failed to get groups:', error);
            return [];
        }
    }

    // 保存组列表
    async saveGroups(groups) {
        try {
            await chrome.storage[this.storageType].set({ groups });
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
            const result = await chrome.storage[this.storageType].get(['bookmarks']);
            return result.bookmarks || [];
        } catch (error) {
            console.error('Failed to get bookmarks:', error);
            return [];
        }
    }

    // 保存书签列表
    async saveBookmarks(bookmarks) {
        try {
            await chrome.storage[this.storageType].set({ bookmarks });
            console.log('Bookmarks saved successfully');
            return true;
        } catch (error) {
            console.error('Failed to save bookmarks:', error);
            return false;
        }
    }

    // 添加新书签
    async addBookmark(bookmarkData) {
        const bookmarks = await this.getBookmarks();
        const newBookmark = {
            id: this.generateId(),
            title: bookmarkData.title.trim(),
            url: this.normalizeUrl(bookmarkData.url),
            groupId: bookmarkData.groupId,
            icon: bookmarkData.icon || null,
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
            const result = await chrome.storage[this.storageType].get(['settings']);
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
            await chrome.storage[this.storageType].set({ settings: newSettings });
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
            autoFetchIcons: true
        };
    }

    // ===== 工具方法 =====
    
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
            if (areaName === this.storageType) {
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
            onStorageChange: () => {}
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