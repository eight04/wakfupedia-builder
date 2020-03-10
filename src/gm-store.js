/* global GM GM_addValueChangeListener GM_removeValueChangeListener */

export function createStore(key, value) {
  const listeners = new Set;
  let gmListener;
  if (typeof GM_addValueChangeListener === "function") {
    gmListener = GM_addValueChangeListener(key, (name, oldValue, newValue, remote) => {
      if (!remote) return;
      value = newValue;
      emitChange();
    });
  }
  get().then(newValue => {
    value = newValue;
    emitChange();
  });
  return {subscribe, set, get, current: () => value, destroy};
  
  function subscribe(callback) {
    listeners.add(callback);
    callback(value);
    return () => listeners.remove(callback);
  }
  
  async function set(newValue) {
    await GM.setValue(key, newValue);
    value = newValue;
    emitChange();
  }
  
  async function get() {
    // FIXME: can we just return `value`?
    const newValue = await GM.getValue(key);
    return newValue == null ? value : newValue;
  }
  
  function emitChange() {
    for (const callback of listeners) {
      callback(value);
    }
  }
  
  function destroy() {
    listeners.clear();
    if (typeof GM_removeValueChangeListener === "function") {
      GM_removeValueChangeListener(gmListener);
    }
  }
}
