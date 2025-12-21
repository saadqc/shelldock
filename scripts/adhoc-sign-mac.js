"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  // Ad-hoc signing (-s -) avoids a paid Apple Developer account; Gatekeeper warnings are expected without notarization.
  execFileSync("codesign", ["--deep", "--force", "--sign", "-", appPath], {
    stdio: "inherit"
  });
};
