import svelte from "rollup-plugin-svelte";
import meta from "userscript-meta-cli";
import resolve from "rollup-plugin-node-resolve";

export default {
  input: "src/index.js",
  output: {
    file: "dist/wakfupedia.user.js",
    format: "esm",
    banner: meta.stringify(meta.getMeta())
  },
  plugins: [
    resolve(),
    svelte()
  ]
};