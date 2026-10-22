// Inclui arquivos .db como assets (dump embutido em assets/db/vflix.db).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db');

module.exports = config;
