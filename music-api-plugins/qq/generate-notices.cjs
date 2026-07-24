"use strict";

const fs = require("node:fs");
const path = require("node:path");

const [runtimeRoot, outputPath] = process.argv.slice(2);
if (!runtimeRoot || !outputPath) {
  throw new Error("Usage: node generate-notices.cjs <runtime-root> <output-path>");
}

function packageDirectories(nodeModules) {
  if (!fs.existsSync(nodeModules)) return [];
  const directories = [];
  for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const entryPath = path.join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of fs.readdirSync(entryPath, { withFileTypes: true })) {
        if (child.isDirectory()) directories.push(path.join(entryPath, child.name));
      }
    } else {
      directories.push(entryPath);
    }
  }
  return directories;
}

const packages = packageDirectories(path.join(runtimeRoot, "node_modules"))
  .map((directory) => {
    try {
      const metadata = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
      const license = typeof metadata.license === "string"
        ? metadata.license
        : metadata.license?.type || "SEE PACKAGE";
      return {
        name: metadata.name || path.basename(directory),
        version: metadata.version || "unknown",
        license
      };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((left, right) => left.name.localeCompare(right.name));

const lines = [
  "FE Monster QQ Music API Plugin - Third-Party Notices",
  "===================================================",
  "",
  "This plugin contains @sansenjian/qq-music-api 2.4.0 and its production dependencies.",
  "The upstream QQ Music API MIT license is included as LICENSE.",
  "Dependency license files remain embedded in runtime.tgz under node_modules/<package>/.",
  "",
  "Packages:",
  ...packages.map((item) => `- ${item.name} ${item.version} — ${item.license}`),
  ""
];

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
