/* global ChromeStartPageApp */
// devine_tabflow - render layer
// 从 main.js 拆分 (11 个方法)
// 通过先赋值到 const 再 Object.assign 注入到 ChromeStartPageApp.prototype
// (严格模式下不能在对象字面量里直接声明 async/function)
(function () {
    'use strict';

    // 初始化 bootstrap 容器 (在 main.js 之前加载, 攒方法)
    if (typeof window.__ChromeStartPageMixins === 'undefined') {
        window.__ChromeStartPageMixins = {};
    }
    const RenderMixin = (window.__ChromeStartPageMixins.render = {});

    RenderMixin.renderGroups = async function () {
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
                    const ao = a.order,
                        bo = b.order;
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
    };

    RenderMixin.createGroupElement = async function (group) {
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
    };

    RenderMixin.renderBookmarksList = async function (bookmarks, groupId) {
        if (bookmarks.length === 0) {
            return '';
        }

        let html = '';
        for (const bookmark of bookmarks) {
            html += await this.createBookmarkElement(bookmark);
        }
        return html;
    };

    RenderMixin.createBookmarkElement = async function (bookmark) {
        const iconUrl = await this.getBookmarkIconUrl(bookmark);
        const fallbackSvg = this.getDefaultBookmarkIconSvg();

        return `
                <li class="bookmark-item" data-bookmark-id="${bookmark.id}">
                    <div class="bookmark-info" data-action="open-bookmark" data-bookmark-id="${bookmark.id}">
                        <div class="bookmark-icon">
                            ${
                                iconUrl
                                    ? `<img src="${iconUrl}" alt="" class="bookmark-icon-img" onerror="window.__defaultBookmarkIcon && window.__defaultBookmarkIcon(this)">`
                                    : fallbackSvg
                            }
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
    };

    RenderMixin.updateEmptyState = function () {
        const emptyState = document.getElementById('emptyState');
        const groupsGrid = document.getElementById('groupsGrid');

        if (!emptyState || !groupsGrid) return;

        const hasGroups = groupsGrid.children.length > 0;

        if (hasGroups) {
            emptyState.style.display = 'none';
        } else {
            emptyState.style.display = 'block';
        }
    };

    RenderMixin.showIconPreview = function (iconUrl, status) {
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
    };

    RenderMixin.hideIconPreview = function () {
        const previewGroup = document.getElementById('iconPreviewGroup');
        if (previewGroup) {
            previewGroup.style.display = 'none';
        }
    };

    RenderMixin.escapeHtml = function (text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    RenderMixin.showError = function (message) {
        this.showNotification(message, 'error');
    };

    RenderMixin.showSuccess = function (message) {
        this.showNotification(message, 'success');
    };

    RenderMixin.showNotification = function (message, type = 'info') {
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
    };

    // RenderMixin 已挂到 window.__ChromeStartPageMixins.render, 由 main.js 末尾统一 merge
    console.log('[main/render.js] queued (11 methods)');
})();
