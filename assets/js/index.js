// Dashboard logic
import { hasDriveAccess, connectDrive, disconnectDrive, getStoredUserInfo, fetchAndStoreUserInfo, getDriveToken } from './drive.js';

// ===== Auth =====
async function initAuth() {
  const overlay = document.getElementById('login-overlay');
  if (hasDriveAccess()) {
    if (!getStoredUserInfo()) {
      await fetchAndStoreUserInfo(getDriveToken());
    }
    showUserInfo();
    overlay.style.display = 'none';
    document.body.classList.remove('auth-pending');
    return;
  }
  // ไม่ได้ login → แสดง overlay
  overlay.style.display = 'flex';
  document.getElementById('btn-login').addEventListener('click', async () => {
    try {
      const token = await connectDrive(false);
      await fetchAndStoreUserInfo(token);
      showUserInfo();
      overlay.style.display = 'none';
      document.body.classList.remove('auth-pending');
    } catch (e) {
      alert('เข้าสู่ระบบไม่สำเร็จ: ' + e.message);
    }
  });
}

function showUserInfo() {
  const info = getStoredUserInfo();
  if (!info) return;
  const el = document.getElementById('sidebar-user');
  el.style.display = 'flex';
  document.getElementById('user-avatar').src = info.picture || '';
  document.getElementById('user-name').textContent = info.name || '';
  document.getElementById('user-email').textContent = info.email || '';
}

document.getElementById('btn-logout').addEventListener('click', () => {
  disconnectDrive();
  location.reload();
});

function getCourseIcon(title) {
  const t = title.toLowerCase();
  if (t.includes('จำนวนเต็ม') || t.includes('การบวก') || t.includes('บวกลบ')) return '🔢';
  if (t.includes('เลขยกกำลัง') || t.includes('ยกกำลัง')) return '⚡';
  if (t.includes('สมการกำลังสอง') || t.includes('quadratic') || t.includes('พาราโบลา') || t.includes('ฟังก์ชันกำลังสอง') || t.includes('กราฟของฟังก์ชัน')) return '🌀';
  if (t.includes('กราฟและ') || t.includes('กราฟ')) return '📈';
  if (t.includes('สถิติ')) return '📊';
  if (t.includes('พีทาโกรัส')) return '📐';
  if (t.includes('ปริซึม') || t.includes('ทรงกระบอก') || t.includes('ปริมาตร') || t.includes('พื้นที่ผิว')) return '📦';
  if (t.includes('พหุนาม') || t.includes('การแยกตัวประกอบ')) return '🧮';
  if (t.includes('เส้นขนาน')) return '📏';
  if (t.includes('วงกลม')) return '⭕';
  if (t.includes('ตรีโกณ')) return '📐';
  if (t.includes('ความคล้าย') || t.includes('การเท่ากัน')) return '🔁';
  if (t.includes('ความน่าจะเป็น')) return '🎲';
  if (t.includes('เซต') || t.includes('set')) return '🫧';
  if (t.includes('ตรรกศาสตร์')) return '🧠';
  if (t.includes('ลอการิทึม') || t.includes('ลอก')) return '📉';
  if (t.includes('สมการ') || t.includes('อสมการ') || t.includes('ระบบสมการ')) return '⚖️';
  if (t.includes('เหรียญ') || t.includes('ธนบัตร')) return '🪙';
  if (t.includes('อายุ')) return '🧓';
  if (t.includes('ของผสม')) return '🧪';
  if (t.includes('กำไร') || t.includes('ขาดทุน')) return '💰';
  if (t.includes('ความเร็ว')) return '🏎️';
  if (t.includes('พายเรือ')) return '🚣';
  if (t.includes('ท่อน้ำ')) return '🚿';
  if (t.includes('การทำงาน')) return '🔧';
  if (t.includes('เรขาคณิต') || t.includes('จุด') || t.includes('เส้นตรง') || t.includes('รังสี') || t.includes('มุม')) return '📐';
  if (t.includes('สามเหลี่ยม')) return '🔺';
  if (t.includes('สี่เหลี่ยม')) return '🟦';
  if (t.includes('อัตราส่วน') || t.includes('สัดส่วน') || t.includes('เปอร์เซนต์') || t.includes('ร้อยละ')) return '💯';
  if (t.includes('แบบทดสอบ')) return '📝';
  if (t.includes('operation')) return '➕';
  if (t.includes('ความหนาแน่น') || t.includes('แรงพยุง') || t.includes('ลอยตัว')) return '🌊';
  if (t.includes('ความร้อน') || t.includes('heat')) return '🌡️';
  if (t.includes('ความดัน')) return '💨';
  if (t.includes('ความชื้น')) return '💧';
  if (t.includes('projectile')) return '🎯';
  if (t.includes('การเคลื่อนที่') || t.includes('motion')) return '🏃';
  if (t.includes('สมดุล')) return '⚖️';
  if (t.includes('โมเมนตัม')) return '💥';
  if (t.includes('งานและพลังงาน') || t.includes('พลังงาน')) return '⚡';
  if (t.includes('แรงดึงดูด')) return '🌍';
  if (t.includes('แรงเทียม') || t.includes('แรง')) return '💪';
  if (t.includes('เกร็ดความรู้')) return '💡';
  if (t.includes('ถาม') || t.includes('ตอบ')) return '❓';
  if (t.includes('quiz') || t.includes('today')) return '🧩';
  return '📚';
}

const subjects = [
  { key: 'math',    file: 'data/math.json' },
  { key: 'biology', file: 'data/biology.json' },
  { key: 'physics', file: 'data/physics.json' },
];

let currentSubject = null;
let currentSectionFilter = 'all';

