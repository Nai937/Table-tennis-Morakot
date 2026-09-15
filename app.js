// ===== CONFIG =====
const TT_OPEN_HOUR = 15;
const TT_CLOSE_HOUR = 20;
const TT_HOURS = Array.from({ length: TT_CLOSE_HOUR - TT_OPEN_HOUR }, (_, i) => TT_OPEN_HOUR + i); // 15..19
const TT_TABLES = [1, 2, 3, 4];

// ===== STATE =====
let ttDayOffset = 0;
let ttBookings = null;

// ===== DATE UTILS =====
function ttDateFor(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDS(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayDS() {
  return toDS(new Date());
}

function formatThaiFullDate(date) {
  return date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ===== CLOCK =====
function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('tt-clock-time');
  const dateEl = document.getElementById('tt-clock-date');
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('th-TH', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
  }
}

// ===== NAVIGATION =====
function goToday() {
  ttDayOffset = 0;
  renderSchedule();
}

function changeDay(delta) {
  ttDayOffset += delta;
  renderSchedule();
}

// ===== LOAD DATA =====
async function loadTTData() {
  // Try live API first (when served from FastAPI on Railway)
  try {
    const res = await fetch('/api/public/table-tennis/bookings');
    if (res.ok) {
      ttBookings = await res.json();
      renderSchedule();
      updateLiveStatus();
      updateFooterTimestamp();
      return;
    }
  } catch (_) {}

  // Fallback: static JSON pushed by the manager system (when served from GitHub Pages)
  try {
    const res = await fetch(`./data/bookings.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ttBookings = {
      generated_at: data.generated_at,
      bookings: data.table_tennis || [],
    };
    renderSchedule();
    updateLiveStatus();
    updateFooterTimestamp();
  } catch (err) {
    ttBookings = { generated_at: null, bookings: [] };
    renderSchedule();
    updateLiveStatus();
  }
}

function renderTTPrice(data) {
  const pillText = document.getElementById('tt-price-pill-text');
  const infoNormal = document.getElementById('tt-info-normal');
  if (infoNormal) infoNormal.textContent = data.normal_price_per_hour;
  if (pillText) {
    if (data.is_promo_active_today) {
      pillText.textContent = `โปรโมชั่นวันนี้ ${data.current_price_per_hour} บาท/ชม.`;
    } else {
      pillText.textContent = `${data.current_price_per_hour} บาท / ชั่วโมง`;
    }
  }
}

async function loadTTPrice() {
  // Try live API first (when served from FastAPI on Railway)
  try {
    const res = await fetch('/api/public/table-tennis/price');
    if (res.ok) {
      renderTTPrice(await res.json());
      return;
    }
  } catch (_) {}

  // Fallback: static JSON pushed by the manager system (when served from GitHub Pages)
  try {
    const res = await fetch(`./data/bookings.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.tt_price) throw new Error('no tt_price in snapshot');
    renderTTPrice(data.tt_price);
  } catch (_) {
    const pillText = document.getElementById('tt-price-pill-text');
    if (pillText) pillText.textContent = 'ติดต่อสอบถามราคา';
  }
}

// ===== GALLERY =====
async function loadTTGallery() {
  try {
    const res = await fetch('/api/public/table-tennis/gallery');
    if (res.ok) {
      const data = await res.json();
      renderGallery(data.images || []);
      return;
    }
  } catch (_) {}

  try {
    const res = await fetch(`./data/gallery.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderGallery(data.images || []);
  } catch (_) {
    renderGallery([]);
  }
}

function renderGallery(images) {
  const section = document.getElementById('gallery');
  const wrap = document.getElementById('tt-gallery-wrap');
  if (!wrap) return;

  const urls = (images || []).map(i => i.url).filter(Boolean);
  if (!urls.length) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';

  const single = urls.length < 2;
  const track = single ? urls : urls.concat(urls);
  const duration = Math.max(urls.length * 4, 14);

  const itemsHtml = track.map(url =>
    `<div class="tt-gallery-item"><img src="${url}" alt="ภาพบรรยากาศสนามปิงปอง" loading="lazy" onerror="this.parentElement.remove()"/><div class="tt-ball-badge"></div></div>`
  ).join('');

  wrap.innerHTML = single
    ? `<div class="tt-gallery-track tt-gallery-static"><div class="tt-gallery-track-inner">${itemsHtml}</div></div>`
    : `<div class="tt-gallery-track" style="--tt-gallery-duration:${duration}s"><div class="tt-gallery-track-inner">${itemsHtml}</div></div>`;
}

function updateFooterTimestamp() {
  const el = document.getElementById('tt-updated-at');
  if (!el) return;
  if (!ttBookings?.generated_at) { el.textContent = '—'; return; }
  try {
    const d = new Date(ttBookings.generated_at);
    el.textContent = d.toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    el.textContent = ttBookings.generated_at;
  }
}

// ===== BOOKING LOOKUP =====
function getBookingAt(ds, tableNo, hour) {
  const list = ttBookings?.bookings || [];
  return list.find(b => {
    if (b.date !== ds || Number(b.table_no) !== tableNo) return false;
    const startH = parseInt(b.start_time.split(':')[0], 10);
    const endH   = parseInt(b.end_time.split(':')[0],   10);
    return hour >= startH && hour < endH;
  }) || null;
}

function isBookingStart(booking, hour) {
  if (!booking) return false;
  return parseInt(booking.start_time.split(':')[0], 10) === hour;
}

function bookingSpan(booking) {
  const s = parseInt(booking.start_time.split(':')[0], 10);
  const e = parseInt(booking.end_time.split(':')[0],   10);
  return Math.max(1, e - s);
}

// ===== LIVE STATUS (โต๊ะว่างตอนนี้) =====
function updateLiveStatus() {
  const el = document.getElementById('tt-live-status');
  if (!el) return;
  const now = new Date();
  const hour = now.getHours();
  const ds = todayDS();

  if (hour < TT_OPEN_HOUR || hour >= TT_CLOSE_HOUR) {
    el.textContent = hour < TT_OPEN_HOUR
      ? `ปิดอยู่ — เปิดวันนี้ 15:00 น.`
      : `ปิดให้บริการวันนี้แล้ว — พบกันใหม่ 15:00 น. พรุ่งนี้`;
    return;
  }
  const freeCount = TT_TABLES.filter(t => !getBookingAt(ds, t, hour)).length;
  if (freeCount === 0) {
    el.textContent = `ตอนนี้โต๊ะเต็มทั้ง ${TT_TABLES.length} โต๊ะ`;
  } else {
    el.textContent = `ตอนนี้ว่าง ${freeCount}/${TT_TABLES.length} โต๊ะ`;
  }
}

// ===== RENDER SCHEDULE (day view — columns = tables) =====
function renderSchedule() {
  const wrap = document.getElementById('tt-schedule-wrap');
  if (!wrap) return;

  const day = ttDateFor(ttDayOffset);
  const ds = toDS(day);

  const label = document.getElementById('tt-day-label');
  if (label) label.textContent = formatThaiFullDate(day);

  let html = `<div class="tt-grid" style="grid-template-columns: 70px repeat(${TT_TABLES.length}, 1fr);">`;

  // Header row
  html += `<div class="tt-grid-header-corner">เวลา</div>`;
  TT_TABLES.forEach(t => {
    html += `<div class="tt-grid-table-head tt-table-${t}"><span class="tt-dot"></span>โต๊ะ ${t}</div>`;
  });

  // Hour rows
  TT_HOURS.forEach(hour => {
    const hourLabel = `${String(hour).padStart(2, '0')}:00`;
    html += `<div class="tt-grid-hour-label">${hourLabel}</div>`;

    TT_TABLES.forEach(t => {
      const booking = getBookingAt(ds, t, hour);

      if (booking && isBookingStart(booking, hour)) {
        const span = bookingSpan(booking);
        const name = booking.booker_name || 'จอง';
        html += `<div class="tt-grid-cell" style="position:relative;">
          <div class="tt-booking-block tt-table-${t}" style="position:absolute;inset:4px;z-index:2;height:calc(${span}00% + ${(span - 1) * 1}px - 8px);">
            <span class="tt-bk-name">${escHtml(name)}</span>
            <span class="tt-bk-time">${booking.start_time.slice(0, 5)}–${booking.end_time.slice(0, 5)}</span>
          </div>
        </div>`;
      } else if (booking && !isBookingStart(booking, hour)) {
        html += `<div class="tt-grid-cell-transparent"></div>`;
      } else {
        html += `<div class="tt-grid-cell"></div>`;
      }
    });
  });

  html += '</div>';
  wrap.innerHTML = html;

  if (ttDayOffset === 0) updateLiveStatus();
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== QR MODAL =====
function ttOpenQrModal() {
  const modal = document.getElementById('tt-qr-modal');
  if (modal) modal.style.display = 'flex';
}

function ttCloseQrModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('tt-qr-modal');
  if (modal) modal.style.display = 'none';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadTTData();
  loadTTGallery();
  loadTTPrice();
  // Refresh every 5 minutes
  setInterval(loadTTData, 5 * 60 * 1000);
  setInterval(loadTTGallery, 5 * 60 * 1000);
  setInterval(loadTTPrice, 5 * 60 * 1000);
  // Recheck live status every minute (in case the hour just rolled over)
  setInterval(updateLiveStatus, 60 * 1000);
});
