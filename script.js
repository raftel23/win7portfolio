const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxuNDoPcHgz3jltRSGoHtcBZbAmHZdjKl5Z90bskUNI2yqrZxgU25kjWX2sVYzyOAwIMw/exec";

// rate-limit cooldown duration set to 3 minutes (180000 milliseconds)
const COOLDOWN_DURATION = 180000;

// Window management state
const openWindows = {};
let windowZIndex = 100;

// Chime audio configuration
const startupChime = new Audio('assets/startup.mp3');
let chimePlayed = false;

// Play chime on the very first click/tap interaction
function playStartupChimeOnce() {
  if (chimePlayed) return;
  chimePlayed = true;
  startupChime.volume = 0.45;
  startupChime.play().catch(err => {
    console.log("Audio autoplay restricted by browser policies:", err);
  });
  document.removeEventListener('click', playStartupChimeOnce);
}
document.addEventListener('click', playStartupChimeOnce);

// Start clock and open About Me window on load
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  
  // Instantly pop open the 'About Me' Notepad frame on startup
  openWindow('about');
});

// SYSTEM TIME ENGINE
function updateClock() {
  const clockEl = document.getElementById('tray-time-clock');
  const dateEl = document.getElementById('tray-time-date');
  if (!clockEl || !dateEl) return;

  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  clockEl.innerText = `${hours}:${minutes} ${ampm}`;
  dateEl.innerText = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

// WINDOW STATE ACTIONS
function openWindow(id) {
  const win = document.getElementById('win-' + id);
  if (!win) return;

  // Toggle display and record states
  win.style.display = 'flex';
  win.classList.remove('minimized');
  openWindows[id] = win;

  // Fetch title and details to add to taskbar
  const titlebarText = win.querySelector('.aero-title-text');
  const title = titlebarText ? titlebarText.innerText : id;
  const icon = win.querySelector('.aero-title-icon') ? win.querySelector('.aero-title-icon').innerText : '📄';

  addTaskbarItem(id, title, icon);
  focusWindow(id);
}

function focusWindow(id) {
  const win = openWindows[id];
  if (!win) return;

  // Elevate Z-Index
  windowZIndex++;
  win.style.zIndex = windowZIndex;

  // Set active classes
  document.querySelectorAll('.aero-window').forEach(el => el.classList.remove('active'));
  win.classList.add('active');

  // Highlight taskbar button
  document.querySelectorAll('.taskbar-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector(`.taskbar-btn[data-window-id="${id}"]`);
  if (btn) btn.classList.add('active');
}

function closeWindow(event, id) {
  if (event) event.stopPropagation();
  const win = openWindows[id];
  if (!win) return;

  win.style.display = 'none';
  delete openWindows[id];
  removeTaskbarItem(id);
}

function minimizeWindow(event, id) {
  if (event) event.stopPropagation();
  const win = openWindows[id];
  if (!win) return;

  win.style.display = 'none';
  win.classList.add('minimized');
  
  // Revert active states
  win.classList.remove('active');
  const btn = document.querySelector(`.taskbar-btn[data-window-id="${id}"]`);
  if (btn) btn.classList.remove('active');
}

function toggleMaximize(event, id) {
  if (event) event.stopPropagation();
  const win = openWindows[id];
  if (!win) return;

  if (win.classList.contains('maximized')) {
    win.classList.remove('maximized');
    // Restore styling
    win.style.width = id === 'about' ? '580px' : id === 'skills' ? '620px' : '540px';
    win.style.height = id === 'about' ? '420px' : id === 'skills' ? '440px' : '420px';
  } else {
    win.classList.add('maximized');
    win.style.width = '';
    win.style.height = '';
  }
}

function toggleWindowFromTaskbar(id) {
  const win = document.getElementById('win-' + id);
  if (!win) return;

  if (win.style.display === 'none' || win.classList.contains('minimized')) {
    win.style.display = 'flex';
    win.classList.remove('minimized');
    focusWindow(id);
  } else {
    if (win.classList.contains('active')) {
      minimizeWindow(null, id);
    } else {
      focusWindow(id);
    }
  }
}

function minimizeAllWindows() {
  Object.keys(openWindows).forEach(id => {
    minimizeWindow(null, id);
  });
}

// TASKBAR CONTROLS
const taskbarItemsContainer = document.getElementById('taskbar-items-container');

function addTaskbarItem(id, title, icon) {
  if (document.querySelector(`.taskbar-btn[data-window-id="${id}"]`)) return;

  const btn = document.createElement('div');
  btn.className = 'taskbar-btn active';
  btn.setAttribute('data-window-id', id);
  btn.onclick = () => toggleWindowFromTaskbar(id);
  btn.innerHTML = `
    <span class="tb-icon">${icon}</span>
    <span class="tb-title">${title.split(' - ')[0]}</span>
  `;
  taskbarItemsContainer.appendChild(btn);
}

function removeTaskbarItem(id) {
  const btn = document.querySelector(`.taskbar-btn[data-window-id="${id}"]`);
  if (btn) btn.remove();
}

// TITLEBAR DRAGGING PIPELINE
let currentDragEl = null;
let startX = 0, startY = 0;
let startLeft = 0, startTop = 0;

function startDrag(e, id) {
  // Drag only with primary mouse click and non-maximized states
  if (e.button !== 0) return;
  const win = document.getElementById('win-' + id);
  if (!win || win.classList.contains('maximized')) return;

  currentDragEl = win;
  startX = e.clientX;
  startY = e.clientY;
  startLeft = parseInt(win.style.left) || 100;
  startTop = parseInt(win.style.top) || 80;

  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);

  focusWindow(id);
  e.preventDefault();
}

function dragMove(e) {
  if (!currentDragEl) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  let newLeft = startLeft + dx;
  let newTop = startTop + dy;

  // Keep window draggable header titlebar visible inside boundary
  if (newTop < 0) newTop = 0;
  if (newTop > window.innerHeight - 40) newTop = window.innerHeight - 40;

  currentDragEl.style.left = `${newLeft}px`;
  currentDragEl.style.top = `${newTop}px`;
}

function dragEnd() {
  currentDragEl = null;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
}

// START MENU ACTION
function toggleStartMenu(event) {
  if (event) event.stopPropagation();
  const startMenu = document.getElementById('start-menu');
  const startBtn = document.getElementById('start-button');
  if (!startMenu) return;

  if (startMenu.style.display === 'flex') {
    startMenu.style.display = 'none';
    startBtn.classList.remove('open');
  } else {
    startMenu.style.display = 'flex';
    startBtn.classList.add('open');
  }
}

// CONTEXT MENU (RIGHT CLICK OVERRIDE)
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();

  // Close Start Menu immediately
  const startMenu = document.getElementById('start-menu');
  const startBtn = document.getElementById('start-button');
  if (startMenu && startMenu.style.display === 'flex') {
    startMenu.style.display = 'none';
    startBtn.classList.remove('open');
  }

  const ctxMenu = document.getElementById('context-menu');
  if (ctxMenu) {
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = `${e.clientX}px`;
    ctxMenu.style.top = `${e.clientY}px`;
  }
});

