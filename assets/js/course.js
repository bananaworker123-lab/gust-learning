// Course page logic
import { hasDriveAccess, connectDrive, ensureDriveAccess, loadVideosFromFolder, listFolderContents, loadDriveProgress, saveDriveProgress } from './drive.js';

const params = new URLSearchParams(location.search);
const subjectKey = params.get('subject') || 'math';
const courseId = parseInt(params.get('id'), 10);
const startVideo = params.get('v') !== null ? parseInt(params.get('v'), 10) : null;

const SUBJECT_FILES = { math: 'data/math.json', biology: 'data/biology.json', physics: 'data/physics.json' };

let courseData = null;
let currentLessonIdx = 0;
let player = null;
let lessonFilter = 'all';
let isDriveCourse = false;
let _driveProgressTimer = null;

function scheduleDriveProgressSave() {
  clearTimeout(_driveProgressTimer);
  _driveProgressTimer = setTimeout(async () => {
    try {
      if (hasDriveAccess()) await saveDriveProgress(loadProgress());
    } catch (e) { /* silent fail */ }
  }, 1500);
}

// ===== Init =====
async function init() {
  const file = SUBJECT_FILES[subjectKey] || SUBJECT_FILES.math;
  const resp = await fetch(file);
  const data = await resp.json();

  for (const sec of data.sections) {
    const found = sec.courses.find(c => c.id === courseId);
    if (found) { courseData = found; break; }
  }

  if (!courseData) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center"><h2>ไม่พบคอร์สนี้</h2></div>';
    return;
  }

  document.title = courseData.title + ' — My Learning';
  document.getElementById('course-title').textContent = courseData.title;
  document.getElementById('btn-back').href = `index.html?subject=${subjectKey}`;

  // Drive คือ source of truth — อ่านจาก Drive เขียนทับ localStorage
  if (hasDriveAccess()) {
    try {
      const driveProgress = await loadDriveProgress();
      if (driveProgress) saveProgress(driveProgress);
    } catch {}
  }

  // Drive-based course (biology)
  if (courseData.driveId) {
    isDriveCourse = true;
    await initDriveCourse();
    return;
  }

  renderLessonList();
  const startIdx = startVideo !== null ? courseData.lessons.findIndex(l => l.v === startVideo) : 0;
  selectLesson(Math.max(0, startIdx));
  updateProgress();
}

// ===== Drive Course =====
let driveFolderStack = []; // [{id, name}]

async function initDriveCourse() {
  if (!hasDriveAccess()) {
    const ok = await ensureDriveAccess();
    if (!ok) { showDriveConnectUI(); return; }
  }
  await driveNavigate(courseData.driveId, courseData.title, true);
  // นับไฟล์จริงทั้งหมด (background) แล้วเก็บลง progress
  _cacheDriveLessonCount(courseData.driveId, courseId);
}

async function _cacheDriveLessonCount(folderId, cId) {
  try {
    const files = await loadVideosFromFolder(folderId);
    const p = loadProgress();
    if (!p._counts) p._counts = {};
    if (p._counts[String(cId)] !== files.length) {
      p._counts[String(cId)] = files.length;
      saveProgress(p);
      scheduleDriveProgressSave();
    }
  } catch {}
}

