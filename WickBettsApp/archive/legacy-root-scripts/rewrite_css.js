const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

// 1. Replace fonts
css = css.replace(/@import url\('.*?'\);/, "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');");
css = css.replace(/--font-(sans|mono|serif):[^;]+;/g, "--font-$1: 'Inter', sans-serif;");
css = css.replace(/var\(--font-(sans|mono|serif)\)/g, "var(--font-inter)");

// 2. Define new vars
css = css.replace(/:root\s*{[^}]+}/, `:root {
  --background: #08070D;
  --foreground: #F6F1FF;
  --card: #12101B;
  --primary: #A855F7;
  --primary-foreground: #09070D;
  --secondary: #1C1728;
  --secondary-foreground: #E9D5FF;
  --muted: #171321;
  --muted-foreground: #A59DB3;
  --accent: #D8B4FE;
  --destructive: #FB7185;
  --border: #2A223A;
  --input: #342847;
  --shadow: none;
  --font-inter: 'Inter', sans-serif;
}`);

// 3. Replace old var usages with new vars
css = css.replace(/var\(--paper\)/g, "var(--background)");
css = css.replace(/var\(--paper-deep\)/g, "var(--muted)");
css = css.replace(/var\(--ink\)/g, "var(--foreground)");
css = css.replace(/var\(--ink-soft\)/g, "var(--muted-foreground)");
css = css.replace(/var\(--pine\)/g, "var(--secondary)");
css = css.replace(/var\(--pine-2\)/g, "var(--input)");
css = css.replace(/var\(--line\)/g, "var(--border)");
css = css.replace(/var\(--lime\)/g, "var(--primary)");
css = css.replace(/var\(--coral\)/g, "var(--accent)");
css = css.replace(/var\(--sky\)/g, "var(--muted)");
css = css.replace(/var\(--cream\)/g, "var(--card)");
css = css.replace(/var\(--muted\)/g, "var(--muted-foreground)");

// 4. Update specific styles
// .eyebrow
css = css.replace(/\.eyebrow\s*{[^}]+}/, `.eyebrow {
  color: var(--primary);
  font: 700 11px var(--font-inter);
  letter-spacing: 1.8px;
  text-transform: uppercase;
}`);
css = css.replace(/\.eyebrow\.light\s*{[^}]+}/, `.eyebrow.light { color: var(--muted-foreground); }`);

// headings letter spacing
css = css.replace(/letter-spacing:\s*-[.0-9]+e?m?;/g, "letter-spacing: -0.8px;");

// .button, .button-primary, etc.
css = css.replace(/\.button\s*{[^}]+}/, `.button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: 1px solid transparent;
  border-radius: 15px;
  padding: 13px 18px;
  min-height: 52px;
  font-size: 14px; font-weight: 700;
  transition: transform .25s ease, background .25s ease, opacity .25s ease;
}`);
css = css.replace(/\.button:hover\s*{[^}]+}/, `.button:hover { opacity: 0.72; }`);
css = css.replace(/\.button-primary\s*{[^}]+}/, `.button-primary { background: var(--primary); color: var(--primary-foreground); }`);
css = css.replace(/\.button-dark\s*{[^}]+}/, `.button-dark { color: var(--primary); background: var(--secondary); border-color: var(--border); }`);
css = css.replace(/\.button-outline\s*{[^}]+}/, `.button-outline { color: var(--foreground); background: transparent; border-color: var(--border); }`);
css = css.replace(/\.button-quiet\s*{[^}]+}/, `.button-quiet { color: var(--foreground); background: transparent; border-color: var(--border); }`);
css = css.replace(/\.button-coral\s*{[^}]+}/, `.button-coral { background: var(--destructive); color: #18070D; }`);

// Tags
css = css.replace(/\.option-tag\s*{[^}]+}/, `.option-tag {
  display: inline-block; background: var(--secondary); color: var(--accent);
  font: 700 10px var(--font-inter); text-transform: uppercase;
  border-radius: 999px; padding: 5px 9px; letter-spacing: 0.8px; margin-left: 6px; vertical-align: middle;
}`);
css = css.replace(/\.plan-tag\s*{[^}]+}/, `.plan-tag {
  position: absolute; top: 16px; right: 16px; padding: 5px 9px; background: var(--secondary); color: var(--accent);
  font: 700 10px var(--font-inter); text-transform: uppercase; border-radius: 999px; letter-spacing: 0.8px;
}`);

