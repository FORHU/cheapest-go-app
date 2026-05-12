const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Add the web project to watch folders so we can import code from it
config.watchFolders = [path.resolve(workspaceRoot, "cheapest-go-app")];

module.exports = withNativeWind(config, { input: "./global.css" });
