/** Password hashing + helpers for salary sheet protection. */

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function hashPassword(password: string, saltB64: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = new Uint8Array(base64ToBuffer(saltB64))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  return bufferToBase64(bits)
}

export function createPasswordSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return bufferToBase64(salt.buffer)
}

export async function verifySheetPassword(
  password: string,
  saltB64: string,
  expectedHashB64: string,
): Promise<boolean> {
  const actual = await hashPassword(password, saltB64)
  return actual === expectedHashB64
}

/** Legacy AES-GCM decrypt for older encrypted uploads. */
export async function decryptBlobWithPassword(
  encrypted: Blob,
  password: string,
  saltB64: string,
  ivB64: string,
): Promise<Blob> {
  const enc = new TextEncoder()
  const salt = new Uint8Array(base64ToBuffer(saltB64))
  const iv = new Uint8Array(base64ToBuffer(ivB64))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      await encrypted.arrayBuffer(),
    )
    return new Blob([plain])
  } catch {
    throw new Error('Incorrect password or corrupted file')
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Trigger browser download/navigation for a Storage download URL (no CORS XHR). */
export function openDownloadUrl(url: string, fileName: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
