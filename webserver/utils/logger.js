const fs = require('fs');
const path = require('path');
const util = require('util');

const LEVELS = ['error', 'warn', 'info', 'debug'];
const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const configured = (process.env.LOG_LEVEL || DEFAULT_LEVEL).toLowerCase();
const activeLevelIndex = LEVELS.includes(configured) ? LEVELS.indexOf(configured) : LEVELS.indexOf(DEFAULT_LEVEL);
const rotateDaily = (process.env.LOG_ROTATE_DAILY || 'true').toLowerCase() !== 'false';
const logDir = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const baseFile = process.env.LOG_FILE || path.join(logDir, 'storyfinder.log');
// When rotation is enabled, we write to <basename>-YYYY-MM-DD<ext> in LOG_DIR
// Otherwise we append to LOG_FILE (or default storyfinder.log)
const logFile = rotateDaily ? baseFile : baseFile;
const logToConsole = process.env.LOG_ENABLE_CONSOLE !== 'false';

const nativeConsole = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: (console.info || console.log).bind(console),
  log: console.log.bind(console)
};

let stream = null;
let streamBroken = false;
let currentDayKey = null; // YYYY-MM-DD for rotation

function dayKey(d = new Date()){
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function buildRotatedPath(base, dkey){
  // base may be '.../storyfinder.log' or a custom path. Inject -YYYY-MM-DD before extension.
  const dir = path.dirname(base);
  const ext = path.extname(base);
  const name = path.basename(base, ext);
  const fname = rotateDaily ? `${name}-${dkey}${ext || '.log'}` : `${name}${ext || '.log'}`;
  // If LOG_DIR is set, force output folder there when rotating
  const outDir = rotateDaily ? (process.env.LOG_DIR || dir) : dir;
  return path.join(outDir, fname);
}

function ensureStream() {
  const dkey = rotateDaily ? dayKey() : null;
  if (rotateDaily) {
    // Rotate if day changed
    if (stream && currentDayKey && currentDayKey !== dkey) {
      try { stream.end(); } catch(_) {}
      stream = null;
    }
  }
  if (stream || streamBroken) return stream;
  try {
    const targetPath = rotateDaily ? buildRotatedPath(baseFile, dkey) : baseFile;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    stream = fs.createWriteStream(targetPath, { flags: 'a', encoding: 'utf8' });
    currentDayKey = rotateDaily ? dkey : null;
    stream.on('error', err => {
      streamBroken = true;
      try { stream?.destroy(); } catch (_) {}
      stream = null;
      nativeConsole.error('[logger] file stream error -> fallback to console only', err?.message || err);
    });
  } catch (err) {
    streamBroken = true;
    stream = null;
    nativeConsole.error('[logger] failed to open log file', baseFile, '-', err?.message || err);
  }
  return stream;
}

function stringifyArgs(args) {
  if (args.length === 1) {
    const [single] = args;
    if (typeof single === 'string') return single;
  }
  return util.format(...args);
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = pad(date.getFullYear() % 100);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${day}-${month}-${year}; ${hours}:${minutes}:${seconds}`;
}

function formatLine(level, scope, args) {
  const ts = formatTimestamp(new Date());
  const upperLevel = level.toUpperCase();
  const scopePart = scope ? `[${scope}]` : '';
  const body = stringifyArgs(args);
  return `(${ts}) [${upperLevel}]${scopePart} ${body}`;
}

function shouldLog(level) {
  const idx = LEVELS.indexOf(level);
  if (idx === -1) return false;
  return idx <= activeLevelIndex;
}

function writeToFile(line) {
  const target = ensureStream();
  if (!target) return;
  try {
    target.write(line + '\n');
  } catch (err) {
    streamBroken = true;
    try { stream?.destroy(); } catch (_) {}
    stream = null;
    nativeConsole.error('[logger] failed to write log line', err?.message || err);
  }
}

function log(level, scope, args) {
  if (!shouldLog(level)) return;
  const line = formatLine(level, scope, args);
  if (!streamBroken) {
    writeToFile(line);
  }
  if (logToConsole) {
    const method = level === 'error' ? nativeConsole.error : level === 'warn' ? nativeConsole.warn : nativeConsole.log;
    method(line);
  }
}

function createLogger(scope) {
  const sc = scope || null;
  return {
    error: (...args) => log('error', sc, args),
    warn: (...args) => log('warn', sc, args),
    info: (...args) => log('info', sc, args),
    debug: (...args) => log('debug', sc, args),
    // Simple timer utility for async ops
    timer: (label, meta) => {
      const start = process.hrtime.bigint();
      return {
        end: (extra) => {
          const durMs = Number(process.hrtime.bigint() - start) / 1e6;
          const payload = Object.assign({ label, ms: Math.round(durMs) }, meta || {}, extra || {});
          log('info', sc, [ '[TIMER]', payload ]);
          return durMs;
        }
      };
    },
    async timePromise(label, fnOrPromise, meta){
      const t = this.timer(label, meta);
      try {
        const res = (typeof fnOrPromise === 'function') ? await fnOrPromise() : await fnOrPromise;
        t.end({ ok: true });
        return res;
      } catch (e) {
        t.end({ ok: false, error: e && (e.message || String(e)) });
        throw e;
      }
    }
  };
}

module.exports = createLogger;
module.exports.level = LEVELS[activeLevelIndex];
module.exports.logFile = baseFile;
module.exports.enableConsole = logToConsole;
module.exports.rotateDaily = rotateDaily;

