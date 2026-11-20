/** Serves dist/ on a fixed port for the picture run (playwright.visual.config.cjs: webServer). */
const path = require("node:path");
const { serveDist } = require("../serve.cjs");
serveDist(path.join(__dirname, "..", "..", "dist"), Number(process.env.VISUAL_PORT || 4173)).then((s) => console.log(`serving ${s.base}`));
