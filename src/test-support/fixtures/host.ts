import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FirstRenderingChild } from './first/child';
import { SecondRenderingChild } from './second/child';

@Component({
  selector: 'app-test-rendering-host',
  imports: [FirstRenderingChild, SecondRenderingChild],
  templateUrl: './renamed-host.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderingHost {
  readonly selected = signal(false);
  readonly lastConfirmation = signal('');
}
