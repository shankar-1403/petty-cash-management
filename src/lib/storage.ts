import { getBytes, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from '@/lib/firebase'

export async function uploadToStorage(
  path: string,
  data: Blob | File,
  contentType?: string,
): Promise<{ url: string; path: string }> {
  const fileRef = storageRef(storage, path)
  await uploadBytes(fileRef, data, contentType ? { contentType } : undefined)
  const url = await getDownloadURL(fileRef)
  return { url, path }
}

export async function uploadInvoiceFile(file: File, requestId: string): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `invoices/${requestId}/${Date.now()}_${safeName}`
  const result = await uploadToStorage(path, file, file.type || 'application/octet-stream')
  return result.url
}

export async function uploadSalarySheetFile(
  file: Blob | File,
  sheetId: string,
  originalFileName: string,
): Promise<{ url: string; path: string }> {
  const safeName = originalFileName.replace(/[^\w.\-]+/g, '_')
  const path = `salary-sheets/${sheetId}/${Date.now()}_${safeName}`
  const type =
    file instanceof File
      ? file.type || 'application/octet-stream'
      : 'application/octet-stream'
  return uploadToStorage(path, file, type)
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

function resolveStoragePath(pathOrUrl: string): string {
  if (!pathOrUrl.startsWith('http')) return pathOrUrl

  try {
    const url = new URL(pathOrUrl)
    const marker = '/o/'
    const idx = url.pathname.indexOf(marker)
    if (idx >= 0) {
      const encoded = url.pathname.slice(idx + marker.length)
      return decodeURIComponent(encoded)
    }
  } catch {
    /* ignore */
  }

  return pathOrUrl
}

/** Download bytes via Storage SDK with a hard timeout (prevents endless “Decrypting…”). */
export async function downloadStorageBlob(pathOrUrl: string): Promise<Blob> {
  const path = resolveStoragePath(pathOrUrl)
  const fileRef = storageRef(storage, path)
  const bytes = await withTimeout(
    getBytes(fileRef),
    20_000,
    'Download timed out. Check Storage rules and try again.',
  )
  return new Blob([bytes])
}

export async function getSalaryDownloadUrl(pathOrUrl: string): Promise<string> {
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  const fileRef = storageRef(storage, pathOrUrl)
  return withTimeout(
    getDownloadURL(fileRef),
    15_000,
    'Could not get download link (timed out).',
  )
}
