/* eslint-env browser, greasemonkey */

import {derived} from "svelte/store";

import {currentSet} from "./set-list.js";
import {createStore} from "./gm-store.js";

export const itemList = createItemList();

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

export const buildSetIssue = derived(itemList, verifyBuildSet);

export const summary = derived(itemList, getSummary);

function getSummary(items) {
  if (!items) return [];
  const summary = new Map;
  for (const item of items) {
    for (const [name, value] of item.stats) {
      summary.set(name, (summary.get(name) || 0) + value);
    }
  }
  const stats = [...summary.entries()];
  stats.sort((a, b) => getStatTier(a[0]) - getStatTier(b[0]));
  return stats;
}

function getStatTier(stat) {
  if (/^hp$/i.test(stat)) {
    return 10;
  }
  if (/^ap$/i.test(stat)) {
    return 20;
  }
  if (/^mp$/i.test(stat)) {
    return 30;
  }
  if (/^\S+$/.test(stat) || /^critical hit$/i.test(stat)) {
    return 40;
  }
  if (/mastery/i.test(stat)) {
    if (/element/i.test(stat)) {
      return 50;
    }
    return 55;
  }
  if (/element/i.test(stat)) {
    return 60;
  }
  return 100;
}
  
function verifyBuildSet(items) {
  if (!items) return;
  const count = {};
  const unique = new Set;
  const rarityCount = {};
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
    
    if (item.rarity) {
      rarityCount[item.rarity] = (rarityCount[item.rarity] || 0) + 1;
      if (/^(epique|relic)$/i.test(item.rarity) && rarityCount[item.rarity] > 1) {
        return `Too many ${item.rarity} item`;
      }
    }
  }
}
  
export function getCurrentItem() {
  const match = location.href.match(/encyclopedia\/\w+\/(\d+)[\w-]*/);
  if (!match) return;
  
  const id = Number(match[1]);
  const name = document.querySelector(".ak-title-container h1").textContent.trim();
  const icon = document.querySelector(".ak-encyclo-detail-illu img").src.replace(/item\/\d+/, "item/42");
  const type = document.querySelector(".ak-encyclo-detail-type").textContent.split(/\s*:\s*/)[1].trim().toLowerCase();
  const rarity = document.querySelector(".ak-object-rarity span").textContent.trim();
  const stats = [];
  const url = location.href;
  
  for (const title of document.querySelectorAll(".ak-panel-title")) {
    if (!/Characteristics/i.test(title.textContent)) continue;
    for (const el of title.nextElementSibling.querySelectorAll(".show .ak-title")) {
      const text = el.textContent.trim();
      const match = text.match(/^([+-]?\d+(?:\.\d+)?)%?\s+(.+)/);
      stats.push([match[2], Number(match[1])]);
    }
  }
  return {id, name, icon, type, stats, url, rarity};
}
