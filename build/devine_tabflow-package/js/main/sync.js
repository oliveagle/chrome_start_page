/* global ChromeStartPageApp */
// devine_tabflow - sync layer
// 从 main.js 拆分 (14 个方法)
// 通过先赋值到 const 再 Object.assign 注入到 ChromeStartPageApp.prototype
// (严格模式下不能在对象字面量里直接声明 async/function)
(function () {
    'use strict';

    // 初始化 bootstrap 容器 (在 main.js 之前加载, 攒方法)
    if (typeof window.__ChromeStartPageMixins === 'undefined') {
        window.__ChromeStartPageMixins = {};
    }
    const SyncMixin = (window.__ChromeStartPageMixins.sync = {});

    SyncMixin.getDefaultBookmarkIconSvg = function () {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="bookmark-icon-img" width="16" height="16"><rect x="2" y="1" width="12" height="14" rx="2" fill="#718096"/><path d="M5 5h6v1H5zm0 2.5h6v1H5zm0 2.5h4v1H5z" fill="#fff"/></svg>`;
    };

    SyncMixin.getBookmarkIconUrl = async function (bookmark) {
        try {
            if (bookmark.icon) {
                return bookmark.icon;
            }
            // 异步获取图标，但不阻塞UI渲染
            bookmarkManager.fetchAndUpdateIcon(bookmark.id);
            return null;
        } catch (error) {
            console.error('Failed to get bookmark icon:', error);
            return null;
        }
    };

    SyncMixin.fetchIconFromUrl = async function (url) {
        console.log('[Main] fetchIconFromUrl called for:', url);

        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                console.log('[Main] Sending message to background.js');
                chrome.runtime.sendMessage({ action: 'fetchIcon', url: url }, (response) => {
                    console.log('[Main] Received response:', response);
                    if (response && response.iconUrl) {
                        console.log('[Main] ✅ Got iconUrl:', response.iconUrl);
                        resolve(response.iconUrl);
                    } else {
                        console.log('[Main] ❌ No iconUrl in response, using fallback');
                        // 备用方案：直接使用网站的 favicon.ico
                        try {
                            const urlObj = new URL(url);
                            const iconUrl = `${urlObj.origin}/favicon.ico`;
                            console.log('[Main] Fallback iconUrl:', iconUrl);
                            resolve(iconUrl);
                        } catch (error) {
                            console.log('[Main] Fallback failed:', error);
                            resolve(null);
                        }
                    }
                });
            } else {
                console.log('[Main] Chrome API not available, using fallback');
                // 备用方案：直接使用网站的 favicon.ico
                try {
                    const urlObj = new URL(url);
                    const iconUrl = `${urlObj.origin}/favicon.ico`;
                    resolve(iconUrl);
                } catch (error) {
                    resolve(null);
                }
            }
        });
    };

    SyncMixin.fetchTitleFromUrl = async function (url) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ action: 'fetchPageTitle', url: url }, (response) => {
                    if (response && response.success && response.title) {
                        resolve(response.title);
                    } else {
                        // 如果获取失败，返回域名
                        try {
                            const urlObj = new URL(url);
                            resolve(urlObj.hostname);
                        } catch (error) {
                            resolve(null);
                        }
                    }
                });
            } else {
                // 如果没有 chrome.runtime，返回域名
                try {
                    const urlObj = new URL(url);
                    resolve(urlObj.hostname);
                } catch (error) {
                    resolve(null);
                }
            }
        });
    };

    SyncMixin.showSettings = async function () {
        // 显示设置模态框
        this.showModal('settingsModal');

        // 加载当前设置到表单
        await this.loadSettingsIntoForm();

        // 绑定设置面板内的 Chrome 书签同步按钮（重复打开不会重复绑定）
        this.bindSettingsSyncButtons();

        // 加载初始同步状态
        await this.refreshSettingsSyncStatus();

        // 加载队列状态
        await this.refreshQueueStats();
    };

    SyncMixin.refreshQueueStats = async function () {
        const el = document.getElementById('queueStats');
        if (!el) return;
        el.textContent = '加载中…';
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'getQueueStats' }, resolve);
            });
            if (chrome.runtime.lastError) {
                el.textContent = '获取失败：' + chrome.runtime.lastError.message;
                el.style.color = '#e53e3e';
                return;
            }
            if (response && response.success) {
                const { pending, failed, total } = response.stats;
                if (total === 0) {
                    el.innerHTML = '<span style="color:#38a169;">✓ 队列空闲</span>';
                } else {
                    const parts = [];
                    if (pending > 0)
                        parts.push(`<span style="color:#3182ce;">待处理 ${pending}</span>`);
                    if (failed > 0)
                        parts.push(`<span style="color:#e53e3e;">失败 ${failed}</span>`);
                    el.innerHTML = parts.join(' · ') + ` · 总计 ${total}`;
                }
            } else {
                el.textContent = '获取失败：' + (response?.error || '未知错误');
                el.style.color = '#e53e3e';
            }
        } catch (e) {
            el.textContent = '获取失败：' + e.message;
            el.style.color = '#e53e3e';
        }
    };

    SyncMixin.drainQueue = async function () {
        this.showNotification('正在排空队列...', 'info');
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'drainOpQueue' }, resolve);
        });
        if (response?.success) {
            this.showSuccess('队列已排空');
        } else {
            this.showError('排空失败：' + (response?.error || '未知错误'));
        }
        this.refreshQueueStats();
    };

    SyncMixin.retryFailedQueue = async function () {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'retryFailedOps' }, resolve);
        });
        if (response?.success) {
            this.showSuccess('失败操作已重新入队');
        } else {
            this.showError('重试失败：' + (response?.error || '未知错误'));
        }
        this.refreshQueueStats();
    };

    SyncMixin.clearQueue = async function () {
        if (!confirm('确定清空操作队列？这会丢失所有未同步的操作（已经同步完成的不会受影响）。'))
            return;
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'clearOpQueue' }, resolve);
        });
        if (response?.success) {
            this.showSuccess('队列已清空');
        } else {
            this.showError('清空失败：' + (response?.error || '未知错误'));
        }
        this.refreshQueueStats();
    };

    SyncMixin.refreshSettingsSyncStatus = async function (text, type = 'info') {
        const el = document.getElementById('settingsSyncStatus');
        if (!el) return;
        if (text) {
            el.textContent = text;
            el.style.color =
                type === 'error'
                    ? '#e53e3e'
                    : type === 'success'
                      ? '#38a169'
                      : type === 'progress'
                        ? '#3182ce'
                        : '#718096';
        } else {
            // 拉一次 storage 里的最后状态
            try {
                const result = await chrome.storage.sync.get(['settings']);
                const lastSyncAt = result.settings?.lastChromeSyncAt;
                if (lastSyncAt) {
                    el.textContent = `上次同步：${new Date(lastSyncAt).toLocaleString()}`;
                    el.style.color = '#718096';
                } else {
                    el.textContent = '就绪';
                    el.style.color = '#718096';
                }
            } catch (e) {
                el.textContent = '就绪';
                el.style.color = '#718096';
            }
        }
    };

    SyncMixin.loadSettingsIntoForm = async function () {
        try {
            const settings = await storageManager.getSettings();

            // 填充表单字段
            document.getElementById('syncToChromeBookmarks').checked =
                settings.syncToChromeBookmarks || false;
            document.getElementById('autoFetchIcons').checked = settings.autoFetchIcons !== false; // 默认为true
            document.getElementById('showEmptyGroups').checked = settings.showEmptyGroups !== false; // 默认为true
            document.getElementById('theme').value = settings.theme || 'default';
            document.getElementById('background').value = settings.background || 'gradient';
        } catch (error) {
            console.error('Failed to load settings into form:', error);
        }
    };

    SyncMixin.saveSettings = async function () {
        try {
            const settings = {
                syncToChromeBookmarks: document.getElementById('syncToChromeBookmarks').checked,
                autoFetchIcons: document.getElementById('autoFetchIcons').checked,
                showEmptyGroups: document.getElementById('showEmptyGroups').checked,
                theme: document.getElementById('theme').value,
                background: document.getElementById('background').value,
            };

            await storageManager.saveSettings(settings);

            // 隐藏模态框
            this.hideModal('settingsModal');

            // 显示成功通知
            this.showNotification('设置已保存', 'success');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('保存设置失败', 'error');
        }
    };

    SyncMixin.syncFromChromeBookmarks = async function () {
        try {
            this.showNotification('正在从Chrome书签同步...', 'info');
            this.refreshSettingsSyncStatus('正在从Chrome书签读取...', 'progress');

            // 调用 background script 的同步功能
            chrome.runtime.sendMessage({ action: 'syncBookmarksFromChrome' }, async (response) => {
                if (chrome.runtime.lastError) {
                    // service worker 启动失败 / 消息未送达
                    console.error('[Sync] runtime.lastError:', chrome.runtime.lastError.message);
                    this.showError('同步失败：后台服务未响应，请重载扩展后重试');
                    this.refreshSettingsSyncStatus('失败：后台服务无响应', 'error');
                    return;
                }

                if (response && response.success) {
                    const added = response.addedGroups || 0;
                    const addedB = response.addedBookmarks || 0;
                    if (added > 0 || addedB > 0) {
                        this.showSuccess(`同步成功！新增 ${added} 个分组 / ${addedB} 个书签`);
                        this.refreshSettingsSyncStatus(
                            `读取成功：新增 ${added} 分组 / ${addedB} 书签`,
                            'success'
                        );
                    } else {
                        this.showSuccess('同步成功！（无新增数据）');
                        this.refreshSettingsSyncStatus(
                            `读取成功：共 ${response.totalGroups || 0} 分组 / ${response.totalBookmarks || 0} 书签，无新增`,
                            'success'
                        );
                    }
                    // 记录时间戳
                    await chrome.storage.sync.get(['settings']).then(async (r) => {
                        const settings = r.settings || {};
                        settings.lastChromeSyncAt = Date.now();
                        settings.lastChromeSyncDirection = 'from';
                        await chrome.storage.sync.set({ settings });
                    });
                    // 重新加载数据
                    await this.renderGroups();
                } else if (response && response.reason) {
                    // background 显式返回失败原因
                    const reason = response.reason;
                    const hint = response.hint ? '\n\n' + response.hint : '';
                    let msg;
                    switch (reason) {
                        case 'ROOT_FOLDER_NOT_FOUND':
                            msg = `未找到根文件夹 "${response.folderName || 'Chrome Start Page Bookmarks'}"。请确认 chrome://bookmarks 中存在同名文件夹。${hint}`;
                            break;
                        case 'ROOT_FOLDER_EMPTY':
                            msg = `根文件夹为空，无可同步的书签。请先在 Chrome 书签管理器中向该文件夹添加书签。${hint}`;
                            break;
                        case 'DUPLICATE_FOLDERS':
                            msg = `找到 ${(response.folders || []).length} 个同名根文件夹，请先在 chrome://bookmarks 中重命名或删除多余的。${hint}`;
                            break;
                        case 'ALREADY_SYNCING':
                            msg = `上一次同步尚未完成，请稍后再试。${hint}`;
                            break;
                        default:
                            msg = `同步失败: ${reason} ${hint}`;
                    }
                    console.warn('[Sync] background rejected:', response);
                    this.showError(msg);
                    this.refreshSettingsSyncStatus(`失败：${reason}`, 'error');
                } else {
                    this.showError('同步失败: ' + (response?.error || '未知错误'));
                    this.refreshSettingsSyncStatus(
                        `失败：${response?.error || '未知错误'}`,
                        'error'
                    );
                }
            });
        } catch (error) {
            console.error('Failed to sync from Chrome bookmarks:', error);
            this.showError('同步失败: ' + error.message);
        }
    };

    SyncMixin.syncToChromeBookmarks = async function () {
        try {
            this.showNotification('正在写入到Chrome书签...', 'info');
            this.refreshSettingsSyncStatus('正在写入Chrome书签...', 'progress');

            chrome.runtime.sendMessage({ action: 'syncBookmarksToChrome' }, async (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[SyncTo] runtime.lastError:', chrome.runtime.lastError.message);
                    this.showError('写入失败：后台服务未响应，请重载扩展后重试');
                    this.refreshSettingsSyncStatus('失败：后台服务无响应', 'error');
                    return;
                }

                if (response && response.success) {
                    const wrote = response.wroteGroups || 0;
                    const wroteB = response.wroteBookmarks || 0;
                    if (response.reason === 'EMPTY') {
                        this.showNotification('没有可写入的数据，请先添加分组或书签', 'info');
                        this.refreshSettingsSyncStatus('无数据可写入', 'info');
                    } else {
                        this.showSuccess(`已写入Chrome书签！${wrote} 分组 / ${wroteB} 书签`);
                        this.refreshSettingsSyncStatus(
                            `写入成功：${wrote} 分组 / ${wroteB} 书签`,
                            'success'
                        );
                        // 记录时间戳
                        await chrome.storage.sync.get(['settings']).then(async (r) => {
                            const settings = r.settings || {};
                            settings.lastChromeSyncAt = Date.now();
                            settings.lastChromeSyncDirection = 'to';
                            await chrome.storage.sync.set({ settings });
                        });
                    }
                } else if (response && response.reason) {
                    this.showError(`写入失败：${response.reason} ${response.hint || ''}`);
                    this.refreshSettingsSyncStatus(`失败：${response.reason}`, 'error');
                } else {
                    this.showError('写入失败: ' + (response?.error || '未知错误'));
                    this.refreshSettingsSyncStatus(
                        `失败：${response?.error || '未知错误'}`,
                        'error'
                    );
                }
            });
        } catch (error) {
            console.error('Failed to sync to Chrome bookmarks:', error);
            this.showError('写入失败: ' + error.message);
            this.refreshSettingsSyncStatus(`失败：${error.message}`, 'error');
        }
    };

    // SyncMixin 已挂到 window.__ChromeStartPageMixins.sync, 由 main.js 末尾统一 merge
    console.log('[main/sync.js] queued (14 methods)');
})();
