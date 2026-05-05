const fs = require("fs");

const RAPL_ENERGY = "/sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj";
const RAPL_MAX    = "/sys/class/powercap/intel-rapl/intel-rapl:0/max_energy_range_uj";

function readRaplUj() {
  try { return parseInt(fs.readFileSync(RAPL_ENERGY, "utf8")); } catch { return null; }
}

let _jetsonPath = undefined;
function findJetsonPowerPath() {
  if (_jetsonPath !== undefined) return _jetsonPath;
  try {
    for (const hw of fs.readdirSync("/sys/class/hwmon")) {
      const base = `/sys/class/hwmon/${hw}`;
      try {
        const name = fs.readFileSync(`${base}/name`, "utf8").trim();
        if (/ina|tegra/i.test(name)) {
          const f = fs.readdirSync(base).find((x) => /^power\d+_input$/.test(x));
          if (f) { _jetsonPath = `${base}/${f}`; return _jetsonPath; }
        }
      } catch {}
    }
  } catch {}
  _jetsonPath = null;
  return null;
}

function readJetsonMw() {
  const p = findJetsonPowerPath();
  if (!p) return null;
  try { return parseInt(fs.readFileSync(p, "utf8")); } catch { return null; }
}

class PowerSampler {
  constructor() {
    this._startUj = null;
    this._startTime = null;
    this._method = null;
    this._samples = [];
    this._timer = null;
  }

  start() {
    this._startTime = Date.now();
    const uj = readRaplUj();
    if (uj !== null) { this._startUj = uj; this._method = "rapl"; return; }
    const mw = readJetsonMw();
    if (mw !== null) {
      this._method = "jetson";
      this._samples = [mw];
      this._timer = setInterval(() => {
        const v = readJetsonMw();
        if (v !== null) this._samples.push(v);
      }, 200);
    }
  }

  stop() {
    const elapsed = (Date.now() - this._startTime) / 1000;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }

    if (this._method === "rapl") {
      const endUj = readRaplUj();
      if (endUj === null) return null;
      let maxUj;
      try { maxUj = parseInt(fs.readFileSync(RAPL_MAX, "utf8")); } catch { maxUj = 262143328850; }
      let delta = endUj - this._startUj;
      if (delta < 0) delta += maxUj;
      const joules = delta / 1e6;
      const watts = elapsed > 0 ? joules / elapsed : 0;
      return { watts: +watts.toFixed(1), joules: +joules.toFixed(2), elapsed: +elapsed.toFixed(1) };
    }

    if (this._method === "jetson" && this._samples.length > 0) {
      const avgMw = this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
      const watts = avgMw / 1000;
      return { watts: +watts.toFixed(1), joules: +(watts * elapsed).toFixed(2), elapsed: +elapsed.toFixed(1) };
    }

    return null;
  }
}

module.exports = { PowerSampler };
