// Google Drive integration for Biology lessons
// ต้องใส่ Client ID ที่ได้จาก Google Cloud Console
const DRIVE_CLIENT_ID = '700846047412-e5e9apph1s53d2h1jm3b8q8sbnvk2ukt.apps.googleusercontent.com';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
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

export function connectDrive() {
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
    _tokenClient.requestAccessToken({ prompt: hasDriveAccess() ? '' : 'select_account' });
  });
}

export function disconnectDrive() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token);
  }
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXP_KEY);
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
