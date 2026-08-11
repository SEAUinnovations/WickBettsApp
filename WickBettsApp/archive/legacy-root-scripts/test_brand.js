const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');
css = css.replace(/\.brand-mark\s*{[^}]+}/g, `.brand-mark {
  width: 28px; height: 28px; display: grid; place-items: center; background: var(--primary); color: var(--primary-foreground); border-radius: 50%; font: 700 13px var(--font-inter);
}`);
fs.writeFileSync('artifacts/wick-betts/src/index.css', css);

