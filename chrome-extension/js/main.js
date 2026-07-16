// Chrome Start Page Main Application
// 协调所有模块，管理用户界面交互

class ChromeStartPageApp {
    constructor() {
        this.currentEditingGroup = null;
        this.currentEditingBookmark = null;
        this.isInitialized = false;
        this.renderTimeout = null;

        // 等待DOM加载完成后初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    // ===== 应用初始化 =====

    async init() {
        try {
            console.log('Initializing Chrome Start Page App...');

            // 等待管理器初始化
            await this.waitForManagers();

            // 绑定事件监听器
            this.bindEventListeners();

            // 初始化数据
            await this.initializeData();

            // 加载并显示数据
            await this.loadAndDisplayData();

            // 设置存储变化监听
            this.setupStorageListeners();

            this.isInitialized = true;
            console.log('Chrome Start Page App initialized successfully');

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('应用初始化失败，请刷新页面重试');
        }
    }

    // 等待管理器初始化
    waitForManagers() {
        return new Promise((resolve) => {
            const checkManagers = () => {
                if (window.storageManager && window.groupManager && window.bookmarkManager) {
                    resolve();
                } else {
                    setTimeout(checkManagers, 100);
                }
            };
            checkManagers();
        });
    }

    // ===== 事件绑定 =====

    bindEventListeners() {
        // 按钮事件
        document.getElementById('addGroupBtn')?.addEventListener('click', () => this.showGroupModal());
        document.getElementById('addBookmarkBtn')?.addEventListener('click', () => this.showBookmarkModal());
        document.getElementById('settingsBtn')?.addEventListener('click', () => this.showSettings());
        document.getElementById('syncFromChromeBtn')?.addEventListener('click', () => this.syncFromChromeBookmarks());

        // 模态框事件
        this.setupModalEvents();

        // 表单事件
        this.setupFormEvents();

        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // 窗口事件
        window.addEventListener('resize', () => this.handleResize());
    }

    // 设置模态框事件
    setupModalEvents() {
        // 关闭按钮
        document.querySelectorAll('.modal-close, [data-modal]').forEach(element => {
            element.addEventListener('click', (e) => {
                const modalId = e.target.getAttribute('data-modal') || e.target.getAttribute('data-modal-close');
                if (modalId) {
                    this.hideModal(modalId);
                }
            });
        });

        // 移除点击背景关闭功能，防止失焦后模态框消失
        // 只能通过点击关闭按钮或按ESC键关闭

        // ESC键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // 设置表单事件
    setupFormEvents() {
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
        document.getElementById('confirmAction')?.addEventListener('click', () => this.handleConfirmAction());

        // 设置表单
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }
    }

    // ===== 数据初始化 =====

    async initializeData() {
        try {
            // 检查是否有初始数据
            const groups = await groupManager.getAllGroups();
            const settings = await storageManager.getSettings();

            if (groups.length === 0) {
                // 创建默认分组
                await this.createDefaultGroups();
            }

            console.log('Data initialized');

        } catch (error) {
            console.error('Failed to initialize data:', error);
        }
    }

    // 创建默认分组
    async createDefaultGroups() {
        const defaultGroups = ['工作', '学习', '娱乐', '工具'];

        for (const groupName of defaultGroups) {
            try {
                await groupManager.createGroup(groupName);
            } catch (error) {
                console.warn(`Failed to create default group ${groupName}:`, error.message);
            }
        }

        console.log('Default groups created');
    }

    // ===== 数据加载和显示 =====

    async loadAndDisplayData() {
        try {
            await this.renderGroups();
            // renderGroups 内部会调用 updateEmptyState

        } catch (error) {
            console.error('Failed to load and display data:', error);
            this.showError('加载数据失败');
        }
    }

    // 渲染组（带防抖）
    async renderGroups() {
        // 清除之前的渲染计划
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }

        // 延迟渲染，避免重复调用
        this.renderTimeout = setTimeout(async () => {
            const groupsContainer = document.getElementById('groupsGrid');
            if (!groupsContainer) return;

            try {
                const groups = await groupManager.getAllGroups();

                if (groups.length === 0) {
                    groupsContainer.innerHTML = '';
                    this.updateEmptyState();
                    return;
                }

                // 按 order 排序（没有 order 的兜底按 createdAt）
                groups.sort((a, b) => {
                    const ao = a.order, bo = b.order;
                    if (ao !== undefined && bo !== undefined) return ao - bo;
                    if (ao !== undefined) return -1;
                    if (bo !== undefined) return 1;
                    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                });

                // 创建文档片段，避免多次重排
                const fragment = document.createDocumentFragment();

                for (const group of groups) {
                    const groupElement = await this.createGroupElement(group);
                    fragment.appendChild(groupElement);
                }

                // 一次性替换所有内容，减少闪烁
                groupsContainer.innerHTML = '';
                groupsContainer.appendChild(fragment);

                // 渲染完成后更新空状态
                this.updateEmptyState();

            } catch (error) {
                console.error('Failed to render groups:', error);
                groupsContainer.innerHTML = '<p class="error">加载分组失败</p>';
                this.updateEmptyState();
            }
        }, 100);
    }

