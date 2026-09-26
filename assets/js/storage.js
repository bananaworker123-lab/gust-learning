// localStorage key: 'progress'
// Structure: { "courseId": { "videoId": true/false } }

const STORAGE_KEY = 'progress';

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

function setLesson(courseId, videoId, watched) {
  const p = loadProgress();
  if (!p[courseId]) p[courseId] = {};
  p[courseId][String(videoId)] = watched;
  saveProgress(p);
}

function getCourseProgress(courseId, totalLessons) {
  const p = loadProgress();
  const courseP = p[String(courseId)] || {};
  const done = Object.values(courseP).filter(Boolean).length;
  const total = totalLessons > 0 ? totalLessons : Object.keys(courseP).length;
  return { done, total };
}

function isLessonWatched(courseId, videoId) {
  const p = loadProgress();
  return !!(p[String(courseId)] || {})[String(videoId)];
}

function exportProgress() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: loadProgress(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `progress-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const progress = data.version === 1 ? data.progress : data;
        saveProgress(progress);
        resolve(progress);
      } catch (err) {
        reject(new Error('ไฟล์ไม่ถูกต้อง: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsText(file);
  });
}
