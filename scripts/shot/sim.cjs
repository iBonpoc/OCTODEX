/** The iPhone-simulator engine (#2360): ONLY looks — deeplink + `simctl io screenshot`. It never taps, rotates, reboots or changes appearance (the device is shared). */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ShotError } = require("./web.cjs");

const DEFAULT_UDID = process.env.GORIX_SIM_UDID || "7E41E526-8EF0-4D3A-A566-3365A860B085";
const xc = (...a) => execFileSync("xcrun", ["simctl", ...a], { encoding: "utf8" }).trim();

/** what the simulator engine cannot do without touching the shared device */
function unsupported(o) {
  const bad = [];
  if (o.actions.length) bad.push("--do");
  if (o.crop) bad.push("--crop");
  if (o.scroll != null) bad.push("--scroll");
  if (o.frames > 1) bad.push("--frames");
  if (o.font !== "normal") bad.push("--font (Dynamic Type — настройка самого симулятора)");
  if (o.reduceMotion) bad.push("--reduce-motion");
  return bad;
}

async function shootSim(o, log) {
  const udid = o.udid || DEFAULT_UDID;
  const bad = unsupported(o);
  if (bad.length) throw new ShotError(`симулятор только смотрит, не нажимает и не меняет настройки устройства: ${bad.join(", ")} не поддерживается. Это можно снять веб-движком (--engine web) или попросить основателя/исполнителя симулятора выставить состояние руками.`);
  let state;
  try { state = xc("list", "devices").split("\n").find((l) => l.includes(udid)) || ""; } catch (e) { throw new ShotError("xcrun simctl недоступен: " + e.message.split("\n")[0]); }
  if (!/Booted/.test(state)) throw new ShotError(`симулятор ${udid} не запущен (${state.trim() || "не найден"}). Запускать его фотограф не будет.`);
  const appearance = xc("ui", udid, "appearance");
  if (appearance !== o.theme) throw new ShotError(`на симуляторе сейчас тема «${appearance}», запрошена «${o.theme}». Фотограф не переключает общее устройство — снимай «${appearance}» или переключи тему сам.`);
  xc("openurl", udid, "gorix://" + o.route);
  await new Promise((r) => setTimeout(r, 2500));
  const tmp = path.join(os.tmpdir(), `gorix-sim-${process.pid}-${Date.now()}.png`);
  xc("io", udid, "screenshot", tmp);
  const png = fs.readFileSync(tmp); fs.rmSync(tmp);
  return [{ png, frame: 0 }];
}

module.exports = { shootSim, unsupported, DEFAULT_UDID };
