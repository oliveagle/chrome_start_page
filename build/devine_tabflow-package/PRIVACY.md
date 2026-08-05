# Privacy Policy for devine_tabflow

Last updated: 2026-07-23

## Summary
devine_tabflow does not collect, transmit, or sell any user data. All
bookmark groups, preferences, and background settings are stored locally
in your browser via `chrome.storage.local`. The extension has no analytics,
no telemetry, and no remote servers.

## Permissions used

| Permission       | Why we need it                                                |
|------------------|---------------------------------------------------------------|
| storage          | Save your bookmark groups and background settings locally      |
| tabs             | Open new tabs when you click a bookmark or "Open all" button |
| bookmarks        | Read/write the "devine_tabflow" folder in Chrome bookmarks   |
| contextMenus     | Add "Add to devine_tabflow" entry on right-click on links     |
| alarms           | Schedule periodic background sync                            |
| http://*/*       | Fetch favicons and page titles for bookmarks you add          |
| https://*/*      | Same as above, for HTTPS sites                                |

## Network requests
The extension fetches two things from user-added bookmark URLs, **directly
from your browser to the website itself** (never via a third party):

1. `/favicon.ico` and similar favicon paths, used to display a site's icon.
2. The HTML page title, used as a fallback when you add a bookmark by URL.

No data leaves your machine. The extension has no backend.

## Data retention
All data lives in `chrome.storage.local` on your device. Uninstalling
the extension deletes all of it. Clearing "devine_tabflow" bookmarks
from `chrome://bookmarks` removes the synced copy.

## Contact
If you have questions about this policy, open an issue at the project's
public repository.
