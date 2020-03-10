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
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
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

/* src\App.svelte generated by Svelte v3.19.1 */

function add_css() {
	var style = element("style");
	style.id = "svelte-16nqpzd-style";
	style.textContent = ".builder-container.svelte-16nqpzd.svelte-16nqpzd{position:fixed;background:white;z-index:999999;max-height:calc(100% - 72px);box-shadow:3px 3px 1.5rem black;display:grid;grid-template-rows:min-content 1fr}.builder-title.svelte-16nqpzd.svelte-16nqpzd{background:#40b2b5;text-shadow:0 2px 2px rgba(0,0,0,0.1);color:white;padding:3px 12px;font-family:\"bebas_neueregular\", sans-serif;font-size:2.4rem;text-transform:uppercase;cursor:move}.builder-issue.svelte-16nqpzd.svelte-16nqpzd{padding:6px;background:pink;color:red}.builder-content.svelte-16nqpzd.svelte-16nqpzd{overflow:auto}.builder-items.svelte-16nqpzd.svelte-16nqpzd{display:grid;grid-template-columns:min-content 1fr min-content;align-items:center;border-bottom:1px solid #e4e4e4}.builder-items.svelte-16nqpzd img.svelte-16nqpzd{margin:3px}.builder-items.svelte-16nqpzd .builder-item-remove.svelte-16nqpzd{margin:6px}.builder-summary.svelte-16nqpzd.svelte-16nqpzd{padding:6px}";
	append(document.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[19] = list[i][0];
	child_ctx[20] = list[i][1];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

// (110:6) {#each $list as item}
function create_each_block_1(ctx) {
	let img;
	let img_src_value;
	let t0;
	let a;
	let t1_value = /*item*/ ctx[23].name + "";
	let t1;
	let a_href_value;
	let t2;
	let button;
	let dispose;

	function click_handler(...args) {
		return /*click_handler*/ ctx[17](/*item*/ ctx[23], ...args);
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
			if (img.src !== (img_src_value = /*item*/ ctx[23].icon)) attr(img, "src", img_src_value);
			attr(img, "alt", "");
			attr(img, "class", "svelte-16nqpzd");
			attr(a, "class", "builder-item-name");
			attr(a, "href", a_href_value = /*item*/ ctx[23].url);
			attr(button, "class", "builder-item-remove svelte-16nqpzd");
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

			if (dirty & /*$list*/ 256 && img.src !== (img_src_value = /*item*/ ctx[23].icon)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*$list*/ 256 && t1_value !== (t1_value = /*item*/ ctx[23].name + "")) set_data(t1, t1_value);

			if (dirty & /*$list*/ 256 && a_href_value !== (a_href_value = /*item*/ ctx[23].url)) {
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

// (119:6) {#each $summary as [name, value]}
function create_each_block(ctx) {
	let div;
	let t0_value = /*value*/ ctx[20] + "";
	let t0;
	let t1;
	let t2_value = /*name*/ ctx[19] + "";
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
			if (dirty & /*$summary*/ 512 && t0_value !== (t0_value = /*value*/ ctx[20] + "")) set_data(t0, t0_value);
			if (dirty & /*$summary*/ 512 && t2_value !== (t2_value = /*name*/ ctx[19] + "")) set_data(t2, t2_value);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let div6;
	let div2;
	let div0;
	let t1;
	let div1;
	let t2;
	let div1_hidden_value;
	let t3;
	let div5;
	let div3;
	let t4;
	let div4;
	let dispose;
	let each_value_1 = /*$list*/ ctx[8];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*$summary*/ ctx[9];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div6 = element("div");
			div2 = element("div");
			div0 = element("div");
			div0.textContent = "Wakfupedia Builder";
			t1 = space();
			div1 = element("div");
			t2 = text(/*$buildSetIssue*/ ctx[7]);
			t3 = space();
			div5 = element("div");
			div3 = element("div");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t4 = space();
			div4 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(div0, "class", "builder-title svelte-16nqpzd");
			attr(div1, "class", "builder-issue svelte-16nqpzd");
			div1.hidden = div1_hidden_value = !/*$buildSetIssue*/ ctx[7];
			attr(div2, "class", "builder-nav");
			attr(div3, "class", "builder-items svelte-16nqpzd");
			attr(div4, "class", "builder-summary svelte-16nqpzd");
			attr(div5, "class", "builder-content svelte-16nqpzd");
			attr(div6, "class", "builder-container svelte-16nqpzd");
			set_style(div6, "top", /*builderTop*/ ctx[1] + "px");
			set_style(div6, "right", /*builderRight*/ ctx[2] + "px");
		},
		m(target, anchor) {
			insert(target, div6, anchor);
			append(div6, div2);
			append(div2, div0);
			append(div2, t1);
			append(div2, div1);
			append(div1, t2);
			append(div6, t3);
			append(div6, div5);
			append(div5, div3);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].m(div3, null);
			}

			append(div5, t4);
			append(div5, div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div4, null);
			}

			/*div6_binding*/ ctx[18](div6);

			dispose = [
				listen(window, "mouseup", /*dragEnd*/ ctx[11]),
				listen(window, "mousemove", /*dragUpdate*/ ctx[12]),
				listen(div0, "mousedown", /*dragStart*/ ctx[10])
			];
		},
		p(ctx, [dirty]) {
			if (dirty & /*$buildSetIssue*/ 128) set_data(t2, /*$buildSetIssue*/ ctx[7]);

			if (dirty & /*$buildSetIssue*/ 128 && div1_hidden_value !== (div1_hidden_value = !/*$buildSetIssue*/ ctx[7])) {
				div1.hidden = div1_hidden_value;
			}

			if (dirty & /*remove, $list*/ 320) {
				each_value_1 = /*$list*/ ctx[8];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(div3, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty & /*$summary*/ 512) {
				each_value = /*$summary*/ ctx[9];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div4, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty & /*builderTop*/ 2) {
				set_style(div6, "top", /*builderTop*/ ctx[1] + "px");
			}

			if (dirty & /*builderRight*/ 4) {
				set_style(div6, "right", /*builderRight*/ ctx[2] + "px");
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div6);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			/*div6_binding*/ ctx[18](null);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $buildSetIssue,
		$$unsubscribe_buildSetIssue = noop,
		$$subscribe_buildSetIssue = () => ($$unsubscribe_buildSetIssue(), $$unsubscribe_buildSetIssue = subscribe(buildSetIssue, $$value => $$invalidate(7, $buildSetIssue = $$value)), buildSetIssue);

	let $list,
		$$unsubscribe_list = noop,
		$$subscribe_list = () => ($$unsubscribe_list(), $$unsubscribe_list = subscribe(list, $$value => $$invalidate(8, $list = $$value)), list);

	let $summary,
		$$unsubscribe_summary = noop,
		$$subscribe_summary = () => ($$unsubscribe_summary(), $$unsubscribe_summary = subscribe(summary, $$value => $$invalidate(9, $summary = $$value)), summary);

	$$self.$$.on_destroy.push(() => $$unsubscribe_buildSetIssue());
	$$self.$$.on_destroy.push(() => $$unsubscribe_list());
	$$self.$$.on_destroy.push(() => $$unsubscribe_summary());
	let { items } = $$props;
	let container;
	let builderTop = 36;
	let builderRight = 36;
	let dragging = false;
	let initDragPos;
	let initPos;

	Promise.all([
		GM.getValue("builder/window/top", 36),
		GM.getValue("builder/window/right", 36),
		new Promise(resolve => {
				onMount(resolve);
			})
	]).then(([top, right]) => {
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

	const click_handler = item => remove(item.id);

	function div6_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(0, container = $$value);
		});
	}

	$$self.$set = $$props => {
		if ("items" in $$props) $$invalidate(13, items = $$props.items);
	};

	let list;
	let summary;
	let buildSetIssue;
	let remove;

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*items*/ 8192) {
			 $$subscribe_list($$invalidate(3, { list, summary, buildSetIssue, remove } = items || {}, list, $$subscribe_summary($$invalidate(4, summary)), $$subscribe_buildSetIssue($$invalidate(5, buildSetIssue)), ($$invalidate(6, remove), $$invalidate(13, items))));
		}
	};

	return [
		container,
		builderTop,
		builderRight,
		list,
		summary,
		buildSetIssue,
		remove,
		$buildSetIssue,
		$list,
		$summary,
		dragStart,
		dragEnd,
		dragUpdate,
		items,
		dragging,
		initDragPos,
		initPos,
		click_handler,
		div6_binding
	];
}

