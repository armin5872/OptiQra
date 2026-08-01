import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "OptiQra Desktop — Scans that don't need a tab open",
	description:
		"The OptiQra desktop app: scheduled scans run in the background even after you close the window, and project audits work fully offline.",
};

const LATEST_RELEASE_URL = "https://github.com/armin5872/optiqra-desktop/releases/latest";

export default function DesktopAppLandingPage() {
	return (
		<>
			<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
			<link
				href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
				rel="stylesheet"
			/>
			<style>{CSS}</style>

			<div className="grid-bg" />

			<header>
				<div className="logo">
					<span className="dot" />
					OptiQra
				</div>
				<nav>
					<a href="#capabilities">Capabilities</a>
					<a href="#background">Background scans</a>
					<a href="#download">Download</a>
					<a href="/" className="nav-web">
						Back to the web app ↗
					</a>
				</nav>
			</header>

			<main>
				<section className="hero">
					<div>
						<span className="eyebrow">
							<span className="pulse" />
							OPTIQRA DESKTOP · NOW AVAILABLE
						</span>
						<h1>
							Your site, audited
							<br />
							while you&apos;re <em>not looking</em>.
						</h1>
						<p className="hero-sub">
							The same audit engine as the web app, now running as a native app — scheduled
							scans fire in the background even after you close the window, and project audits
							work with zero connection.
						</p>
						<div className="cta-row" style={{ marginTop: 32 }}>
							<a href="#download" className="btn btn-primary">
								Download for macOS <small>v2.0 · Apple Silicon</small>
							</a>
							<a href="#capabilities" className="btn btn-ghost">
								See what changed
							</a>
						</div>
						<div className="platform-row" style={{ marginTop: 22 }}>
							<span>macOS 12+</span>
							<span>Windows 10/11</span>
							<span>Linux (AppImage / .deb)</span>
						</div>
					</div>

					<div className="scan-stage">
						<div className="browser-chrome">
							<div className="dots">
								<span />
								<span />
								<span />
							</div>
							<div className="url">optiqra scan · yourdomain.com</div>
						</div>
						<div className="scan-viewport">
							<div className="page-mock">
								<div className="bar w1" />
								<div className="bar w2" />
								<div className="block" />
								<div className="row">
									<div className="block" />
									<div className="block" />
								</div>
								<div className="bar w3" />
								<div className="bar w4" />
								<div className="block" />
							</div>
							<div className="scan-tint" />
							<div className="scanline" />
							<div className="chip c1 good">
								<span>Performance</span>
								<span className="score">94</span>
							</div>
							<div className="chip c2 warn">
								<span>SEO</span>
								<span className="score">78</span>
							</div>
							<div className="chip c3 good">
								<span>Accessibility</span>
								<span className="score">91</span>
							</div>
							<div className="chip c4 warn">
								<span>AEO / LLM Readiness</span>
								<span className="score">76</span>
							</div>
						</div>
					</div>
				</section>

				<section id="capabilities">
					<div className="section-inner">
						<div className="section-head">
							<span className="eyebrow" style={{ marginLeft: 0 }}>
								WHAT&apos;S ACTUALLY NEW
							</span>
							<h2>Not a wrapper. A different runtime.</h2>
							<p>
								Same crawler, same fix engine, same reports — running as a persistent process on
								your machine instead of a browser tab.
							</p>
						</div>
						<div className="features">
							<div className="feature">
								<div className="icon">
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
										<circle cx="12" cy="12" r="9" />
										<path d="M12 7v5l3 3" />
									</svg>
								</div>
								<h3>Schedules that outlive the window</h3>
								<p>
									Close OptiQra and scheduled scans keep running — a background process checks
									and fires them, not a tab that has to stay open.
								</p>
							</div>
							<div className="feature">
								<div className="icon">
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
										<path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
										<line x1="12" y1="2" x2="12" y2="12" />
									</svg>
								</div>
								<h3>Project audits, zero connection</h3>
								<p>
									Upload and audit a project with the wifi off. Only live-site crawling and
									AI-assisted fixes need a network — everything else runs local.
								</p>
							</div>
							<div className="feature">
								<div className="icon">
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
										<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
										<polyline points="22 4 12 14.01 9 11.01" />
									</svg>
								</div>
								<h3>Same scores, every time</h3>
								<p>
									The desktop app runs the identical engine as the hosted version — no separate
									ruleset to keep in sync, no drift between &quot;web score&quot; and &quot;app
									score&quot;.
								</p>
							</div>
						</div>
					</div>
				</section>

				<section id="background">
					<div className="section-inner terminal-wrap">
						<div className="terminal-copy">
							<span className="eyebrow" style={{ marginBottom: 16, display: "inline-flex" }}>
								HOW IT RUNS
							</span>
							<h2>It sits in the tray. It does the work.</h2>
							<p>
								Closing the window doesn&apos;t quit OptiQra — it hides it. A background process
								keeps checking your schedules against a local queue and runs anything that&apos;s
								due, whether or not you&apos;re looking at it.
							</p>
							<p>
								<b>Full history, either way.</b> Anything scanned while the app was closed is
								waiting for you in Recent Scans the next time you open it — nothing to fetch,
								nothing to re-run.
							</p>
						</div>
						<div className="terminal">
							<div className="bar">
								<span />
								<span />
								<span />
							</div>
							<div className="body">
								<div>
									<span className="muted">$</span> optiqra --daemon --status
								</div>
								<div className="ok">✓ watching 3 schedules</div>
								<div>&nbsp;</div>
								<div className="muted">02:00:04 checking due schedules…</div>
								<div>
									02:00:05 running <b>yourdomain.com</b> · site scan
								</div>
								<div>
									02:00:41 scored <span className="ok">88/100</span>{" "}
									<span className="muted">(+3 vs last run)</span>
								</div>
								<div>
									02:00:41 <span className="warn">2 new issues</span>, 5 resolved
								</div>
								<div>02:00:41 notification sent</div>
								<div>&nbsp;</div>
								<div className="muted">
									window: closed · daemon: alive<span className="caret" />
								</div>
							</div>
						</div>
					</div>
				</section>

				<section id="download" className="download">
					<div className="section-inner">
						<h2>Get OptiQra on your machine.</h2>
						<p>Free. Same account as the web app — sign in once, everything syncs.</p>
						<div className="download-grid">
							<a href={LATEST_RELEASE_URL} className="os-card">
								<div className="os-name">macOS</div>
								<div className="os-meta">.dmg · Apple Silicon &amp; Intel</div>
							</a>
							<a href={LATEST_RELEASE_URL} className="os-card">
								<div className="os-name">Windows</div>
								<div className="os-meta">.msi · 10 / 11, x64</div>
							</a>
							<a href={LATEST_RELEASE_URL} className="os-card">
								<div className="os-name">Linux</div>
								<div className="os-meta">.AppImage / .deb</div>
							</a>
						</div>
						<div className="download-foot">
							v2.0.0 · <a href={LATEST_RELEASE_URL.replace("/latest", "")}>release notes ↗</a> ·
							prefer the browser? <a href="/">use the web app ↗</a>
						</div>
					</div>
				</section>
			</main>

			<footer>
				<div className="logo">
					<span className="dot" />
					OptiQra
				</div>
				<p>Website auditing that runs where you do.</p>
			</footer>
		</>
	);
}

