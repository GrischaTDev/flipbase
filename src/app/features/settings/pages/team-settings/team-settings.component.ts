import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideMail,
  LucideTrash2,
  LucideUserPlus,
  LucideUsers,
  LucideX,
} from '@lucide/angular';
import { WorkspaceRole } from '../../../../core/models/flipbase.models';
import { WorkspaceMemberService } from '../../../../core/services/workspace-member.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

@Component({
  selector: 'app-team-settings',
  imports: [ReactiveFormsModule, LucideDynamicIcon, CustomSelectComponent, TextFieldComponent],
  templateUrl: './team-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TeamSettingsComponent {
  readonly memberService = inject(WorkspaceMemberService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  readonly usersIcon = LucideUsers;
  readonly userPlusIcon = LucideUserPlus;
  readonly mailIcon = LucideMail;
  readonly trashIcon = LucideTrash2;
  readonly closeIcon = LucideX;
  readonly roleOptions: readonly SelectOption<WorkspaceRole>[] = [
    { value: 'admin', label: 'Administrator' },
    { value: 'member', label: 'Sourcing & Einkauf' },
    { value: 'fulfillment', label: 'Packstation & Logistik' },
    { value: 'accountant', label: 'Steuerberater / DATEV' },
    { value: 'readonly', label: 'Nur-Lesen' },
  ];
  readonly inviteRoleOptions: readonly SelectOption<WorkspaceRole>[] = [
    { value: 'member', label: 'Sourcing & Einkauf (Einkauf & Inventar)' },
    { value: 'fulfillment', label: 'Packstation & Logistik (Versand & Sendungsverfolgung)' },
    { value: 'accountant', label: 'Steuerberater / DATEV (Nur-Lesen auf Finanzen)' },
    { value: 'readonly', label: 'Nur-Lesen (Reine Ansicht)' },
    { value: 'admin', label: 'Administrator (Voller Zugriff ohne Inhaber-Rechte)' },
  ];
  readonly inviteForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    role: new FormControl<WorkspaceRole>('member', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly isInviteModalOpen = signal(false);
  readonly isSendingInvite = signal(false);
  readonly inviteError = signal<string | null>(null);
  openInviteModal(): void {
    this.inviteForm.reset({ email: '', role: 'member' });
    this.inviteError.set(null);
    this.isInviteModalOpen.set(true);
  }
  closeInviteModal(): void {
    this.isInviteModalOpen.set(false);
  }
  async onSendInvite(): Promise<void> {
    if (this.inviteForm.invalid) return;
    this.isSendingInvite.set(true);
    this.inviteError.set(null);
    const { email, role } = this.inviteForm.getRawValue();
    const { error } = await this.memberService.inviteMember(email, role);
    this.isSendingInvite.set(false);
    if (error) {
      this.inviteError.set(error.message);
      return;
    }
    this.toast.success('Einladung wurde versendet.');
    this.closeInviteModal();
  }
  async onUpdateRole(memberId: string, role: WorkspaceRole): Promise<void> {
    const { error } = await this.memberService.updateMemberRole(memberId, role);
    if (!error) this.toast.success('Rolle wurde geändert.');
  }
  async onRemoveMember(memberId: string): Promise<void> {
    const confirmed = await this.dialog.frage({
      titel: 'Mitglied entfernen?',
      text: 'Die Person verliert damit den Zugriff auf diesen Workspace.',
      bestaetigenText: 'Entfernen',
      gefahr: true,
    });
    if (!confirmed) return;
    const { error } = await this.memberService.removeMember(memberId);
    if (!error) this.toast.success('Mitglied wurde entfernt.');
  }
  async onCancelInvite(inviteId: string): Promise<void> {
    const { error } = await this.memberService.cancelInvite(inviteId);
    if (!error) this.toast.success('Einladung wurde zurückgezogen.');
  }
}