async function loadSubject(key) {
  const meta = subjects.find(s => s.key === key);
  if (!meta) return;

  const resp = await fetch(meta.file);
  if (!resp.ok) throw new Error(`Failed to load ${meta.file}`);
  return resp.json();
}

function buildHeaderStats(data) {
  const progress = loadProgress();
  let totalLessons = 0, doneLessons = 0, doneCourses = 0, inProgressCourses = 0;

  for (const sec of data.sections) {
    for (const course of sec.courses) {
      const n = course.lessons.length;
      totalLessons += n;
      const cp = progress[String(course.id)] || {};
      const done = Object.values(cp).filter(Boolean).length;
      doneLessons += done;
      if (done === n && n > 0) doneCourses++;
      else if (done > 0) inProgressCourses++;
    }
  }

  const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

  const header = document.getElementById('subject-header');
  const isBio = data._key === 'biology';
  const isPhysics = data._key === 'physics';
  header.className = 'subject-header' + (isBio ? ' bio' : isPhysics ? ' physics' : '');
  const iconBadge = isBio
    ? '<span class="subj-badge bio-badge hdr"><i class="fas fa-seedling"></i></span>'
    : isPhysics
    ? '<span class="subj-badge physics-badge hdr"><i class="fas fa-bolt"></i></span>'
    : '<span class="subj-badge math-badge hdr"><i class="fas fa-calculator"></i></span>';
  header.innerHTML = `
    <h1>${iconBadge} ${data.subject}</h1>
    <div class="header-stats">
      <div class="stat-item"><strong>${doneLessons.toLocaleString()}</strong> / ${totalLessons.toLocaleString()} บทเรียน</div>
      <div class="stat-item"><strong>${doneCourses}</strong> คอร์สจบ · <strong>${inProgressCourses}</strong> กำลังเรียน</div>
      <div class="header-progress">
        <div class="progress-bar-wrap">
          <img class="progress-car header-car" src="assets/sport-car.png" style="left:${pct}%;${pct === 0 ? 'transform:translateX(0)' : ''}">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="progress-label">${pct}% สำเร็จ</div>
      </div>
    </div>`;
}

function buildSectionFilter(data) {
  const bar = document.getElementById('section-filter');
  const theme = data._key === 'biology' ? ' bio' : data._key === 'physics' ? ' physics' : '';
  bar.className = 'section-filter' + theme;
  bar.innerHTML = '';

  function makeBtn(label, key) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (currentSectionFilter === key ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => {
      currentSectionFilter = key;
      buildSectionFilter(currentSubject);
      renderCourses(currentSubject);
    };
    return btn;
  }

  bar.appendChild(makeBtn('ทั้งหมด', 'all'));
  for (const sec of data.sections) {
    bar.appendChild(makeBtn(sec.label, sec.id));
  }
}

function buildCourseCard(course) {
  const { done, total } = getCourseProgress(course.id, course.lessons.length);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  let status = 'not-started', badge = '';
  if (pct === 100 && total > 0) { status = 'done'; badge = '✅'; }
  else if (pct > 0) { status = 'in-progress'; badge = '🔵'; }

  const a = document.createElement('a');
  a.className = `course-card status-${status}`;
  a.href = `course.html?subject=${encodeURIComponent(currentSubject._key)}&id=${course.id}`;
  const fillClass = status === 'done' ? 'done' : status === 'in-progress' ? 'in-progress' : '';
  a.innerHTML = `
    <div class="card-icon">${getCourseIcon(course.title)}</div>
    <div class="card-status-badge">${badge}</div>
    <div class="card-title">${course.title}</div>
    <div class="card-duration">${course.duration || ''}</div>
    <div class="card-progress-row">
      <div class="card-progress-wrap">
        <img class="progress-car" src="assets/sport-car.png" style="left:${pct}%;${pct === 0 ? 'transform:translateX(0)' : ''}">
        <div class="card-progress-track">
          <div class="card-progress-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
      </div>
      <span>${done}/${total}</span>
    </div>`;
  return a;
}

function renderCourses(data) {
  const area = document.getElementById('courses-area');
  area.innerHTML = '';

  const sections = currentSectionFilter === 'all'
    ? data.sections
    : data.sections.filter(s => s.id === currentSectionFilter);

  let totalCards = 0;
  for (const sec of sections) {
    if (sec.courses.length === 0) continue;
    totalCards += sec.courses.length;

    const group = document.createElement('div');
    group.className = 'section-group';
    const title = document.createElement('div');
    title.className = 'section-group-title' + (data._key === 'biology' ? ' bio' : data._key === 'physics' ? ' physics' : '');
    title.textContent = sec.label;
    group.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'course-grid';
    for (const course of sec.courses) {
      grid.appendChild(buildCourseCard(course));
    }
    group.appendChild(grid);
    area.appendChild(group);
  }

  if (totalCards === 0) {
    area.innerHTML = `
      <div class="placeholder-area">
        <div class="icon">${data.icon}</div>
        <h2>ยังไม่มีเนื้อหา</h2>
        <p>เนื้อหา${data.subject}จะถูกเพิ่มในอนาคต</p>
      </div>`;
  }
}

async function switchSubject(key) {
  document.querySelectorAll('.subject-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.subject === key);
  });
  currentSectionFilter = 'all';

  const area = document.getElementById('courses-area');
  area.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner"></div></div>';

  const data = await loadSubject(key);
  data._key = key;
  currentSubject = data;

  buildHeaderStats(data);
  buildSectionFilter(data);
  renderCourses(data);

  localStorage.setItem('lastSubject', key);
}

// ===== Subject tab clicks =====
document.querySelectorAll('.subject-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    switchSubject(tab.dataset.subject);
  });
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

// ===== Init =====
await initAuth();
const lastSubject = localStorage.getItem('lastSubject') || 'math';
switchSubject(lastSubject);