    // 创建组元素
    async createGroupElement(group) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group-card';
        groupDiv.setAttribute('data-group-id', group.id);

        const bookmarks = await bookmarkManager.getBookmarksByGroup(group.id);
        const bookmarkCount = bookmarks.length;

        groupDiv.innerHTML = `
            <div class="group-header">
                <h3 class="group-title">${this.escapeHtml(group.name)}</h3>
                <div class="group-actions">
                    <button class="group-action-btn" data-action="move-group-up" data-group-id="${group.id}" title="上移分组">↑</button>
                    <button class="group-action-btn" data-action="move-group-down" data-group-id="${group.id}" title="下移分组">↓</button>
                    <button class="group-action-btn" data-action="add-bookmark" data-group-id="${group.id}" title="添加书签">
                        +
                    </button>
                    <button class="group-action-btn" data-action="edit-group" data-group-id="${group.id}" title="编辑分组">
                        ✏️
                    </button>
                    <button class="group-action-btn" data-action="delete-group" data-group-id="${group.id}" title="删除分组">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="group-body">
                <ul class="bookmark-list" data-group-id="${group.id}">
                    ${await this.renderBookmarksList(bookmarks, group.id)}
                </ul>
                ${bookmarkCount === 0 ? '<p class="empty-group">暂无书签</p>' : ''}
            </div>
        `;

        // 绑定组事件
        this.bindGroupEvents(groupDiv);

