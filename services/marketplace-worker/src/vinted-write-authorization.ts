export type VintedWriteAuthorization = (() => Promise<void>) & {
  beforeWrite?: () => Promise<void>;
};

/** Die dauerhafte Freigabe muss bestätigt sein, bevor ein Anbieter-Schreibversuch möglich ist. */
export async function beforeVintedWrite(authorize: VintedWriteAuthorization): Promise<void> {
  await authorize();
  await authorize.beforeWrite?.();
}
