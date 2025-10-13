// webserver/public/js/ui/busy.js
// Busy orchestrator: maintains a set of reasons and notifies on state changes.

export function createBusy(onChange) {
  const reasons = new Set();
  function notify() {
    if (typeof onChange === 'function') onChange(reasons.size > 0);
  }
  return {
    start(reason = 'generic') { reasons.add(reason); notify(); },
    end(reason = 'generic') { reasons.delete(reason); notify(); },
    isBusy() { return reasons.size > 0; }
  };
}

