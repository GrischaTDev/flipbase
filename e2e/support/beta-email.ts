interface MailpitMessageSummary {
  readonly ID: string;
  readonly To: readonly { readonly Address: string }[];
}

export async function invitationLinkFor(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const listResponse = await fetch('http://127.0.0.1:54360/api/v1/messages');
    const list = (await listResponse.json()) as { messages?: readonly MailpitMessageSummary[] };
    const message = list.messages?.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const messageResponse = await fetch(`http://127.0.0.1:54360/api/v1/message/${message.ID}`);
      const body = (await messageResponse.json()) as { HTML?: string; Text?: string };
      const content = `${body.HTML ?? ''}\n${body.Text ?? ''}`;
      const link = content
        .match(/https?:\/\/[^\s"'<>]+/gu)
        ?.map((value) => value.replaceAll('&amp;', '&'))
        .find((value) => value.includes('/auth/set-password#beta_token='));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Keine Registrierungseinladung für ${email} in Mailpit gefunden.`);
}
