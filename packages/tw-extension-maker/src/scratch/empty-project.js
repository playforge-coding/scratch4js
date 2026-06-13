// A minimal empty Scratch project (white backdrop + one blank sprite) the VM
// runs while we load the user's extension on top. Inlined as base64 (<1 KB).
const EMPTY_PROJECT_BASE64 =
  'UEsDBBQAAAAIALiazFwA194XjQEAAEYEAAAMAAAAcHJvamVjdC5qc29u1VNNb9swDP0rgc5tYCdO0uxaYMCAATukhw1FD4zFekL0YVC0lyzIfy8lu06GXnbtyX6PftQjn3xWDNQgR/Vl9nxWJu4YGhTA1OHdTHlwCamBFqIHMrC3mATnixDWRJ7AngLoGm4ZG+rDhOrgHPprte6IBD+GyF0+qMgfZTRaghiRv+lkotxu1npVLqvqYbGt9ptitV0vK3zVC70pqgrUjeE91AdNoS0T6fQKj/w/Leaxb5JCA8PXQA6yaiQpMLAJ/lEsI/2UyqIqPvC/hC8fisuLVGLovM6DJNQHO0xZFklm4YT0gzTSODija4O8rxPojcbwROBjC7Kj+iSF1VSQPDjPGbzKyiM/hV2LWP/+Dr7phhB9Z62s+TbXV7Dxn2BbMozlZ4p2bPJZki1zZtHIZq//1XFcyGl8RvP3KteGsE7HCrPNBEHTwNDgPcB3azs+ZV6BtTOgZEtlhy54w4Emj7In9FEUE+OQIcWlIro+e1XLeTEv8mVwCRbzxQDl8vi8MP5zPzW6d3AQ2eXyBlBLAwQUAAAACAC4msxcNkvSElgAAAB2AAAAJAAAADE5NzZkNTEzNDQ4Mjk0YjcwNTk2MzRlZmQyZDcwNDRhLnN2Z3WMWwqAIBAAryLbv7tkRIR6mTIV7EEtbcfv8d/8zjD2OKO65rIcDhLz1iOKiBaj1z1iTUT4FKAkj5wcNB2BSiHHxA5MS+DtHgb+1WrKpTiopg9Ab9+dvwFQSwECFAMUAAAACAC4msxcANfeF40BAABGBAAADAAAAAAAAAAAAAAAgAEAAAAAcHJvamVjdC5qc29uUEsBAhQDFAAAAAgAuJrMXDZL0hJYAAAAdgAAACQAAAAAAAAAAAAAAIABtwEAADE5NzZkNTEzNDQ4Mjk0YjcwNTk2MzRlZmQyZDcwNDRhLnN2Z1BLBQYAAAAAAgACAIwAAABRAgAAAAA=';

/** Decode to the Uint8Array scratch-vm's loadProject() wants. */
export function emptyProjectBytes() {
  const binary = atob(EMPTY_PROJECT_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
