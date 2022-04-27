module.exports = {
	"env": {
		"es6": true,
		"node": true
	},
	"rules": {
		"no-use-before-define": [2, "nofunc"],
		"semi": [2, "always"],
    "no-console": [2, {"allow": ["error", "warn"]}]
	},
	"extends": [
		"eslint:recommended"
	],
  "parserOptions": {
    "sourceType": "module",
    "ecmaVersion": 2019
  },
  plugins: [
    'svelte3'
  ],
  overrides: [
    {
      files: ['*.svelte'],
      processor: 'svelte3/svelte3'
    }
  ],
};
