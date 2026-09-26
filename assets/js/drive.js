// Google Drive integration for Biology lessons
// ต้องใส่ Client ID ที่ได้จาก Google Cloud Console
const DRIVE_CLIENT_ID = '700846047412-e5e9apph1s53d2h1jm3b8q8sbnvk2ukt.apps.googleusercontent.com';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'bio_drive_token';
const TOKEN_EXP_KEY = 'bio_drive_token_exp';

let _tokenClient = null;

function _isTokenValid() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const exp = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || '0', 10);
  return token && Date.now() < exp;
}

function getDriveToken() {
  return _isTokenValid() ? sessionStorage.getItem(TOKEN_KEY) : null;
}

function _saveToken(token, expiresIn) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + (expiresIn - 60) * 1000));
}

export function hasDriveAccess() {
  return _isTokenValid();
}

export function connectDrive(silent = false) {
  return new Promise((resolve, reject) => {
    if (!DRIVE_CLIENT_ID) {
      reject(new Error('no_client_id'));
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('gis_not_loaded'));
      return;
    }
    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
      });
    }
    _tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      _saveToken(resp.access_token, resp.expires_in || 3600);
      resolve(resp.access_token);
    };
    // silent = ไม่แสดง account picker ถ้า login อยู่แล้ว
    _tokenClient.requestAccessToken({ prompt: silent ? '' : 'select_account' });
  });
}

// ขอ token ใหม่แบบ silent ถ้าหมดอายุ (ไม่ใช่ครั้งแรก)
export async function ensureDriveAccess() {
  if (_isTokenValid()) return true;
  // ไม่เคย login เลย → ไม่ต้อง try (จะค้าง)
  if (!sessionStorage.getItem(TOKEN_KEY)) return false;
  // token มีแต่หมดอายุ → ลอง silent refresh พร้อม timeout
  try {
    await Promise.race([
      connectDrive(true),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function disconnectDrive() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token);
  }
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXP_KEY);
}

// ===== Progress sync via Drive =====
const PROGRESS_FILENAME = 'gust-learning-progress.json';
let _progressFileId = null;

export async function loadDriveProgress() {
  const q = encodeURIComponent(`name='${PROGRESS_FILENAME}' and trashed=false`);
  const data = await _driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`
  );
  if (data.files && data.files.length > 0) {
    _progressFileId = data.files[0].id;
    const token = getDriveToken();
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${_progressFileId}?alt=media`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (resp.ok) return resp.json();
  }
  return null;
}

export async function saveDriveProgress(progressData) {
  const token = getDriveToken();
  if (!token) return;
  const boundary = 'gust_progress_boundary';
  const content = JSON.stringify(progressData);
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: PROGRESS_FILENAME, mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');
  const url = _progressFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${_progressFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const resp = await fetch(url, {
    method: _progressFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (resp.ok) {
    const result = await resp.json();
    _progressFileId = result.id;
  }
}

async function _driveRequest(url) {
  const token = getDriveToken();
  if (!token) throw new Error('not_connected');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error('not_connected');
  }
  if (!r.ok) throw new Error('drive_api_error_' + r.status);
  return r.json();
}

async function listFolder(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = 'nextPageToken,files(id,name,mimeType)';
  let all = [], pageToken = '';
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
    const data = await _driveRequest(url);
    all = all.concat(data.files || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

function isVideo(f) {
  return f.mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f.name);
}

function isPdf(f) {
  return f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.name);
}

function isDisplayable(f) {
  return isVideo(f) || isPdf(f);
}

async function _collectFiles(folderId, section, results) {
  const items = await listFolder(folderId);
  for (const item of items) {
    if (isVideo(item)) {
      results.push({ id: item.id, name: item.name, section, type: 'video' });
    } else if (isPdf(item)) {
      results.push({ id: item.id, name: item.name, section, type: 'pdf' });
    } else if (item.mimeType === 'application/vnd.google-apps.folder') {
      await _collectFiles(item.id, section || item.name, results);
    }
  }
}

// โหลดไฟล์ทั้งหมด (video + pdf) จาก folder (recursive)
export async function loadVideosFromFolder(folderId) {
  const files = [];
  await _collectFiles(folderId, '', files);
  files.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return files;
}

// ดูว่า folder มีอะไรบ้างใน level บนสุด
export async function listFolderContents(folderId) {
  const items = await listFolder(folderId);
  return {
    folders: items.filter(i => i.mimeType === 'application/vnd.google-apps.folder'),
    videos: items.filter(isDisplayable),
  };
}
