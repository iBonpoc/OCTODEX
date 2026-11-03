// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Workspace packages (packages/*) are ESM TypeScript that import siblings as "./x.js" (NodeNext style,
// needed by vitest/tsc). Metro does not map ".js" to ".ts", so strip the extension for those imports only.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js") && /[\\/]packages[\\/]/.test(context.originModulePath)) {
    return resolve(context, moduleName.slice(0, -3), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
