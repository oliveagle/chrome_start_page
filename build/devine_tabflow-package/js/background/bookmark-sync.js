// devine_tabflow - bookmark-sync module
// 从 background.js 拆分 (26 个函数)
// 通过 self.bookmarksync = { ... } 暴露,service-worker 用 importScripts 加载
(function (self) {
    'use strict';

    // 根文件夹候选名（新名优先，旧名兼容老用户数据）
    const ROOT_FOLDER_CANDIDATES = ['devine_tabflow', 'Chrome Start Page Bookmarks'];

    const BookmarkSync = {};

    BookmarkSync.findOrCreateBookmarkFolder = async function findOrCreateBookmarkFolder(
        folderName,
        parentId = null
    ) {
        try {
            console.log(
                '[Bookmark Folder] Finding or creating folder:',
                folderName,
                'with parentId:',
                parentId
            );

            // 查找现有的文件夹
            // 注意：chrome.bookmarks.search 对 parentId 参数有一些限制，我们只按标题搜索
            const existingFolders = await chrome.bookmarks.search({ title: folderName });

            // 如果指定了 parentId，需要进一步过滤结果
            let filteredFolders = existingFolders;
            if (parentId) {
                filteredFolders = existingFolders.filter((folder) => folder.parentId === parentId);
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
                parentId: parentId,
            });
            console.log('[Bookmark Folder] Created new folder:', newFolder);

            return { ...newFolder, __created: true };
        } catch (error) {
            console.error('[Bookmark Folder] Failed to find or create bookmark folder:', error);
            throw error;
        }
    };

    BookmarkSync.createOrUpdateChromeBookmark = async function createOrUpdateChromeBookmark(
        bookmark,
        parentId
    ) {
        try {
            console.log(
                '[Bookmark Item] Creating or updating bookmark:',
                bookmark.title,
                bookmark.url,
                'in folder:',
                parentId
            );

            // 查找是否已存在相同的书签
            const existingBookmarks = await chrome.bookmarks.search({
                url: bookmark.url,
            });
            console.log(
                '[Bookmark Item] Found existing bookmarks with same URL:',
                existingBookmarks
            );

            // 过滤出在指定父文件夹中的书签
            const bookmarksInFolder = existingBookmarks.filter((b) => b.parentId === parentId);
            console.log('[Bookmark Item] Found bookmarks in same folder:', bookmarksInFolder);

            if (bookmarksInFolder.length > 0) {
                // 更新现有书签
                console.log('[Bookmark Item] Updating existing bookmark:', bookmarksInFolder[0].id);
                const updated = await chrome.bookmarks.update(bookmarksInFolder[0].id, {
                    title: bookmark.title,
                });
                console.log('[Bookmark Item] Updated bookmark successfully');
                return { ...updated, __created: false };
            } else {
                // 创建新书签
                console.log('[Bookmark Item] Creating new bookmark');
                const created = await chrome.bookmarks.create({
                    title: bookmark.title,
                    url: bookmark.url,
                    parentId: parentId,
                });
                console.log('[Bookmark Item] Created bookmark successfully');
                return { ...created, __created: true };
            }
        } catch (error) {
            console.error('[Bookmark Item] Failed to create or update Chrome bookmark:', error);
            return null;
        }
    };

    BookmarkSync.syncBookmarksToChrome = async function syncBookmarksToChrome() {
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
                return {
                    success: false,
                    reason: 'DISABLED',
                    hint: '请先在设置中启用"同步书签到Chrome原生书签管理器"。',
                };
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

            // 查找或创建根文件夹（兼容旧版 'Chrome Start Page Bookmarks'）
            const rootFolder = await ensureRootBookmarkFolder();
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
                const groupBookmarks = customBookmarks.filter((b) => b.groupId === group.id);
                console.log(
                    '[Bookmark Sync] Bookmarks in group',
                    group.name,
                    ':',
                    groupBookmarks.length
                );

                // 同步书签到对应的分组文件夹
                for (const bookmark of groupBookmarks) {
                    console.log(
                        '[Bookmark Sync] Creating/updating bookmark:',
                        bookmark.title,
                        bookmark.url
                    );
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
                totalBookmarks: customBookmarks.length,
            };
        } catch (error) {
            console.error('[Bookmark Sync] Failed to sync bookmarks to Chrome:', error);
            throw error;
        } finally {
            isSyncing = false;
        }
    };

    BookmarkSync.syncBookmarksFromChrome = async function syncBookmarksFromChrome() {
        if (isSyncing) {
            return { success: false, reason: 'ALREADY_SYNCING' };
        }

        try {
            console.log('[Reverse Sync] Starting reverse sync process');

            isSyncing = true;

            // 查找根文件夹（按新名+旧名依次搜，找到任一即用；都找不到才报错）
            const matched = await BookmarkSync.findRootBookmarkFolder();
            const existingFolders = matched ? [matched] : [];
            const rootFolderName = existingFolders[0]
                ? existingFolders[0].title
                : ROOT_FOLDER_CANDIDATES[0];

            if (!existingFolders || existingFolders.length === 0) {
                console.log('[Reverse Sync] Root folder not found, nothing to sync');
                return {
                    success: false,
                    reason: 'ROOT_FOLDER_NOT_FOUND',
                    folderName: rootFolderName,
                    hint:
                        '请确认 Chrome 书签中存在名为 "' +
                        ROOT_FOLDER_CANDIDATES[0] +
                        '"（或旧版 "' +
                        ROOT_FOLDER_CANDIDATES[1] +
                        '"）的文件夹，或在 chrome://bookmarks 中新建后重试。',
                };
            }

            if (existingFolders.length > 1) {
                console.log(
                    '[Reverse Sync] Multiple folders with same name found:',
                    existingFolders.length
                );
                return {
                    success: false,
                    reason: 'DUPLICATE_FOLDERS',
                    folderName: rootFolderName,
                    folders: existingFolders.map((f) => ({
                        id: f.id,
                        title: f.title,
                        parentId: f.parentId,
                    })),
                    hint: '检测到多个同名文件夹，请先在 chrome://bookmarks 中重命名其中之一或删除多余项。',
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
            const allChildren = subNodes[0].children.map((node, idx) => ({
                ...node,
                _chromeIndex: idx,
            }));
            const chromeGroups = allChildren.filter(
                (node) => !node.url && node.title !== QUEUE_FOLDER
            ); // 文件夹作为分组

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
                let group = currentGroups.find((g) => g.name === chromeGroup.title);
                if (!group) {
                    group = {
                        id: 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name: chromeGroup.title,
                        order: chromeGroup._chromeIndex, // 沿用 Chrome 那边的位置
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
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
                        if (chromeBookmark.url) {
                            // 只处理书签，忽略子文件夹
                            let bookmark = currentBookmarks.find(
                                (b) => b.url === chromeBookmark.url && b.groupId === group.id
                            );

                            if (!bookmark) {
                                bookmark = {
                                    id:
                                        'id_' +
                                        Date.now() +
                                        '_' +
                                        Math.random().toString(36).substr(2, 9),
                                    title: chromeBookmark.title,
                                    url: chromeBookmark.url,
                                    groupId: group.id,
                                    icon: null, // 不从Chrome书签导入图标
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString(),
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
            currentGroups = currentGroups.filter((g) => !internalTitles.has(g.name));
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
                addedBookmarks,
            };
        } catch (error) {
            console.error('[Reverse Sync] Failed to sync from Chrome:', error);
            throw error;
        } finally {
            isSyncing = false;
        }
    };

    BookmarkSync.scanChromeBookmarkTree = async function scanChromeBookmarkTree() {
        const ids = await getQueueFolderIds();
        if (!ids) return { groups: [], bookmarks: [] };

        // 找根文件夹
        const roots = await chrome.bookmarks.search({ title: ROOT_FOLDER_CANDIDATES[0] });
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
                                groupChromeId: child.id,
                            });
                        }
                    }
                }
            }
        }
        return { groups, bookmarks };
    };

    BookmarkSync.cleanupInternalGroups = async function cleanupInternalGroups() {
        const INTERNAL_TITLES = ['__op_queue__'];
        try {
            const r = await chrome.storage.sync.get(['groups']);
            const groups = r.groups || [];
            const filtered = groups.filter((g) => !INTERNAL_TITLES.includes(g.name));
            if (filtered.length !== groups.length) {
                await chrome.storage.sync.set({ groups: filtered });
                console.log(
                    '[Cleanup] Removed',
                    groups.length - filtered.length,
                    'internal groups'
                );
                return groups.length - filtered.length;
            }
        } catch (e) {
            console.error('[Cleanup] error:', e);
        }
        return 0;
    };

    BookmarkSync.pushGroupAdd = async function pushGroupAdd(op) {
        const ids = await getQueueFolderIds();
        if (!ids) throw new Error('root folder not ready');
        const rootId = ids.rootFolderId;
        // 找一个未占用的 group folder 名称（同 name 可能有多个 add op）
        const group = op.payload;
        const existing = await findChromeFolderByName(group.name, rootId);
        if (existing) {
            console.log(
                '[OpProcessor] push group add: folder already exists',
                group.name,
                existing.id
            );
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
    };

    BookmarkSync.pushGroupUpdate = async function pushGroupUpdate(op) {
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
    };

    BookmarkSync.pushGroupRemove = async function pushGroupRemove(op) {
        const ids = await getQueueFolderIds();
        if (!ids) return; // 没初始化就不管
        const rootId = ids.rootFolderId;
        const folder = await findChromeFolderByName(op.payload.name || '', rootId);
        // 注意：payload 里只有 id，没有 name；这里需要在 storage 里再查一次
        if (folder) {
            try {
                await chrome.bookmarks.removeTree(folder.id);
            } catch (e) {
                /* ignore */
            }
        }
    };

    BookmarkSync.pullGroupFromChrome = async function pullGroupFromChrome(op) {
        const payload = op.payload || {};
        const groups = await _getExtGroups();
        const chromeId = payload.chromeId;

        if (op.type === 'add') {
            // payload 包含 name
            let g = groups.find((x) => x.chromeId === chromeId);
            if (!g) {
                g = {
                    id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    name: payload.name || 'Untitled',
                    chromeId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                groups.push(g);
                await _saveExtGroups(groups);
            }
        } else if (op.type === 'update') {
            const g = groups.find((x) => x.chromeId === chromeId);
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
                    id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    name: payload.name || 'Untitled',
                    chromeId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                await _saveExtGroups(groups);
            }
        } else if (op.type === 'remove') {
            const newGroups = groups.filter((x) => x.chromeId !== chromeId);
            await _saveExtGroups(newGroups);
        }
    };

    BookmarkSync.pushBookmarkAdd = async function pushBookmarkAdd(op) {
        const ids = await getQueueFolderIds();
        if (!ids) throw new Error('root folder not ready');
        const rootId = ids.rootFolderId;
        const bookmark = op.payload;
        // 找到 group 对应的 chrome folder
        const groups = await _getExtGroups();
        const group = groups.find((g) => g.id === bookmark.groupId);
        if (!group) {
            console.warn('[OpProcessor] push bookmark add: group not found', bookmark.groupId);
            return;
        }
        const groupFolder = await findChromeFolderByName(group.name, rootId);
        if (!groupFolder) {
            // group folder 还没建，先建
            const created = await chrome.bookmarks.create({ title: group.name, parentId: rootId });
            // 顺便记一下 group folder 创建
            console.log(
                '[OpProcessor] push bookmark add: created missing group folder',
                group.name
            );
            await chrome.bookmarks.create({
                title: bookmark.title,
                url: bookmark.url,
                parentId: created.id,
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
            parentId: groupFolder.id,
        });
    };

    BookmarkSync.pushBookmarkUpdate = async function pushBookmarkUpdate(op) {
        const ids = await getQueueFolderIds();
        if (!ids) throw new Error('root folder not ready');
        const rootId = ids.rootFolderId;
        const bookmark = op.payload;
        const groups = await _getExtGroups();
        const group = groups.find((g) => g.id === bookmark.groupId);
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
                parentId: groupFolder.id,
            });
        }
    };

    BookmarkSync.pushBookmarkRemove = async function pushBookmarkRemove(op) {
        const ids = await getQueueFolderIds();
        if (!ids) return;
        const rootId = ids.rootFolderId;
        const bookmarks = await _getExtBookmarks();
        // pull 时已经移除，这里直接尝试按 url 找
        const all = await chrome.bookmarks.getRecent(1000);
        // 更稳：通过 trash 里有 payload
        return; // trash 已经处理了真实删除（如果 chrome 那边被删过的话）
    };

    BookmarkSync.pullBookmarkFromChrome = async function pullBookmarkFromChrome(op) {
        const payload = op.payload || {};
        const bookmarks = await _getExtBookmarks();
        const chromeId = payload.chromeId;

        if (op.type === 'add' || op.type === 'update') {
            let b = bookmarks.find((x) => x.chromeId === chromeId);
            if (!b) {
                b = {
                    id: 'b_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    title: payload.title || '',
                    url: payload.url || '',
                    groupChromeId: payload.groupChromeId || null,
                    chromeId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
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
            const newBookmarks = bookmarks.filter((x) => x.chromeId !== chromeId);
            await _saveExtBookmarks(newBookmarks);
        }
    };

    BookmarkSync.initializeDefaultData = async function initializeDefaultData() {
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
                        showEmptyGroups: true,
                    },
                });
                console.log('Default data initialized');
            }
        } catch (error) {
            console.error('Failed to initialize default data:', error);
        }
    };

    BookmarkSync.findRootBookmarkFolder = async function findRootBookmarkFolder() {
        for (const name of ROOT_FOLDER_CANDIDATES) {
            const found = await chrome.bookmarks.search({ title: name });
            if (found && found.length > 0) return found[0];
        }
        return null;
    };

    BookmarkSync.ensureRootBookmarkFolder = async function ensureRootBookmarkFolder() {
        const existing = await BookmarkSync.findRootBookmarkFolder();
        if (existing) return existing;
        return await chrome.bookmarks.create({ title: ROOT_FOLDER_CANDIDATES[0] });
    };

    BookmarkSync.getQueueFolderIds = async function getQueueFolderIds() {
        if (cachedQueueFolderId && cachedQueueFolderRootId) {
            return { queueFolderId: cachedQueueFolderId, rootFolderId: cachedQueueFolderRootId };
        }
        // 找根文件夹
        const roots = await chrome.bookmarks.search({ title: ROOT_FOLDER_CANDIDATES[0] });
        if (!roots || roots.length === 0) return null;
        const root = roots[0];
        cachedQueueFolderRootId = root.id;
        // 在根目录下找 __op_queue__
        const subs = await chrome.bookmarks.getChildren(root.id);
        const q = subs.find((s) => s.title === '__op_queue__' && !s.url);
        if (q) cachedQueueFolderId = q.id;
        return { queueFolderId: cachedQueueFolderId, rootFolderId: root.id };
    };

    BookmarkSync.isOwnOpBookmark = async function isOwnOpBookmark(bookmarkId) {
        const ids = await getQueueFolderIds();
        if (!ids || !ids.queueFolderId) return false;
        try {
            const node = await chrome.bookmarks.get(bookmarkId);
            if (!node) return false;
            // 在队列文件夹下 → 必然是自己入队的 op
            if (node.parentId === ids.queueFolderId) return true;
            return false;
        } catch (e) {
            return false;
        }
    };

    BookmarkSync.findChromeFolderByName = async function findChromeFolderByName(name, parentId) {
        try {
            const query = parentId !== undefined ? { title: name } : { title: name };
            const found = await chrome.bookmarks.search(query);
            if (!found || found.length === 0) return null;
            // 过滤：在指定 parent 下的文件夹
            const matches =
                parentId !== undefined
                    ? found.filter((f) => f.parentId === parentId && !f.url)
                    : found.filter((f) => !f.url);
            return matches.length > 0 ? matches[0] : null;
        } catch (e) {
            return null;
        }
    };

    BookmarkSync.findChromeBookmarkByUrl = async function findChromeBookmarkByUrl(url, parentId) {
        try {
            const found = await chrome.bookmarks.search({ url });
            if (!found) return null;
            const matches =
                parentId !== undefined
                    ? found.filter((b) => b.parentId === parentId && b.url)
                    : found.filter((b) => b.url);
            return matches.length > 0 ? matches[0] : null;
        } catch (e) {
            return null;
        }
    };

    BookmarkSync.moveChromeFolderToOrder = async function moveChromeFolderToOrder(
        rootId,
        folderId,
        targetOrder
    ) {
        try {
            const siblings = await chrome.bookmarks.getChildren(rootId);
            // 过滤出非 __op_queue__ 的 group folder
            const groupFolders = siblings.filter((s) => !s.url && s.title !== '__op_queue__');
            const currentIdx = groupFolders.findIndex((s) => s.id === folderId);
            if (currentIdx === -1) return;
            const desiredIdx = Math.max(0, Math.min(targetOrder, groupFolders.length - 1));
            if (currentIdx === desiredIdx) return;
            // chrome.bookmarks.move 的 parentId+index 接受 index 为 0..N
            await chrome.bookmarks.move(folderId, { parentId: rootId, index: desiredIdx });
            console.log('[OpProcessor] moved folder to order', desiredIdx);
        } catch (e) {
            console.warn('[OpProcessor] moveChromeFolderToOrder failed:', e.message);
        }
    };

    BookmarkSync._getExtGroups = async function _getExtGroups() {
        const r = await chrome.storage.sync.get(['groups']);
        return r.groups || [];
    };

    BookmarkSync._getExtBookmarks = async function _getExtBookmarks() {
        const r = await chrome.storage.local.get(['bookmarks']);
        return r.bookmarks || [];
    };

    BookmarkSync._saveExtGroups = async function _saveExtGroups(groups) {
        await chrome.storage.sync.set({ groups });
    };

    BookmarkSync._saveExtBookmarks = async function _saveExtBookmarks(bookmarks) {
        await chrome.storage.local.set({ bookmarks });
    };

    self.BookmarkSync = BookmarkSync;
    console.log('[background/bookmark-sync.js] loaded (26 functions)');
})(self);
