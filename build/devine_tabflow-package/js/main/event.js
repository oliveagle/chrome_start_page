/* global ChromeStartPageApp */
// devine_tabflow - event layer
// 从 main.js 拆分 (15 个方法)
// 通过先赋值到 const 再 Object.assign 注入到 ChromeStartPageApp.prototype
// (严格模式下不能在对象字面量里直接声明 async/function)
(function () {
    'use strict';

    // 初始化 bootstrap 容器 (在 main.js 之前加载, 攒方法)
    if (typeof window.__ChromeStartPageMixins === 'undefined') {
        window.__ChromeStartPageMixins = {};
    }
    const EventMixin = (window.__ChromeStartPageMixins.event = {});

    EventMixin.setupFormEvents = function () {
        // 组表单
        const groupForm = document.getElementById('groupForm');
        if (groupForm) {
            groupForm.addEventListener('submit', (e) => this.handleGroupSubmit(e));
        }

        // 书签表单
        const bookmarkForm = document.getElementById('bookmarkForm');
        if (bookmarkForm) {
            bookmarkForm.addEventListener('submit', (e) => this.handleBookmarkSubmit(e));
        }

        // 刷新图标按钮
        const refreshIconBtn = document.getElementById('refreshIconBtn');
        if (refreshIconBtn) {
            refreshIconBtn.addEventListener('click', () => this.handleRefreshIcon());
        }

        // 刷新标题按钮
        const refreshTitleBtn = document.getElementById('refreshTitleBtn');
        if (refreshTitleBtn) {
            refreshTitleBtn.addEventListener('click', () => this.handleRefreshTitle());
        }

        // URL 输入框变化时自动获取标题
        const bookmarkUrlInput = document.getElementById('bookmarkUrl');
        if (bookmarkUrlInput) {
            // 防抖处理
            let urlChangeTimeout;
            bookmarkUrlInput.addEventListener('input', (e) => {
                clearTimeout(urlChangeTimeout);
                urlChangeTimeout = setTimeout(() => {
                    this.handleUrlChange(e.target.value);
                }, 800); // 800ms 防抖
            });
        }

        // 预览自定义图标按钮
        const previewCustomIconBtn = document.getElementById('previewCustomIconBtn');
        if (previewCustomIconBtn) {
            previewCustomIconBtn.addEventListener('click', () => this.handlePreviewCustomIcon());
        }

        // 确认模态框
        document
            .getElementById('confirmAction')
            ?.addEventListener('click', () => this.handleConfirmAction());

        // 设置表单
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }
    };

    EventMixin.bindGroupEvents = function (groupElement) {
        // 组操作按钮
        groupElement.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.getAttribute('data-action');
                const groupId = e.target.getAttribute('data-group-id');

                if (action === 'add-bookmark') {
                    this.showBookmarkModal(groupId);
                } else {
                    this.handleGroupAction(action, groupId);
                }
            });
        });

        // 书签操作
        groupElement.querySelectorAll('.bookmark-item').forEach((bookmarkElement) => {
            this.bindBookmarkEvents(bookmarkElement);
        });
    };

    EventMixin.bindBookmarkEvents = function (bookmarkElement) {
        const bookmarkId = bookmarkElement.getAttribute('data-bookmark-id');

        // 书签点击打开
        const bookmarkInfo = bookmarkElement.querySelector('.bookmark-info');
        if (bookmarkInfo) {
            bookmarkInfo.addEventListener('click', (e) => {
                e.stopPropagation();

                // 检测 CMD 键（Mac）或 Ctrl 键（Windows/Linux）
                const isCmdOrCtrl = e.metaKey || e.ctrlKey;

                if (isCmdOrCtrl) {
                    // CMD+点击：在后台新窗口打开
                    this.openBookmarkInBackground(bookmarkId);
                } else {
                    // 普通点击：正常打开
                    this.handleBookmarkAction('open-bookmark', bookmarkId);
                }
            });
        }

        // 书签操作按钮
        bookmarkElement.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.getAttribute('data-action');
                this.handleBookmarkAction(action, bookmarkId);
            });
        });

        // 图标加载错误处理
        const iconImg = bookmarkElement.querySelector('.bookmark-icon-img');
        if (iconImg) {
            iconImg.addEventListener('error', (e) => {
                e.target.style.display = 'none';
            });
        }
    };

    EventMixin.bindSettingsSyncButtons = function () {
        const fromBtn = document.getElementById('settingsSyncFromChromeBtn');
        if (fromBtn && !fromBtn.dataset.bound) {
            fromBtn.dataset.bound = '1';
            fromBtn.addEventListener('click', () => this.syncFromChromeBookmarks());
        }
        const toBtn = document.getElementById('settingsSyncToChromeBtn');
        if (toBtn && !toBtn.dataset.bound) {
            toBtn.dataset.bound = '1';
            toBtn.addEventListener('click', () => this.syncToChromeBookmarks());
        }

        // 队列按钮
        const queueRefresh = document.getElementById('queueRefreshBtn');
        if (queueRefresh && !queueRefresh.dataset.bound) {
            queueRefresh.dataset.bound = '1';
            queueRefresh.addEventListener('click', () => this.refreshQueueStats());
        }
        const queueDrain = document.getElementById('queueDrainBtn');
        if (queueDrain && !queueDrain.dataset.bound) {
            queueDrain.dataset.bound = '1';
            queueDrain.addEventListener('click', () => this.drainQueue());
        }
        const queueRetry = document.getElementById('queueRetryBtn');
        if (queueRetry && !queueRetry.dataset.bound) {
            queueRetry.dataset.bound = '1';
            queueRetry.addEventListener('click', () => this.retryFailedQueue());
        }
        const queueClear = document.getElementById('queueClearBtn');
        if (queueClear && !queueClear.dataset.bound) {
            queueClear.dataset.bound = '1';
            queueClear.addEventListener('click', () => this.clearQueue());
        }
    };

    EventMixin.handleGroupAction = async function (action, groupId) {
        try {
            switch (action) {
                case 'edit-group':
                    this.showGroupModal(groupId);
                    break;
                case 'delete-group':
                    await this.confirmDeleteGroup(groupId);
                    break;
                case 'move-group-up':
                    await this.moveGroupByOffset(groupId, -1);
                    break;
                case 'move-group-down':
                    await this.moveGroupByOffset(groupId, +1);
                    break;
                default:
                    console.warn('Unknown group action:', action);
            }
        } catch (error) {
            console.error('Group action failed:', error);
            this.showError(error.message);
        }
    };

    EventMixin.handleBookmarkAction = async function (action, bookmarkId) {
        try {
            switch (action) {
                case 'open-bookmark':
                    await bookmarkManager.openBookmark(bookmarkId);
                    break;
                case 'edit-bookmark':
                    this.showBookmarkModal(null, bookmarkId);
                    break;
                case 'delete-bookmark':
                    await this.confirmDeleteBookmark(bookmarkId);
                    break;
                default:
                    console.warn('Unknown bookmark action:', action);
            }
        } catch (error) {
            console.error('Bookmark action failed:', error);
            this.showError(error.message);
        }
    };

    EventMixin.handleGroupSubmit = async function (e) {
        e.preventDefault();

        try {
            const name = document.getElementById('groupName').value.trim();

            if (!name) {
                this.showError('请输入分组名称');
                return;
            }

            if (this.currentEditingGroup) {
                // 更新组
                await groupManager.updateGroup(this.currentEditingGroup, { name });
                this.showSuccess('分组更新成功');
            } else {
                // 创建新组
                await groupManager.createGroup(name);
                this.showSuccess('分组创建成功');
            }

            this.hideModal('groupModal');
            await this.renderGroups();
            // renderGroups 内部会调用 updateEmptyState
        } catch (error) {
            console.error('Group form submission failed:', error);
            this.showError(error.message);
        }
    };

    EventMixin.handleBookmarkSubmit = async function (e) {
        e.preventDefault();

        try {
            const formData = {
                title: document.getElementById('bookmarkTitle').value.trim(),
                url: document.getElementById('bookmarkUrl').value.trim(),
                groupId: document.getElementById('bookmarkGroup').value,
            };

            if (!formData.title || !formData.url || !formData.groupId) {
                this.showError('请填写完整信息');
                return;
            }

            // 优先使用自定义图标URL
            const customIconUrl = document.getElementById('customIconUrl').value.trim();
            if (customIconUrl) {
                formData.icon = customIconUrl;
            } else {
                // 如果没有自定义，尝试使用预览的图标
                const iconPreview = document.getElementById('iconPreview');
                if (iconPreview && iconPreview.style.display !== 'none' && iconPreview.src) {
                    formData.icon = iconPreview.src;
                }
            }

            if (this.currentEditingBookmark) {
                // 更新书签
                await bookmarkManager.updateBookmark(this.currentEditingBookmark, formData);
                this.showSuccess('书签更新成功');
            } else {
                // 创建新书签
                await bookmarkManager.createBookmark(formData);
                this.showSuccess('书签添加成功');
            }

            this.hideModal('bookmarkModal');
            await this.renderGroups();
        } catch (error) {
            console.error('Bookmark form submission failed:', error);
            this.showError(error.message);
        }
    };

    EventMixin.confirmDeleteGroup = async function (groupId) {
        try {
            const group = await groupManager.getGroup(groupId);
            if (!group) return;

            const bookmarkCount = await groupManager.getGroupBookmarkCount(groupId);

            const confirmModal = document.getElementById('confirmModal');
            const confirmTitle = document.getElementById('confirmTitle');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmAction = document.getElementById('confirmAction');

            if (!confirmModal || !confirmTitle || !confirmMessage || !confirmAction) return;

            confirmTitle.textContent = '删除分组';
            confirmMessage.textContent =
                bookmarkCount > 0
                    ? `确定要删除分组"${group.name}"吗？这将同时删除其中的 ${bookmarkCount} 个书签。`
                    : `确定要删除分组"${group.name}"吗？`;

            confirmAction.setAttribute('data-type', 'group');
            confirmAction.setAttribute('data-id', groupId);

            this.showModal('confirmModal');
        } catch (error) {
            console.error('Failed to show group delete confirmation:', error);
        }
    };

    EventMixin.confirmDeleteBookmark = async function (bookmarkId) {
        try {
            const bookmark = await bookmarkManager.getBookmark(bookmarkId);
            if (!bookmark) return;

            const confirmModal = document.getElementById('confirmModal');
            const confirmTitle = document.getElementById('confirmTitle');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmAction = document.getElementById('confirmAction');

            if (!confirmModal || !confirmTitle || !confirmMessage || !confirmAction) return;

            confirmTitle.textContent = '删除书签';
            confirmMessage.textContent = `确定要删除书签"${bookmark.title}"吗？`;

            confirmAction.setAttribute('data-type', 'bookmark');
            confirmAction.setAttribute('data-id', bookmarkId);

            this.showModal('confirmModal');
        } catch (error) {
            console.error('Failed to show bookmark delete confirmation:', error);
        }
    };

    EventMixin.handleConfirmAction = async function () {
        try {
            const confirmAction = document.getElementById('confirmAction');
            const type = confirmAction.getAttribute('data-type');
            const id = confirmAction.getAttribute('data-id');

            if (type === 'group') {
                await groupManager.forceDeleteGroup(id);
                this.showSuccess('分组删除成功');
            } else if (type === 'bookmark') {
                await bookmarkManager.deleteBookmark(id);
                this.showSuccess('书签删除成功');
            }

            this.hideModal('confirmModal');
            await this.renderGroups();
            // renderGroups 内部会调用 updateEmptyState
        } catch (error) {
            console.error('Confirm action failed:', error);
            this.showError(error.message);
        }
    };

    EventMixin.handleRefreshIcon = async function () {
        const urlInput = document.getElementById('bookmarkUrl');
        const url = urlInput?.value.trim();

        if (!url) {
            this.showError('请先输入网址');
            return;
        }

        // 验证 URL
        try {
            const normalizedUrl = storageManager.normalizeUrl(url);
            if (!storageManager.isValidUrl(normalizedUrl)) {
                this.showError('请输入有效的网址');
                return;
            }

            // 显示加载中
            this.showIconPreview(null, '正在获取图标...');

            // 获取图标
            const iconUrl = await this.fetchIconFromUrl(normalizedUrl);

            if (iconUrl) {
                this.showIconPreview(iconUrl, '图标获取成功');
                this.showSuccess('图标获取成功');
            } else {
                this.showIconPreview(null, '未找到图标');
                this.showError('无法获取图标，将使用默认图标');
            }
        } catch (error) {
            console.error('Failed to refresh icon:', error);
            this.showIconPreview(null, '获取失败');
            this.showError('获取图标失败');
        }
    };

    EventMixin.handlePreviewCustomIcon = async function () {
        const customIconInput = document.getElementById('customIconUrl');
        const iconUrl = customIconInput?.value.trim();

        if (!iconUrl) {
            this.showError('请先输入图标地址');
            return;
        }

        // 验证 URL
        try {
            new URL(iconUrl);
        } catch (error) {
            this.showError('请输入有效的图标地址');
            return;
        }

        // 显示预览
        this.showIconPreview(iconUrl, '自定义图标预览');
        this.showSuccess('图标预览成功');
    };

    EventMixin.handleUrlChange = async function (url) {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return;

        // 验证 URL
        try {
            const normalizedUrl = storageManager.normalizeUrl(trimmedUrl);
            if (!storageManager.isValidUrl(normalizedUrl)) {
                return; // URL 无效，不做处理
            }

            // 自动获取标题
            const titleInput = document.getElementById('bookmarkTitle');
            if (titleInput && !titleInput.value.trim()) {
                // 只有当标题为空时才自动填充
                const title = await this.fetchTitleFromUrl(normalizedUrl);
                if (title) {
                    titleInput.value = title;
                }
            }

            // 先尝试从缓存获取图标
            let iconUrl = await bookmarkManager.getIconFromCache(normalizedUrl);
            if (iconUrl) {
                console.log('URL change: Using cached icon for', normalizedUrl);
                this.showIconPreview(iconUrl, '缓存复用');
            } else {
                // 缓存未命中，从服务器获取
                console.log('URL change: Cache miss, fetching icon for', normalizedUrl);
                iconUrl = await this.fetchIconFromUrl(normalizedUrl);
                if (iconUrl) {
                    this.showIconPreview(iconUrl, '自动获取');
                }
            }
        } catch (error) {
            console.error('Failed to handle URL change:', error);
        }
    };

    EventMixin.handleRefreshTitle = async function () {
        const urlInput = document.getElementById('bookmarkUrl');
        const titleInput = document.getElementById('bookmarkTitle');
        const url = urlInput?.value.trim();

        if (!url) {
            this.showError('请先输入网址');
            return;
        }

        // 验证 URL
        try {
            const normalizedUrl = storageManager.normalizeUrl(url);
            if (!storageManager.isValidUrl(normalizedUrl)) {
                this.showError('请输入有效的网址');
                return;
            }

            // 显示加载中
            if (titleInput) {
                const originalTitle = titleInput.value;
                titleInput.value = '正在获取标题...';
                titleInput.disabled = true;

                // 获取标题
                const title = await this.fetchTitleFromUrl(normalizedUrl);

                titleInput.disabled = false;

                if (title) {
                    titleInput.value = title;
                    this.showSuccess('标题获取成功');
                } else {
                    titleInput.value = originalTitle;
                    this.showError('无法获取标题');
                }
            }
        } catch (error) {
            console.error('Failed to refresh title:', error);
            if (titleInput) {
                titleInput.disabled = false;
            }
            this.showError('获取标题失败');
        }
    };

    // EventMixin 已挂到 window.__ChromeStartPageMixins.event, 由 main.js 末尾统一 merge
    console.log('[main/event.js] queued (15 methods)');
})();
