// 单元测试：Icon 获取和缓存功能
// 运行方式：node test-icon-fetch.js

const fs = require('fs');
const path = require('path');

// 模拟 Chrome Storage API
class MockStorage {
    constructor() {
        this.data = {};
    }

    get(keys) {
        const result = {};
        keys.forEach(key => {
            if (this.data[key]) {
                result[key] = this.data[key];
            }
        });
        return Promise.resolve(result);
    }

    set(items) {
        Object.assign(this.data, items);
        return Promise.resolve();
    }

    clear() {
        this.data = {};
    }
}

// 模拟 URL 解析
function parseUrl(url) {
    return new URL(url);
}

// 从 URL 中提取缓存键（复制自 bookmark.js 的逻辑）
function extractCacheKey(url) {
    const urlObj = parseUrl(url);
    const hostname = urlObj.hostname;
    const port = urlObj.port;

    // 对于任何带端口的地址，都应该按 host:port 来缓存
    const cacheKey = port ? `${hostname}:${port}` : hostname;
    return cacheKey;
}

// 测试用例
const testCases = [
    {
        name: 'IP地址：不同端口应该有不同的缓存键',
        urls: [
            'http://10.126.126.5:4000/dashboard/query',
            'http://10.126.126.5:9000/'
        ],
        expected: {
            'http://10.126.126.5:4000/dashboard/query': '10.126.126.5:4000',
            'http://10.126.126.5:9000/': '10.126.126.5:9000'
        },
        shouldMatch: false
    },
    {
        name: 'IP地址：相同端口应该有相同的缓存键',
        urls: [
            'http://10.126.126.5:4000/dashboard/query',
            'http://10.126.126.5:4000/other/page'
        ],
        expected: {
            'http://10.126.126.5:4000/dashboard/query': '10.126.126.5:4000',
            'http://10.126.126.5:4000/other/page': '10.126.126.5:4000'
        },
        shouldMatch: true
    },
    {
        name: '域名：带端口应该有不同的缓存键',
        urls: [
            'http://myhost:4589/page1',
            'http://myhost:8080/page2'
        ],
        expected: {
            'http://myhost:4589/page1': 'myhost:4589',
            'http://myhost:8080/page2': 'myhost:8080'
        },
        shouldMatch: false
    },
    {
        name: '域名：不带端口应该共享缓存键',
        urls: [
            'http://example.com/page1',
            'http://example.com/page2',
            'http://example.com/'
        ],
        expected: {
            'http://example.com/page1': 'example.com',
            'http://example.com/page2': 'example.com',
            'http://example.com/': 'example.com'
        },
        shouldMatch: true
    },
    {
        name: '域名：不同子域名应该有不同的缓存键',
        urls: [
            'http://console.compshare.cn/',
            'http://www.compshare.cn/',
            'http://api.compshare.cn/'
        ],
        expected: {
            'http://console.compshare.cn/': 'console.compshare.cn',
            'http://www.compshare.cn/': 'www.compshare.cn',
            'http://api.compshare.cn/': 'api.compshare.cn'
        },
        shouldMatch: false
    },
    {
        name: '域名：相同域名不同端口',
        urls: [
            'http://localhost:3000',
            'http://localhost:4000',
            'http://localhost:8080'
        ],
        expected: {
            'http://localhost:3000': 'localhost:3000',
            'http://localhost:4000': 'localhost:4000',
            'http://localhost:8080': 'localhost:8080'
        },
        shouldMatch: false
    },
    {
        name: '混合测试：复杂场景',
        urls: [
            'http://192.168.1.1:5000',
            'http://192.168.1.1:5001',
            'http://dev.example.com:8080',
            'http://dev.example.com:9000',
            'http://prod.example.com/',
            'http://myhost:3000',
            'http://myhost:4000'
        ],
        expected: {
            'http://192.168.1.1:5000': '192.168.1.1:5000',
            'http://192.168.1.1:5001': '192.168.1.1:5001',
            'http://dev.example.com:8080': 'dev.example.com:8080',
            'http://dev.example.com:9000': 'dev.example.com:9000',
            'http://prod.example.com/': 'prod.example.com',
            'http://myhost:3000': 'myhost:3000',
            'http://myhost:4000': 'myhost:4000'
        },
        shouldMatch: false
    }
];

