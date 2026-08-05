// devine_tabflow Main Application
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
            console.log('Initializing devine_tabflow App...');

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
            console.log('devine_tabflow App initialized successfully');
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
        document
            .getElementById('addGroupBtn')
            ?.addEventListener('click', () => this.showGroupModal());
        document
            .getElementById('addBookmarkBtn')
            ?.addEventListener('click', () => this.showBookmarkModal());
        document
            .getElementById('settingsBtn')
            ?.addEventListener('click', () => this.showSettings());
        document
            .getElementById('syncFromChromeBtn')
            ?.addEventListener('click', () => this.syncFromChromeBookmarks());

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
        document.querySelectorAll('.modal-close, [data-modal]').forEach((element) => {
            element.addEventListener('click', (e) => {
                const modalId =
                    e.target.getAttribute('data-modal') ||
                    e.target.getAttribute('data-modal-close');
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

    // 创建组元素

    // 渲染书签列表

    // 创建书签元素

    // 默认书签图标（内联 SVG）- favicon 加载失败或没 icon 时显示

    // 获取书签图标URL

    // 绑定组事件

    // 绑定书签事件

    // ===== 事件处理方法 =====

    // 处理组操作

    // 把分组上下移动 offset 个位置
    async moveGroupByOffset(groupId, offset) {
        const groups = await storageManager.getGroups();
        const sorted = groups.slice().sort((a, b) => {
            const ao = a.order,
                bo = b.order;
            if (ao !== undefined && bo !== undefined) return ao - bo;
            if (ao !== undefined) return -1;
            if (bo !== undefined) return 1;
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        });
        const idx = sorted.findIndex((g) => g.id === groupId);
        if (idx === -1) return;
        const newIdx = idx + offset;
        if (newIdx < 0 || newIdx >= sorted.length) return;
        // 数组中交换
        [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
        // 重新分配 order
        sorted.forEach((g, i) => (g.order = i));
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
                chrome.runtime.sendMessage(
                    {
                        action: 'openEmailInBackground',
                        url: bookmark.url,
                    },
                    (response) => {
                        if (response && response.success) {
                            console.log('邮件已在后台窗口打开:', bookmark.url);
                        } else {
                            // 如果失败，使用普通方式打开
                            console.warn('无法在后台打开邮件，使用普通方式打开');
                            bookmarkManager.openBookmark(bookmarkId);
                        }
                    }
                );
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
                'gmail.com',
                'outlook.com',
                'hotmail.com',
                'yahoo.com',
                'protonmail.com',
                'mail.qq.com',
                '163.com',
                '126.com',
                'sina.com',
                'foxmail.com',
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

            return (
                path.includes('mail') ||
                path.includes('message') ||
                search.includes('mail') ||
                search.includes('email')
            );
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
            this.getGroup(groupId).then((group) => {
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

            groups.forEach((group) => {
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
        document.querySelectorAll('.modal').forEach((modal) => {
            modal.style.display = 'none';
        });
        document.body.style.overflow = 'auto';

        this.currentEditingGroup = null;
        this.currentEditingBookmark = null;
    }

    // ===== 表单处理 =====

    // 处理组表单提交

    // 处理书签表单提交

    // ===== 确认对话框 =====

    // 确认删除组

    // 确认删除书签

    // 处理确认操作

    // ===== 状态更新 =====

    // 更新空状态显示

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

    // 预览自定义图标

    // 从 URL 获取图标

    // 从 URL 获取页面标题

    // 处理 URL 输入框变化

    // 手动刷新标题

    // 显示图标预览

    // 隐藏图标预览

    // HTML转义

    // 显示错误消息

    // 显示成功消息

    // 显示通知

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

    // 绑定设置面板内的 Chrome 书签同步按钮

    // ===== 操作队列 UI =====

    // 刷新设置面板上的同步状态文字

    // 加载设置到表单

    // 保存设置

    // 从 Chrome 书签同步

    // 写入扩展分组和书签到 Chrome 书签
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
window.__defaultBookmarkIcon = function (imgEl) {
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
    rect.setAttribute('x', '2');
    rect.setAttribute('y', '1');
    rect.setAttribute('width', '12');
    rect.setAttribute('height', '14');
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', '#718096');
    svg.appendChild(rect);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M5 5h6v1H5zm0 2.5h6v1H5zm0 2.5h4v1H5z');
    path.setAttribute('fill', '#fff');
    svg.appendChild(path);
    imgEl.replaceWith(svg);
};

// 把拆分模块的方法合并到 ChromeStartPageApp.prototype
// (render.js / sync.js / event.js 在 main.js 之前加载,把方法攒到 window.__ChromeStartPageMixins)
if (typeof window.__ChromeStartPageMixins !== 'undefined') {
    const mixins = window.__ChromeStartPageMixins;
    let totalMethods = 0;
    for (const layerName of Object.keys(mixins)) {
        const layer = mixins[layerName];
        Object.assign(ChromeStartPageApp.prototype, layer);
        totalMethods += Object.keys(layer).length;
        console.log(`[main.js] merged ${layerName} layer (${Object.keys(layer).length} methods)`);
    }
    console.log(`[main.js] total ${totalMethods} methods merged from split modules`);
} else {
    console.warn('[main.js] no __ChromeStartPageMixins found, split modules not loaded?');
}

// 创建应用实例
const app = new ChromeStartPageApp();
