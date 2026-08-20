"use client";

import { useState } from "react";
import type { Issue } from "@/lib/auditUtils";

export default function IssueList({ issues, passed }: { issues: Issue[]; passed: Issue[] }) {
	const [showPassed, setShowPassed] = useState(false);

	if (issues.length === 0 && passed.length === 0) return null;

	return (
		<div className="tool-issues">
			{issues.length === 0 ? (
				<div className="tool-all-clear">✓ No issues found by this check.</div>
			) : (
				<div className="findings-list">
					{issues.map((iss, idx) => (
						<div key={idx} className="finding">
							<span className={`sev-dot sev-${iss.severity}`}></span>
							<div className="finding-body">
								<span className={`sev-badge sev-badge-${iss.severity}`}>{iss.severity}</span>
								<div className="finding-title">{iss.title}</div>
								{iss.detail && <div className="finding-detail">{iss.detail}</div>}
								{iss.fix && <div className="finding-fix">Fix: {iss.fix}</div>}
							</div>
						</div>
					))}
				</div>
			)}

			{passed.length > 0 && (
				<div className="tool-passed-toggle-wrap">
					<button type="button" className="link-btn" onClick={() => setShowPassed((s) => !s)}>
						{showPassed ? "Hide" : "Show"} {passed.length} passed check{passed.length === 1 ? "" : "s"}
					</button>
					{showPassed && (
						<div className="findings-list">
							{passed.map((p, idx) => (
								<div key={idx} className="finding resolved">
									<span className="sev-dot sev-good"></span>
									<div className="finding-body">
										<div className="finding-title">{p.title}</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
