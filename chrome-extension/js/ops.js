// BookmarkQueue —— 用 Chrome 书签文件夹本身做操作队列
// 队列项是真实书签，存在 __op_queue__ 文件夹下
// 优势：天然随 Chrome 账户跨设备同步

(function (global) {
    'use strict';

    const QUEUE_FOLDER_TITLE = '__op_queue__';    // 队列文件夹名（双下划线包裹便于识别）
    const OP_URL_PREFIX = 'chrome-extension-op://'; // op 书签的 url 前缀
    const OP_TITLE_PREFIX = '[op]';               // op 书签的 title 前缀（用户在 chrome://bookmarks 里看到时知道是队列项）
    const OP_FAILED_PREFIX = '[op-failed]';       // 失败的 op 改名加这个前缀
    const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const SNAPSHOT_DEBOUNCE_MS = 5 * 60 * 1000;
    const MAX_QUEUE = 500;

    function nowMs() { return Date.now(); }
    function genId() { return nowMs() + '_' + Math.random().toString(36).substr(2, 6); }

    // ----- URL 编解码 -----
    // 书签 url 形如：chrome-extension-op://push/add/bookmark/<id>?payload=<base64-json>&ts=<ms>&opId=<x>
    function encodeOpUrl(direction, type, target, refId, payload) {
        const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload || {}))));
        return `${OP_URL_PREFIX}${direction}/${type}/${target}/${encodeURIComponent(refId || '')}?payload=${payloadStr}&ts=${nowMs()}&opId=${genId()}`;
    }

    function decodeOpUrl(url) {
        if (!url || !url.startsWith(OP_URL_PREFIX)) return null;
        try {
            const stripped = url.slice(OP_URL_PREFIX.length);
            const [path, query] = stripped.split('?');
            const parts = path.split('/');
            if (parts.length < 4) return null;
            const [direction, type, target, refIdEnc] = parts;
            const refId = decodeURIComponent(refIdEnc || '');
            const params = new URLSearchParams(query || '');
            const payloadStr = params.get('payload') || '';
            const ts = parseInt(params.get('ts') || '0', 10);
            const opId = params.get('opId') || '';
            let payload = {};
            try { payload = JSON.parse(decodeURIComponent(escape(atob(payloadStr)))); } catch (e) { payload = {}; }
            return { direction, type, target, refId, payload, ts, opId, url };
        } catch (e) {
            console.error('[BookmarkQueue] decodeOpUrl failed', e);
            return null;
        }
    }

    // ----- 队列文件夹定位 -----
    // 队列文件夹在 "Chrome Start Page Bookmarks" 根目录下
    async function findOrCreateRootFolder() {
        const rootName = 'Chrome Start Page Bookmarks';
        let roots = await chrome.bookmarks.search({ title: rootName });
        if (!roots || roots.length === 0) {
            // 根文件夹还没有，先创建
            const created = await chrome.bookmarks.create({ title: rootName, parentId: undefined });
            roots = [created];
        } else if (roots.length > 1) {
            // 多个同名根：取第一个（重复检测交给 syncBookmarksFromChrome 处理）
            roots = [roots[0]];
        }
        return roots[0];
    }

    async function findOrCreateQueueFolder() {
        const root = await findOrCreateRootFolder();
        // 在根目录下找 __op_queue__
        const subs = await chrome.bookmarks.getChildren(root.id);
        let queueFolder = subs.find(s => s.title === QUEUE_FOLDER_TITLE && !s.url);
        if (!queueFolder) {
            queueFolder = await chrome.bookmarks.create({
                title: QUEUE_FOLDER_TITLE,
                parentId: root.id
            });
            console.log('[BookmarkQueue] Created queue folder:', queueFolder.id);
        }
        return queueFolder;
    }

    // ----- BookmarkQueue 主类 -----
    class BookmarkQueue {
        constructor() {
            this._queueFolderId = null;
        }

        async _ensureFolder() {
            if (!this._queueFolderId) {
                const f = await findOrCreateQueueFolder();
                this._queueFolderId = f.id;
            }
            return this._queueFolderId;
        }

        // 入队一个 op
        async enqueue(op) {
            try {
                const folderId = await this._ensureFolder();
                const direction = op.direction;   // 'push' | 'pull'
                const type = op.type;             // 'add' | 'update' | 'remove'
                const target = op.target;         // 'group' | 'bookmark'
                const refId = op.refId;
                const payload = op.payload || {};

                const url = encodeOpUrl(direction, type, target, refId, payload);
                const title = `${OP_TITLE_PREFIX} ${direction}/${type}/${target}/${refId.slice(0, 8)}`;
                const created = await chrome.bookmarks.create({
                    title,
                    url,
                    parentId: folderId
                });
                console.log('[BookmarkQueue] enqueued:', created.title, created.url);
                return { id: created.id, url };
            } catch (e) {
                console.error('[BookmarkQueue] enqueue failed', e);
                throw e;
            }
        }

        // 拿所有 pending op（按 ts 升序）
        async pending() {
            try {
                const folderId = await this._ensureFolder();
                const items = await chrome.bookmarks.getChildren(folderId);
                const ops = [];
                for (const item of items) {
                    if (!item.url) continue; // 跳过子文件夹（理论上不会有）
                    if (item.title.startsWith(OP_FAILED_PREFIX)) continue; // 失败的另外处理
                    const decoded = decodeOpUrl(item.url);
                    if (!decoded) continue;
                    decoded.chromeId = item.id;
                    ops.push(decoded);
                }
                return ops.sort((a, b) => a.ts - b.ts);
            } catch (e) {
                console.error('[BookmarkQueue] pending failed', e);
                return [];
            }
        }

        // 拿所有 failed op
        async failed() {
            try {
                const folderId = await this._ensureFolder();
                const items = await chrome.bookmarks.getChildren(folderId);
                const ops = [];
                for (const item of items) {
                    if (!item.url || !item.title.startsWith(OP_FAILED_PREFIX)) continue;
                    const decoded = decodeOpUrl(item.url);
                    if (!decoded) continue;
                    decoded.chromeId = item.id;
                    decoded.failed = true;
                    ops.push(decoded);
                }
                return ops.sort((a, b) => a.ts - b.ts);
            } catch (e) {
                console.error('[BookmarkQueue] failed() error', e);
                return [];
            }
        }

        // 删除一个 op（成功消费后调用）
        async remove(chromeId) {
            try {
                await chrome.bookmarks.remove(chromeId);
            } catch (e) {
                console.error('[BookmarkQueue] remove failed', chromeId, e);
            }
        }

        // 标记失败：把 title 改成 [op-failed]，保留在队列里
        async markFailed(chromeId, errorMsg) {
            try {
                const node = await chrome.bookmarks.get(chromeId);
                if (!node) return;
                const newTitle = node.title.startsWith(OP_FAILED_PREFIX)
                    ? node.title
                    : node.title.replace(OP_TITLE_PREFIX, OP_FAILED_PREFIX);
                await chrome.bookmarks.update(chromeId, {
                    title: newTitle + ' #' + (errorMsg || 'err').slice(0, 30)
                });
            } catch (e) {
                console.error('[BookmarkQueue] markFailed error', e);
            }
        }

        // 清空整个队列（危险操作，给设置面板的"清空队列"按钮用）
        async clear() {
            try {
                const folderId = await this._ensureFolder();
                const items = await chrome.bookmarks.getChildren(folderId);
                for (const item of items) {
                    try { await chrome.bookmarks.remove(item.id); } catch (e) { /* ignore */ }
                }
                console.log('[BookmarkQueue] cleared');
            } catch (e) {
                console.error('[BookmarkQueue] clear error', e);
            }
        }

        // 给 UI 用的：队列大小
        async size() {
            try {
                const folderId = await this._ensureFolder();
                const items = await chrome.bookmarks.getChildren(folderId);
                return items.filter(i => i.url).length;
            } catch (e) {
                return -1;
            }
        }

        // 检测队列是否健康（不超过 MAX_QUEUE）
        async isHealthy() {
            const n = await this.size();
            return n >= 0 && n <= MAX_QUEUE;
        }
    }

    // ----- Trash (软删除暂存) -----
    class Trash {
        static KEY() { return 'trashItems'; }
        static async _load() {
            try {
                const r = await chrome.storage.local.get([Trash.KEY()]);
                return r[Trash.KEY()] || [];
            } catch (e) { return []; }
        }
        static async _save(items) {
            try { await chrome.storage.local.set({ [Trash.KEY()]: items }); }
            catch (e) { console.error('[Trash] save failed', e); }
        }
        static async push(item) {
            const items = await Trash._load();
            items.push({ ...item, trashedAt: nowMs(), expiresAt: nowMs() + TRASH_TTL_MS });
            if (items.length > 500) items.splice(0, items.length - 500);
            await Trash._save(items);
        }
        static async list() {
            await Trash.cleanup();
            const items = await Trash._load();
            return items.slice().sort((a, b) => b.trashedAt - a.trashedAt);
        }
        static async remove(id) {
            const items = await Trash._load();
            const idx = items.findIndex(x => x.id === id);
            if (idx >= 0) { items.splice(idx, 1); await Trash._save(items); }
        }
        static async cleanup() {
            const items = await Trash._load();
            const now = nowMs();
            const remain = items.filter(x => (x.expiresAt || 0) > now);
            if (remain.length !== items.length) await Trash._save(remain);
            return remain;
        }
    }

    // ----- Snapshot (防抖快照) -----
    class Snapshot {
        static KEY() { return 'dataSnapshot'; }
        static _timer = null;
        static schedule() {
            if (Snapshot._timer) clearTimeout(Snapshot._timer);
            Snapshot._timer = setTimeout(() => {
                Snapshot.take().catch(err => console.error('[Snapshot] take failed', err));
            }, SNAPSHOT_DEBOUNCE_MS);
        }
        static async take() {
            try {
                const [sync, local] = await Promise.all([
                    chrome.storage.sync.get(['groups', 'settings']),
                    chrome.storage.local.get(['bookmarks'])
                ]);
                const snap = {
                    ts: nowMs(),
                    groups: sync.groups || [],
                    bookmarks: local.bookmarks || [],
                    settings: sync.settings || {}
                };
                await chrome.storage.local.set({ [Snapshot.KEY()]: snap });
                console.log('[Snapshot] saved', new Date(snap.ts).toISOString(),
                    'groups:', snap.groups.length, 'bookmarks:', snap.bookmarks.length);
            } catch (e) { console.error('[Snapshot] take error', e); }
        }
        static async get() {
            try {
                const r = await chrome.storage.local.get([Snapshot.KEY()]);
                return r[Snapshot.KEY()] || null;
            } catch (e) { return null; }
        }
    }

    // ----- Export -----
    const api = { BookmarkQueue, Trash, Snapshot, QUEUE_FOLDER_TITLE, OP_URL_PREFIX, decodeOpUrl };

    if (typeof window !== 'undefined') {
        window.BookmarkQueue = BookmarkQueue;
        window.Trash = Trash;
        window.Snapshot = Snapshot;
        window.decodeOpUrl = decodeOpUrl;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof self !== 'undefined') {
        self.BookmarkQueue = BookmarkQueue;
        self.Trash = Trash;
        self.Snapshot = Snapshot;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
