const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// On-device models ship as assets and can be swapped without a native rebuild.
config.resolver.assetExts.push('tflite');

module.exports = config;