function showDriveConnectUI() {
  const wrapper = document.getElementById('video-wrapper');
  wrapper.innerHTML = `
    <div class="video-placeholder drive-connect-screen">
      <div class="icon">🧬</div>
      <h3>เชื่อมต่อ Google Drive</h3>
      <p>เพื่อดูวีดีโอบทเรียนชีววิทยา กรุณาเข้าสู่ระบบด้วย Google account ที่มีสิทธิ์เข้าถึง</p>
      <button class="btn-drive-connect" id="btn-drive-connect">
        <svg width="18" height="18" viewBox="0 0 48 48" style="vertical-align:middle;margin-right:8px"><path fill="#4285F4" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.8 2.3 30.2 0 24 0 14.7 0 6.6 5.3 2.5 13.1l7.8 6C12.2 13 17.7 9.5 24 9.5z"/><path fill="#34A853" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.1 5.1-4.5 6.7l7 5.4C43.5 36.7 46.1 31 46.1 24.5z"/><path fill="#FBBC05" d="M10.3 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6.1z"/><path fill="#EA4335" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7-5.4C30.2 38.9 27.3 40 24 40c-6.3 0-11.6-3.8-13.7-9.4l-7.8 6C6.6 44.5 14.7 48 24 48z"/></svg>
        เข้าสู่ระบบด้วย Google
      </button>
    </div>`;
  document.getElementById('btn-drive-connect').onclick = async () => {
    try {
      await connectDrive();
      await driveNavigate(courseData.driveId, courseData.title, true);
    } catch (e) {
      if (e.message === 'no_client_id') {
        showToast('กรุณาใส่ Google Client ID ใน assets/js/drive.js ก่อน');
      } else {
        showToast('เข้าสู่ระบบไม่สำเร็จ: ' + e.message);
      }
    }
  };
  document.getElementById('lesson-list').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">เข้าสู่ระบบ Google เพื่อดูรายการบทเรียน</div>';
}

// navigate เข้า folder — reset=true เมื่อเริ่มต้นใหม่
async function driveNavigate(folderId, folderName, reset = false) {
  if (reset) driveFolderStack = [];
  driveFolderStack.push({ id: folderId, name: folderName });
  updateDriveBackBtn();

  const list = document.getElementById('lesson-list');
  list.innerHTML = '<div style="padding:20px;text-align:center"><div class="spinner"></div></div>';
  const wrapper = document.getElementById('video-wrapper');
  wrapper.classList.remove('drive-mode');
  if (reset) wrapper.innerHTML = '<div class="video-placeholder"><div class="icon">⏳</div><p>กำลังโหลด...</p></div>';

  try {
    const { folders, videos } = await listFolderContents(folderId);

    if (folders.length > 0 && videos.length === 0) {
      // มีแต่ subfolder — แสดงให้เลือก
      showDriveFolderPicker(folders);
    } else {
      // มี video (อาจมี subfolder ด้วย) — โหลดทั้งหมด recursive
      document.getElementById('lesson-filter-tabs').style.display = '';
      document.getElementById('btn-mark-all').style.display = '';
      const allVideos = await loadVideosFromFolder(folderId);
      if (allVideos.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;line-height:1.6">ไม่พบไฟล์วีดีโอในโฟลเดอร์นี้<br>(อาจมีไฟล์ประเภทอื่น เช่น PDF)<br><br>กด ‹ กลับ เพื่อเลือกโฟลเดอร์อื่น</div>';
        wrapper.innerHTML = '<div class="video-placeholder"><div class="icon">📄</div><p>โฟลเดอร์นี้ไม่มีวีดีโอ</p></div>';
        return;
      }
      courseData.lessons = allVideos.map((v) => ({
        v: v.id, t: v.name.replace(/\.[^.]+$/, ''), d: '', driveId: v.id, section: v.section, type: v.type || 'video',
      }));
      console.log('[DEBUG] lessons loaded in folder:', folderId, 'first 3 IDs:', courseData.lessons.slice(0,3).map(l=>l.v));
      const prog = loadProgress()[String(courseId)] || {};
      console.log('[DEBUG] progress keys:', Object.keys(prog));
      renderLessonList();
      selectLesson(0);
      updateProgress();
    }
  } catch (e) {
    if (e.message === 'not_connected') {
      showDriveConnectUI();
    } else {
      list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary)">โหลดไม่สำเร็จ: ${e.message}</div>`;
    }
  }
}

