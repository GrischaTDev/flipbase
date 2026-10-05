(function exposeMessages(root) {
  const identifier = (input) => {
    const text = typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
    return typeof text === 'string' && /^[1-9][0-9]{0,31}$/.test(text) ? text : null;
  };
  function readCsrfToken(document) {
    const validToken = (token) => typeof token === 'string' && token.trim() && token.length <= 512;
    const metadata = document.querySelector('meta[name="csrf-token"]')?.content;
    if (validToken(metadata)) return metadata;
    // Aktuelle Vinted-Seiten liefern den Schutzwert in einem Next.js-JSON-Frame.
    // Nur JSON lesen; ausgelieferte Skripte niemals ausführen.
    for (const script of document.scripts) {
      if (script.src) continue;
      const frame = script.textContent?.trim().match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);
      if (!frame) continue;
      try {
        const payload = JSON.parse(frame[1]);
        const match =
          typeof payload?.[1] === 'string'
            ? payload[1].match(/"CSRF_TOKEN"\s*:\s*("(?:[^"\\]|\\.)*")/)
            : null;
        const token = match ? JSON.parse(match[1]) : null;
        if (validToken(token)) return token;
      } catch {
        // Unvollständige oder andere Frames sind keine Sitzungsfreigabe.
      }
    }
    return null;
  }
  function attachmentBytes(attachment) {
    if (!attachment) return null;
    if (
      !['image/jpeg', 'image/png'].includes(attachment.mimeType) ||
      typeof attachment.name !== 'string' ||
      attachment.name.length > 200 ||
      typeof attachment.base64 !== 'string' ||
      attachment.base64.length > 350_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.base64)
    )
      throw new Error('Ungültiger Bildanhang.');
    const bytes = Uint8Array.from(root.atob(attachment.base64), (character) =>
      character.charCodeAt(0),
    );
    const valid =
      attachment.mimeType === 'image/png'
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid || bytes.length > 256 * 1024) throw new Error('Ungültiger Bildanhang.');
    return bytes;
  }
  async function send(adapter, accountId, command) {
    const conversationId = identifier(command.externalConversationId);
    if (
      !conversationId ||
      (command.text !== null &&
        (typeof command.text !== 'string' || command.text.length > 10_000)) ||
      (!command.text?.trim() && !command.attachment)
    )
      throw new Error('Ungültiger Nachrichtenauftrag.');
    const bytes = attachmentBytes(command.attachment);
    async function identity() {
      if (identifier((await adapter.read('/api/v2/users/current'))?.user?.id) !== accountId) {
        const error = new Error('Das Vinted-Konto wurde gewechselt.');
        error.code = 'identity_changed';
        throw error;
      }
    }
    function detail(response) {
      if (
        identifier(response?.conversation?.id) !== conversationId ||
        !Array.isArray(response.conversation.messages)
      )
        throw new Error('Vinted bestätigt den Gesprächsverlauf nicht.');
      return response.conversation.messages;
    }
    let replyAttempted = false;
    let replyAccepted = false;
    try {
      if (typeof adapter.csrf !== 'string' || !adapter.csrf.trim() || adapter.csrf.length > 512) {
        const error = new Error('Vinted bestätigt die Browserfreigabe nicht. Öffne Vinted erneut.');
        error.code = 'login_required';
        throw error;
      }
      await identity();
      const baseline = new Set(
        detail(await adapter.read(`/api/v2/conversations/${conversationId}`))
          .map((message) => identifier(message.id) ?? identifier(message.entity?.id))
          .filter(Boolean),
      );
      let temporaryPhotos = null;
      if (bytes) {
        await identity();
        const form = new FormData();
        form.append('photo[type]', 'user_msg');
        form.append(
          'photo[file]',
          new Blob([bytes], { type: command.attachment.mimeType }),
          command.attachment.name,
        );
        const uploaded = await adapter.write('/api/v2/photos', { body: form, csrf: adapter.csrf });
        const temporaryId = uploaded?.photo_temp_uuid ?? uploaded?.temp_uuid;
        if (typeof temporaryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(temporaryId))
          throw new Error('Vinted bestätigt den Bildanhang nicht.');
        temporaryPhotos = [temporaryId];
      }
      await identity();
      const reply = { body: command.text, photo_temp_uuids: temporaryPhotos };
      if (bytes) reply.is_personal_data_sharing_check_skipped = false;
      replyAttempted = true;
      await adapter.write(`/api/v2/conversations/${conversationId}/replies`, {
        body: JSON.stringify({ reply }),
        csrf: adapter.csrf,
        json: true,
      });
      replyAccepted = true;
      await identity();
      const after = detail(await adapter.read(`/api/v2/conversations/${conversationId}`));
      const matches = after.filter((message) => {
        const id = identifier(message.id) ?? identifier(message.entity?.id);
        // Ein Bild ohne belegten temporären Bezug bleibt unbestätigt; nicht allein nach Upload zählen.
        return (
          id &&
          !baseline.has(id) &&
          identifier(message.entity?.user_id) === accountId &&
          message.entity?.body === command.text &&
          !bytes
        );
      });
      if (matches.length === 1)
        return {
          outcome: 'sent',
          externalMessageId: identifier(matches[0].id) ?? identifier(matches[0].entity.id),
        };
      return { outcome: 'outcome_unknown', errorCode: 'reply_unconfirmed' };
    } catch (error) {
      const failed =
        !replyAttempted ||
        (!replyAccepted &&
          Number.isInteger(error.httpStatus) &&
          error.httpStatus >= 400 &&
          error.httpStatus < 500 &&
          error.httpStatus !== 408);
      return {
        outcome: failed ? 'failed' : 'outcome_unknown',
        errorCode: error.code ?? 'provider_unavailable',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      };
    }
  }
  const api = { send, attachmentBytes, readCsrfToken };
  root.FlipbaseVintedMessages = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
