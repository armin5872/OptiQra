export interface Issue {
  id: string;
  title: string;
  detail: string;
  fix?: string;
  weight: number;
  severity: 'critical' | 'warn' | 'good';
  resolved: boolean;
}

export function issue(id: string, title: string, detail: string, fix: string, weight: number, severity?: 'critical' | 'warn'): Issue {
  return { id, title, detail, fix, weight, severity: severity || (weight >= 11 ? 'critical' : 'warn'), resolved: false };
}

export function pass(id: string, title: string): Issue {
  return { id, title, detail: '', weight: 0, severity: 'good', resolved: true };
}

export function scoreFromIssues(issues: Issue[]) {
  let score = 100;
  issues.forEach(i => { score -= i.weight; });
  return Math.max(20, Math.min(99, Math.round(score)));
}
