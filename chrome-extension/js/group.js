// Group Management Module
// 处理书签分组的所有操作

class GroupManager {
    constructor() {
        this.storage = storageManager;
    }

    // ===== 获取组相关方法 =====
    
    // 获取所有组
    async getAllGroups() {
        return await this.storage.getGroups();
    }

    // 获取单个组
    async getGroup(id) {
        const groups = await this.getAllGroups();
        return groups.find(group => group.id === id) || null;
    }

    // 获取组的书签数量
    async getGroupBookmarkCount(groupId) {
        const bookmarks = await this.storage.getBookmarksByGroup(groupId);
        return bookmarks.length;
    }

    // ===== 创建组相关方法 =====
    
    // 创建新组
    async createGroup(name) {
        try {
            // 验证输入
            if (!name || typeof name !== 'string') {
                throw new Error('组名不能为空');
            }

            const trimmedName = name.trim();
            if (trimmedName.length === 0) {
                throw new Error('组名不能为空');
            }

            if (trimmedName.length > 50) {
                throw new Error('组名不能超过50个字符');
            }

            // 检查重复组名
            const existingGroups = await this.getAllGroups();
            const isDuplicate = existingGroups.some(group => 
                group.name.toLowerCase() === trimmedName.toLowerCase()
            );

            if (isDuplicate) {
                throw new Error('已存在相同名称的组');
            }

            // 创建新组
            const newGroup = await this.storage.addGroup(trimmedName);
            
            if (newGroup) {
                console.log('New group created:', newGroup);
                return newGroup;
            } else {
                throw new Error('创建组失败');
            }

        } catch (error) {
            console.error('Failed to create group:', error);
            throw error;
        }
    }

    // ===== 更新组相关方法 =====
    
    // 更新组信息
    async updateGroup(id, updates) {
        try {
            const group = await this.getGroup(id);
            if (!group) {
                throw new Error('组不存在');
            }

            // 验证更新数据
            if (updates.name) {
                const trimmedName = updates.name.trim();
                if (trimmedName.length === 0) {
                    throw new Error('组名不能为空');
                }

                if (trimmedName.length > 50) {
                    throw new Error('组名不能超过50个字符');
                }

                // 检查重复组名（排除当前组）
                const existingGroups = await this.getAllGroups();
                const isDuplicate = existingGroups.some(g => 
                    g.id !== id && g.name.toLowerCase() === trimmedName.toLowerCase()
                );

                if (isDuplicate) {
                    throw new Error('已存在相同名称的组');
                }

                updates.name = trimmedName;
            }

            const updatedGroup = await this.storage.updateGroup(id, updates);
            
            if (updatedGroup) {
                console.log('Group updated:', updatedGroup);
                return updatedGroup;
            } else {
                throw new Error('更新组失败');
            }

        } catch (error) {
            console.error('Failed to update group:', error);
            throw error;
        }
    }

    // ===== 删除组相关方法 =====
    
    // 删除组
    async deleteGroup(id, confirmMessage = null) {
        try {
            const group = await this.getGroup(id);
            if (!group) {
                throw new Error('组不存在');
            }

            // 获取组中的书签数量
            const bookmarkCount = await this.getGroupBookmarkCount(id);

            // 如果组中有书签，需要确认
            if (bookmarkCount > 0 && !confirmMessage) {
                throw new Error(`该组中包含 ${bookmarkCount} 个书签，删除组会同时删除所有书签。请确认操作。`);
            }

            // 执行删除
            const success = await this.storage.deleteGroup(id);
            
            if (success) {
                console.log('Group deleted:', id);
                return true;
            } else {
                throw new Error('删除组失败');
            }

        } catch (error) {
            console.error('Failed to delete group:', error);
            throw error;
        }
    }

    // 强制删除组（包括确认处理）
    async forceDeleteGroup(id) {
        try {
            const group = await this.getGroup(id);
            if (!group) {
                throw new Error('组不存在');
            }

            const bookmarkCount = await this.getGroupBookmarkCount(id);
            
            if (bookmarkCount > 0) {
                // 删除组的同时删除所有相关书签
                await this.deleteGroup(id, '已确认删除组及其所有书签');
            } else {
                // 没有书签，直接删除组
                const success = await this.storage.deleteGroup(id);
                if (!success) {
                    throw new Error('删除组失败');
                }
            }

            console.log('Group force deleted:', id);
            return true;

        } catch (error) {
            console.error('Failed to force delete group:', error);
            throw error;
        }
    }

