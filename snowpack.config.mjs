export default {
  optimize: {
    bundle: true,
    minify: true,
    target: 'es2020',
    entrypoints:[
      "src/helios.js",
    ],
    splitting: true
  },
  devOptions: {
    openUrl: "docs/example/",
  },
  exlude:[
    '**/node_modules/**/*',
    '**/.git/**/*'
  ]
};
