export default {
  '*.{ts,tsx,js,mjs}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,md,css,html,yml,yaml}': ['prettier --write'],
};
