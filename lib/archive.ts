import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ARCHIVE_DIR = FileSystem.documentDirectory + 'archive/';
const META_KEY = 'meta.json';
export const DIR_KEY = 'download_dir_uri_v1';

export type ToolKind =
  | 'merge' | 'split' | 'rotate' | 'delete' | 'img2pdf' | 'protect' | 'pdf2img' | 'other';

export type ArchiveFile = {
  name: string; uri: string; size: number;
  createdAt: number; kind: ToolKind; protected?: boolean;
};

type MetaMap = Record<string, { kind: ToolKind; createdAt: number; protected?: boolean }>;

// امتدادات الملفات المدعومة بالأرشيف (PDF لكل الأدوات، ZIP لتحويل PDF إلى صور)
const SUPPORTED_EXT = ['.pdf', '.zip'];

function getExt(name: string): string {
  const m = name.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0].toLowerCase() : '';
}
function getMime(ext: string): string {
  if (ext === '.zip') return 'application/zip';
  return 'application/pdf';
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(ARCHIVE_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(ARCHIVE_DIR, { intermediates: true });
  } catch {}
}
async function readMeta(): Promise<MetaMap> {
  try { return JSON.parse(await FileSystem.readAsStringAsync(ARCHIVE_DIR + META_KEY)) as MetaMap; }
  catch { return {}; }
}
async function writeMeta(meta: MetaMap): Promise<void> {
  try { await FileSystem.writeAsStringAsync(ARCHIVE_DIR + META_KEY, JSON.stringify(meta)); } catch {}
}

export async function saveToArchive(
  base64: string, fileName: string, kind: ToolKind, opts?: { protected?: boolean }
): Promise<ArchiveFile | null> {
  try {
    await ensureDir();
    let finalName = fileName;
    const ext = getExt(fileName) || '.pdf';
    const exists = await FileSystem.getInfoAsync(ARCHIVE_DIR + finalName);
    if (exists.exists) {
      const stamp = Date.now().toString().slice(-5);
      const baseNoExt = fileName.slice(0, fileName.length - ext.length);
      finalName = `${baseNoExt}_${stamp}${ext}`;
    }
    const uri = ARCHIVE_DIR + finalName;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const createdAt = Date.now();
    const meta = await readMeta();
    meta[finalName] = { kind, createdAt, protected: opts?.protected };
    await writeMeta(meta);
    return { name: finalName, uri, size: (info as any).size ?? 0, createdAt, kind, protected: opts?.protected };
  } catch (e) { console.log('ARCHIVE SAVE ERROR:', e); return null; }
}

/**
 * ينزّل ملفاً من رابط مباشرة لمجلد الأرشيف على القرص (Stream-to-disk)
 * بدون تحميل محتواه كنص Base64 بذاكرة جافاسكريبت أبداً.
 * ضروري للملفات الضخمة (مثل ZIP تحويل كتاب كامل لصور) التي قد تتجاوز
 * عشرات أو مئات الميجابايتات — تحويلها لنص Base64 بالذاكرة يفشل بخطأ
 * "read failed" (FileReader) على أغلب الأجهزة.
 */
export async function saveDownloadedFile(
  url: string, fileName: string, kind: ToolKind, opts?: { protected?: boolean }
): Promise<ArchiveFile | null> {
  try {
    await ensureDir();
    let finalName = fileName;
    const ext = getExt(fileName) || '.pdf';
    const exists = await FileSystem.getInfoAsync(ARCHIVE_DIR + finalName);
    if (exists.exists) {
      const stamp = Date.now().toString().slice(-5);
      const baseNoExt = fileName.slice(0, fileName.length - ext.length);
      finalName = `${baseNoExt}_${stamp}${ext}`;
    }
    const uri = ARCHIVE_DIR + finalName;
    const result = await FileSystem.downloadAsync(url, uri);
    if (!result || result.status !== 200) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      console.log('ARCHIVE DOWNLOAD ERROR: HTTP', result?.status);
      return null;
    }
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const createdAt = Date.now();
    const meta = await readMeta();
    meta[finalName] = { kind, createdAt, protected: opts?.protected };
    await writeMeta(meta);
    return { name: finalName, uri, size: (info as any).size ?? 0, createdAt, kind, protected: opts?.protected };
  } catch (e) { console.log('ARCHIVE DOWNLOAD ERROR:', e); return null; }
}

export async function listArchive(): Promise<ArchiveFile[]> {
  try {
    await ensureDir();
    const names = await FileSystem.readDirectoryAsync(ARCHIVE_DIR);
    const meta = await readMeta();
    const files: ArchiveFile[] = [];
    for (const name of names) {
      if (name === META_KEY) continue;
      const ext = getExt(name);
      if (!SUPPORTED_EXT.includes(ext)) continue;
      const uri = ARCHIVE_DIR + name;
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      const m = meta[name];
      files.push({ name, uri, size: (info as any).size ?? 0, createdAt: m?.createdAt ?? 0, kind: m?.kind ?? 'other', protected: m?.protected });
    }
    files.sort((a, b) => b.createdAt - a.createdAt);
    return files;
  } catch (e) { console.log('ARCHIVE LIST ERROR:', e); return []; }
}

export async function downloadToDevice(
  file: ArchiveFile, savedDirUri?: string | null
): Promise<{ ok: boolean; dirUri?: string }> {
  try {
    const ext = getExt(file.name) || '.pdf';
    const mime = getMime(ext);
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
    if (Platform.OS === 'android') {
      let dirUri = savedDirUri || null;
      if (dirUri) {
        try { await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri); }
        catch { dirUri = null; }
      }
      if (!dirUri) {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) return { ok: false };
        dirUri = perm.directoryUri;
        try { await AsyncStorage.setItem(DIR_KEY, dirUri); } catch {}
      }
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        dirUri, file.name.slice(0, file.name.length - ext.length), mime
      );
      await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
      return { ok: true, dirUri };
    } else {
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: file.name });
      return { ok: true };
    }
  } catch (e) { console.log('DOWNLOAD ERROR:', e); return { ok: false }; }
}

export async function shareFile(file: ArchiveFile): Promise<void> {
  try {
    const ext = getExt(file.name) || '.pdf';
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(file.uri, { mimeType: getMime(ext), dialogTitle: file.name });
  } catch (e) { console.log('SHARE ERROR:', e); }
}

export async function deleteFromArchive(file: ArchiveFile): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(file.uri, { idempotent: true });
    const meta = await readMeta();
    delete meta[file.name];
    await writeMeta(meta);
    return true;
  } catch (e) { console.log('DELETE ERROR:', e); return false; }
}

export async function clearArchive(): Promise<boolean> {
  try {
    await ensureDir();
    const names = await FileSystem.readDirectoryAsync(ARCHIVE_DIR);
    for (const name of names) {
      try { await FileSystem.deleteAsync(ARCHIVE_DIR + name, { idempotent: true }); } catch {}
    }
    await writeMeta({});
    return true;
  } catch (e) {
    console.log('CLEAR ERROR:', e);
    try { await FileSystem.deleteAsync(ARCHIVE_DIR, { idempotent: true }); await ensureDir(); return true; }
    catch { return false; }
  }
}
