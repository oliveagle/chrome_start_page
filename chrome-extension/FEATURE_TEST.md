# 邮件书签后台打开功能测试说明

## 功能概述

本扩展新增了两种在后台打开邮件书签的方式：

1. **CMD/Ctrl + 点击**：按住 CMD (Mac) 或 Ctrl (Windows) 键点击书签，可在后台打开
2. **右键上下文菜单**：右键点击邮件书签，选择"在后台新窗口打开"

## 测试步骤

### 1. CMD/Ctrl + 点击功能测试

#### 测试普通书签
1. 添加一个普通网站书签（如：https://www.google.com）
2. 正常点击 → 应在当前标签页打开
3. 按住 CMD/Ctrl 点击 → 应在后台标签页打开

#### 测试邮件书签
1. 添加一个邮件书签：
   - **mailto 链接**：`mailto:user@example.com`
   - **邮件服务链接**：`https://mail.google.com` 或 `https://outlook.live.com`
2. 正常点击 → 应在当前标签页打开
3. 按住 CMD/Ctrl 点击 → 应在后台**窗口**中打开（注意：邮件使用窗口而非标签页）

### 2. 右键上下文菜单测试

#### 测试条件
1. 确保扩展已加载（重新加载扩展以应用新权限）
2. 在新标签页中查看书签列表

#### 测试步骤
1. 右键点击邮件书签
2. 应看到菜单项："在后台新窗口打开邮件"
3. 点击该选项
4. 邮件应在后台新窗口中打开，当前页面保持焦点

### 3. 邮件链接识别测试

扩展能识别以下类型的邮件链接：

- **协议类型**：`mailto:user@example.com`
- **邮件服务域名**：
  - gmail.com
  - outlook.com
  - hotmail.com
  - yahoo.com
  - protonmail.com
  - mail.qq.com
  - 163.com
  - 126.com
  - sina.com
  - foxmail.com
- **URL 包含关键词**：
  - 路径包含：`mail` 或 `message`
  - 参数包含：`mail` 或 `email`

## 测试用例示例

### 测试用例 1：Gmail 书签
```
标题：Gmail
URL：https://mail.google.com
```
- 正常点击：在当前标签页打开 Gmail
- CMD+点击：在后台窗口打开 Gmail
- 右键菜单：在后台窗口打开 Gmail

### 测试用例 2：mailto 链接
```
标题：发送邮件
URL：mailto:contact@example.com?subject=Hello
```
- 正常点击：打开默认邮件客户端
- CMD+点击：在后台窗口打开默认邮件客户端
- 右键菜单：在后台窗口打开默认邮件客户端

### 测试用例 3：普通网站
```
标题：Google
URL：https://www.google.com
```
- 正常点击：在当前标签页打开
- CMD+点击：在后台标签页打开
- 右键菜单：无反应（仅对邮件链接有效）

## 故障排除

### 问题：右键菜单不显示
**解决方案**：
1. 检查 manifest.json 中是否包含 `"contextMenus"` 权限
2. 重新加载扩展：扩展管理页面 → 刷新按钮
3. 检查控制台错误：右键 → 检查 → Console

### 问题：CMD+点击无效
**解决方案**：
1. 检查 main.js 中的事件绑定是否正确
2. 查看控制台是否有错误信息
3. 确认书签 ID 是否正确传递

### 问题：邮件在前台打开
**解决方案**：
1. 检查 background.js 中的 `chrome.windows.create` 参数
2. 确认 `focused: false` 设置正确
3. 检查邮件 URL 是否被正确识别

## 开发者工具调试

### 查看日志
1. 打开新标签页
2. 右键 → 检查 → Console
3. 查找以下关键词：
   - "Opening bookmark in background"
   - "邮件已在后台窗口打开"
   - "Context menu created"

### 检查权限
1. 访问：`chrome://extensions/`
2. 找到 "Chrome Start Page"
3. 点击 "Details"
4. 检查 "Permissions" 是否包含 "contextMenus"

### 重新加载扩展
1. 在扩展管理页面
2. 点击 "Reload" 按钮（刷新图标）
3. 或者在代码修改后按 F5 刷新新标签页