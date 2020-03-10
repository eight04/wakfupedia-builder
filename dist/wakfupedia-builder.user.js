// ==UserScript==
// @name Wakfupedia Builder
// @version 0.1.0
// @description A userscript that extends Wakfu Encyclopedia with a simple builder.
// @license MIT
// @author eight04 <eight04@gmail.com>
// @homepageURL https://github.com/eight04/wakfupedia-builder
// @supportURL https://github.com/eight04/wakfupedia-builder/issues
// @match https://www.wakfu.com/en/mmorpg/encyclopedia/*
// @match https://www.wakfu.com/en/search?*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_addValueChangeListener
// @grant GM_removeValueChangeListener
// @grant GM.getValue
// @grant GM.setValue
// @run-at document-end
// ==/UserScript==

function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.data !== data)
        text.data = data;
}
function set_style(node, key, value, important) {
    node.style.setProperty(key, value, important ? 'important' : '');
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        dirty_components.length = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    flushing = false;
    seen_callbacks.clear();
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if ($$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(children(options.target));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

const subscriber_queue = [];
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
function readable(value, start) {
    return {
        subscribe: writable(value, start).subscribe,
    };
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}
function derived(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single
        ? [stores]
        : stores;
    const auto = fn.length < 2;
    return readable(initial_value, (set) => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = noop;
        const sync = () => {
            if (pending) {
                return;
            }
            cleanup();
            const result = fn(single ? values[0] : values, set);
            if (auto) {
                set(result);
            }
            else {
                cleanup = is_function(result) ? result : noop;
            }
        };
        const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
            values[i] = value;
            pending &= ~(1 << i);
            if (inited) {
                sync();
            }
        }, () => {
            pending |= (1 << i);
        }));
        inited = true;
        sync();
        return function stop() {
            run_all(unsubscribers);
            cleanup();
        };
    });
}

/* global GM GM_addValueChangeListener GM_removeValueChangeListener */

