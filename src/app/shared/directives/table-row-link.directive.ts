import { Directive, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/** Der vorhandene Link bleibt das Tastaturziel; freie Zeilenflächen öffnen dasselbe Ziel. */
@Directive({
  selector: '[appTableRowLink]',
  host: { '(click)': 'open($event)', class: 'cursor-pointer' },
})
export class TableRowLinkDirective {
  readonly appTableRowLink = input.required<string>();
  private readonly router = inject(Router);

  open(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (
      !(event.target instanceof Element) ||
      event.target.closest(
        'a, button, input, select, textarea, summary, [role="button"], [role="checkbox"], [role="combobox"], app-table-action-menu',
      )
    )
      return;
    if (window.getSelection()?.toString()) return;
    void this.router.navigateByUrl(this.appTableRowLink());
  }
}
