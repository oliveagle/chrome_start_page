# 邮件书签后台打开功能测试

## 快速测试

### CMD/Ctrl + 点击测试
1. **普通书签**：`https://www.google.com`
   - 正常点击 → 当前标签页
   - Cmd+点击 → 后台标签页

2. **邮件书签**：`mailto:test@example.com` 或 `https://mail.google.com`
   - 正常点击 → 当前标签页
   - Cmd+点击 → 后台**窗口**

### 右键菜单测试
1. 右键点击邮件书签
2. 选择 "在后台新窗口打开邮件"
3. 邮件在后台新窗口打开

## 邮件链接识别范围

- **协议**：`mailto:user@example.com`
- **域名**：gmail.com, outlook.com, qq.com, 163.com, 126.com, yahoo.com, protonmail.com, sina.com, foxmail.com
- **关键词**：URL路径或参数包含 `mail` 或 `email`

## 常见问题

### 右键菜单不显示
- 重新加载扩展：扩展管理页面 → 刷新
- 检查权限：manifest.json 是否包含 `contextMenus`

### CMD+点击无效
- 检查控制台错误
- 确认事件绑定正常

### 邮件在前台打开
- 检查 `chrome.windows.create({ focused: false })` 参数