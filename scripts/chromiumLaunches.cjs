// Does Chromium start? (a short launch; #1060: installed without the system libraries, it can be there and not run)
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  await b.close();
  console.log("playwright: chromium launches");
})().catch((e) => {
  console.error(String(e.message || e).split("\n")[0]);
  process.exit(1);
});
