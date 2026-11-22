export class FeedDelivery {
  #items = new Map();
  #history = [];
  #cursor = 0;
  #epoch;
  #revision;
  #historyLimit;

  constructor({ epoch, revision, historyLimit = 60 }) {
    this.#epoch = epoch;
    this.#revision = revision;
    this.#historyLimit = historyLimit;
  }

  publish(items, removedIds = []) {
    if (!items.length && !removedIds.length) return;
    for (const id of removedIds) this.#items.delete(id);
    for (const item of items) this.#items.set(item.id, structuredClone(item));
    this.#history.push({
      type: 'delta',
      cursor: ++this.#cursor,
      items: structuredClone(items),
      removedIds: [...removedIds],
    });
    if (this.#history.length > this.#historyLimit) this.#history.shift();
  }

  checkpoint() {
    return { epoch: this.#epoch, revision: this.#revision, cursor: this.#cursor };
  }

  resume(checkpoint) {
    const canResume =
      checkpoint?.epoch === this.#epoch &&
      checkpoint.revision === this.#revision &&
      Number.isInteger(checkpoint.cursor) &&
      checkpoint.cursor >= (this.#history[0]?.cursor ?? 1) - 1 &&
      checkpoint.cursor <= this.#cursor;
    if (canResume) {
      return {
        checkpoint: this.checkpoint(),
        events: structuredClone(this.#history.filter((e) => e.cursor > checkpoint.cursor)),
      };
    }
    return {
      checkpoint: this.checkpoint(),
      events: [
        {
          type: 'snapshot',
          cursor: this.#cursor,
          items: structuredClone([...this.#items.values()]),
        },
      ],
    };
  }
}
