const fs = require('fs');
let log = (err, stdout, stderr) => console.log(stdout)
fs.rm("build", { recursive: true,force:true, maxRetries:10}, function(err, result) {
  if(err) console.log('error', err);
});
