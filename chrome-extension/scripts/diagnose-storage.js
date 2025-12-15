// Storage Diagnostic Script
// Run this in the browser console on the new tab page to diagnose storage issues

(async function () {
    console.log('=== Chrome Storage Diagnostic ===\n');

    try {
        // Get all storage data
        const syncData = await chrome.storage.sync.get(null);
        const localData = await chrome.storage.local.get(null);

        console.log('📊 Storage Usage:');
        console.log('─'.repeat(50));

        // Calculate sizes
        const syncSize = new Blob([JSON.stringify(syncData)]).size;
        const localSize = new Blob([JSON.stringify(localData)]).size;

        console.log(`Sync Storage: ${syncSize} bytes (${(syncSize / 1024).toFixed(2)} KB)`);
        console.log(`Local Storage: ${localSize} bytes (${(localSize / 1024).toFixed(2)} KB)`);
        console.log('');

        // Analyze each key in sync storage
        console.log('🔍 Sync Storage Breakdown:');
        console.log('─'.repeat(50));

        for (const [key, value] of Object.entries(syncData)) {
            const itemSize = new Blob([JSON.stringify(value)]).size;
            const isOverQuota = itemSize > 8192; // 8KB limit per item

            console.log(`${isOverQuota ? '❌' : '✅'} ${key}: ${itemSize} bytes (${(itemSize / 1024).toFixed(2)} KB)`);

            if (key === 'bookmarks' && Array.isArray(value)) {
                console.log(`   └─ ${value.length} bookmarks`);

                // Find largest bookmarks
                const bookmarkSizes = value.map(b => ({
                    title: b.title,
                    url: b.url,
                    size: new Blob([JSON.stringify(b)]).size,
                    hasIcon: !!b.icon,
                    iconIsDataUrl: b.icon && b.icon.startsWith('data:'),
                    iconLength: b.icon ? b.icon.length : 0
                })).sort((a, b) => b.size - a.size);

                console.log('   └─ Top 5 largest bookmarks:');
                bookmarkSizes.slice(0, 5).forEach((b, i) => {
                    console.log(`      ${i + 1}. "${b.title}": ${b.size} bytes`);
                    console.log(`         URL: ${b.url.substring(0, 50)}...`);
                    if (b.hasIcon) {
                        console.log(`         Icon: ${b.iconIsDataUrl ? 'DATA URL' : 'URL'} (${b.iconLength} chars)`);
                    }
                });

                // Count data URL icons
                const dataUrlCount = bookmarkSizes.filter(b => b.iconIsDataUrl).length;
                if (dataUrlCount > 0) {
                    console.warn(`   ⚠️  WARNING: ${dataUrlCount} bookmarks have data URL icons!`);
                }
            }
        }

        console.log('');
        console.log('💡 Recommendations:');
        console.log('─'.repeat(50));

        if (syncData.bookmarks) {
            const bookmarksSize = new Blob([JSON.stringify(syncData.bookmarks)]).size;
            if (bookmarksSize > 8192) {
                console.warn('⚠️  Bookmarks exceed 8KB quota limit!');
                console.warn('   Solution: Remove data URL icons or reduce bookmark count');
            } else if (bookmarksSize > 7000) {
                console.warn('⚠️  Bookmarks approaching quota limit (> 7KB)');
            } else {
                console.log('✅ Bookmarks storage is healthy');
            }
        }

    } catch (error) {
        console.error('❌ Error reading storage:', error);
    }
})();