    // ===== 数据验证方法 =====
    
    // 验证组名
    validateGroupName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, message: '组名不能为空' };
        }

        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return { valid: false, message: '组名不能为空' };
        }

        if (trimmedName.length > 50) {
            return { valid: false, message: '组名不能超过50个字符' };
        }

        // 检查特殊字符
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(trimmedName)) {
            return { valid: false, message: '组名不能包含特殊字符' };
        }

        return { valid: true, message: '组名有效' };
    }

    // ===== 统计数据方法 =====
    
    // 获取组统计信息
    async getGroupStats(groupId) {
        try {
            const group = await this.getGroup(groupId);
            if (!group) {
                return null;
            }

            const bookmarks = await this.storage.getBookmarksByGroup(groupId);
            
            return {
                group: group,
                bookmarkCount: bookmarks.length,
                createdAt: group.createdAt,
                updatedAt: group.updatedAt
            };

        } catch (error) {
            console.error('Failed to get group stats:', error);
            return null;
        }
    }

    // 获取所有组的统计信息
    async getAllGroupsStats() {
        try {
            const groups = await this.getAllGroups();
            const stats = [];

            for (const group of groups) {
                const groupStats = await this.getGroupStats(group.id);
                if (groupStats) {
                    stats.push(groupStats);
                }
            }

            return stats;

        } catch (error) {
            console.error('Failed to get all groups stats:', error);
            return [];
        }
    }

    // ===== 排序和过滤方法 =====
    
    // 按名称排序组
    async getGroupsSorted(sortBy = 'name', order = 'asc') {
        const groups = await this.getAllGroups();
        
        const sortedGroups = groups.sort((a, b) => {
            let valueA, valueB;
            
            switch (sortBy) {
                case 'name':
                    valueA = a.name.toLowerCase();
                    valueB = b.name.toLowerCase();
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
                    valueA = a.name.toLowerCase();
                    valueB = b.name.toLowerCase();
            }
            
            if (order === 'desc') {
                return valueA < valueB ? 1 : -1;
            } else {
                return valueA > valueB ? 1 : -1;
            }
        });

        return sortedGroups;
    }

    // 过滤空组
    async getNonEmptyGroups() {
        try {
            const groups = await this.getAllGroups();
            const nonEmptyGroups = [];

            for (const group of groups) {
                const bookmarkCount = await this.getGroupBookmarkCount(group.id);
                if (bookmarkCount > 0) {
                    nonEmptyGroups.push(group);
                }
            }

            return nonEmptyGroups;

        } catch (error) {
            console.error('Failed to get non-empty groups:', error);
            return [];
        }
    }

    // ===== 批量操作方法 =====
    
    // 批量删除组
    async deleteMultipleGroups(groupIds) {
        try {
            const results = [];
            
            for (const groupId of groupIds) {
                try {
                    await this.deleteGroup(groupId);
                    results.push({ groupId, success: true });
                } catch (error) {
                    results.push({ 
                        groupId, 
                        success: false, 
                        error: error.message 
                    });
                }
            }

            console.log('Batch delete results:', results);
            return results;

        } catch (error) {
            console.error('Failed to delete multiple groups:', error);
            throw error;
        }
    }

    // 导出组数据
    async exportGroups(groupIds = null) {
        try {
            let groups;
            if (groupIds) {
                groups = [];
                for (const groupId of groupIds) {
                    const group = await this.getGroup(groupId);
                    if (group) {
                        groups.push(group);
                    }
                }
            } else {
                groups = await this.getAllGroups();
            }

            return {
                groups: groups,
                exportDate: new Date().toISOString(),
                count: groups.length
            };

        } catch (error) {
            console.error('Failed to export groups:', error);
            throw error;
        }
    }
}

// 等待 storageManager 初始化后创建组管理器实例
function createGroupManager() {
    if (!window.storageManager) {
        console.error('StorageManager not available');
        return null;
    }
    
    const groupManager = new GroupManager();
    
    // 将管理器暴露到window对象
    if (typeof window !== 'undefined') {
        window.groupManager = groupManager;
    }
    
    // 导出管理器供模块使用
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { groupManager };
    }
    
    return groupManager;
}

// 监听 storageManager 就绪事件
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createGroupManager);
} else if (window.storageManager) {
    createGroupManager();
}