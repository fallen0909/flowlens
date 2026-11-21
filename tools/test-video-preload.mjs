import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const core = fs.readFileSync(new URL("../src/core/flowlens-core.js", import.meta.url), "utf8");
const source = core.slice(core.indexOf("  function clearNextVideoPreload("), core.indexOf("  function unloadVideoElement("));
const timers = new Map();
const requests = new Map();
const seen = [];
const state = {
  index: 0,
  images: ["current.mp4", "photo.jpg", "blocked.mp4", "next.mp4"],
  videoTimeByImage: new Map(),
  lightbox: {
    dataset: { active: "true" },
    appendChild(frame) { frame.isConnected = true; seen.push(["attach", frame]); }
  },
  root: {
    appendChild(video) { video.isConnected = true; seen.push(["stage", video]); }
  }
};
const context = {
  state,
  document: { visibilityState: "visible" },
  navigator: { connection: { saveData: false } },
  window: { __flowLensMediaFilter: { reasonFor: url => url === "blocked.mp4" } },
  setTimeout(fn) { const id = Symbol(); timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); },
  isVideoUrl: url => url.endsWith(".mp4"),
  mediaMatchesFilter: () => true,
  normalizeMediaUrl: url => url,
  keyForUrl: url => url,
  unloadVideoElement(video) { seen.push(["unload", video]); },
  pauseLightboxMedia() {},
  removeDirectLightboxMedia(except) { seen.push(["keep", except]); },
  ensureLightboxChrome() {},
  updateFavoriteButton() {},
  videoSizeFromUrl() {},
  updateLightboxZoomHint() {},
  installVideoGestures() {},
  videoSourceRequests: requests,
  setVideoSourceWithFallback(video, url) { requests.set(video, { autoplay: false }); seen.push(["load", url]); },
  armVideoSourceTimeout() {},
  requestVideoPlayback(video) { seen.push(["play", video]); }
};
vm.createContext(context);
vm.runInContext(source, context);
context.createLightboxVideoPlayer = url => ({
  url, frame: null,
  video: { dataset: {}, readyState: 0, addEventListener() {}, remove() { seen.push(["remove", this]); } }
});

const owner = {
  video: {
    isConnected: true, readyState: 3, currentTime: 5, duration: 90,
    buffered: { length: 1, start: () => 0, end: () => 6 }
  }
};
context.preloadNextVideo(owner);
assert.equal(state.nextVideoPreload, undefined, "reserve bandwidth when the current video has little buffered");
owner.video.readyState = 4;
context.navigator.connection.saveData = true;
context.preloadNextVideo(owner);
assert.equal(state.nextVideoPreload, undefined);
context.navigator.connection.saveData = false;
context.preloadNextVideo(owner);
const pending = state.nextVideoPreload;
assert.equal(pending.player.url, "next.mp4", "skip images and blocked clips");
context.preloadNextVideo(owner);
assert.equal(seen.filter(([action]) => action === "load").length, 1);
pending.player.video.readyState = 4;
timers.get(pending.timer)();
assert.equal(state.nextVideoPreload, pending, "keep a playable buffer through a long current clip");

const video = pending.player.video;
const frame = {
  isConnected: true, hidden: true, dataset: { xivWarm: "true" },
  remove() { seen.push(["remove", this]); }
};
pending.player.frame = frame;
context.setLightboxVideo("next.mp4");
assert.equal(state.nextVideoPreload, null);
assert.equal(frame.hidden, false);
assert.equal(frame.dataset.mediaUrl, "next.mp4");
assert(seen.some(([action, node]) => action === "keep" && node === frame));
assert(seen.some(([action, node]) => action === "play" && node === video));
assert(!seen.some(([action]) => action === "attach" || action === "unload"));
assert.equal(seen.filter(([action]) => action === "load").length, 1, "promotion must not assign a new source");
assert.equal(requests.get(video).autoplay, true);

owner.preloadAttempted = false;
context.preloadNextVideo(owner);
const incomplete = state.nextVideoPreload;
assert.equal(incomplete.player.video.readyState, 0);
timers.get(incomplete.timer)();
assert.equal(state.nextVideoPreload, null);
assert(seen.some(([action, node]) => action === "unload" && node === incomplete.player.video));
console.log("PASS one eligible next clip, bandwidth checks, retained ready buffer, in-place frame promotion and cleanup");
