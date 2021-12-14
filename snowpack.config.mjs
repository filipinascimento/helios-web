export default {
  optimize: {
    bundle: true,
    minify: false,
    target: 'es2020',
    entrypoints:[
      "src/helios.js",
      "docs/example/script.js"
    ],
  },
  devOptions: {
    openUrl: "docs/example/",
  },
  exlude:[
    '**/node_modules/**/*',
    '**/.git/**/*'
  ]
};
