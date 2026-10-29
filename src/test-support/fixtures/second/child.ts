import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-test-second-child',
  templateUrl: './content.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecondRenderingChild {}
