import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * نظام الأرشيف (Files archive)
 * ============================
 * - كل أداة تحفظ ناتجها في مجلد التطبيق الداخلي عبر saveToArchive().
 * - شاشة الملفات تقرأ هذا المجلد عبر listArchive().
 * - المستخدم يحمّل أي ملف للتخزين العام عبر downloadToDevice().
 *
 * المجلد الداخلي لا يظهر في مدير ملفات الجهاز — هو أرشيف التطبيق.
 */

const ARCHIVE_DIR = FileSystem.documentDirectory + 'archive/';
const META_KEY = 'meta.json'; // بيانات وصفية (نوع الأداة لكل ملف)

export type ToolKind =
  | 'merge'
  | 'split'
  | 'rotate'
  | 'delete'
  | 'img2pdf'
  | 'protect'
  | 'other';

export type ArchiveFile = {
  name: string;
  uri: string;
  size: number;
  createdAt: number; // ms
  kind: ToolKind;
  protected?: boolean;
};

type MetaMap = Record<string, { kind: ToolKind; createdAt: number; protected?: boolean }>;

// تأكد أن مجلد الأرشيف موجود
async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(ARCHIVE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(ARCHIVE_DIR, { intermediates: true });
    }
  } catch {}
}

async function readMeta(): Promise<MetaMap> {
  try {
    const raw = await FileSystem.readAsStringAsync(ARCHIVE_DIR + META_KEY);
    return JSON.parse(raw) as MetaMap;
  } catch {
    return {};
  }
}

async function writeMeta(meta: MetaMap): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      ARCHIVE_DIR + META_KEY,
      JSON.stringify(meta)
    );
  } catch {}
}

/**
 * احفظ ملفاً (base64) في الأرشيف.
 * تستدعيها كل أداة بعد إنتاج الناتج، بدل/إضافةً للحفظ المباشر.
 */
export async function saveToArchive(
  base64: string,
  fileName: string,
  kind: ToolKind,
  opts?: { protected?: boolean }
): Promise<ArchiveFile | null> {
  try {
    await ensureDir();

    // امنع تكرار الاسم بإضافة طابع زمني عند الحاجة
    let finalName = fileName;
    const target = ARCHIVE_DIR + finalName;
    const exists = await FileSystem.getInfoAsync(target);
    if (exists.exists) {
      const stamp = Date.now().toString().slice(-5);
      finalName = fileName.replace(/\.pdf$/i, '') + `_${stamp}.pdf`;
    }

    const uri = ARCHIVE_DIR + finalName;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });

    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const createdAt = Date.now();

    const meta = await readMeta();
    meta[finalName] = { kind, createdAt, protected: opts?.protected };
    await writeMeta(meta);

    return {
      name: finalName,
      uri,
      size: (info as any).size ?? 0,
      createdAt,
      kind,
      protected: opts?.protected,
    };
  } catch (e) {
    console.log('ARCHIVE SAVE ERROR:', e);
    return null;
  }
}

/** اقرأ كل ملفات الأرشيف، مرتّبة الأحدث أولاً */
export async function listArchive(): Promise<ArchiveFile[]> {
  try {
    await ensureDir();
    const names = await FileSystem.readDirectoryAsync(ARCHIVE_DIR);
    const meta = await readMeta();

    const files: ArchiveFile[] = [];
    for (const name of names) {
      if (name === META_KEY) continue;
      if (!name.toLowerCase().endsWith('.pdf')) continue;
      const uri = ARCHIVE_DIR + name;
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      const m = meta[name];
      files.push({
        name,
        uri,
        size: (info as any).size ?? 0,
        createdAt: m?.createdAt ?? 0,
        kind: m?.kind ?? 'other',
        protected: m?.protected,
      });
    }
    files.sort((a, b) => b.createdAt - a.createdAt);
    return files;
  } catch (e) {
    console.log('ARCHIVE LIST ERROR:', e);
    return [];
  }
}

/**
 * حمّل ملفاً من الأرشيف إلى التخزين العام للجوال.
 * أندرويد: يطلب من المستخدم اختيار مجلد (StorageAccessFramework) ويحفظ هناك.
 * iOS: يفتح قائمة المشاركة/الحفظ.
 * يُمرَّر savedDirUri لإعادة استخدام مجلد محفوظ مسبقاً (دون سؤال كل مرة).
 */
export async function downloadToDevice(
  file: ArchiveFile,
  savedDirUri?: string | null
): Promise<{ ok: boolean; dirUri?: string }> {
  try {
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: 'base64',
    });

    if (Platform.OS === 'android') {
      let dirUri = savedDirUri || null;

      // إن لم يوجد مجلد محفوظ، اطلب من المستخدم اختياره مرة
      if (!dirUri) {
        const perm =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) return { ok: false };
        dirUri = perm.directoryUri;
      }

      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        dirUri,
        file.name.replace(/\.pdf$/i, ''),
        'application/pdf'
      );
      await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
      return { ok: true, dirUri };
    } else {
      // iOS
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: file.name,
        });
      }
      return { ok: true };
    }
  } catch (e) {
    console.log('DOWNLOAD ERROR:', e);
    return { ok: false };
  }
}

/** شارك ملفاً مباشرة */
export async function shareFile(file: ArchiveFile): Promise<void> {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: file.name,
      });
    }
  } catch (e) {
    console.log('SHARE ERROR:', e);
  }
}

/** احذف ملفاً واحداً من الأرشيف */
export async function deleteFromArchive(file: ArchiveFile): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(file.uri, { idempotent: true });
    const meta = await readMeta();
    delete meta[file.name];
    await writeMeta(meta);
    return true;
  } catch (e) {
    console.log('DELETE ERROR:', e);
    return false;
  }
}

/** فرّغ الأرشيف بالكامل */
export async function clearArchive(): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(ARCHIVE_DIR, { idempotent: true });
    await ensureDir();
    return true;
  } catch (e) {
    console.log('CLEAR ERROR:', e);
    return false;
  }
}