function createStore(key, value) {
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

const currentSet = createStore("build/current-build", "DEFAULT");

const setList = createStore("build/build-list", ["DEFAULT"]);

async function addSet(name) {
  const sets = await setList.get();
  if (sets.includes(name)) return;
  sets.push(name);
  await setList.set(sets);
  await currentSet.set(name);
}

async function removeSet(name) {
  if (name === "DEFAULT") return;
  const sets = await setList.get();
  if (!sets.includes(name)) return;
  if (currentSet.current() === name) {
    await currentSet.set("DEFAULT");
  }
  const newSets = sets.filter(n => n !== name);
  await setList.set(newSets);
}

/* eslint-env browser, greasemonkey */

const itemList = createItemList();

function createItemList() {
  const listeners = new Set;
  let setName = "DEFAULT";
  let rawList;
  updateRawList();
  
  currentSet.subscribe(newSetName => {
    // console.log("new set name", newSetName);
    if (setName === newSetName) return;
    setName = newSetName;
    updateRawList();
  });
  
  return {subscribe, add, remove};
  
  function updateRawList() {
    if (rawList) {
      rawList.destroy();
    }
    rawList = createStore(`build/items/${setName}`, []);
    rawList.subscribe(emitChange);
  }
  
  function subscribe(callback) {
    listeners.add(callback);
    callback(rawList.current());
    return () => listeners.remove(callback);
  }
  
  function emitChange() {
    for (const callback of listeners) {
      callback(rawList.current());
    }
  }
  
  async function add(item) {
    const items = await rawList.get();
    items.push(item);
    await rawList.set(items);
  }
  
  async function remove(itemId) {
    const items = await rawList.get();
    const idx = items.findIndex(i => i.id === itemId);
    if (idx < 0) {
      console.warn(`cannot find item ${itemId}`);
      return;
    }
    items.splice(idx, 1);
    await rawList.set(items);
  }
}

const buildSetIssue = derived(itemList, verifyBuildSet);

const summary = derived(itemList, getSummary);

function getSummary(items) {
  if (!items) return [];
  const summary = new Map;
  for (const item of items) {
    for (const [name, value] of item.stats) {
      summary.set(name, (summary.get(name) || 0) + value);
    }
  }
  return [...summary.entries()];
}
  
function verifyBuildSet(items) {
  if (!items) return;
  const count = {};
  const unique = new Set;
  for (const item of items) {
    if (unique.has(item.id)) {
      return `Duplicate item: ${item.name}`;
    }
    unique.add(item.id);
    
    count[item.type] = count[item.type] ? count[item.type] + 1 : 1;
    if (
      count[item.type] > 1 && item.type !== "ring" ||
      count[item.type] > 2
    ) {
      return `Too many ${item.type}`;
    }
  }
}
  
function getCurrentItem() {
  const match = location.href.match(/encyclopedia\/\w+\/(\d+)[\w-]*/);
  if (!match) return;
  
  const id = Number(match[1]);
  const name = document.querySelector(".ak-title-container h1").textContent.trim();
  const icon = document.querySelector(".ak-encyclo-detail-illu img").src.replace(/item\/\d+/, "item/42");
  const type = document.querySelector(".ak-encyclo-detail-type").textContent.split(/\s*:\s*/)[1].trim().toLowerCase();
  const stats = [];
  const url = location.href;
  
  for (const title of document.querySelectorAll(".ak-panel-title")) {
    if (!/Characteristics/i.test(title.textContent)) continue;
    for (const el of title.nextElementSibling.querySelectorAll(".show .ak-title")) {
      const text = el.textContent.trim();
      const match = text.match(/^(-?\d+(?:\.\d+)?)%?\s+(.+)/);
      stats.push([match[2], Number(match[1])]);
    }
  }
  return {id, name, icon, type, stats, url};
}

/* src\App.svelte generated by Svelte v3.19.1 */

function add_css() {
	var style = element("style");
	style.id = "svelte-z2h4wy-style";
	style.textContent = ".builder-container.svelte-z2h4wy.svelte-z2h4wy{position:fixed;background:white;z-index:999999;max-height:calc(100% - 72px);box-shadow:3px 3px 1.5rem black;display:grid;grid-template-rows:min-content 1fr}.builder-title.svelte-z2h4wy.svelte-z2h4wy{background:#40b2b5;text-shadow:0 2px 2px rgba(0,0,0,0.1);color:white;padding:3px 12px;font-family:\"bebas_neueregular\", sans-serif;font-size:2.4rem;text-transform:uppercase;cursor:move}.builder-set-select.svelte-z2h4wy.svelte-z2h4wy{display:block;width:100%}.builder-issue.svelte-z2h4wy.svelte-z2h4wy{padding:6px;background:pink;color:red}.builder-content.svelte-z2h4wy.svelte-z2h4wy{overflow:auto}.builder-items.svelte-z2h4wy.svelte-z2h4wy{display:grid;grid-template-columns:min-content 1fr min-content;align-items:center;border-bottom:1px solid #e4e4e4}.builder-items.svelte-z2h4wy img.svelte-z2h4wy{margin:3px}.builder-items.svelte-z2h4wy .builder-item-remove.svelte-z2h4wy{margin:6px}.builder-summary.svelte-z2h4wy.svelte-z2h4wy{padding:6px}";
	append(document.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[18] = list[i][0];
	child_ctx[19] = list[i][1];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[22] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[18] = list[i];
	return child_ctx;
}

// (144:10) {#each $setList as name}
function create_each_block_2(ctx) {
	let option;
	let t_value = /*name*/ ctx[18] + "";
	let t;
	let option_value_value;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			option.__value = option_value_value = /*name*/ ctx[18];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert(target, option, anchor);
			append(option, t);
		},
		p(ctx, dirty) {
			if (dirty & /*$setList*/ 16 && t_value !== (t_value = /*name*/ ctx[18] + "")) set_data(t, t_value);

			if (dirty & /*$setList*/ 16 && option_value_value !== (option_value_value = /*name*/ ctx[18])) {
				option.__value = option_value_value;
			}

			option.value = option.__value;
		},
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (160:6) {#each $itemList as item}
function create_each_block_1(ctx) {
	let img;
	let img_src_value;
	let t0;
	let a;
	let t1_value = /*item*/ ctx[22].name + "";
	let t1;
	let a_href_value;
	let t2;
	let button;
	let dispose;

	function click_handler(...args) {
		return /*click_handler*/ ctx[17](/*item*/ ctx[22], ...args);
	}

	return {
		c() {
			img = element("img");
			t0 = space();
			a = element("a");
			t1 = text(t1_value);
			t2 = space();
			button = element("button");
			button.textContent = "✗\r\n        ";
			if (img.src !== (img_src_value = /*item*/ ctx[22].icon)) attr(img, "src", img_src_value);
			attr(img, "alt", "");
			attr(img, "class", "svelte-z2h4wy");
			attr(a, "class", "builder-item-name");
			attr(a, "href", a_href_value = /*item*/ ctx[22].url);
			attr(button, "class", "builder-item-remove svelte-z2h4wy");
			attr(button, "type", "button");
		},
		m(target, anchor) {
			insert(target, img, anchor);
			insert(target, t0, anchor);
			insert(target, a, anchor);
			append(a, t1);
			insert(target, t2, anchor);
			insert(target, button, anchor);
			dispose = listen(button, "click", click_handler);
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*$itemList*/ 64 && img.src !== (img_src_value = /*item*/ ctx[22].icon)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*$itemList*/ 64 && t1_value !== (t1_value = /*item*/ ctx[22].name + "")) set_data(t1, t1_value);

			if (dirty & /*$itemList*/ 64 && a_href_value !== (a_href_value = /*item*/ ctx[22].url)) {
				attr(a, "href", a_href_value);
			}
		},
		d(detaching) {
			if (detaching) detach(img);
			if (detaching) detach(t0);
			if (detaching) detach(a);
			if (detaching) detach(t2);
			if (detaching) detach(button);
			dispose();
		}
	};
}

// (169:6) {#each $summary as [name, value]}
function create_each_block(ctx) {
	let div;
	let t0_value = /*value*/ ctx[19] + "";
	let t0;
	let t1;
	let t2_value = /*name*/ ctx[18] + "";
	let t2;
	let t3;

	return {
		c() {
			div = element("div");
			t0 = text(t0_value);
			t1 = space();
			t2 = text(t2_value);
			t3 = space();
			attr(div, "class", "builder-summary-element");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, t2);
			append(div, t3);
		},
		p(ctx, dirty) {
			if (dirty & /*$summary*/ 128 && t0_value !== (t0_value = /*value*/ ctx[19] + "")) set_data(t0, t0_value);
			if (dirty & /*$summary*/ 128 && t2_value !== (t2_value = /*name*/ ctx[18] + "")) set_data(t2, t2_value);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let div7;
	let div3;
	let div0;
	let t1;
	let div1;
	let select;
	let optgroup0;
	let optgroup1;
	let option0;
	let option1;
	let t3;
	let option1_disabled_value;
	let t4;
	let div2;
	let t5;
	let div2_hidden_value;
	let t6;
	let div6;
	let div4;
	let t7;
	let div5;
	let dispose;
	let each_value_2 = /*$setList*/ ctx[4];
	let each_blocks_2 = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	let each_value_1 = /*$itemList*/ ctx[6];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*$summary*/ ctx[7];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div7 = element("div");
			div3 = element("div");
			div0 = element("div");
			div0.textContent = "Wakfupedia Builder";
			t1 = space();
			div1 = element("div");
			select = element("select");
			optgroup0 = element("optgroup");

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].c();
			}

			optgroup1 = element("optgroup");
			option0 = element("option");
			option0.textContent = "Add a new set";
			option1 = element("option");
			t3 = text("Delete current set");
			t4 = space();
			div2 = element("div");
			t5 = text(/*$buildSetIssue*/ ctx[5]);
			t6 = space();
			div6 = element("div");
			div4 = element("div");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t7 = space();
			div5 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(div0, "class", "builder-title svelte-z2h4wy");
			attr(optgroup0, "label", "Sets");
			option0.__value = "_NEW_";
			option0.value = option0.__value;
			option1.__value = "_DELETE_";
			option1.value = option1.__value;
			option1.disabled = option1_disabled_value = /*$currentSet*/ ctx[3] === "DEFAULT";
			attr(optgroup1, "label", "Actions");
			attr(select, "class", "builder-set-select svelte-z2h4wy");
			attr(div1, "class", "builder-set-list");
			attr(div2, "class", "builder-issue svelte-z2h4wy");
			div2.hidden = div2_hidden_value = !/*$buildSetIssue*/ ctx[5];
			attr(div3, "class", "builder-nav");
			attr(div4, "class", "builder-items svelte-z2h4wy");
			attr(div5, "class", "builder-summary svelte-z2h4wy");
			attr(div6, "class", "builder-content svelte-z2h4wy");
			attr(div7, "class", "builder-container svelte-z2h4wy");
			set_style(div7, "top", /*builderTop*/ ctx[1] + "px");
			set_style(div7, "right", /*builderRight*/ ctx[2] + "px");
		},
		m(target, anchor) {
			insert(target, div7, anchor);
			append(div7, div3);
			append(div3, div0);
			append(div3, t1);
			append(div3, div1);
			append(div1, select);
			append(select, optgroup0);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].m(optgroup0, null);
			}

			append(select, optgroup1);
			append(optgroup1, option0);
			append(optgroup1, option1);
			append(option1, t3);
			/*select_binding*/ ctx[16](select);
			append(div3, t4);
			append(div3, div2);
			append(div2, t5);
			append(div7, t6);
			append(div7, div6);
			append(div6, div4);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].m(div4, null);
			}

			append(div6, t7);
			append(div6, div5);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div5, null);
			}

			dispose = [
				listen(window, "mouseup", /*dragEnd*/ ctx[10]),
				listen(window, "mousemove", /*dragUpdate*/ ctx[11]),
				listen(div0, "mousedown", /*dragStart*/ ctx[9]),
				listen(select, "change", /*updateSelectedSet*/ ctx[8])
			];
		},
		p(ctx, [dirty]) {
			if (dirty & /*$setList*/ 16) {
				each_value_2 = /*$setList*/ ctx[4];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks_2[i]) {
						each_blocks_2[i].p(child_ctx, dirty);
					} else {
						each_blocks_2[i] = create_each_block_2(child_ctx);
						each_blocks_2[i].c();
						each_blocks_2[i].m(optgroup0, null);
					}
				}

				for (; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].d(1);
				}

				each_blocks_2.length = each_value_2.length;
			}

			if (dirty & /*$currentSet*/ 8 && option1_disabled_value !== (option1_disabled_value = /*$currentSet*/ ctx[3] === "DEFAULT")) {
				option1.disabled = option1_disabled_value;
			}

			if (dirty & /*$buildSetIssue*/ 32) set_data(t5, /*$buildSetIssue*/ ctx[5]);

			if (dirty & /*$buildSetIssue*/ 32 && div2_hidden_value !== (div2_hidden_value = !/*$buildSetIssue*/ ctx[5])) {
				div2.hidden = div2_hidden_value;
			}

			if (dirty & /*itemList, $itemList*/ 64) {
				each_value_1 = /*$itemList*/ ctx[6];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(div4, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty & /*$summary*/ 128) {
				each_value = /*$summary*/ ctx[7];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div5, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty & /*builderTop*/ 2) {
				set_style(div7, "top", /*builderTop*/ ctx[1] + "px");
			}

			if (dirty & /*builderRight*/ 4) {
				set_style(div7, "right", /*builderRight*/ ctx[2] + "px");
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div7);
			destroy_each(each_blocks_2, detaching);
			/*select_binding*/ ctx[16](null);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $currentSet;
	let $setList;
	let $buildSetIssue;
	let $itemList;
	let $summary;
	component_subscribe($$self, currentSet, $$value => $$invalidate(3, $currentSet = $$value));
	component_subscribe($$self, setList, $$value => $$invalidate(4, $setList = $$value));
	component_subscribe($$self, buildSetIssue, $$value => $$invalidate(5, $buildSetIssue = $$value));
	component_subscribe($$self, itemList, $$value => $$invalidate(6, $itemList = $$value));
	component_subscribe($$self, summary, $$value => $$invalidate(7, $summary = $$value));
	let setSelectEl;

	afterUpdate(() => {
		if (!setSelectEl) return;
		$$invalidate(0, setSelectEl.value = $currentSet, setSelectEl);
	});

	const selectActions = {
		_NEW_: async () => {
			const newSet = prompt("Name of the new set");

			if (!newSet) {
				return;
			}

			await addSet(newSet);
		},
		_DELETE_: async () => {
			await removeSet($currentSet);
		}
	};

	async function updateSelectedSet() {
		const action = selectActions[setSelectEl.value];

		if (action) {
			$$invalidate(0, setSelectEl.value = $currentSet, setSelectEl);
			await action();
			return;
		}

		currentSet.set(setSelectEl.value);
	}

	let builderTop = 36;
	let builderRight = 36;
	let dragging = false;
	let initDragPos;
	let initPos;

	Promise.all([GM.getValue("builder/window/top", 36), GM.getValue("builder/window/right", 36)]).then(([top, right]) => {
		$$invalidate(1, builderTop = top);
		$$invalidate(2, builderRight = right);
	});

	function dragStart(e) {
		initDragPos = { x: e.screenX, y: e.screenY };
		initPos = { top: builderTop, right: builderRight };
		dragging = true;
		e.preventDefault();
	}

	function dragEnd() {
		dragging = false;
		GM.setValue("builder/window/top", builderTop);
		GM.setValue("builder/window/right", builderRight);
	}

	function dragUpdate(e) {
		if (!dragging) return;
		$$invalidate(1, builderTop = initPos.top + e.screenY - initDragPos.y);
		$$invalidate(2, builderRight = initPos.right - (e.screenX - initDragPos.x));
	}

	function select_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(0, setSelectEl = $$value);
		});
	}

	const click_handler = item => itemList.remove(item.id);

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*setSelectEl, $currentSet*/ 9) {
			 {
				if (setSelectEl) {
					$$invalidate(0, setSelectEl.value = $currentSet, setSelectEl);
				}
			}
		}
	};

	return [
		setSelectEl,
		builderTop,
		builderRight,
		$currentSet,
		$setList,
		$buildSetIssue,
		$itemList,
		$summary,
		updateSelectedSet,
		dragStart,
		dragEnd,
		dragUpdate,
		dragging,
		initDragPos,
		initPos,
		selectActions,
		select_binding,
		click_handler
	];
}

