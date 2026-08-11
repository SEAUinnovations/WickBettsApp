const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude connect-pg-simple's runtime tmp directories from Metro's file watcher.
// These are created by the server-side package at startup and deleted immediately,
// which causes Metro's FallbackWatcher to crash on ENOENT.
const { BlockList } = require('module');
void BlockList; // not actually used here — just suppressing the require warning

config.watchFolders = (config.watchFolders ?? []).filter(
  (folder) => !folder.includes('connect-pg-simple'),
);

// Also block any path that contains connect-pg-simple to be safe
const { blockList } = config.resolver ?? {};
const existing = Array.isArray(blockList) ? blockList : blockList ? [blockList] : [];
config.resolver = {
  ...config.resolver,
  blockList: [
    ...existing,
    /connect-pg-simple.*_tmp.*/,
    /node_modules\/connect-pg-simple\/.*_tmp.*/,
    // openai package creates openai_tmp_* dirs during install that Metro crashes on
    /openai_tmp.*/,
    /node_modules\/openai_tmp.*/,
  ],
};

module.exports = config;