class App extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-16nqpzd-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, { items: 13 });
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

/* eslint-env browser, greasemonkey */

function createItemStore() {
  const list = writable([]);
  const buildSetIssue = derived(list, verifyBuildSet);
  const summary = derived(list, getSummary);
  let currentBuild;
  const ready = prepare();
  return {list, buildSetIssue, add, remove, summary};
  
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
  
  async function prepare() {
    currentBuild = await GM.getValue("build/current-build", "DEFAULT");
    list.set(await GM.getValue(`build/items/${currentBuild}`));
    
    if (typeof GM_addValueChangeListener === "function") {
      GM_addValueChangeListener(`build/items/${currentBuild}`, (name, oldValue, newValue, remote) => {
        if (remote) {
          list.set(newValue);
        }
      });
    }
  }
  
  async function add(newItem) {
    await ready;
    let pending;
    list.update(items => {
      if (!items) items = [];
      items.push(newItem);
      pending = GM.setValue(`build/items/${currentBuild}`, items);
      return items;
    });
    await pending;
  }
  
  async function remove(itemId) {
    await ready;
    let pending;
    list.update(items => {
      if (!items) items = [];
      const idx = items.findIndex(i => i.id === itemId);
      if (idx < 0) {
        console.warn(`cannot find item ${itemId}`);
      } else {
        items.splice(idx, 1);
      }
      pending = GM.setValue(`build/items/${currentBuild}`, items);
      return items;
    });
    return pending;
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
      const match = text.match(/^(\d+)%?\s+(.+)/);
      stats.push([match[2], Number(match[1])]);
    }
  }
  return {id, name, icon, type, stats, url};
}

/* eslint-env browser */

const items = createItemStore();

const container = document.createElement("div");
document.body.appendChild(container);

new App({
  target: container,
  props: {
    items
  }
});

if (getCurrentItem()) {
  const buttonContainer = document.createElement("span");
  const el = document.querySelector(".ak-backlink-button");
  el.parentNode.insertBefore(buttonContainer, el.nextSibling);
  const button = new Button({target: buttonContainer});
  button.$on("addItem", () => {
    items.add(getCurrentItem());
  });
}