function showDriveFolderPicker(folders) {
  document.getElementById('lesson-filter-tabs').style.display = 'none';
  document.getElementById('btn-mark-all').style.display = 'none';
  const wrapper = document.getElementById('video-wrapper');
  wrapper.classList.remove('drive-mode');
  wrapper.innerHTML = '<div class="video-placeholder"><div class="icon">📁</div><p>เลือกโฟลเดอร์เพื่อดูบทเรียน</p></div>';

  const list = document.getElementById('lesson-list');
  list.innerHTML = '';
  folders.forEach(folder => {
    const item = document.createElement('div');
    item.className = 'lesson-item drive-folder-item';
    item.innerHTML = `<span style="font-size:20px">📁</span>
      <div class="lesson-item-info"><div class="lesson-item-title">${folder.name}</div></div>
      <span style="color:var(--text-secondary);font-size:18px">›</span>`;
    item.addEventListener('click', () => driveNavigate(folder.id, folder.name));
    list.appendChild(item);
  });
}

function updateDriveBackBtn() {
  // อัปเดตชื่อ folder ปัจจุบันใน header
  const current = driveFolderStack[driveFolderStack.length - 1];
  const titleEl = document.getElementById('lesson-panel-title');
  if (titleEl) {
    if (current && driveFolderStack.length > 1) {
      titleEl.textContent = current.name;
      titleEl.title = current.name;
    } else {
      titleEl.textContent = 'บทเรียน';
      titleEl.removeAttribute('title');
    }
  }

  let btn = document.getElementById('drive-back-btn');
  const canGoBack = driveFolderStack.length > 1;
  if (!canGoBack) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'drive-back-btn';
    btn.className = 'drive-back-btn';
    document.querySelector('.lesson-panel-header').prepend(btn);
  }
  const parent = driveFolderStack[driveFolderStack.length - 2];
  btn.textContent = '‹ กลับ';
  btn.onclick = () => {
    driveFolderStack.pop(); // ออกจาก current
    driveFolderStack.pop(); // ออกจาก parent (driveNavigate จะ push ใหม่)
    driveNavigate(parent.id, parent.name);
  };
}

// ===== Lesson Filter =====
document.getElementById('lesson-filter-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.lesson-filter-btn');
  if (!btn) return;
  lessonFilter = btn.dataset.filter;
  document.querySelectorAll('.lesson-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderLessonList();
});

// ===== Lesson List =====
function renderLessonList() {
  const list = document.getElementById('lesson-list');
  list.innerHTML = '';
  courseData.lessons.forEach((lesson, idx) => {
    const watched = isLessonWatched(courseId, lesson.v);
    if (lessonFilter === 'watched' && !watched) return;
    if (lessonFilter === 'unwatched' && watched) return;

    const item = document.createElement('div');
    item.className = 'lesson-item';
    item.dataset.idx = idx;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isLessonWatched(courseId, lesson.v);
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      setLesson(courseId, lesson.v, cb.checked);
      updateProgress();
      scheduleDriveProgressSave();
    });

    const info = document.createElement('div');
    info.className = 'lesson-item-info';
    const typeIcon = lesson.type === 'pdf' ? '📄 ' : '';
    info.innerHTML = `
      <div class="lesson-item-title">${typeIcon}${lesson.t}</div>
      <div class="lesson-item-dur">${lesson.d}</div>`;

    const num = document.createElement('div');
    num.className = 'lesson-item-num';
    num.textContent = idx + 1;

    item.appendChild(cb);
    item.appendChild(info);
    item.appendChild(num);
    item.addEventListener('click', (e) => {
      if (e.target === cb) return;
      selectLesson(idx);
    });

    list.appendChild(item);
  });
}

function updateLessonListChecks() {
  document.querySelectorAll('.lesson-item').forEach(item => {
    const idx = parseInt(item.dataset.idx, 10);
    const lesson = courseData.lessons[idx];
    if (!lesson) return;
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = isLessonWatched(courseId, lesson.v);
    item.classList.toggle('active', idx === currentLessonIdx);
  });
}

