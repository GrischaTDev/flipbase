import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule, Tag, Copy, Sparkles } from 'lucide-angular';

@Component({
  selector: 'app-listings',
  imports: [TranslatePipe, LucideAngularModule],
  templateUrl: './listings.component.html',
  styleUrl: './listings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsComponent {
  readonly tagIcon = Tag;
  readonly copyIcon = Copy;
  readonly sparklesIcon = Sparkles;
}