const CSS = `
  :root{
    --bg:#0A0C10;
    --surface:#12161D;
    --surface-2:#171C25;
    --line:#232A36;
    --cyan:#5EEAD4;
    --amber:#F5A623;
    --text:#E8ECF1;
    --muted:#7C8698;
  }
  body{
    background:var(--bg);
    color:var(--text);
    font-family:'Inter', sans-serif;
    line-height:1.5;
    overflow-x:hidden;
  }
  .grid-bg{
    position:fixed; inset:0; z-index:0; pointer-events:none;
    background-image:
      linear-gradient(to right, rgba(94,234,212,0.035) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(94,234,212,0.035) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, black 40%, transparent 90%);
  }
  header{
    position:fixed; top:0; left:0; right:0; z-index:50;
    display:flex; align-items:center; justify-content:space-between;
    padding:20px clamp(20px, 5vw, 64px);
    background:rgba(10,12,16,0.7);
    backdrop-filter: blur(10px);
    border-bottom:1px solid var(--line);
  }
  .logo{display:flex; align-items:center; gap:10px; font-weight:600; font-size:17px; font-family:'Space Grotesk', sans-serif;}
  .logo .dot{width:9px; height:9px; border-radius:2px; background:var(--cyan); box-shadow:0 0 12px var(--cyan);}
  nav{display:flex; gap:28px; align-items:center;}
  nav a{color:var(--muted); text-decoration:none; font-size:14px; font-weight:500; transition:color .2s;}
  nav a:hover{color:var(--text);}
  .nav-web{
    font-family:'IBM Plex Mono', monospace;
    font-size:12.5px; color:var(--text) !important;
    border:1px solid var(--line); padding:7px 14px; border-radius:6px;
    transition:border-color .2s, background .2s;
  }
  .nav-web:hover{border-color:var(--cyan); background:rgba(94,234,212,0.06);}
  @media (max-width:720px){ nav a:not(.nav-web){display:none;} }
  main{position:relative; z-index:1;}
  .hero{
    padding:168px clamp(20px, 5vw, 64px) 80px;
    max-width:1180px; margin:0 auto;
    display:grid; grid-template-columns:1fr; gap:56px;
    text-align:center;
  }
  .eyebrow{
    display:inline-flex; align-items:center; gap:8px;
    font-family:'IBM Plex Mono', monospace; font-size:12.5px; letter-spacing:0.06em;
    color:var(--cyan); background:rgba(94,234,212,0.08);
    border:1px solid rgba(94,234,212,0.25);
    padding:6px 12px; border-radius:100px; margin:0 auto 22px;
  }
  .eyebrow .pulse{width:6px; height:6px; border-radius:50%; background:var(--cyan); animation:pulse 2s infinite;}
  @keyframes pulse{0%,100%{opacity:1;} 50%{opacity:.3;}}
  h1{
    font-family:'Space Grotesk', sans-serif;
    font-size:clamp(38px, 6vw, 68px);
    font-weight:600; letter-spacing:-0.02em; line-height:1.06;
    max-width:900px; margin:0 auto 22px;
  }
  h1 em{font-style:normal; color:var(--cyan);}
  .hero-sub{
    font-size:clamp(16px, 2vw, 19px); color:var(--muted);
    max-width:560px; margin:0 auto; line-height:1.6;
  }
  .cta-row{display:flex; gap:14px; justify-content:center; flex-wrap:wrap;}
  .btn{
    display:inline-flex; align-items:center; gap:10px;
    padding:13px 22px; border-radius:8px; font-size:15px; font-weight:600;
    text-decoration:none; cursor:pointer; border:1px solid transparent;
    transition:transform .15s ease, box-shadow .15s ease;
  }
  .btn:hover{transform:translateY(-1px);}
  .btn-primary{background:var(--cyan); color:#062622 !important;}
  .btn-primary:hover{box-shadow:0 8px 24px rgba(94,234,212,0.25);}
  .btn-ghost{background:var(--surface); border-color:var(--line); color:var(--text) !important;}
  .btn-ghost:hover{border-color:var(--muted);}
  .btn small{font-family:'IBM Plex Mono', monospace; font-weight:400; opacity:.7; font-size:11px;}
  .platform-row{
    display:flex; gap:10px; justify-content:center; flex-wrap:wrap;
    font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--muted);
  }
  .platform-row span{border:1px solid var(--line); border-radius:5px; padding:4px 9px;}
  .scan-stage{
    position:relative; max-width:840px; margin:12px auto 0;
    border-radius:14px; overflow:hidden;
    border:1px solid var(--line);
    background:var(--surface);
    box-shadow:0 40px 100px -30px rgba(0,0,0,0.7);
  }
  .browser-chrome{
    display:flex; align-items:center; gap:8px;
    padding:11px 14px; border-bottom:1px solid var(--line); background:var(--surface-2);
  }
  .browser-chrome .dots{display:flex; gap:6px;}
  .browser-chrome .dots span{width:9px; height:9px; border-radius:50%; background:#2A3140;}
  .browser-chrome .url{
    flex:1; font-family:'IBM Plex Mono', monospace; font-size:11.5px; color:var(--muted);
    background:var(--bg); border:1px solid var(--line); border-radius:5px;
    padding:5px 10px; text-align:left;
  }
  .scan-viewport{position:relative; height:340px; overflow:hidden; text-align:left;}
  .page-mock{padding:26px 30px; display:flex; flex-direction:column; gap:14px;}
  .page-mock .bar{height:11px; border-radius:3px; background:#1C222D;}
  .page-mock .bar.w1{width:38%;}
  .page-mock .bar.w2{width:82%;}
  .page-mock .bar.w3{width:64%;}
  .page-mock .bar.w4{width:71%;}
  .page-mock .block{height:64px; border-radius:8px; background:#1C222D; margin-top:6px;}
  .page-mock .row{display:flex; gap:12px;}
  .page-mock .row .block{flex:1;}
  .scanline{
    position:absolute; left:0; right:0; top:-4px; height:4px;
    background:linear-gradient(90deg, transparent, var(--cyan), transparent);
    box-shadow:0 0 24px 6px rgba(94,234,212,0.55);
    animation: sweep 3.6s cubic-bezier(.65,0,.35,1) infinite;
  }
  .scan-tint{
    position:absolute; inset:0;
    background:linear-gradient(180deg, rgba(94,234,212,0.10), transparent 60%);
    transform:translateY(-100%);
    animation: tint-sweep 3.6s cubic-bezier(.65,0,.35,1) infinite;
  }
  @keyframes sweep{
    0%{ top:-4px; } 45%{ top:340px; } 50%{ top:340px; } 95%{ top:-4px; } 100%{ top:-4px; }
  }
  @keyframes tint-sweep{
    0%{ transform:translateY(-100%); } 45%{ transform:translateY(0%); } 50%{ transform:translateY(0%); } 95%{ transform:translateY(-100%); } 100%{ transform:translateY(-100%); }
  }
  .chip{
    position:absolute; display:flex; align-items:center; gap:7px;
    font-family:'IBM Plex Mono', monospace; font-size:11.5px; font-weight:500;
    background:rgba(18,22,29,0.92); border:1px solid var(--line);
    padding:6px 10px; border-radius:7px; opacity:0;
    backdrop-filter:blur(4px);
  }
  .chip .score{font-weight:600;}
  .chip.good .score{color:var(--cyan);}
  .chip.warn .score{color:var(--amber);}
  .c1{top:24px; right:26px; animation: reveal 3.6s ease infinite; animation-delay:0.15s;}
  .c2{top:96px; right:40px; animation: reveal 3.6s ease infinite; animation-delay:0.55s;}
  .c3{top:168px; right:24px; animation: reveal 3.6s ease infinite; animation-delay:0.95s;}
  .c4{top:240px; right:52px; animation: reveal 3.6s ease infinite; animation-delay:1.35s;}
  @keyframes reveal{
    0%{opacity:0; transform:translateY(-6px);} 5%{opacity:1; transform:translateY(0);} 88%{opacity:1;} 94%{opacity:0;} 100%{opacity:0;}
  }
  @media (prefers-reduced-motion: reduce){
    .scanline, .scan-tint, .chip, .eyebrow .pulse{animation:none !important;}
    .scan-tint{opacity:0;}
    .chip{opacity:1;}
  }
  @media (max-width:640px){
    .scan-viewport{height:280px;}
    .c1,.c2,.c3,.c4{right:14px; font-size:10.5px;}
  }
  section{padding:100px clamp(20px, 5vw, 64px);}
  .section-inner{max-width:1080px; margin:0 auto;}
  .section-head{max-width:600px; margin-bottom:52px;}
  .section-head h2{font-family:'Space Grotesk', sans-serif; font-size:clamp(26px, 3.4vw, 36px); font-weight:600; letter-spacing:-0.01em; margin-bottom:12px;}
  .section-head p{color:var(--muted); font-size:16px;}
  .features{display:grid; grid-template-columns:repeat(3, 1fr); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:14px; overflow:hidden;}
  @media (max-width:860px){ .features{grid-template-columns:1fr;} }
  .feature{background:var(--surface); padding:32px 28px;}
  .feature .icon{
    width:38px; height:38px; border-radius:8px; margin-bottom:20px;
    display:flex; align-items:center; justify-content:center;
    background:rgba(94,234,212,0.08); border:1px solid rgba(94,234,212,0.2);
    color:var(--cyan);
  }
  .feature h3{font-size:17px; font-weight:600; margin-bottom:10px; font-family:'Space Grotesk', sans-serif;}
  .feature p{color:var(--muted); font-size:14.5px; line-height:1.65;}
  .terminal-wrap{display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center;}
  @media (max-width:860px){ .terminal-wrap{grid-template-columns:1fr;} }
  .terminal{
    background:#0D1015; border:1px solid var(--line); border-radius:12px;
    font-family:'IBM Plex Mono', monospace; font-size:12.5px; overflow:hidden;
    box-shadow:0 30px 70px -30px rgba(0,0,0,0.6);
  }
  .terminal .bar{display:flex; gap:6px; padding:11px 14px; border-bottom:1px solid var(--line);}
  .terminal .bar span{width:9px; height:9px; border-radius:50%; background:#2A3140;}
  .terminal .body{padding:20px; color:#A6AFC0; line-height:2;}
  .terminal .muted{color:#525C6C;}
  .terminal .ok{color:var(--cyan);}
  .terminal .warn{color:var(--amber);}
  .terminal .caret{display:inline-block; width:7px; height:14px; background:var(--cyan); vertical-align:-2px; animation:blink 1.1s step-end infinite;}
  @keyframes blink{0%,49%{opacity:1;} 50%,100%{opacity:0;}}
  @media (prefers-reduced-motion: reduce){ .caret{animation:none;} }
  .terminal-copy h2{font-family:'Space Grotesk', sans-serif; font-size:clamp(24px,3vw,32px); font-weight:600; margin-bottom:16px; letter-spacing:-0.01em;}
  .terminal-copy p{color:var(--muted); font-size:15.5px; line-height:1.7; margin-bottom:14px;}
  .terminal-copy p b{color:var(--text); font-weight:600;}
  .download{
    text-align:center; border-top:1px solid var(--line); border-bottom:1px solid var(--line);
    background:radial-gradient(ellipse 60% 100% at 50% 100%, rgba(94,234,212,0.07), transparent);
  }
  .download h2{font-family:'Space Grotesk', sans-serif; font-size:clamp(28px,4vw,42px); font-weight:600; letter-spacing:-0.02em; margin-bottom:14px;}
  .download p{color:var(--muted); font-size:16px; margin-bottom:36px;}
  .download-grid{display:flex; gap:14px; justify-content:center; flex-wrap:wrap;}
  .os-card{
    width:200px; padding:22px 18px; border:1px solid var(--line); border-radius:12px;
    background:var(--surface); text-decoration:none; color:var(--text) !important;
    transition:border-color .2s, transform .15s; display:block;
  }
  .os-card:hover{border-color:var(--cyan); transform:translateY(-2px);}
  .os-card .os-name{font-weight:600; font-size:15px; margin-bottom:4px;}
  .os-card .os-meta{font-family:'IBM Plex Mono', monospace; font-size:11.5px; color:var(--muted);}
  .download-foot{margin-top:28px; font-family:'IBM Plex Mono', monospace; font-size:12px; color:var(--muted);}
  .download-foot a{color:var(--cyan);}
  footer{padding:40px clamp(20px,5vw,64px); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;}
  footer .logo{font-size:14px;}
  footer p{color:var(--muted); font-size:13px;}
`;
