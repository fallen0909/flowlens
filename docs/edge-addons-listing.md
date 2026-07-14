# Microsoft Edge Add-ons Listing Draft

## Product name

FlowLens

## Short description

Turn webpage images and videos into a fullscreen waterfall gallery with lightbox viewing, slideshow controls, and downloads.

## Full description

FlowLens collects media from the current webpage and presents it as a clean fullscreen gallery. It is designed for image-heavy pages, galleries, and media feeds where the default webpage layout makes browsing slow or distracting.

Features:

- Fullscreen waterfall gallery for images and videos
- Smooth lightbox viewer with previous/next navigation
- Slideshow playback for hands-free browsing
- Media filtering for images, videos, or all media
- ZIP and direct download actions initiated by the user
- Browser-syncable preferences such as theme, columns, autoplay speed, and video preview settings

FlowLens runs locally in the browser. It does not upload media content or browsing history to a FlowLens server.

## Category

Productivity

## Website

Optional. Use a project page or documentation page if available.

## Support contact

Required before submission. Use your support email address or support webpage.

## Privacy policy URL

Required if Microsoft treats webpage access or media URL handling as personal data access. Host `docs/edge-addons-privacy-policy.md` as a public webpage and use that URL.

## Permission justification

- `activeTab`: lets the toolbar button interact with the current tab after the user clicks FlowLens.
- `scripting`: injects the viewer script into the current tab when needed.
- `storage`: saves preferences and syncs lightweight settings through browser sync.
- `downloads`: saves media files only after a user starts a download.
- `<all_urls>` host permission: allows FlowLens to detect and display media on user-chosen webpages across sites.

## Mature content

The extension itself does not include mature content. Do not use mature or explicit screenshots in the store listing.
