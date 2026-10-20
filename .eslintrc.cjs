module.exports = {
  extends: [ 'plugin:@wordpress/recommended' ],
  env: { jest: true },
  rules: { 'import/no-extraneous-dependencies': 'off' },
};
