// Vitest 配置 —— 单元测试 Chrome extension 模块
// 范围：纯逻辑（ops.js / storage.js / utils），不测 chrome.* API
// 集成测试通过手动跑扩展 + Chrome 实例完成

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        globals: false,
        testTimeout: 5000,
    },
});