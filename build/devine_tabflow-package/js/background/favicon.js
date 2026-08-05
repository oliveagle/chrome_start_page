// devine_tabflow - favicon module
// 从 background.js 拆分 (5 个函数)
// 通过 self.favicon = { ... } 暴露,service-worker 用 importScripts 加载
(function (self) {
    'use strict';

    const Favicon = {};

    Favicon.fetchWebsiteIcon = async function fetchWebsiteIcon(url) {
        try {
            const urlObj = new URL(url);
            const origin = urlObj.origin;
            const hostname = urlObj.hostname;
            const protocol = urlObj.protocol;
            const candidateUrls = [];

            const iconFromHtml = await extractIconFromHtml(url);
            if (iconFromHtml) {
                const absoluteIconUrl = new URL(iconFromHtml, origin).toString();
                candidateUrls.push(absoluteIconUrl);
            }

            const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
            const parts = hostname.split('.');

            if (!isIpAddress && parts.length > 2) {
                const mainHostname = parts.slice(1).join('.');
                const mainOrigin = `${protocol}//${mainHostname}`;
                candidateUrls.push(`${mainOrigin}/favicon.ico`);
                candidateUrls.push(`${protocol}//www.${mainHostname}/favicon.ico`);
            }

            if (hostname.startsWith('www.')) {
                const withoutWww = `${protocol}//${hostname.substring(4)}`;
                candidateUrls.push(`${withoutWww}/favicon.ico`);
            }

            candidateUrls.push(`${origin}/favicon.ico`);

            const commonFaviconPaths = [
                '/assets/favicon.ico',
                '/static/favicon.ico',
                '/img/favicon.ico',
                '/images/favicon.ico',
                '/public/favicon.ico',
                '/favicon.png',
                '/favicon.svg',
                '/apple-touch-icon.png',
                '/apple-touch-icon-precomposed.png',
            ];

            for (const path of commonFaviconPaths) {
                candidateUrls.push(`${origin}${path}`);
            }

            const uniqueUrls = [...new Set(candidateUrls)];
            console.log('[Favicon] Candidate URLs:', uniqueUrls);

            const workingUrl = await validateFaviconUrl(uniqueUrls);
            return workingUrl;
        } catch (error) {
            console.error('Invalid URL:', error);
            throw new Error('Invalid URL: ' + error.message);
        }
    };

    Favicon.fetchPageTitle = async function fetchPageTitle(url) {
        try {
            // 验证 URL
            const urlObj = new URL(url);

            // 使用 fetch 获取页面内容
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Chrome Extension)',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();

            // 提取 <title> 标签内容
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                return titleMatch[1].trim();
            }

            // 如果没有找到 title，尝试查找 og:title
            const ogTitleMatch = html.match(
                /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
            );
            if (ogTitleMatch && ogTitleMatch[1]) {
                return ogTitleMatch[1].trim();
            }

            // 都没找到，返回域名
            return urlObj.hostname;
        } catch (error) {
            console.error('Failed to fetch page title:', error);
            // 如果获取失败，返回域名作为后备
            try {
                const urlObj = new URL(url);
                return urlObj.hostname;
            } catch (e) {
                throw new Error('Invalid URL: ' + error.message);
            }
        }
    };

    Favicon.validateFaviconUrl = async function validateFaviconUrl(candidateUrls) {
        console.log('[Favicon] validateFaviconUrl called with', candidateUrls.length, 'candidates');

        for (const url of candidateUrls) {
            try {
                console.log('[Favicon] Trying to fetch:', url);
                const response = await fetch(url, {
                    method: 'GET',
                    cache: 'no-cache',
                    redirect: 'follow',
                });

                console.log('[Favicon] Response status:', response.status, 'type:', response.type);

                if (response.ok && response.status >= 200 && response.status < 300) {
                    const contentType = response.headers.get('content-type');
                    console.log('[Favicon] Content-Type:', contentType);
                    if (
                        contentType &&
                        (contentType.includes('image/') || contentType.includes('x-icon'))
                    ) {
                        console.log('[Favicon] ✅ Found working URL:', url);
                        return url;
                    }
                }
            } catch (error) {
                console.log('[Favicon] ❌ Failed to fetch:', url, error.message);
                continue;
            }
        }

        console.log('[Favicon] No valid URL found with CORS, trying no-cors mode');

        for (const url of candidateUrls) {
            try {
                console.log('[Favicon] Trying no-cors:', url);
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-cache',
                });

                console.log('[Favicon] no-cors response type:', response.type);
                if (response.type === 'opaque') {
                    console.log('[Favicon] ✅ Using (opaque response):', url);
                    return url;
                }
            } catch (error) {
                console.log('[Favicon] no-cors failed:', url, error.message);
                continue;
            }
        }

        console.log('[Favicon] ❌ All candidates failed, returning first candidate');
        return candidateUrls[0] || null;
    };

    Favicon.extractIconFromHtml = async function extractIconFromHtml(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Chrome Extension)',
                },
            });

            if (!response.ok) {
                return null;
            }

            const html = await response.text();

            const iconSelectors = [
                /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
                /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
                /<link[^>]*rel=["']apple-touch-icon-precomposed["'][^>]*href=["']([^"']+)["']/i,
                /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
                /<link[^>]*href=["']([^"']+\.ico|favicon[^"']+)["'][^>]*>/i,
            ];

            for (const selector of iconSelectors) {
                const match = html.match(selector);
                if (match && match[1]) {
                    console.log('[Favicon] Found icon in HTML:', match[1]);
                    return match[1];
                }
            }

            return null;
        } catch (error) {
            console.log('[Favicon] Failed to extract icon from HTML:', error.message);
            return null;
        }
    };

    Favicon.isEmailUrl = function isEmailUrl(url) {
        if (!url) return false;

        try {
            const urlObj = new URL(url);

            // 检查协议是否为 mailto
            if (urlObj.protocol === 'mailto:') {
                return true;
            }

            // 检查常见邮件服务域名
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

            // 检查域名是否匹配
            for (const domain of emailDomains) {
                if (hostname.includes(domain)) {
                    return true;
                }
            }

            // 检查是否包含邮件相关路径或参数
            const path = urlObj.pathname.toLowerCase();
            const search = urlObj.search.toLowerCase();

            if (
                path.includes('mail') ||
                path.includes('message') ||
                search.includes('mail') ||
                search.includes('email')
            ) {
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error parsing URL:', error);
            return false;
        }
    };

    self.Favicon = Favicon;
    console.log('[background/favicon.js] loaded (5 functions)');
})(self);
