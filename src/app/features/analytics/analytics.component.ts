import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, BarChart3, TrendingUp, Calendar, Trophy, AlertTriangle } from 'lucide-angular';

@Component({
  selector: 'app-analytics',
  imports: [TranslatePipe, LucideAngularModule],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent {
  readonly barIcon = BarChart3;
  readonly trendingIcon = TrendingUp;
  readonly calendarIcon = Calendar;
  readonly trophyIcon = Trophy;
  readonly alertIcon = AlertTriangle;

  readonly timeRange = signal<'7d' | '30d' | '1y' | 'all'>('30d');
}
