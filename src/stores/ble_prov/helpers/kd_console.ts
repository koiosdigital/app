export enum KDCryptoStatus {
  UNINITIALIZED = 0,
  KEY_GENERATED = 1,
  VALID_CSR = 2,
  VALID_CERT = 3,
  BAD_DS_PARAMS = 4,
}

export interface KD_DSParams {
  ds_key_id: number
  rsa_len: number
  cipher_c: Uint8Array
  iv: Uint8Array
}
