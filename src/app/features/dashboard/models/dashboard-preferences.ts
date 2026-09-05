import { DashboardRange } from '../../../core/models/flipbase.models';
import { DashboardPlatform } from '../../../core/services/dashboard-report.service';

export interface DashboardPreferences {
  readonly range: DashboardRange;
  readonly platform: DashboardPlatform;
}

export function parseDashboardPreferences(value: unknown): DashboardPreferences {
  if (!isRecord(value)) return { range: 'year', platform: 'all' };

  const range = isDashboardRange(value['range']) ? value['range'] : 'year';
  const platform = isDashboardPlatform(value['platform']) ? value['platform'] : 'all';
  return { range, platform };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDashboardRange(value: unknown): value is DashboardRange {
  return value === 'today' || value === 'last_7_days' || value === 'month' || value === 'year';
}

function isDashboardPlatform(value: unknown): value is DashboardPlatform {
  return typeof value === 'string' && value.length > 0 && value.length <= 100;
}
