// storage.js 单元测试 —— 验证 generateId 返回 UUID v4
//
// storage.js 的 StorageManager 构造函数会立刻调 migrateBookmarksToLocal，
// 所以不能在 Node 直接 require（依赖 chrome.storage）。
// 我们走更窄的路径：单独验证 generateId 方法（不依赖 chrome 状态）。
//
// 跑：cd chrome-extension && npx vitest run

import { describe, it, expect, beforeEach } from 'vitest';

const globalScope = globalThis;

beforeEach(() => {
    // 提供最小 chrome mock（让 StorageManager 构造函数不抛）
    globalScope.chrome = {
        storage: {
            sync: { get: async () => ({}), set: async () => {} },
            local: { get: async () => ({ bookmarks: [] }), set: async () => {} },
        },
    };
    // 给 window 兑底（StorageManager IIFE 会挂到 window）
    if (typeof globalScope.window === 'undefined') globalScope.window = globalScope;
    delete globalScope.storageManager;
});

async function loadStorage() {
    const path = require('node:path');
    const fs = require('node:fs');
    const storagePath = path.resolve(__dirname, '../js/storage.js');
    const code = fs.readFileSync(storagePath, 'utf8');
    eval(code);
    return globalScope.storageManager;
}

describe('StorageManager.generateId()', () => {
    it('returns RFC 4122 v4 UUIDs', async () => {
        const sm = await loadStorage();
        const id = sm.generateId();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('100 calls produce 100 unique ids', async () => {
        const sm = await loadStorage();
        const set = new Set();
        for (let i = 0; i < 100; i++) set.add(sm.generateId());
        expect(set.size).toBe(100);
    });
});

describe('StorageManager.addBookmark / addGroup id 稳定性', () => {
    it('addBookmark 接受外部传入的 id', async () => {
        const sm = await loadStorage();
        const providedId = '11111111-2222-4333-8444-555555555555';
        const result = await sm.addBookmark({
            id: providedId,
            title: 'Test',
            url: 'https://example.com',
            groupId: 'g-1',
        });
        expect(result.id).toBe(providedId);
    });

    it('addGroup 接受外部传入的 id', async () => {
        const sm = await loadStorage();
        const providedId = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
        const result = await sm.addGroup('Test Group', providedId);
        expect(result.id).toBe(providedId);
    });

    it('addBookmark 不传 id 时自动生成 UUID', async () => {
        const sm = await loadStorage();
        const result = await sm.addBookmark({
            title: 'Test',
            url: 'https://example.com',
            groupId: 'g-1',
        });
        expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});