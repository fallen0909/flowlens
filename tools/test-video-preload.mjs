import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const core = fs.readFileSync(new URL("../src/core/flowlens-core.js", import.meta.url), "utf8");
const source = core.slice(core.indexOf("  function takeVideoPreload("), core.indexOf("  function unloadVideoElement("));
const timers = new Map();
const requests = new Map();
const seen = [];
const state = {
  index: 0,
  images: ["current.mp4", "photo.jpg", "blocked.mp4", "next.mp4", "third.mp4", "fourth.mp4", "fifth.mp4", "sixth.mp4"],
  videoPreloads: new Map(),
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
  state, VIDEO_PRELOAD_AHEAD: 4, VIDEO_PRELOAD_CONCURRENCY: 2,
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
  showVideoLoading: () => null,
  playVideoTransition() {},
  videoSourceRequests: requests,
  setVideoSourceWithFallback(video, url) { requests.set(video, { autoplay: false }); seen.push(["load", url]); },
  armVideoSourceTimeout() {},
  requestVideoPlayback(video) { seen.push(["play", video]); }
};
vm.createContext(context);
vm.runInContext(source, context);
context.createLightboxVideoPlayer = url => {
  const listeners = new Map();
  const video = {
    dataset: {}, readyState: 0,
    addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
    removeEventListener(type, handler) { listeners.set(type, (listeners.get(type) || []).filter(fn => fn !== handler)); },
    emit(type) { for (const fn of [...(listeners.get(type) || [])]) fn(); },
    remove() { seen.push(["remove", this]); }
  };
  return { url, frame: null, video };
};

const owner = {
  url: "current.mp4", preloadFailures: new Set(),
  upcoming: context.nextVideosForPreload("current.mp4"),
  video: {
    isConnected: true, readyState: 3, currentTime: 5, duration: 90,
    buffered: { length: 1, start: () => 0, end: () => 6 }
  }
};
state.lightboxVideoPlayer = owner;
assert.deepEqual(Array.from(owner.upcoming), ["next.mp4", "third.mp4", "fourth.mp4", "fifth.mp4"]);
context.preloadNextVideos(owner);
assert.equal(state.videoPreloads.size, 0, "reserve bandwidth when the current video has little buffered");
owner.video.readyState = 4;
context.navigator.connection.saveData = true;
context.preloadNextVideos(owner);
assert.equal(state.videoPreloads.size, 0);
context.navigator.connection.saveData = false;
context.preloadNextVideos(owner);
assert.deepEqual([...state.videoPreloads.keys()], ["next.mp4", "third.mp4"]);
const pending = state.videoPreloads.get("next.mp4");
pending.player.video.readyState = 4;
pending.player.video.emit("loadeddata");
assert.deepEqual([...state.videoPreloads.keys()], ["next.mp4", "third.mp4", "fourth.mp4"]);
const third = state.videoPreloads.get("third.mp4");
third.player.video.readyState = 4;
third.player.video.emit("canplay");
assert.deepEqual([...state.videoPreloads.keys()], ["next.mp4", "third.mp4", "fourth.mp4", "fifth.mp4"]);
assert.equal(timers.has(pending.timer), false, "ready buffers persist for long current clips");

const video = pending.player.video;
const frame = {
  isConnected: true, hidden: true, dataset: { xivWarm: "true" },
  remove() { seen.push(["remove", this]); }
};
pending.player.frame = frame;
state.index = 3;
context.setLightboxVideo("next.mp4");
assert.deepEqual([...state.videoPreloads.keys()], ["third.mp4", "fourth.mp4", "fifth.mp4"], "retain upcoming players after promotion");
assert.equal(frame.hidden, false);
assert.equal(frame.dataset.mediaUrl, "next.mp4");
assert(seen.some(([action, node]) => action === "keep" && node === frame));
assert(seen.some(([action, node]) => action === "play" && node === video));
assert(!seen.some(([action]) => action === "attach" || action === "unload"));
assert.equal(seen.filter(([action, url]) => action === "load" && url === "next.mp4").length, 1, "promotion must not assign a new source");
assert.equal(requests.get(video).autoplay, true);

const incomplete = state.videoPreloads.get("fourth.mp4");
const expire = timers.get(incomplete.timer);
timers.delete(incomplete.timer);
expire();
assert(!state.videoPreloads.has("fourth.mp4"));
assert(state.videoPreloads.has("sixth.mp4"), "a stalled preload must not block later clips");
assert(seen.some(([action, node]) => action === "unload" && node === incomplete.player.video));
context.clearVideoPreloads();
assert.equal(state.videoPreloads.size, 0);
assert.equal(timers.size, 0);
console.log("PASS four-item lookahead, two first-frame loads at a time, retained buffers, in-place promotion and timeout cleanup");
