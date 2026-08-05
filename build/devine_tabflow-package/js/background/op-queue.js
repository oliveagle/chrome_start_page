// devine_tabflow - op-queue module
// 从 background.js 拆分 (5 个函数)
// 通过 self.opqueue = { ... } 暴露,service-worker 用 importScripts 加载
(function (self) {
    'use strict';

    const OpQueue = {};

    OpQueue.drainOpQueue = async function drainOpQueue() {
        if (opProcessorRunning) return;
        opProcessorRunning = true;
        try {
            const queue = new BookmarkQueue();
            // 队列健康检查
            const healthy = await queue.isHealthy();
            if (!healthy) {
                console.warn('[OpProcessor] queue unhealthy (overflow?), pausing drain');
                return;
            }

            // 先处理 failed（重试）
            const failed = await queue.failed();
            const pending = await queue.pending();
            const all = [...failed, ...pending];

            if (all.length === 0) {
                console.log('[OpProcessor] queue empty');
                return;
            }
            console.log(
                `[OpProcessor] draining ${all.length} ops (${failed.length} failed, ${pending.length} pending)`
            );

            for (const op of all) {
                try {
                    await executeOp(op);
                    // 成功：从队列移除
                    await queue.remove(op.chromeId);
                    console.log(
                        '[OpProcessor] ✓ executed:',
                        op.direction,
                        op.type,
                        op.target,
                        op.refId
                    );
                } catch (e) {
                    console.error(
                        '[OpProcessor] ✗ failed:',
                        op.direction,
                        op.type,
                        op.target,
                        e.message
                    );
                    await queue.markFailed(op.chromeId, e.message || 'unknown');
                }
            }
        } catch (e) {
            console.error('[OpProcessor] drain error', e);
        } finally {
            opProcessorRunning = false;
        }
    };

    OpQueue.executeOp = async function executeOp(op) {
        if (op.direction === 'push') {
            if (op.target === 'group') {
                if (op.type === 'add') return await pushGroupAdd(op);
                if (op.type === 'update') return await pushGroupUpdate(op);
                if (op.type === 'remove') return await pushGroupRemove(op);
            } else if (op.target === 'bookmark') {
                if (op.type === 'add') return await pushBookmarkAdd(op);
                if (op.type === 'update') return await pushBookmarkUpdate(op);
                if (op.type === 'remove') return await pushBookmarkRemove(op);
            }
        } else if (op.direction === 'pull') {
            if (op.target === 'group') return await pullGroupFromChrome(op);
            if (op.target === 'bookmark') return await pullBookmarkFromChrome(op);
        }
        console.warn('[OpProcessor] unknown op shape', op);
    };

    OpQueue.retryFailedOps = async function retryFailedOps() {
        // 把 [op-failed] 标题改回 [op]
        const queue = new BookmarkQueue();
        const failed = await queue.failed();
        for (const op of failed) {
            try {
                const node = await chrome.bookmarks.get(op.chromeId);
                if (node) {
                    await chrome.bookmarks.update(op.chromeId, {
                        title: node.title.replace('[op-failed]', '[op]'),
                    });
                }
            } catch (e) {
                /* ignore */
            }
        }
    };

    OpQueue.getQueueStats = async function getQueueStats() {
        const queue = new BookmarkQueue();
        const pending = await queue.pending();
        const failed = await queue.failed();
        return {
            pending: pending.length,
            failed: failed.length,
            total: pending.length + failed.length,
        };
    };

    OpQueue.clearOpQueue = async function clearOpQueue() {
        const queue = new BookmarkQueue();
        await queue.clear();
    };

    self.OpQueue = OpQueue;
    console.log('[background/op-queue.js] loaded (5 functions)');
})(self);
