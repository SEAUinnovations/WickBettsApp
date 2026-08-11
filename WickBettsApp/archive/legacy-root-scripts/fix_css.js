const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

// Fix notice colors
css = css.replace(/background:#e2eee4;/g, "background: #11271E;");
css = css.replace(/color:#4d735b;/g, "color: #7AE2AA;");

// Fix muted day color
css = css.replace(/color:#b1afa6;/g, "color: var(--muted-foreground);");

// Fix mobile nav background
css = css.replace(/background:rgba\(32,55,44,\.97\);/, "background: rgba(28, 23, 40, .97);");

// Fix specific table direction colors
css = css.replace(/color:#4b7b5f;/g, "color: #7AE2AA;");
css = css.replace(/color:#a85e54;/g, "color: #FB7185;");

// Fix specific pinned label colors
css = css.replace(/color:#9e853e;/g, "color: #FDBA74;");

// Fix inline styles in App.tsx? Let's check App.tsx as well for any hardcoded styles.
fs.writeFileSync('artifacts/wick-betts/src/index.css', css);

let app = fs.readFileSync('artifacts/wick-betts/src/App.tsx', 'utf8');
// remove the `<span className="hero-index mono">01 / 04 — OPENING NOTE</span>` or anything that clashes with the new design?
// The instructions say: "keep ALL existing functionality, routes, component logic ... this is a visual reskin via index.css and className/inline-style adjustments".
// So inline style adjustments are allowed and expected if it helps.

// Let's change the App.tsx Signin Button text color.
app = app.replace(/background: '#fff', color: '#3c4043'/g, "background: 'var(--foreground)', color: 'var(--primary-foreground)'");
app = app.replace(/border: '1\.5px solid #dadce0'/g, "border: '1.5px solid var(--border)'");

fs.writeFileSync('artifacts/wick-betts/src/App.tsx', app);
console.log("Cleanup done");
