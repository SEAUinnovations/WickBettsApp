const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

// Use secondary surface for avatars (with foreground color)
css = css.replace(/\.avatar { width:30px; height:30px; border-radius:50%; display:grid; place-items:center; background:var\(--primary\); color:var\(--secondary\); font:500 11px var\(--font-inter\); }/g, ".avatar { width:30px; height:30px; border-radius:50%; display:grid; place-items:center; background:var(--secondary); color:var(--secondary-foreground); font:500 11px var(--font-inter); }");

css = css.replace(/\.pulse-row \.avatar { flex:none; background:var\(--muted-foreground\); color:var\(--secondary\); width:26px; height:26px; font-size:9px; }/g, ".pulse-row .avatar { flex:none; background:var(--secondary); color:var(--secondary-foreground); width:26px; height:26px; font-size:9px; display:grid; place-items:center; border-radius:50%; }");

css = css.replace(/\.author \.avatar { width:27px; height:27px; background:var\(--muted-foreground\); }/g, ".author .avatar { width:27px; height:27px; background:var(--secondary); color:var(--secondary-foreground); display:grid; place-items:center; border-radius:50%; }");

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);