// Dismiss context menu & start menu on standard clicks
document.addEventListener('click', (e) => {
  const ctxMenu = document.getElementById('context-menu');
  if (ctxMenu && !ctxMenu.contains(e.target)) {
    ctxMenu.style.display = 'none';
  }

  const startMenu = document.getElementById('start-menu');
  const startBtn = document.getElementById('start-button');
  if (startMenu && startMenu.style.display === 'flex' && !startMenu.contains(e.target) && !startBtn.contains(e.target)) {
    startMenu.style.display = 'none';
    startBtn.classList.remove('open');
  }
});

// CONTEXT MENU CLICK ACTION UTILITIES
function handleCtxAction(action) {
  const ctxMenu = document.getElementById('context-menu');
  if (ctxMenu) ctxMenu.style.display = 'none';

  if (action === 'refresh') {
    const desktop = document.getElementById('desktop');
    if (desktop) {
      desktop.classList.remove('win7-refresh-flicker');
      void desktop.offsetWidth; // Force redraw reflow
      desktop.classList.add('win7-refresh-flicker');
      
      // Remove class after animation concludes
      setTimeout(() => {
        desktop.classList.remove('win7-refresh-flicker');
      }, 150);
    }
  }
}

// FORM WEBHOOK SUBMISSION ENGINE (WITH SPAM MITIGATION & VALIDATIONS)
document.addEventListener('submit', (e) => {
  if (e.target && e.target.id === 'email-form') {
    e.preventDefault();

    // 1. PERSISTENT COOLDOWN RATE LIMITER
    const lastSubmission = localStorage.getItem('last_submission_time');
    const now = Date.now();
    if (lastSubmission) {
      const elapsed = now - parseInt(lastSubmission, 10);
      if (elapsed < COOLDOWN_DURATION) {
        const remaining = COOLDOWN_DURATION - elapsed;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        showSystemMessage('System Error', `Security Warning: Flood protection active. Please wait ${minutes} minutes and ${seconds} seconds before submitting another transmission.`, true);
        return;
      }
    }

    // 2. COMPREHENSIVE CLIENT-SIDE VALIDATION
    // Trim values
    const nameVal = document.getElementById('mail-name').value.trim();
    const emailVal = document.getElementById('mail-sender').value.trim();
    const subjectVal = document.getElementById('mail-subject').value.trim();
    const messageVal = document.getElementById('mail-message').value.trim();

    // Presence checks
    if (nameVal === "" || emailVal === "" || subjectVal === "") {
      showSystemMessage('System Error', 'System Error: All header entry fields are mandatory.', true);
      return;
    }

    // Regex Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal)) {
      showSystemMessage('System Error', 'System Error: The email address configuration provided is structurally invalid.', true);
      return;
    }

    // Message Body Size checks
    if (messageVal.length === 0 || messageVal.length > 500) {
      showSystemMessage('System Error', 'System Error: Message size restrictions violated. Content body must be between 1 and 500 characters max.', true);
      return;
    }

    // 3. TRANSMISSION PIPELINE LOGIC
    // Set wait loading cursors
    document.body.style.cursor = 'wait';
    document.body.classList.add('waiting');

    // Gather payload
    const payload = {
      name: nameVal,
      email: emailVal,
      subject: subjectVal,
      message: messageVal,
      timestamp: new Date().toISOString(),
      tags: "win7-portfolio"
    };

    // Native fetch post transmission
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(result => {
      // Restore mouse pointer state
      document.body.style.cursor = 'default';
      document.body.classList.remove('waiting');

      if (result && result.status === 'success') {
        // Clear all form inputs
        e.target.reset();

        // Save last submission timestamp
        localStorage.setItem('last_submission_time', Date.now().toString());

        // Display success confirmation dialog
        showSystemMessage('Windows Mail', 'Your message has been sent successfully.', false);
      } else {
        const errorMsg = result && result.message ? result.message : 'Unknown Webhook Error';
        showSystemMessage('System Error', `Failed to deliver message: ${errorMsg}`, true);
      }
    })
    .catch(error => {
      // Restore default pointer
      document.body.style.cursor = 'default';
      document.body.classList.remove('waiting');

      // Pipe error directly to System Error dialog
      const errorMsg = error && error.message ? error.message : String(error);
      showSystemMessage('System Error', `Failed to deliver message: ${errorMsg}`, true);
    });
  }
});