class App extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-z2h4wy-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, {});
	}
}

/* src\Button.svelte generated by Svelte v3.19.1 */

function add_css$1() {
	var style = element("style");
	style.id = "svelte-czc51x-style";
	style.textContent = ".builder-add-item.svelte-czc51x{position:absolute;top:12px;bottom:12px;right:146px;width:42px;background:rgba(0, 0, 0, 0.3);border:none;color:white}.builder-add-item.svelte-czc51x:hover{text-decoration:underline}";
	append(document.head, style);
}

function create_fragment$1(ctx) {
	let button;
	let dispose;

	return {
		c() {
			button = element("button");
			button.textContent = "+";
			attr(button, "type", "button");
			attr(button, "class", "builder-add-item svelte-czc51x");
		},
		m(target, anchor) {
			insert(target, button, anchor);
			dispose = listen(button, "click", /*click_handler*/ ctx[1]);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(button);
			dispose();
		}
	};
}

function instance$1($$self) {
	const dispatch = createEventDispatcher();
	const click_handler = () => dispatch("addItem");
	return [dispatch, click_handler];
}

class Button extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-czc51x-style")) add_css$1();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
	}
}

/* eslint-env browser */

const container = document.createElement("div");
document.body.appendChild(container);

new App({target: container});

if (getCurrentItem()) {
  const buttonContainer = document.createElement("span");
  const el = document.querySelector(".ak-backlink-button");
  el.parentNode.insertBefore(buttonContainer, el.nextSibling);
  const button = new Button({target: buttonContainer});
  button.$on("addItem", () => {
    itemList.add(getCurrentItem());
  });
}
