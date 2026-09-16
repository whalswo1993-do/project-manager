const fs = require('fs');
let code = fs.readFileSync('run_full_test2.cjs', 'utf8');
code = "const fs = require('fs');\n" + code;
fs.writeFileSync('run_full_test3.cjs', code);