        return groupDiv;
    }

    // 渲染书签列表
    async renderBookmarksList(bookmarks, groupId) {
        if (bookmarks.length === 0) {
            return '';
        }

        let html = '';
        for (const bookmark of bookmarks) {
            html += await this.createBookmarkElement(bookmark);
        }
        return html;
    }

    // 创建书签元素
    async createBookmarkElement(bookmark) {
        const iconUrl = await this.getBookmarkIconUrl(bookmark);
        const fallbackSvg = this.getDefaultBookmarkIconSvg();

        return `
            <li class="bookmark-item" data-bookmark-id="${bookmark.id}">
                <div class="bookmark-info" data-action="open-bookmark" data-bookmark-id="${bookmark.id}">
                    <div class="bookmark-icon">
                        ${iconUrl
                            ? `<img src="${iconUrl}" alt="" class="bookmark-icon-img" onerror="window.__defaultBookmarkIcon && window.__defaultBookmarkIcon(this)">`
                            : fallbackSvg}
                    </div>
                    <span class="bookmark-title">${this.escapeHtml(bookmark.title)}</span>
                </div>
                <div class="bookmark-actions">
                    <button class="bookmark-action-btn" data-action="edit-bookmark" data-bookmark-id="${bookmark.id}" title="编辑书签">
                        ✏️
                    </button>
                    <button class="bookmark-action-btn" data-action="delete-bookmark" data-bookmark-id="${bookmark.id}" title="删除书签">
                        🗑️
                    </button>
                </div>
            </li>
        `;
    }

    // 默认书签图标（内联 SVG）- favicon 加载失败或没 icon 时显示
    getDefaultBookmarkIconSvg() {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="bookmark-icon-img" width="16" height="16"><rect x="2" y="1" width="12" height="14" rx="2" fill="#718096"/><path d="M5 5h6v1H5zm0 2.5h6v1H5zm0 2.5h4v1H5z" fill="#fff"/></svg>`;
    }

    // 获取书签图标URL
    async getBookmarkIconUrl(bookmark) {
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
    }

    // 绑定组事件
    bindGroupEvents(groupElement) {
        // 组操作按钮
        groupElement.querySelectorAll('[data-action]').forEach(button => {
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
        groupElement.querySelectorAll('.bookmark-item').forEach(bookmarkElement => {
            this.bindBookmarkEvents(bookmarkElement);
        });
    }

    // 绑定书签事件
    bindBookmarkEvents(bookmarkElement) {
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
        bookmarkElement.querySelectorAll('[data-action]').forEach(button => {
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
    }

    // ===== 事件处理方法 =====

    // 处理组操作
    async handleGroupAction(action, groupId) {
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
    }

    // 把分组上下移动 offset 个位置
    async moveGroupByOffset(groupId, offset) {
        const groups = await storageManager.getGroups();
        const sorted = groups.slice().sort((a, b) => {
            const ao = a.order, bo = b.order;
            if (ao !== undefined && bo !== undefined) return ao - bo;
            if (ao !== undefined) return -1;
            if (bo !== undefined) return 1;
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });
        const idx = sorted.findIndex(g => g.id === groupId);
        if (idx === -1) return;
        const newIdx = idx + offset;
        if (newIdx < 0 || newIdx >= sorted.length) return;
        // 数组中交换
        [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
        // 重新分配 order
        sorted.forEach((g, i) => g.order = i);
        await storageManager.saveGroups(sorted);
        // 把所有变更的 group 都 enqueue update（让 chrome 那边的 order 也跟上）
        // 实际上只 enqueue 两个就够了：被移动的两个
        if (typeof groupManager !== 'undefined' && groupManager._enqueueOp) {
            groupManager._enqueueOp('update', sorted[idx]);
            groupManager._enqueueOp('update', sorted[newIdx]);
        }
        await this.renderGroups();
    }

    // 处理书签操作
    async handleBookmarkAction(action, bookmarkId) {
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
    }

    // 在后台新窗口打开书签
    async openBookmarkInBackground(bookmarkId) {
        try {
            const bookmark = await bookmarkManager.getBookmark(bookmarkId);
            if (!bookmark) {
                throw new Error('书签不存在');
            }

            // 检查是否是邮件链接
            const isEmail = this.isEmailBookmark(bookmark.url);

            if (isEmail) {
                // 邮件链接：使用 background script 在后台窗口打开
                chrome.runtime.sendMessage({
                    action: 'openEmailInBackground',
                    url: bookmark.url
                }, (response) => {
                    if (response && response.success) {
                        console.log('邮件已在后台窗口打开:', bookmark.url);
                    } else {
                        // 如果失败，使用普通方式打开
                        console.warn('无法在后台打开邮件，使用普通方式打开');
                        bookmarkManager.openBookmark(bookmarkId);
                    }
                });
            } else {
                // 非邮件链接：直接在后台标签页打开
                await bookmarkManager.openBookmark(bookmarkId, true);
            }

        } catch (error) {
            console.error('Failed to open bookmark in background:', error);
            this.showError('后台打开失败: ' + error.message);
        }
    }

    // 检查是否为邮件书签
    isEmailBookmark(url) {
        if (!url) return false;

        try {
            const urlObj = new URL(url);

            // 检查 mailto 协议
            if (urlObj.protocol === 'mailto:') {
                return true;
            }

            // 常见邮件服务域名
            const emailDomains = [
                'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
                'protonmail.com', 'mail.qq.com', '163.com', '126.com',
                'sina.com', 'foxmail.com'
            ];

            const hostname = urlObj.hostname.toLowerCase();

            // 检查域名匹配
            for (const domain of emailDomains) {
                if (hostname.includes(domain)) {
                    return true;
                }
            }

            // 检查路径或参数中的邮件关键词
            const path = urlObj.pathname.toLowerCase();
            const search = urlObj.search.toLowerCase();

            return path.includes('mail') || path.includes('message') ||
                   search.includes('mail') || search.includes('email');

        } catch (error) {
            console.error('Error parsing URL for email check:', error);
            return false;
        }
    }

    // ===== 模态框显示/隐藏 =====

    // 显示组模态框
    showGroupModal(groupId = null) {
        const modal = document.getElementById('groupModal');
        const title = document.getElementById('groupModalTitle');
        const nameInput = document.getElementById('groupName');
        const form = document.getElementById('groupForm');

        if (!modal || !title || !nameInput || !form) return;

        this.currentEditingGroup = groupId;

        if (groupId) {
            // 编辑模式
            title.textContent = '编辑分组';
            this.getGroup(groupId).then(group => {
                if (group) {
                    nameInput.value = group.name;
                }
            });
        } else {
            // 添加模式
            title.textContent = '添加新分组';
            form.reset();
        }

        this.showModal('groupModal');
        nameInput.focus();
    }

    // 显示书签模态框
    async showBookmarkModal(groupId = null, bookmarkId = null) {
        const modal = document.getElementById('bookmarkModal');
        const title = document.getElementById('bookmarkModalTitle');
        const form = document.getElementById('bookmarkForm');
        const groupSelect = document.getElementById('bookmarkGroup');

        if (!modal || !title || !form || !groupSelect) return;

        this.currentEditingBookmark = bookmarkId;

        // 隐藏图标预览
        this.hideIconPreview();

        // 先加载分组选项
        await this.loadGroupOptions();

        if (bookmarkId) {
            // 编辑模式 - 加载分组后再设置书签数据
            title.textContent = '编辑书签';
            await this.loadBookmarkForEditing(bookmarkId);
        } else {
            // 添加模式
            title.textContent = '添加新书签';
            form.reset();
            if (groupId) {
                groupSelect.value = groupId;
            }
        }

        this.showModal('bookmarkModal');
        document.getElementById('bookmarkTitle')?.focus();
    }

    // 加载分组选项
    async loadGroupOptions() {
        const groupSelect = document.getElementById('bookmarkGroup');
        if (!groupSelect) return;

        try {
            const groups = await groupManager.getAllGroups();
            const currentValue = groupSelect.value;

            groupSelect.innerHTML = '<option value="">请选择分组</option>';

            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                groupSelect.appendChild(option);
            });

            // 恢复之前的值
            if (currentValue) {
                groupSelect.value = currentValue;
            }
        } catch (error) {
            console.error('Failed to load group options:', error);
        }
    }

    // 加载书签进行编辑
    async loadBookmarkForEditing(bookmarkId) {
        try {
            const bookmark = await bookmarkManager.getBookmark(bookmarkId);
            if (!bookmark) return;

            document.getElementById('bookmarkTitle').value = bookmark.title;
            document.getElementById('bookmarkUrl').value = bookmark.url;
            document.getElementById('bookmarkGroup').value = bookmark.groupId;

            // 如果有图标，显示预览和填充自定义URL
            if (bookmark.icon) {
                // 如果图标不是 favicon.ico，认为是自定义图标
                if (!bookmark.icon.endsWith('/favicon.ico')) {
                    document.getElementById('customIconUrl').value = bookmark.icon;
                }
                this.showIconPreview(bookmark.icon, '当前图标');
            }
        } catch (error) {
            console.error('Failed to load bookmark for editing:', error);
        }
    }

    // 获取组信息
    async getGroup(groupId) {
        return await groupManager.getGroup(groupId);
    }

    // 显示模态框
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    // 隐藏模态框
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // 重置编辑状态
        if (modalId === 'groupModal') {
            this.currentEditingGroup = null;
        } else if (modalId === 'bookmarkModal') {
            this.currentEditingBookmark = null;
        }
    }

    // 关闭所有模态框
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        document.body.style.overflow = 'auto';

        this.currentEditingGroup = null;
        this.currentEditingBookmark = null;
    }

    // ===== 表单处理 =====

    // 处理组表单提交
    async handleGroupSubmit(e) {
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
    }

    // 处理书签表单提交
    async handleBookmarkSubmit(e) {
        e.preventDefault();

        try {
            const formData = {
                title: document.getElementById('bookmarkTitle').value.trim(),
                url: document.getElementById('bookmarkUrl').value.trim(),
                groupId: document.getElementById('bookmarkGroup').value
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
    }

    // ===== 确认对话框 =====

    // 确认删除组
    async confirmDeleteGroup(groupId) {
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
            confirmMessage.textContent = bookmarkCount > 0
                ? `确定要删除分组"${group.name}"吗？这将同时删除其中的 ${bookmarkCount} 个书签。`
                : `确定要删除分组"${group.name}"吗？`;

            confirmAction.setAttribute('data-type', 'group');
            confirmAction.setAttribute('data-id', groupId);

            this.showModal('confirmModal');

        } catch (error) {
            console.error('Failed to show group delete confirmation:', error);
        }
    }

    // 确认删除书签
    async confirmDeleteBookmark(bookmarkId) {
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
    }

    // 处理确认操作
    async handleConfirmAction() {
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
    }

    // ===== 状态更新 =====

    // 更新空状态显示
    updateEmptyState() {
        const emptyState = document.getElementById('emptyState');
        const groupsGrid = document.getElementById('groupsGrid');

        if (!emptyState || !groupsGrid) return;

        const hasGroups = groupsGrid.children.length > 0;

        if (hasGroups) {
            emptyState.style.display = 'none';
        } else {
            emptyState.style.display = 'block';
        }
    }

    // 设置存储监听器
    setupStorageListeners() {
        storageManager.onStorageChange((changes) => {
            console.log('Storage changed:', changes);

            // 如果数据发生变化，重新渲染（使用防抖）
            if (changes.groups || changes.bookmarks) {
                this.renderGroups();
                // renderGroups 内部会调用 updateEmptyState
            }
        });
    }

    // ===== 工具方法 =====

    // 刷新图标
    async handleRefreshIcon() {
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
    }

    // 预览自定义图标
    async handlePreviewCustomIcon() {
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
    }

    // 从 URL 获取图标
    async fetchIconFromUrl(url) {
        console.log('[Main] fetchIconFromUrl called for:', url);

        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                console.log('[Main] Sending message to background.js');
                chrome.runtime.sendMessage(
                    { action: 'fetchIcon', url: url },
                    (response) => {
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
                    }
                );
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
    }

    // 从 URL 获取页面标题
    async fetchTitleFromUrl(url) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage(
                    { action: 'fetchPageTitle', url: url },
                    (response) => {
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
                    }
                );
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
    }

    // 处理 URL 输入框变化
    async handleUrlChange(url) {
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
    }

    // 手动刷新标题
    async handleRefreshTitle() {
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
    }

    // 显示图标预览
    showIconPreview(iconUrl, status) {
        const previewGroup = document.getElementById('iconPreviewGroup');
        const previewImg = document.getElementById('iconPreview');
        const statusText = document.getElementById('iconStatus');

        if (!previewGroup || !previewImg || !statusText) return;

        previewGroup.style.display = 'block';

        if (iconUrl) {
            previewImg.src = iconUrl;
            previewImg.style.display = 'block';
        } else {
            previewImg.style.display = 'none';
        }

        statusText.textContent = status || '';
    }

    // 隐藏图标预览
    hideIconPreview() {
        const previewGroup = document.getElementById('iconPreviewGroup');
        if (previewGroup) {
            previewGroup.style.display = 'none';
        }
    }

    // HTML转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 显示错误消息
    showError(message) {
        this.showNotification(message, 'error');
    }

    // 显示成功消息
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    // 显示通知
    showNotification(message, type = 'info') {
        // 简单的通知实现
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#38a169' : '#3182ce'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // 键盘事件处理
    handleKeyDown(e) {
        // 在模态框中按 Ctrl+Enter 或 Cmd+Enter 提交表单
        // 避免在输入框中按 Enter 时意外提交
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            const activeModal = document.querySelector('.modal[style*="flex"]');
            if (activeModal) {
                const form = activeModal.querySelector('form');
                if (form) {
                    e.preventDefault();
                    form.dispatchEvent(new Event('submit'));
                }
            }
        }

        // ESC 键关闭模态框已经在 setupModalEvents 中处理
    }

    // 窗口大小变化处理
    handleResize() {
        // 可以在这里处理响应式布局调整
        console.log('Window resized');
    }

    // 显示设置
    async showSettings() {
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
    }

    // 绑定设置面板内的 Chrome 书签同步按钮
    bindSettingsSyncButtons() {
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
    }

    // ===== 操作队列 UI =====

    async refreshQueueStats() {
        const el = document.getElementById('queueStats');
        if (!el) return;
        el.textContent = '加载中…';
        try {
            const response = await new Promise(resolve => {
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
                    if (pending > 0) parts.push(`<span style="color:#3182ce;">待处理 ${pending}</span>`);
                    if (failed > 0) parts.push(`<span style="color:#e53e3e;">失败 ${failed}</span>`);
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
    }

    async drainQueue() {
        this.showNotification('正在排空队列...', 'info');
        const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'drainOpQueue' }, resolve);
        });
        if (response?.success) {
            this.showSuccess('队列已排空');
        } else {
            this.showError('排空失败：' + (response?.error || '未知错误'));
        }
        this.refreshQueueStats();
    }

    async retryFailedQueue() {
        const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'retryFailedOps' }, resolve);
        });
        if (response?.success) {
            this.showSuccess('失败操作已重新入队');
        } else {
            this.showError('重试失败：' + (response?.error || '未知错误'));
        }
        this.refreshQueueStats();
    }

    async clearQueue() {
        if (!confirm('确定清空操作队列？这会丢失所有未同步的操作（已经同步完成的不会受影响）。')) return;
        const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'clearOpQueue' }, resolve);
        });
        if (response?.success) {
            this.showSuccess('队列已清空');
        } else {
            this.showError('清空失败：' + (response?.error || '未知错误'));
        }
        this.refreshQueueStats();
    }

    // 刷新设置面板上的同步状态文字
    async refreshSettingsSyncStatus(text, type = 'info') {
        const el = document.getElementById('settingsSyncStatus');
        if (!el) return;
        if (text) {
            el.textContent = text;
            el.style.color = type === 'error' ? '#e53e3e'
                : type === 'success' ? '#38a169'
                : type === 'progress' ? '#3182ce'
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
    }

    // 加载设置到表单
    async loadSettingsIntoForm() {
        try {
            const settings = await storageManager.getSettings();

            // 填充表单字段
            document.getElementById('syncToChromeBookmarks').checked = settings.syncToChromeBookmarks || false;
            document.getElementById('autoFetchIcons').checked = settings.autoFetchIcons !== false; // 默认为true
            document.getElementById('showEmptyGroups').checked = settings.showEmptyGroups !== false; // 默认为true
            document.getElementById('theme').value = settings.theme || 'default';
            document.getElementById('background').value = settings.background || 'gradient';
        } catch (error) {
            console.error('Failed to load settings into form:', error);
        }
    }

    // 保存设置
    async saveSettings() {
        try {
            const settings = {
                syncToChromeBookmarks: document.getElementById('syncToChromeBookmarks').checked,
                autoFetchIcons: document.getElementById('autoFetchIcons').checked,
                showEmptyGroups: document.getElementById('showEmptyGroups').checked,
                theme: document.getElementById('theme').value,
                background: document.getElementById('background').value
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
    }

    // 从 Chrome 书签同步
    async syncFromChromeBookmarks() {
        try {
            this.showNotification('正在从Chrome书签同步...', 'info');
            this.refreshSettingsSyncStatus('正在从Chrome书签读取...', 'progress');

            // 调用 background script 的同步功能
            chrome.runtime.sendMessage(
                { action: 'syncBookmarksFromChrome' },
                async (response) => {
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
                            this.refreshSettingsSyncStatus(`读取成功：新增 ${added} 分组 / ${addedB} 书签`, 'success');
                        } else {
                            this.showSuccess('同步成功！（无新增数据）');
                            this.refreshSettingsSyncStatus(`读取成功：共 ${response.totalGroups || 0} 分组 / ${response.totalBookmarks || 0} 书签，无新增`, 'success');
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
                        this.refreshSettingsSyncStatus(`失败：${response?.error || '未知错误'}`, 'error');
                    }
                }
            );
        } catch (error) {
            console.error('Failed to sync from Chrome bookmarks:', error);
            this.showError('同步失败: ' + error.message);
        }
    }

    // 写入扩展分组和书签到 Chrome 书签
    async syncToChromeBookmarks() {
        try {
            this.showNotification('正在写入到Chrome书签...', 'info');
            this.refreshSettingsSyncStatus('正在写入Chrome书签...', 'progress');

            chrome.runtime.sendMessage(
                { action: 'syncBookmarksToChrome' },
                async (response) => {
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
                            this.refreshSettingsSyncStatus(`写入成功：${wrote} 分组 / ${wroteB} 书签`, 'success');
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
                        this.refreshSettingsSyncStatus(`失败：${response?.error || '未知错误'}`, 'error');
                    }
                }
            );
        } catch (error) {
            console.error('Failed to sync to Chrome bookmarks:', error);
            this.showError('写入失败: ' + error.message);
            this.refreshSettingsSyncStatus(`失败：${error.message}`, 'error');
        }
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 全局默认书签图标兜底（favicon 加载失败时调用）
window.__defaultBookmarkIcon = function(imgEl) {
    if (!imgEl || imgEl.dataset.fallbackApplied) return;
    imgEl.dataset.fallbackApplied = '1';
    imgEl.onerror = null;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.classList.add('bookmark-icon-img');
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '2'); rect.setAttribute('y', '1');
    rect.setAttribute('width', '12'); rect.setAttribute('height', '14');
    rect.setAttribute('rx', '2'); rect.setAttribute('fill', '#718096');
    svg.appendChild(rect);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M5 5h6v1H5zm0 2.5h6v1H5zm0 2.5h4v1H5z');
    path.setAttribute('fill', '#fff');
    svg.appendChild(path);
    imgEl.replaceWith(svg);
};

// 创建应用实例
const app = new ChromeStartPageApp();