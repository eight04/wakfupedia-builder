import {createStore} from "./gm-store.js";

export const currentSet = createStore("build/current-build", "DEFAULT");

export const setList = createStore("build/build-list", ["DEFAULT"]);

export async function addSet(name) {
  const sets = await setList.get();
  if (sets.includes(name)) return;
  sets.push(name);
  await setList.set(sets);
  await currentSet.set(name);
}

export async function removeSet(name) {
  if (name === "DEFAULT") return;
  const sets = await setList.get();
  if (!sets.includes(name)) return;
  if (currentSet.current() === name) {
    await currentSet.set("DEFAULT");
  }
  const newSets = sets.filter(n => n !== name);
  await setList.set(newSets);
}