// 运行测试
function runTests() {
    console.log('='.repeat(80));
    console.log('开始运行 Icon 缓存键提取测试');
    console.log('='.repeat(80));
    console.log();

    let passedTests = 0;
    let failedTests = 0;

    testCases.forEach((testCase, index) => {
        console.log(`\n测试 ${index + 1}: ${testCase.name}`);
        console.log('-'.repeat(80));

        const actualResults = {};
        testCase.urls.forEach(url => {
            actualResults[url] = extractCacheKey(url);
        });

        // 检查每个URL的缓存键是否符合预期
        let allMatch = true;
        for (const url of testCase.urls) {
            const expected = testCase.expected[url];
            const actual = actualResults[url];

            if (expected !== actual) {
                allMatch = false;
                console.log(`  ❌ ${url}`);
                console.log(`     期望: ${expected}`);
                console.log(`     实际: ${actual}`);
            } else {
                console.log(`  ✅ ${url} -> ${actual}`);
            }
        }

        // 检查是否所有URL的缓存键都相同（或都不同）
        const cacheKeys = Object.values(actualResults);
        const uniqueKeys = new Set(cacheKeys);
        const allSame = uniqueKeys.size === 1;

        if (testCase.shouldMatch && !allSame) {
            allMatch = false;
            console.log(`  ❌ 期望所有URL共享相同的缓存键，但实际有 ${uniqueKeys.size} 个不同的键:`);
            console.log(`     ${Array.from(uniqueKeys).join(', ')}`);
        } else if (!testCase.shouldMatch && allSame) {
            allMatch = false;
            console.log(`  ❌ 期望所有URL有不同的缓存键，但实际都相同: ${cacheKeys[0]}`);
        }

        if (allMatch) {
            console.log(`\n✅ 测试通过`);
            passedTests++;
        } else {
            console.log(`\n❌ 测试失败`);
            failedTests++;
        }
    });

    console.log('\n' + '='.repeat(80));
    console.log('测试结果汇总');
    console.log('='.repeat(80));
    console.log(`✅ 通过: ${passedTests}/${testCases.length}`);
    console.log(`❌ 失败: ${failedTests}/${testCases.length}`);
    console.log();

    if (failedTests === 0) {
        console.log('🎉 所有测试通过！');
    } else {
        console.log('❌ 存在失败的测试');
    }
}

// 测试 favicon 候选URL生成（模拟 background.js 的逻辑）
function generateFaviconCandidates(url) {
    try {
        const urlObj = parseUrl(url);
        const origin = urlObj.origin;
        const hostname = urlObj.hostname;
        const protocol = urlObj.protocol;
        const candidateUrls = [];

        candidateUrls.push(`${origin}/favicon.ico`);

        if (hostname.startsWith('www.')) {
            const withoutWww = `${protocol}//${hostname.substring(4)}`;
            candidateUrls.push(`${withoutWww}/favicon.ico`);
        }

        const parts = hostname.split('.');
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

        if (!isIpAddress && parts.length > 2) {
            const mainHostname = parts.slice(1).join('.');
            const mainOrigin = `${protocol}//${mainHostname}`;
            candidateUrls.push(`${mainOrigin}/favicon.ico`);
            candidateUrls.push(`${protocol}//www.${mainHostname}/favicon.ico`);
        }

        const commonFaviconPaths = [
            '/assets/favicon.ico',
            '/static/favicon.ico',
            '/img/favicon.ico',
            '/images/favicon.ico',
            '/public/favicon.ico',
            '/favicon.png',
            '/favicon.svg',
            '/apple-touch-icon.png',
            '/apple-touch-icon-precomposed.png'
        ];

        for (const path of commonFaviconPaths) {
            candidateUrls.push(`${origin}${path}`);
        }

        return [...new Set(candidateUrls)];
    } catch (error) {
        return [];
    }
}

