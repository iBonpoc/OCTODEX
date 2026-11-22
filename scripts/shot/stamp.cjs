/** Draws the stamp strip UNDER a PNG (never inside the interface), in the already open Chrome — no image dependency (rule 17). */
const BAR = 34;
async function stampPng(browser, png, lines) {
  const page = await browser.newPage();
  try {
    const out = await page.evaluate(async ([b64, lines, bar]) => {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + b64; });
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height + bar;
      const x = c.getContext("2d");
      x.fillStyle = "#111"; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0);
      x.fillStyle = "#fff"; x.fillRect(0, img.height, c.width, bar);
      x.fillStyle = "#000"; x.font = "11px ui-monospace, Menlo, monospace"; x.textBaseline = "top";
      x.fillText(lines[0], 6, img.height + 3, c.width - 12); x.fillText(lines[1], 6, img.height + 18, c.width - 12);
      return c.toDataURL("image/png").split(",")[1];
    }, [png.toString("base64"), lines, BAR]);
    return Buffer.from(out, "base64");
  } finally { await page.close(); }
}
module.exports = { stampPng, BAR };