// Cards
css = css.replace(/\.plan-card\s*{[^}]+}/, `.plan-card {
  position: relative; min-height: 390px; padding: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 18px; display: flex; flex-direction: column; transition: opacity .3s ease;
}`);
css = css.replace(/\.plan-card:hover\s*{[^}]+}/, `.plan-card:hover { opacity: 0.9; }`);
css = css.replace(/\.plan-card\.featured\s*{[^}]+}/, `.plan-card.featured { background: var(--secondary); border-color: var(--border); }`);
css = css.replace(/\.surface\s*{[^}]+}/, `.surface { background: var(--card); border: 1px solid var(--border); border-radius: 18px; }`);
css = css.replace(/\.surface-dark\s*{[^}]+}/, `.surface-dark { background: var(--secondary); border: 1px solid var(--border); border-radius: 18px; }`);

// Snapshots / status
css = css.replace(/\.status-pill\s*{[^}]+}/, `.status-pill {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; font: 700 10px var(--font-inter); text-transform: uppercase; border-radius: 999px; letter-spacing: 0.8px;
}`);
css = css.replace(/\.status-active\s*{[^}]+}/, `.status-active { color: #7AE2AA; background: #11271E; }`);
css = css.replace(/\.status-watching\s*{[^}]+}/, `.status-watching { color: #FDBA74; background: #2B1D14; }`);
css = css.replace(/\.status-closed\s*{[^}]+}/, `.status-closed { color: var(--muted-foreground); background: var(--muted); }`);
css = css.replace(/\.status-stopped\s*{[^}]+}/, `.status-stopped { color: #FB7185; background: #18070D; }`);
css = css.replace(/\.dark-status\s*{[^}]+}/, `.dark-status { background: var(--secondary); color: var(--accent); }`);
css = css.replace(/\.positive\s*{[^}]+}/, `.positive { color: #7AE2AA; }`);
css = css.replace(/\.negative\s*{[^}]+}/, `.negative { color: #FB7185; }`);

// Landing Hero
css = css.replace(/\.landing-hero\s*{[^}]+}/, `.landing-hero {
  position: relative; width: min(1180px, calc(100% - 48px)); min-height: 660px; margin: 15px auto 0;
  padding: clamp(56px, 9vw, 128px) clamp(28px, 7vw, 96px); overflow: hidden;
  background: linear-gradient(135deg, #1A0A2E, #08070D); color: var(--foreground); border-radius: 24px; border: 1px solid var(--border);
}`);

// Sidebar / Nav
css = css.replace(/\.sidebar\s*{[^}]+}/, `.sidebar { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; padding: 25px 20px 18px; background: var(--card); color: var(--foreground); border-right: 1px solid var(--border); }`);
css = css.replace(/\.brand-mark\s*{[^}]+}/, `.brand-mark {
  width: 28px; height: 28px; display: grid; place-items: center; background: var(--primary); color: var(--primary-foreground); border-radius: 50%; font: 700 13px var(--font-inter);
}`);
css = css.replace(/\.member-nav a\.active\s*{[^}]+}/, `.member-nav a:hover, .member-nav a.active { color: var(--primary); background: var(--secondary); border-color: var(--primary); }`);
css = css.replace(/\.icon-button\s*{[^}]+}/, `.icon-button { display: grid; place-items: center; width: 42px; height: 42px; background: var(--secondary); border: 1px solid var(--border); color: var(--accent); border-radius: 50%; transition: opacity .2s ease; }`);
css = css.replace(/\.icon-button:hover\s*{[^}]+}/, `.icon-button:hover { opacity: 0.8; }`);

// Misc overrides
css = css.replace(/border-radius:\s*3px;/g, "border-radius: 18px;");
css = css.replace(/border-radius:\s*2px;/g, "border-radius: 15px;");
css = css.replace(/rgba\(244,240,232,[^)]+\)/g, "var(--muted-foreground)");
css = css.replace(/rgba\(216,237,117,[^)]+\)/g, "var(--border)");

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);
console.log("Rewrote CSS basics");