// 测试 favicon 候选URL生成
function testFaviconCandidates() {
    console.log('\n' + '='.repeat(80));
    console.log('开始运行 Favicon 候选URL生成测试');
    console.log('='.repeat(80));
    console.log();

    const faviconTests = [
        {
            url: 'http://10.126.126.5:4000/dashboard/query',
            description: 'IP地址 + 端口',
            shouldNotInclude: ['http://10.126.126.5/favicon.ico', 'http://126.126.5/favicon.ico']
        },
        {
            url: 'http://console.compshare.cn/light-gpu/resources/create',
            description: '多级子域名',
            shouldInclude: ['http://compshare.cn/favicon.ico', 'http://www.compshare.cn/favicon.ico']
        },
        {
            url: 'http://www.example.com/page',
            description: 'www 子域名',
            shouldInclude: ['http://www.example.com/favicon.ico', 'http://example.com/favicon.ico']
        },
        {
            url: 'http://myhost:4589/api',
            description: '域名 + 端口',
            shouldNotInclude: ['http://myhost/favicon.ico', 'http://:4589/favicon.ico']
        },
        {
            url: 'http://10.126.126.4:8188/dashboard',
            description: 'IP地址 + 端口 + 非标准favicon路径',
            shouldInclude: [
                'http://10.126.126.4:8188/favicon.ico',
                'http://10.126.126.4:8188/assets/favicon.ico',
                'http://10.126.126.4:8188/static/favicon.ico',
                'http://10.126.126.4:8188/img/favicon.ico',
                'http://10.126.126.4:8188/images/favicon.ico',
                'http://10.126.126.4:8188/public/favicon.ico'
            ]
        }
    ];

    let passed = 0;
    let failed = 0;

    faviconTests.forEach((test, index) => {
        console.log(`\n测试 ${index + 1}: ${test.description}`);
        console.log(`URL: ${test.url}`);
        console.log('-'.repeat(80));

        const candidates = generateFaviconCandidates(test.url);
        console.log('生成的候选URL:');
        candidates.forEach((url, i) => {
            console.log(`  ${i + 1}. ${url}`);
        });

        let testPassed = true;

        if (test.shouldInclude) {
            test.shouldInclude.forEach(shouldIncludeUrl => {
                if (!candidates.includes(shouldIncludeUrl)) {
                    console.log(`  ❌ 应该包含: ${shouldIncludeUrl}`);
                    testPassed = false;
                }
            });
        }

        if (test.shouldNotInclude) {
            test.shouldNotInclude.forEach(shouldNotIncludeUrl => {
                if (candidates.includes(shouldNotIncludeUrl)) {
                    console.log(`  ❌ 不应该包含: ${shouldNotIncludeUrl}`);
                    testPassed = false;
                }
            });
        }

        if (testPassed) {
            console.log('  ✅ 测试通过');
            passed++;
        } else {
            console.log('  ❌ 测试失败');
            failed++;
        }
    });

    console.log('\n' + '='.repeat(80));
    console.log('Favicon 测试结果汇总');
    console.log('='.repeat(80));
    console.log(`✅ 通过: ${passed}/${faviconTests.length}`);
    console.log(`❌ 失败: ${failed}/${faviconTests.length}`);
}

// 运行所有测试
let hasFailure = false;
try {
    runTests();
} catch (error) {
    hasFailure = true;
}

try {
    testFaviconCandidates();
} catch (error) {
    hasFailure = true;
}

if (hasFailure) {
    process.exit(1);
} else {
    process.exit(0);
}
