<script>
import {createEventDispatcher} from "svelte";
const dispatch = createEventDispatcher();
</script>

<style>
.builder-add-item {
  position: absolute;
  top: 12px;
  bottom: 12px;
  right: 146px;
  width: 42px;
  background: rgba(0, 0, 0, 0.3);
  border: none;
  color: white;
}
.builder-add-item:hover {
  text-decoration: underline;
}
</style>

<button type="button" class="builder-add-item" on:click={() => dispatch("addItem")}>
  &plus;
</button>
