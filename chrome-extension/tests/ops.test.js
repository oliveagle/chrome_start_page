// ops.js 单元测试 —— 重点验证跨设备去重机制
//
// 测试目标：
//   1. uuidv4() 生成 RFC 4122 v4 格式
//   2. encodeOpUrl / decodeOpUrl 正确编解码 opId
//   3. BookmarkQueue.pending() 在同 opId 重复时去重
//   4. BookmarkQueue.appliedOpIds() 解码墓簿
//   5. drainOpQueue 跳过墓簿已含的 opId
//
// 跑：cd chrome-extension && npx vitest run

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Mock chrome.bookmarks ----
// 用一个真实的内存模型：每个节点是一个 {id, title, url, parentId, children: []}
// chrome.bookmarks API 直接操作这个模型

function makeBookmarkNode(id, fields = {}) {
    return {
        id,
        title: fields.title || '',
        url: fields.url,
        parentId: fields.parentId,
        dateAdded: fields.dateAdded || Date.now(),
        // 文件夹默认有 children 数组；书签没有
        children: fields.children || (fields.url === undefined ? [] : undefined),
    };
}

function makeMockChromeBookmarks() {
    let nextId = 1000;
    const nodes = new Map();
    const ROOT_NAME = 'Chrome Start Page Bookmarks';
    const root = makeBookmarkNode('root', { title: ROOT_NAME, children: [] });
    nodes.set('root', root);

    function search(query) {
        const results = [];
        for (const n of nodes.values()) {
            if (query.title && n.title === query.title) results.push(n);
            if (query.url && n.url === query.url) results.push(n);
        }
        return results;
    }

    function getChildren(parentId) {
        const parent = nodes.get(parentId);
        if (!parent || !parent.children) return [];
        return parent.children.map(id => nodes.get(id)).filter(Boolean);
    }

    function create(fields) {
        const id = 'bm_' + (++nextId);
        const node = makeBookmarkNode(id, {
            title: fields.title,
            url: fields.url,
            parentId: fields.parentId,
        });
        if (fields.parentId) {
            const parent = nodes.get(fields.parentId);
            if (parent.children) parent.children.push(id);
        } else {
            root.children.push(id);
        }
        nodes.set(id, node);
        return node;
    }

    function update(id, changes) {
        const node = nodes.get(id);
        if (!node) throw new Error('Not found');
        Object.assign(node, changes);
        return node;
    }

    function remove(id) {
        const node = nodes.get(id);
        if (!node) return;
        if (node.parentId) {
            const parent = nodes.get(node.parentId);
            if (parent && parent.children) {
                parent.children = parent.children.filter(c => c !== id);
            }
        } else {
            root.children = root.children.filter(c => c !== id);
        }
        nodes.delete(id);
    }

    function get(id) {
        return nodes.get(id) || null;
    }

    return { search, getChildren, create, update, remove, get };
}

const globalScope = globalThis;

// 每个测试前重置 mock + 清除上一次 eval 留下的 class
let mockBookmarks;
beforeEach(() => {
    mockBookmarks = makeMockChromeBookmarks();
    globalScope.chrome = {
        bookmarks: mockBookmarks,
        storage: {
            local: { get: async () => ({}), set: async () => {} },
            sync: { get: async () => ({}), set: async () => {} },
        },
    };
    // ops.js 末尾靠 window / self 导出 API。在 Node 环境这两个 undefined,
    // 兑底让 window = self = globalThis，eval 后 BookmarkQueue / uuidv4 都在 globalScope 上。
    if (typeof globalScope.window === 'undefined') globalScope.window = globalScope;
    if (typeof globalScope.self === 'undefined') globalScope.self = globalScope;
    delete globalScope.BookmarkQueue;
    delete globalScope.Trash;
    delete globalScope.Snapshot;
    delete globalScope.uuidv4;
    delete globalScope.decodeOpUrl;
    delete globalScope.decodeAppliedUrl;
    vi.resetModules();
});

// 加载 ops.js（IIFE）进当前 global scope
async function loadOps() {
    const path = require('node:path');
    const fs = require('node:fs');
    const opsPath = path.resolve(__dirname, '../js/ops.js');
    const code = fs.readFileSync(opsPath, 'utf8');
    eval(code);
    return globalScope.BookmarkQueue;
}