function scrollLessonIntoView(idx) {
  const items = document.querySelectorAll('.lesson-item');
  if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
}

// ===== Progress display =====
function updateProgress() {
  const { done, total } = getCourseProgress(courseId, courseData.lessons.length);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('topbar-progress-count').textContent = `${done}/${total}`;
  document.getElementById('topbar-progress-fill').style.width = pct + '%';
  updateLessonListChecks();
  updateWatchButton();
}

function updateWatchButton() {
  const lesson = courseData.lessons[currentLessonIdx];
  if (!lesson) return;
  const watched = isLessonWatched(courseId, lesson.v);
  const btn = document.getElementById('btn-mark-watched');
  btn.textContent = watched ? '✅ ดูแล้ว' : '☐ ทำเครื่องหมายว่าดูแล้ว';
  btn.classList.toggle('watched', watched);
}

// ===== Select lesson =====
function selectLesson(idx) {
  if (!courseData.lessons[idx]) return;
  currentLessonIdx = idx;
  const lesson = courseData.lessons[idx];

  // Counter
  document.getElementById('lesson-counter').textContent =
    `${idx + 1} / ${courseData.lessons.length}`;

  // Nav buttons
  document.getElementById('btn-prev').disabled = idx === 0;
  document.getElementById('btn-next').disabled = idx === courseData.lessons.length - 1;

  // Lesson list highlight
  updateLessonListChecks();
  scrollLessonIntoView(idx);
  updateWatchButton();

  // Update URL without reload
  const url = new URL(location.href);
  url.searchParams.set('v', lesson.v);
  history.replaceState(null, '', url);

  // Load video
  loadVideo(courseId, lesson.v);
}

// ===== Proxy config =====
const PROXY_BASE = 'http://localhost:8766';
let proxyAvailable = null; // null=unknown, true/false

