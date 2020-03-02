/* eslint-env browser, greasemonkey */
/* global GM_addValueChangeListener */

import {writable, derived} from "svelte/store";

export function createItemStore() {
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

export function getCurrentItem() {
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