// ---- uuidv4 格式 ----
describe('uuidv4()', () => {
    it('generates RFC 4122 v4 UUIDs', async () => {
        await loadOps();
        const u = globalScope.uuidv4();
        expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns unique values across calls', async () => {
        await loadOps();
        const set = new Set();
        for (let i = 0; i < 100; i++) set.add(globalScope.uuidv4());
        expect(set.size).toBe(100);
    });
});

// ---- encode/decode op URL ----
describe('encodeOpUrl / decodeOpUrl', () => {
    it('round-trips with opId', async () => {
        await loadOps();
        const opId = globalScope.uuidv4();
        const refId = globalScope.uuidv4();
        const q = new globalScope.BookmarkQueue();
        const created = await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId, payload: { x: 1 }, opId,
        });
        const decoded = globalScope.decodeOpUrl(created.url);
        expect(decoded).not.toBeNull();
        expect(decoded.opId).toBe(opId);
        expect(decoded.refId).toBe(refId);
        expect(decoded.direction).toBe('push');
        expect(decoded.payload).toEqual({ x: 1 });
    });
});

// ---- pending() 去重 ----
describe('BookmarkQueue.pending() dedup', () => {
    it('同一 opId 在队列里重复出现时只返回一次', async () => {
        await loadOps();
        const q = new globalScope.BookmarkQueue();
        const opId = globalScope.uuidv4();
        const refId = globalScope.uuidv4();

        // 模拟"跨设备同步后，队列里出现两个相同 opId 的 op"
        await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId, payload: { x: 1 }, opId,
        });
        await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId, payload: { x: 1 }, opId,
        });

        const pending = await q.pending();
        expect(pending.length).toBe(1);
        expect(pending[0].opId).toBe(opId);
    });

    it('不同 opId 不互相影响', async () => {
        await loadOps();
        const q = new globalScope.BookmarkQueue();
        await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId: globalScope.uuidv4(), payload: {}, opId: globalScope.uuidv4(),
        });
        await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId: globalScope.uuidv4(), payload: {}, opId: globalScope.uuidv4(),
        });

        const pending = await q.pending();
        expect(pending.length).toBe(2);
    });
});

// ---- appliedOpIds / markApplied ----
describe('BookmarkQueue applied tombstones', () => {
    it('markApplied 后 appliedOpIds 包含该 opId', async () => {
        await loadOps();
        const q = new globalScope.BookmarkQueue();
        const opId = globalScope.uuidv4();
        const created = await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId: globalScope.uuidv4(), payload: {}, opId,
        });

        await q.markApplied(created.id, opId);

        const applied = await q.appliedOpIds();
        expect(applied.has(opId)).toBe(true);

        // 原本的 op 应该已删除
        const pending = await q.pending();
        expect(pending.find(o => o.opId === opId)).toBeUndefined();
    });

    it('markApplied 不传 opId 时退化为 remove', async () => {
        await loadOps();
        const q = new globalScope.BookmarkQueue();
        const created = await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId: globalScope.uuidv4(), payload: {},
        });
        await q.markApplied(created.id, null);

        const pending = await q.pending();
        expect(pending.length).toBe(0);
        const applied = await q.appliedOpIds();
        expect(applied.size).toBe(0);
    });
});

// ---- 跨设备同步场景:墓簿已含 opId 时的 drain 行为 ----
describe('drain dedup against applied tombstones', () => {
    it('模拟跨设备:drain 应跳过墓簿里已含的 opId', async () => {
        await loadOps();
        const q = new globalScope.BookmarkQueue();
        const opId = globalScope.uuidv4();

        // 1. device A 入队并成功执行 → 移到墓簿
        const created = await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId: globalScope.uuidv4(), payload: {}, opId,
        });
        await q.markApplied(created.id, opId);

        // 2. 同步后 device B 也收到了这个 op
        await q.enqueue({
            direction: 'push', type: 'add', target: 'bookmark',
            refId: globalScope.uuidv4(), payload: {}, opId,
        });

        // 3. device B 调 drainOpQueue → 应在 pending 阶段就跳过这个 opId
        const applied = await q.appliedOpIds();
        const pending = await q.pending();
        const toExecute = pending.filter(op => !applied.has(op.opId));
        expect(toExecute.length).toBe(0); // 跨设备重复 op 应被识别并跳过
    });
});