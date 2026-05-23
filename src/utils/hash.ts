import * as Crypto from 'expo-crypto'

export async function sha256(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? input : Buffer.from(input).toString('base64')
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data)
}

export async function fileBufferToHash(base64: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64)
}