// SYSTEM MESSAGE MODALS OVERLAYS
function showSystemMessage(title, message, isError = true) {
  const overlay = document.getElementById('win-error-overlay');
  const titleText = document.getElementById('error-dialog-title-text');
  const titleIcon = document.getElementById('error-dialog-title-icon');
  const bodyIcon = document.getElementById('error-dialog-body-icon');
  const msgText = document.getElementById('error-message-text');
  const dialog = document.getElementById('win-error-dialog');

  if (!overlay) return;

  if (msgText) msgText.innerText = message;
  if (titleText) titleText.innerText = title;

  if (isError) {
    if (titleIcon) titleIcon.innerText = "❌";
    if (bodyIcon) {
      bodyIcon.src = "assets/error-icon.png";
      bodyIcon.onerror = () => { bodyIcon.src = 'https://img.icons8.com/color/48/000000/cancel--v1.png'; };
    }
    if (dialog) dialog.style.borderColor = "#c00"; // Red boundary error highlight
  } else {
    if (titleIcon) titleIcon.innerText = "✅";
    if (bodyIcon) {
      bodyIcon.src = "https://img.icons8.com/color/48/000000/checked-checkbox.png";
      bodyIcon.onerror = () => { bodyIcon.src = 'https://img.icons8.com/color/48/000000/ok--v1.png'; };
    }
    if (dialog) dialog.style.borderColor = "#00a2e8"; // Normal blue boundary highlight
  }

  overlay.style.display = 'flex';
  
  // Place active z-index prioritized top of screen
  windowZIndex++;
  dialog.style.zIndex = windowZIndex;
}

function showSystemError(message) {
  showSystemMessage('System Error', message, true);
}

function dismissSystemError() {
  const overlay = document.getElementById('win-error-overlay');
  if (overlay) overlay.style.display = 'none';
}
