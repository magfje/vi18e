/**
 * electron-builder afterPack hook.
 *
 * NOTE: ffmpeg.dll, dxcompiler.dll, and dxil.dll must all be kept.
 * Chromium's renderer process loads ffmpeg.dll at startup on Windows
 * (even for non-media apps) and crashes with STATUS_BREAKPOINT if it
 * is missing. dxcompiler.dll is required by the ANGLE D3D12 backend.
 */
export default async function afterPack(_context) {
  // Nothing to remove — all Electron DLLs are required for stable rendering.
}
