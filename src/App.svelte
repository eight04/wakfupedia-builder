<script>
import {onMount} from "svelte";

export let items;
$: ({list, summary, buildSetIssue, remove} = items || {});

let container;

Promise.all([
  GM.getValue("builder/window/top", 36),
  GM.getValue("builder/window/right", 36),
  new Promise(resolve => {
    onMount(resolve);
  })
])
  .then(([top, right]) => {
    container.style.setProperty("--builder-top", top);
    container.style.setProperty("--builder-right", right);
  });
</script>

<style>
.builder-container {
  position: fixed;
  background: white;
  top: calc(var(--builder-top, 36) * 1px);
  right: calc(var(--builder-right, 36) * 1px);
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

<div class="builder-container" bind:this={container}>
  <div class="builder-nav">
    <div class="builder-title">
      Wakfupedia Builder
    </div>
    <div class="builder-issue" hidden={!$buildSetIssue}>
      {$buildSetIssue}
    </div>
  </div>
  <div class="builder-content">
    <div class="builder-items">
      {#each $list as item}
        <img src={item.icon} alt="">
        <a class="builder-item-name" href={item.url}>{item.name}</a>
        <button class="builder-item-remove" type="button" on:click={() => remove(item.id)}>
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
