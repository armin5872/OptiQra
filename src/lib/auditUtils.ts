export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational' | 'good';

export interface Issue {
  id: string;
  title: string;
  detail: string;
  fix?: string;
  weight: number;
  severity: Severity;
  resolved: boolean;
}

/** Buckets an issue's point weight into one of five severity tiers. Used
 *  whenever a call site doesn't pin an explicit severity. */
export function severityFromWeight(weight: number): Severity {
  if (weight >= 14) return 'critical';
  if (weight >= 9) return 'high';
  if (weight >= 5) return 'medium';
  if (weight >= 2) return 'low';
  return 'informational';
}

export function issue(id: string, title: string, detail: string, fix: string, weight: number, severity?: Severity): Issue {
  return { id, title, detail, fix, weight, severity: severity || severityFromWeight(weight), resolved: false };
}

export function pass(id: string, title: string): Issue {
  return { id, title, detail: '', weight: 0, severity: 'good', resolved: true };
}

export function scoreFromIssues(issues: Issue[]) {
  let score = 100;
  issues.forEach(i => { score -= i.weight; });
  return Math.max(20, Math.min(99, Math.round(score)));
}
