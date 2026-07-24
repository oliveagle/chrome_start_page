// BookmarkQueue —— 用 Chrome 书签文件夹本身做操作队列
// 队列项是真实书签，存在 __op_queue__ 文件夹下
// 优势：天然随 Chrome 账户跨设备同步
//
// 跨设备去重机制（2026-07）：
//   1. 每个 op 带 opId (UUID v4)，跨设备同步后，相同 op 只执行一次
//   2. __applied__ 子文件夹存已应用 op 的"墓碑"（标题 = opId）
//      drain 时跳过墓碑里已有的 opId
//   3. 同一队列文件夹内如果出现 opId 重复（极端 race），也跳过
//
// 书签 / 分组 / op 一律用 crypto.randomUUID()（RFC 4122 v4）生成 id，
//   避免跨设备碰撞。

(function (global) {
    'use strict';

    const QUEUE_FOLDER_TITLE = '__op_queue__';     // 队列文件夹名
    const APPLIED_FOLDER_TITLE = '__applied__';    // 已应用 op 墓碑文件夹
    const OP_URL_PREFIX = 'chrome-extension-op://'; // op 书签的 url 前缀
    const OP_TITLE_PREFIX = '[op]';                // op 书签的 title 前缀
    const OP_FAILED_PREFIX = '[op-failed]';        // 失败的 op 改名加这个前缀
    const APPLIED_URL_PREFIX = 'chrome-extension-applied://'; // 墓碑书签的 url 前缀
    const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const SNAPSHOT_DEBOUNCE_MS = 5 * 60 * 1000;
    const MAX_QUEUE = 500;
    const MAX_APPLIED = 1000; // 墓簿上限，避免无限增长

    function nowMs() { return Date.now(); }

    // RFC 4122 v4 UUID。Chrome 92+ / manifest v3 全部支持。
    // 跨设备/跨浏览器天然唯一，替换之前的 nowMs() + Math.random()。
    function uuidv4() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // 极简 fallback（理论上不会走到）
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    // ----- URL 编解码 -----
    // 书签 url 形如：
    //   chrome-extension-op://push/add/bookmark/<uuid-refId>
    //     ?payload=<base64-json>&ts=<ms>&opId=<uuid>
    //
    // 墓簿 url 形如：
    //   chrome-extension-applied://<uuid-opId>
    function encodeOpUrl(direction, type, target, refId, payload, opId) {
        const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload || {}))));
        return `${OP_URL_PREFIX}${direction}/${type}/${target}/${encodeURIComponent(refId || '')}?payload=${payloadStr}&ts=${nowMs()}&opId=${encodeURIComponent(opId || uuidv4())}`;
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
            const opIdRaw = params.get('opId') || '';
            const opId = decodeURIComponent(opIdRaw);
            let payload = {};
            try { payload = JSON.parse(decodeURIComponent(escape(atob(payloadStr)))); } catch (e) { payload = {}; }
            return { direction, type, target, refId, payload, ts, opId, url };
        } catch (e) {
            console.error('[BookmarkQueue] decodeOpUrl failed', e);
            return null;
        }
    }

    // 从墓簿 url 解出 opId
    function decodeAppliedUrl(url) {
        if (!url || !url.startsWith(APPLIED_URL_PREFIX)) return null;
        try {
            const opId = decodeURIComponent(url.slice(APPLIED_URL_PREFIX.length));
            return opId || null;
        } catch (e) {
            return null;
        }
    }

    // ----- 队列文件夹定位 -----
    async function findOrCreateRootFolder() {
        const rootName = 'Chrome Start Page Bookmarks';
        let roots = await chrome.bookmarks.search({ title: rootName });
        if (!roots || roots.length === 0) {
            const created = await chrome.bookmarks.create({ title: rootName, parentId: undefined });
            roots = [created];
        } else if (roots.length > 1) {
            roots = [roots[0]];
        }
        return roots[0];
    }

    async function findOrCreateChildFolder(parentId, title) {
        const subs = await chrome.bookmarks.getChildren(parentId);
        let folder = subs.find(s => s.title === title && !s.url);
        if (!folder) {
            folder = await chrome.bookmarks.create({ title, parentId });
            console.log('[BookmarkQueue] Created folder:', title, folder.id);
        }
        return folder;
    }

    async function findOrCreateQueueFolder() {
        const root = await findOrCreateRootFolder();
        return await findOrCreateChildFolder(root.id, QUEUE_FOLDER_TITLE);
    }

    async function findOrCreateAppliedFolder() {
        const root = await findOrCreateRootFolder();
        return await findOrCreateChildFolder(root.id, APPLIED_FOLDER_TITLE);
    }

    // ----- BookmarkQueue 主类 -----
    class BookmarkQueue {
        constructor() {
            this._queueFolderId = null;
            this._appliedFolderId = null;
        }

        async _ensureFolder() {
            if (!this._queueFolderId) {
                const f = await findOrCreateQueueFolder();
                this._queueFolderId = f.id;
            }
            return this._queueFolderId;
        }

        async _ensureAppliedFolder() {
            if (!this._appliedFolderId) {
                const f = await findOrCreateAppliedFolder();
                this._appliedFolderId = f.id;
            }
            return this._appliedFolderId;
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
                // 调用方可显式传 opId；不传则自动生成 uuid
                const opId = op.opId || uuidv4();

                const url = encodeOpUrl(direction, type, target, refId, payload, opId);
                const title = `${OP_TITLE_PREFIX} ${direction}/${type}/${target}/${refId.slice(0, 8)}`;
                const created = await chrome.bookmarks.create({
                    title,
                    url,
                    parentId: folderId
                });
                console.log('[BookmarkQueue] enqueued:', created.title, 'opId=', opId);
                return { id: created.id, url, opId };
            } catch (e) {
                console.error('[BookmarkQueue] enqueue failed', e);
                throw e;
            }
        }

        // 拿所有 pending op（按 ts 升序）
        // 同 opId 在同一队列里只返回一次
        async pending() {
            try {
                const folderId = await this._ensureFolder();
                const items = await chrome.bookmarks.getChildren(folderId);
                const ops = [];
                const seenOpIds = new Set();
                for (const item of items) {
                    if (!item.url) continue;
                    if (item.title.startsWith(OP_FAILED_PREFIX)) continue;
                    const decoded = decodeOpUrl(item.url);
                    if (!decoded) continue;
                    if (decoded.opId && seenOpIds.has(decoded.opId)) {
                        // 同一 opId 已在队列里出现过 → 跳过（同步去重）
                        continue;
                    }
                    if (decoded.opId) seenOpIds.add(decoded.opId);
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
                const seenOpIds = new Set();
                for (const item of items) {
                    if (!item.url || !item.title.startsWith(OP_FAILED_PREFIX)) continue;
                    const decoded = decodeOpUrl(item.url);
                    if (!decoded) continue;
                    if (decoded.opId && seenOpIds.has(decoded.opId)) continue;
                    if (decoded.opId) seenOpIds.add(decoded.opId);
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

        // 拿所有已应用 op 的 opId 集合（墓簿）
        async appliedOpIds() {
            try {
                const folderId = await this._ensureAppliedFolder();
                const items = await chrome.bookmarks.getChildren(folderId);
                const set = new Set();
                for (const item of items) {
                    if (!item.url) continue;
                    const opId = decodeAppliedUrl(item.url);
                    if (opId) set.add(opId);
                }
                return set;
            } catch (e) {
                console.error('[BookmarkQueue] appliedOpIds failed', e);
                return new Set();
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

        // 把一个 op 标记为已应用：移到 __applied__ 子文件夹
        // 保留一个书签作为"墓碑"，url = chrome-extension-applied://<opId>
        // 标题 = opId（前 8 字符 + ...）便于排查
        async markApplied(chromeId, opId) {
            try {
                if (!opId) {
                    console.warn('[BookmarkQueue] markApplied: missing opId, falling back to remove', chromeId);
                    await this.remove(chromeId);
                    return;
                }
                const appliedFolderId = await this._ensureAppliedFolder();
                const url = `${APPLIED_URL_PREFIX}${encodeURIComponent(opId)}`;
                const title = `applied:${opId.slice(0, 8)}`;
                // 在墓簿文件夹下创建新书签，再删除原 op
                await chrome.bookmarks.create({
                    parentId: appliedFolderId,
                    title,
                    url,
                });
                await chrome.bookmarks.remove(chromeId);
                // 墓簿上限：超过 MAX_APPLIED 时清理最旧的
                await this._trimApplied(appliedFolderId);
            } catch (e) {
                console.error('[BookmarkQueue] markApplied error', e);
            }
        }

        async _trimApplied(appliedFolderId) {
            try {
                const items = await chrome.bookmarks.getChildren(appliedFolderId);
                if (items.length <= MAX_APPLIED) return;
                // 按 dateAdded 升序，删最旧的
                const sorted = items.slice().sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
                const toRemove = sorted.slice(0, items.length - MAX_APPLIED);
                for (const item of toRemove) {
                    try { await chrome.bookmarks.remove(item.id); } catch (e) { /* ignore */ }
                }
                console.log('[BookmarkQueue] trimmed applied tombstones:', toRemove.length);
            } catch (e) {
                console.warn('[BookmarkQueue] _trimApplied failed:', e.message);
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
                const queueFolderId = await this._ensureFolder();
                const items = await chrome.bookmarks.getChildren(queueFolderId);
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
    const api = {
        BookmarkQueue, Trash, Snapshot,
        QUEUE_FOLDER_TITLE, APPLIED_FOLDER_TITLE, OP_URL_PREFIX, APPLIED_URL_PREFIX,
        decodeOpUrl, decodeAppliedUrl, uuidv4,
    };

    if (typeof window !== 'undefined') {
        window.BookmarkQueue = BookmarkQueue;
        window.Trash = Trash;
        window.Snapshot = Snapshot;
        window.decodeOpUrl = decodeOpUrl;
        window.decodeAppliedUrl = decodeAppliedUrl;
        window.uuidv4 = uuidv4;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof self !== 'undefined') {
        self.BookmarkQueue = BookmarkQueue;
        self.Trash = Trash;
        self.Snapshot = Snapshot;
        self.uuidv4 = uuidv4;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);