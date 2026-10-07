/** Some file pickers/storage services omit audio MIME types. */
export function isAudioAttachment(file: {fileType: string; fileName: string}): boolean {
  const type = file.fileType.toLowerCase().split(';')[0].trim()
  if (type.startsWith('audio/')) return true
  return (!type || type === 'application/octet-stream') && /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|aiff|aif|weba)$/i.test(file.fileName)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
