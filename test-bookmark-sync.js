// 测试书签同步功能的脚本
// 在Chrome开发者工具控制台中运行此代码

console.log('Testing bookmark sync...');

// 直接调用后台脚本中的同步函数
chrome.runtime.sendMessage({ action: 'syncBookmarksToChrome' }, (response) => {
  console.log('Bookmark sync response:', response);
});

// 或者检查当前设置
chrome.storage.sync.get(['settings'], (result) => {
  console.log('Current settings:', result.settings);
  
  // 检查是否启用了书签同步
  if (result.settings && result.settings.syncToChromeBookmarks) {
    console.log('Bookmark sync is enabled');
  } else {
    console.log('Bookmark sync is disabled');
  }
});

// 检查当前的分组和书签
chrome.storage.sync.get(['groups', 'bookmarks'], (result) => {
  console.log('Groups:', result.groups);
  console.log('Bookmarks:', result.bookmarks);
});