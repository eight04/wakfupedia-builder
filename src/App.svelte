<script>
import {afterUpdate} from "svelte";

import {itemList, summary, buildSetIssue} from "./items.js";
import {setList, currentSet, addSet, removeSet} from "./set-list.js";

let setSelectEl;
afterUpdate(() => {
  if (!setSelectEl) return;
  
  setSelectEl.value = $currentSet;  
});
$: {
  if (setSelectEl) {
    setSelectEl.value = $currentSet;
  }
}

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
}

async function updateSelectedSet() {
  const action = selectActions[setSelectEl.value];
  if (action) {
    setSelectEl.value = $currentSet;
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

Promise.all([
  GM.getValue("builder/window/top", 36),
  GM.getValue("builder/window/right", 36),
])
  .then(([top, right]) => {
    builderTop = top;
    builderRight = right;
  });
  
function dragStart(e) {
  initDragPos = {x: e.screenX, y: e.screenY};
  initPos = {top: builderTop, right: builderRight};
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
  
  builderTop = initPos.top + e.screenY - initDragPos.y;
  builderRight = initPos.right - (e.screenX - initDragPos.x);
}
</script>

<style>
.builder-container {
  position: fixed;
  background: white;
  z-index: 999999;
  max-height: calc(100% - 72px);
  box-shadow: 3px 3px 1.5rem black;
  display: grid;
  grid-template-rows: min-content 1fr;
}

.builder-title {
  background: #40b2b5;
  text-shadow: 0 2px 2px rgba(0,0,0,0.1);
  color: white;
  padding: 3px 12px;
  font-family: "bebas_neueregular", sans-serif;
  font-size: 2.4rem;
  text-transform: uppercase;
  cursor: move;
}

.builder-set-select {
  display: block;
  width: 100%;
}

.builder-issue {
  padding: 6px;
  background: pink;
  color: red;
}

.builder-content {
  overflow: auto;
}

.builder-items {
  display: grid;
  grid-template-columns: min-content 1fr min-content;
  align-items: center;
  border-bottom: 1px solid #e4e4e4;
}
.builder-items img {
  margin: 3px;
}
.builder-items .builder-item-remove {
  margin: 6px;
}

.builder-summary {
  padding: 6px;
}
</style>

<svelte:window on:mouseup={dragEnd} on:mousemove={dragUpdate} />

<div class="builder-container" style="top: {builderTop}px; right: {builderRight}px;">
  <div class="builder-nav">
    <div class="builder-title" on:mousedown={dragStart}>
      Wakfupedia Builder
    </div>
    <div class="builder-set-list">
      <select class="builder-set-select" on:change={updateSelectedSet} bind:this={setSelectEl}>
        <optgroup label="Sets">
          {#each $setList as name}
            <option value={name}>{name}</option>
          {/each}
        </optgroup>
        <optgroup label="Actions">
          <option value="_NEW_">Add a new set</option>
          <option value="_DELETE_" disabled={$currentSet === "DEFAULT"}>Delete current set</option>
        </optgroup>
      </select>
    </div>
    <div class="builder-issue" hidden={!$buildSetIssue}>
      {$buildSetIssue}
    </div>
  </div>
  <div class="builder-content">
    <div class="builder-items">
      {#each $itemList as item}
        <img src={item.icon} alt="">
        <a class="builder-item-name" href={item.url}>{item.name}</a>
        <button class="builder-item-remove" type="button" on:click={() => itemList.remove(item.id)}>
          &cross;
        </button>
      {/each}
    </div>
    <div class="builder-summary">
      {#each $summary as [name, value]}
        <div class="builder-summary-element">
          {value} {name}
        </div>
      {/each}
    </div>
  </div>
</div>