async function checkProxy() {
  if (proxyAvailable !== null) return proxyAvailable;
  try {
    const resp = await fetch(`${PROXY_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    proxyAvailable = resp.ok;
  } catch {
    proxyAvailable = false;
  }
  return proxyAvailable;
}

// ===== Video loading =====
async function loadVideo(courseIdNum, videoId) {
  const lesson = courseData.lessons[currentLessonIdx];

  // Drive-based video → show iframe
  if (lesson && lesson.driveId) {
    renderDrivePlayer(lesson.driveId);
    return;
  }

  const videoWrapper = document.getElementById('video-wrapper');
  videoWrapper.innerHTML = '<div class="video-placeholder"><div class="icon">⏳</div><p>กำลังโหลด...</p></div>';

  // Destroy existing player
  if (player) {
    try { player.dispose(); } catch {}
    player = null;
  }

  let m3u8Url = null;

  // Check if pre-scraped URL is in data
  if (lesson && lesson.u) {
    m3u8Url = lesson.u;
  }

  // Try local proxy (if running)
  if (!m3u8Url && await checkProxy()) {
    try {
      const resp = await fetch(
        `${PROXY_BASE}/video?id=${courseIdNum}&v=${videoId}`,
        { signal: AbortSignal.timeout(12000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.url) m3u8Url = data.url;
      }
    } catch { /* proxy failed */ }
  }

  if (m3u8Url) {
    renderVideoPlayer(videoWrapper, m3u8Url);
  } else {
    renderVideoFallback(videoWrapper, courseIdNum, videoId);
  }
}

function renderVideoPlayer(wrapper, src) {
  wrapper.innerHTML = '<video id="vjsplayer" class="video-js vjs-big-play-centered" controls></video>';
  player = videojs('vjsplayer', {
    techOrder: ['html5'],
    html5: { vhs: { overrideNative: true } },
    controls: true,
    playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
    controlBar: {
      children: [
        'playToggle',
        'skipBackward',
        'skipForward',
        'volumePanel',
        'progressControl',
        'remainingTimeDisplay',
        'playbackRateMenuButton',
        'pictureInPictureToggle',
        'fullscreenToggle',
      ],
      skipButtons: { backward: 10, forward: 10 },
      volumePanel: { inline: true },
    },
  });
  const mimeType = src.endsWith('.mp4') ? 'video/mp4' : 'application/x-mpegURL';
  player.src({ src, type: mimeType });
  player.on('ended', () => {
    const lesson = courseData.lessons[currentLessonIdx];
    if (lesson && !isLessonWatched(courseId, lesson.v)) {
      setLesson(courseId, lesson.v, true);
      updateProgress();
      showToast('บันทึกความก้าวหน้าแล้ว ✅');
    }
  });
}

function renderVideoFallback(wrapper, courseIdNum, videoId) {
  const lesson = courseData.lessons[currentLessonIdx];
  const origUrl = `https://ajnunu.com/app/course/index.php?id=${courseIdNum}&video_id=${videoId}`;
  wrapper.innerHTML = `
    <div class="video-placeholder">
      <div class="icon">🎬</div>
      <p>${lesson ? lesson.t : 'บทเรียนนี้'}</p>
      <p style="font-size:12px;opacity:0.5">โหลดวิดีโอผ่าน CORS ไม่ได้ — เปิดในแท็บใหม่</p>
      <a class="btn-open-original" href="${origUrl}" target="_blank" rel="noopener">
        <i class="fas fa-external-link-alt"></i> เปิดใน ajnunu.com
      </a>
    </div>`;
}

function renderDrivePlayer(driveFileId) {
  const wrapper = document.getElementById('video-wrapper');
  if (player) { try { player.dispose(); } catch {} player = null; }
  wrapper.classList.add('drive-mode');
  wrapper.innerHTML = `<iframe
    src="https://drive.google.com/file/d/${driveFileId}/preview"
    class="drive-iframe"
    allowfullscreen
    allow="autoplay"
    frameborder="0"></iframe>`;
}

// ===== Panel Toggle =====
function setPanelOpen(open) {
  const panel = document.getElementById('lesson-panel');
  const backdrop = document.getElementById('panel-backdrop');
  panel.classList.toggle('collapsed', !open);
  backdrop.classList.toggle('open', open);
}

document.getElementById('btn-toggle-panel').addEventListener('click', () => {
  const panel = document.getElementById('lesson-panel');
  setPanelOpen(panel.classList.contains('collapsed'));
});

document.getElementById('panel-backdrop').addEventListener('click', () => {
  setPanelOpen(false);
});

// ===== Controls =====
document.getElementById('btn-prev').addEventListener('click', () => {
  if (currentLessonIdx > 0) selectLesson(currentLessonIdx - 1);
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (currentLessonIdx < courseData.lessons.length - 1) selectLesson(currentLessonIdx + 1);
});

document.getElementById('btn-mark-watched').addEventListener('click', () => {
  const lesson = courseData.lessons[currentLessonIdx];
  if (!lesson) return;
  const newVal = !isLessonWatched(courseId, lesson.v);
  setLesson(courseId, lesson.v, newVal);
  updateProgress();
  scheduleDriveProgressSave();
  showToast(newVal ? 'ทำเครื่องหมายว่าดูแล้ว ✅' : 'ยกเลิกเครื่องหมาย');
});

document.getElementById('btn-mark-all').addEventListener('click', () => {
  const allWatched = courseData.lessons.every(l => isLessonWatched(courseId, l.v));
  const progress = loadProgress();
  if (!progress[String(courseId)]) progress[String(courseId)] = {};
  courseData.lessons.forEach(l => { progress[String(courseId)][String(l.v)] = !allWatched; });
  saveProgress(progress);
  updateProgress();
  scheduleDriveProgressSave();
  showToast(allWatched ? 'ยกเลิกเครื่องหมายทั้งหมด' : 'ทำเครื่องหมายทุกบทเรียนว่าดูแล้ว ✅');
});

// ===== Toast =====
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ===== Start =====
init();
