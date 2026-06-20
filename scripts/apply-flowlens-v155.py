from pathlib import Path
import json
import re

ROOT = Path('.')
VERSION = '1.5.5'


def path(name: str) -> Path:
    return ROOT / name


def read(name: str) -> str:
    return path(name).read_text(encoding='utf-8')


def write(name: str, text: str) -> None:
    path(name).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing expected block: {label}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl: str, label: str, flags: int = re.S) -> str:
    text2, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'Missing expected pattern: {label}')
    return text2


# version.json
manifest = json.loads(read('version.json'))
manifest['version'] = VERSION
manifest.setdefault('desktop', {})['version'] = VERSION
manifest.setdefault('mobile', {})['version'] = VERSION
features = manifest.setdefault('features', [])
for feature in ['topbar-page-bookmark-icons', 'x810114-profile-bookmark-url']:
    if feature not in features:
        features.append(feature)
write('version.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

# Browser extension manifest.
ext_manifest = json.loads(read('flowlens-extension/manifest.json'))
ext_manifest['version'] = VERSION
write('flowlens-extension/manifest.json', json.dumps(ext_manifest, ensure_ascii=False, indent=2) + '\n')

# README and install page.
readme = read('README.md')
readme = readme.replace('当前统一版本：`v1.5.4`。', f'当前统一版本：`v{VERSION}`。')
readme = readme.replace(
    '## 📝 近期更新\n\n### v1.5.4',
    '## 📝 近期更新\n\n### v1.5.5\n\n'
    '- 收藏本页、收藏列表入口改为顶部工具栏图标，电脑端和手机端不再在右侧显示文字悬浮按钮。\n'
    '- x.810114 收藏会优先保存当前个人主页地址，例如 `https://x.810114.xyz/ObserverAlphaAI`，避免只保存站点首页。\n\n'
    '### v1.5.4',
)
write('README.md', readme)

index = read('index.html')
index = re.sub(
    r'<p class="note"><strong>.*?</p>',
    '<p class="note"><strong>当前统一版本：v1.5.5。</strong>收藏入口已并入顶部工具栏图标；x.810114 会收藏当前个人主页地址，不再只保存站点首页。</p>',
    index,
    count=1,
    flags=re.S,
)
index = re.sub(r'安装/更新电脑油猴版 v[0-9.]+', f'安装/更新电脑油猴版 v{VERSION}', index)
index = re.sub(r'安装/更新手机整合版 v[0-9.]+', f'安装/更新手机整合版 v{VERSION}', index)
write('index.html', index)

version_js = read('src/core/version.js')
if 'topbar-page-bookmark-icons' not in version_js:
    version_js = replace_once(
        version_js,
        '    "version-display-sync",\n    "page-bookmarks"',
        '    "version-display-sync",\n    "page-bookmarks",\n    "topbar-page-bookmark-icons",\n    "x810114-profile-bookmark-url"',
        'version center features',
    )
write('src/core/version.js', version_js)

# Core viewer: move bookmark actions into the top toolbar and use the active profile URL.
core = read('src/core/flowlens-core.js')
core = regex_once(
    core,
    r'    #xiv-page-bookmarks-controls \{.*?#xiv-root\[data-lightbox-active="true"\] #xiv-page-bookmarks-controls \{ display: none !important; \}\n',
    '''    .xiv-btn[data-xiv="page-bookmark-toggle"][data-saved="true"] {
      color: #ffb648; border-color: rgba(255,190,80,.56); background: rgba(255,190,80,.22);
    }
    .xiv-btn[data-xiv="page-bookmark-toggle"][data-saved="true"] svg {
      fill: currentColor;
    }
''',
    'remove floating bookmark css',
)
if 'bookmarkList:' not in core:
    core = replace_once(
        core,
        "    link: '<svg",
        "    bookmark: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z\"/></svg>',\n"
        "    bookmarkList: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 6h11M8 12h11M8 18h11\"/><path d=\"M4.5 6h.01M4.5 12h.01M4.5 18h.01\"/></svg>',\n"
        "    link: '<svg",
        'core bookmark icons',
    )
if 'function currentPageBookmarkUrl()' not in core:
    helper = '''  function isX810114ProfileBookmarkUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\\.810114\\.xyz$/i.test(parsed.hostname)
        && parts.length === 1
        && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]);
    } catch {
      return false;
    }
  }

  function currentPageBookmarkUrl() {
    const candidates = [
      state.galleryQueueCurrentUrl,
      state.galleryQueueIndex >= 0 ? state.galleryQueue[state.galleryQueueIndex] : "",
      state.collectionBase,
      activeGalleryQueueUrl(),
      document.querySelector('link[rel="canonical"]')?.href || "",
      document.querySelector('meta[property="og:url"], meta[name="og:url"]')?.getAttribute?.("content") || "",
      location.href
    ].filter(Boolean).map((url) => normalizePageBookmarkUrl(url));
    const profile = candidates.find(isX810114ProfileBookmarkUrl);
    if (profile) return profile;
    return candidates[candidates.length - 1] || normalizePageBookmarkUrl();
  }

  function setPageBookmarkButtonLabel(button, label) {
    if (!button) return;
    button.title = label;
    button.setAttribute("aria-label", label);
    const span = button.querySelector("span");
    if (span) span.textContent = label;
    else button.textContent = label;
  }

'''
    core = replace_once(core, '  function pageBookmarkHost(url) {\n', helper + '  function pageBookmarkHost(url) {\n', 'core bookmark helpers')
core = regex_once(
    core,
    r'  async function syncPageBookmarkControls\(\) \{.*?  \}\n\n  async function togglePageBookmarkFromCore',
    '''  async function syncPageBookmarkControls() {
    const button = state.root?.querySelector('[data-xiv="page-bookmark-toggle"]');
    if (!button) return;
    const currentUrl = currentPageBookmarkUrl();
    const saved = (await readPageBookmarks()).some((item) => normalizePageBookmarkUrl(item.url) === currentUrl);
    const label = saved ? "已收藏本页" : "收藏本页";
    button.dataset.saved = saved ? "true" : "false";
    setPageBookmarkButtonLabel(button, label);
  }

  async function togglePageBookmarkFromCore''',
    'core bookmark sync function',
)
core = replace_once(
    core,
    '  async function togglePageBookmarkFromCore() {\n    const currentUrl = normalizePageBookmarkUrl();',
    '  async function togglePageBookmarkFromCore() {\n    const currentUrl = currentPageBookmarkUrl();',
    'core bookmark target url',
)
core = replace_once(
    core,
    '          <button class="xiv-btn" type="button" data-xiv="favzip" title="下载收藏 ZIP">${icons.heart}<span>收藏</span></button>\n          <button class="xiv-btn" type="button" data-xiv="links" title="导出链接">${icons.link}<span>链接</span></button>',
    '          <button class="xiv-btn" type="button" data-xiv="favzip" title="下载收藏 ZIP">${icons.heart}<span>收藏</span></button>\n          <button class="xiv-btn" type="button" data-xiv="page-bookmark-toggle" title="收藏本页" aria-label="收藏本页">${icons.bookmark}<span>收藏本页</span></button>\n          <button class="xiv-btn" type="button" data-xiv="page-bookmark-list" title="收藏列表" aria-label="收藏列表">${icons.bookmarkList}<span>收藏列表</span></button>\n          <button class="xiv-btn" type="button" data-xiv="links" title="导出链接">${icons.link}<span>链接</span></button>',
    'core toolbar buttons',
)
core = replace_once(
    core,
    '      <div id="xiv-page-bookmarks-controls" aria-label="页面收藏">\n        <button type="button" data-xiv="page-bookmark-toggle">收藏本页</button>\n        <button type="button" data-xiv="page-bookmark-list">收藏列表</button>\n      </div>\n',
    '',
    'core floating controls markup',
)
core = replace_once(
    core,
    '      loadSavedPage(url) {\n        return loadSavedPageInPlace(url);\n      }',
    '      loadSavedPage(url) {\n        return loadSavedPageInPlace(url);\n      },\n      currentPageBookmarkUrl() {\n        return currentPageBookmarkUrl();\n      }',
    'core public bookmark api',
)
write('src/core/flowlens-core.js', core)

# Page bookmark panel patch: reuse the same active URL and bind topbar icons.
bookmarks = read('src/patches/page-bookmarks.js')
if 'function currentPageUrl()' not in bookmarks:
    helper = '''  function isX810114ProfileUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return /^x\\.810114\\.xyz$/i.test(parsed.hostname)
        && parts.length === 1
        && /^[A-Za-z0-9_]{2,64}$/.test(parts[0]);
    } catch {
      return false;
    }
  }

  function currentPageUrl() {
    const apiUrl = window.__flowLensControl?.currentPageBookmarkUrl?.();
    const candidates = [
      apiUrl,
      document.querySelector('link[rel="canonical"]')?.href || "",
      document.querySelector('meta[property="og:url"], meta[name="og:url"]')?.getAttribute?.("content") || "",
      location.href
    ].filter(Boolean).map((url) => normalizeUrl(url));
    const profile = candidates.find(isX810114ProfileUrl);
    if (profile) return profile;
    return candidates[0] || normalizeUrl();
  }

  function setIconButtonLabel(button, label) {
    if (!button) return;
    button.title = label;
    button.setAttribute("aria-label", label);
    const span = button.querySelector("span");
    if (span) span.textContent = label;
    else button.textContent = label;
  }

'''
    bookmarks = replace_once(bookmarks, '  function hostOf(url) {\n', helper + '  function hostOf(url) {\n', 'bookmark patch helpers')
bookmarks = bookmarks.replace('    return title || hostOf(location.href) || "未命名页面";', '    return title || hostOf(currentPageUrl()) || "未命名页面";')
bookmarks = regex_once(
    bookmarks,
    r'  function currentBookmark\(\) \{.*?  \}\n\n  async function toggleCurrentBookmark',
    '''  function currentBookmark() {
    const url = currentPageUrl();
    return cache.find((item) => normalizeUrl(item.url) === url) || null;
  }

  async function toggleCurrentBookmark''',
    'bookmark patch current bookmark',
)
bookmarks = replace_once(bookmarks, '    const url = normalizeUrl();\n    const exists = currentBookmark();', '    const url = currentPageUrl();\n    const exists = currentBookmark();', 'bookmark patch toggle url')
bookmarks = regex_once(
    bookmarks,
    r'      #xiv-page-bookmarks-controls \{.*?#xiv-root \.fl-bookmarks-list-fab svg \{ width: 18px !important; height: 18px !important; \}\n',
    '''      #xiv-root .fl-bookmarks-fab[data-saved="true"] {
        background: rgba(255,190,80,.22) !important;
        color: #ffb648 !important;
        border-color: rgba(255,190,80,.56) !important;
      }
      #xiv-root .fl-bookmarks-fab[data-saved="true"] svg { fill: currentColor !important; }
''',
    'bookmark patch floating css',
)
bookmarks = regex_once(
    bookmarks,
    r'  function ensureFloatingButton\(\) \{.*?  \}\n\n  function ensurePanel',
    '''  function ensureFloatingButton() {
    const r = root();
    if (!r) return;
    const button = r.querySelector('[data-xiv="page-bookmark-toggle"]');
    const listButton = r.querySelector('[data-xiv="page-bookmark-list"]');
    if (!button || !listButton) return;
    button.classList.add("fl-bookmarks-fab");
    listButton.classList.add("fl-bookmarks-list-fab");
    const saved = !!currentBookmark();
    const label = saved ? "已收藏本页" : "收藏本页";
    button.dataset.saved = saved ? "true" : "false";
    setIconButtonLabel(button, label);
    setIconButtonLabel(listButton, "收藏列表");
  }

  function ensurePanel''',
    'bookmark patch button binding',
)
bookmarks = regex_once(
    bookmarks,
    r'  function syncButtonState\(\) \{.*?  \}\n\n  function togglePanel',
    '''  function syncButtonState() {
    const btn = document.querySelector("#xiv-root .fl-bookmarks-btn");
    const current = currentBookmark();
    const saved = current ? "true" : "false";
    if (btn) {
      btn.dataset.saved = saved;
      btn.title = current ? "当前页面已收藏，点击打开收藏列表" : "页面收藏";
    }
    const fab = document.querySelector("#xiv-root .fl-bookmarks-fab");
    if (fab) {
      const label = saved === "true" ? "已收藏本页" : "收藏本页";
      fab.dataset.saved = saved;
      setIconButtonLabel(fab, label);
    }
  }

  function togglePanel''',
    'bookmark patch sync state',
)
bookmarks = bookmarks.replace('.fl-bookmarks-panel, .fl-bookmarks-btn', '.fl-bookmarks-panel, .fl-bookmarks-btn, .fl-bookmarks-fab, .fl-bookmarks-list-fab')
write('src/patches/page-bookmarks.js', bookmarks)

print('FlowLens v1.5.5 source patch applied')
