/* eslint-env browser */

import App from "./App.svelte";
import Button from "./Button.svelte";
import {getCurrentItem, createItemStore} from "./items.js";

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
