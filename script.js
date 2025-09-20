
// Global variables
let prayerTimes = {};
let currentLocation = { lat: 23.8103, lon: 90.4125 }; // Default: Dhaka
let missedPrayers = {};
let completedPrayers = {};
let deferredPrompt;
let islamicDate = ''; // Cache Islamic date to prevent constant changes

// Load data from memory (instead of localStorage)
try {
    const storedMissed = window.memoryStorage?.missedPrayers;
    const storedCompleted = window.memoryStorage?.completedPrayers;
    if (storedMissed) missedPrayers = storedMissed;
    if (storedCompleted) completedPrayers = storedCompleted;
} catch (error) {
    console.log('Memory storage not available, using fresh data');
}

// Memory storage fallback
if (!window.memoryStorage) {
    window.memoryStorage = {};
}

// Prayer names with Arabic
const prayerNames = {
    Fajr: { arabic: 'الفجر', icon: '🌅' },
    Dhuhr: { arabic: 'الظهر', icon: '☀️' },
    Asr: { arabic: 'العصر', icon: '🌤️' },
    Maghrib: { arabic: 'المغرب', icon: '🌇' },
    Isha: { arabic: 'العشاء', icon: '🌙' }
};

// Initialize app
async function init() {
    updateDateTime();
    setInterval(updateDateTime, 1000);

    await getLocation();
    await fetchPrayerTimes();

    // Check and reset daily
    checkDailyReset();

    // Update prayer times every minute
    setInterval(() => {
        updatePrayerStatus();
        checkForMissedPrayers();
    }, 60000);

    // Setup PWA
    setupPWA();
}

// Get user location
async function getLocation() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    currentLocation.lat = position.coords.latitude;
                    currentLocation.lon = position.coords.longitude;
                    updateLocationDisplay();
                    resolve();
                },
                (error) => {
                    console.log('Using default location');
                    updateLocationDisplay();
                    resolve();
                }
            );
        } else {
            updateLocationDisplay();
            resolve();
        }
    });
}

// Update location display
async function updateLocationDisplay() {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${currentLocation.lat}&lon=${currentLocation.lon}&format=json`);
        const data = await response.json();
        const city = data.address.city || data.address.town || data.address.village || 'Unknown';
        const country = data.address.country || '';
        document.getElementById('location').textContent = `${city}, ${country}`;
    } catch (error) {
        document.getElementById('location').textContent = 'Dhaka, Bangladesh';
    }
}

// Fetch prayer times using Aladhan API
async function fetchPrayerTimes() {
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

    try {
        // Using method=2 (University of Islamic Sciences, Karachi) with school=1 (Hanafi)
        const response = await fetch(
            `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${currentLocation.lat}&longitude=${currentLocation.lon}&method=2&school=1`
        );
        const data = await response.json();

        if (data.code === 200) {
            prayerTimes = {
                Fajr: data.data.timings.Fajr,
                Sunrise: data.data.timings.Sunrise,
                Dhuhr: data.data.timings.Dhuhr,
                Asr: data.data.timings.Asr,
                Maghrib: data.data.timings.Maghrib,
                Isha: data.data.timings.Isha
            };

            // Handle Jummah (Friday)
            if (today.getDay() === 5) {
                prayerTimes.Jummah = prayerTimes.Dhuhr;
            }

            // Cache Islamic date from API to prevent constant changes
            if (data.data.date.hijri) {
                islamicDate = `${data.data.date.hijri.day} ${data.data.date.hijri.month.en} ${data.data.date.hijri.year} AH`;
            }

            displayPrayerTimes();
            updatePrayerStatus();
            checkForMissedPrayers();
        }
    } catch (error) {
        console.error('Error fetching prayer times:', error);
        // Use default times as fallback
        useDefaultPrayerTimes();
    }
}

// Fallback prayer times
function useDefaultPrayerTimes() {
    const today = new Date();
    prayerTimes = {
        Fajr: '05:00',
        Sunrise: '06:15',
        Dhuhr: '12:15',
        Asr: '15:45',
        Maghrib: '18:00',
        Isha: '19:30'
    };

    if (today.getDay() === 5) {
        prayerTimes.Jummah = prayerTimes.Dhuhr;
    }

    displayPrayerTimes();
    updatePrayerStatus();
}

// Display prayer times
function displayPrayerTimes() {
    const container = document.getElementById('prayersList');
    const today = new Date();
    const todayKey = getTodayKey();
    const isFriday = today.getDay() === 5;

    let html = '';

    const prayers = isFriday ?
        ['Fajr', 'Jummah', 'Asr', 'Maghrib', 'Isha'] :
        ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    prayers.forEach(prayer => {
        const displayName = prayer === 'Jummah' ? 'Jummah' : prayer;
        const prayerData = prayer === 'Jummah' ?
            { arabic: 'الجمعة', icon: '🕌' } :
            prayerNames[prayer];

        const time = prayerTimes[prayer];
        const endTime = getEndTime(prayer);
        const isCompleted = completedPrayers[todayKey] && completedPrayers[todayKey][prayer];

        html += `
                    <div class="prayer-card ${isCompleted ? 'completed' : ''}" id="prayer-${prayer}">
                        <div class="prayer-header">
                            <div class="prayer-name">
                                <div class="prayer-icon">${prayerData.icon}</div>
                                <span>${displayName}</span>
                            </div>
                            <div class="prayer-time">${formatTime(time)}</div>
                        </div>
                        <div class="prayer-details">
                            <span>Start: ${formatTime(time)} | End: ${formatTime(endTime)}</span>
                            <span>${prayerData.arabic}</span>
                        </div>
                        <div class="prayer-checkbox">
                            <input type="checkbox" id="check-${prayer}" 
                                ${isCompleted ? 'checked' : ''} 
                                onchange="togglePrayer('${prayer}')">
                            <label for="check-${prayer}">
                                ${prayer === 'Jummah' ? 'Attended Jummah Prayer' : 'Mark as Prayed'}
                            </label>
                        </div>
                    </div>
                `;
    });

    container.innerHTML = html;
    updateStats();
}

// Get end time for prayer
function getEndTime(prayer) {
    const prayers = Object.keys(prayerTimes);
    const index = prayers.indexOf(prayer === 'Jummah' ? 'Dhuhr' : prayer);

    if (prayer === 'Fajr') {
        return prayerTimes.Sunrise;
    } else if (index < prayers.length - 1) {
        return prayerTimes[prayers[index + 1]];
    } else {
        // Isha ends at midnight
        return '23:59';
    }
}

// Update prayer status (active/forbidden)
function updatePrayerStatus() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isFriday = now.getDay() === 5;

    // Check forbidden times
    const isForbidden = isInForbiddenTime(currentTime);
    document.getElementById('forbiddenBanner').classList.toggle('show', isForbidden);

    // Update active prayer
    const prayers = isFriday ?
        ['Fajr', 'Jummah', 'Asr', 'Maghrib', 'Isha'] :
        ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    prayers.forEach(prayer => {
        const card = document.getElementById(`prayer-${prayer}`);
        if (card) {
            const prayerTime = prayerTimes[prayer === 'Jummah' ? 'Dhuhr' : prayer];
            const endTime = getEndTime(prayer);

            card.classList.remove('active', 'forbidden');

            if (isTimeInRange(currentTime, prayerTime, endTime)) {
                if (!isForbidden) {
                    card.classList.add('active');
                }
            }

            if (isForbidden && isTimeInRange(currentTime, prayerTime, endTime)) {
                card.classList.add('forbidden');
            }
        }
    });

    // Update next prayer
    updateNextPrayer();
}

// Check if current time is in forbidden time
function isInForbiddenTime(currentTime) {
    // Simplified forbidden times check
    const sunrise = addMinutes(prayerTimes.Fajr, 90);
    const sunriseEnd = prayerTimes.Sunrise;
    const zenith = subtractMinutes(prayerTimes.Dhuhr, 10);
    const zenithEnd = prayerTimes.Dhuhr;
    const sunset = subtractMinutes(prayerTimes.Maghrib, 15);
    const sunsetEnd = prayerTimes.Maghrib;

    return isTimeInRange(currentTime, sunrise, sunriseEnd) ||
        isTimeInRange(currentTime, zenith, zenithEnd) ||
        isTimeInRange(currentTime, sunset, sunsetEnd);
}

// Update next prayer display
function updateNextPrayer() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isFriday = now.getDay() === 5;

    const prayers = isFriday ?
        ['Fajr', 'Jummah', 'Asr', 'Maghrib', 'Isha'] :
        ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    let nextPrayer = null;
    let nextTime = null;

    for (let prayer of prayers) {
        const prayerTime = prayerTimes[prayer === 'Jummah' ? 'Dhuhr' : prayer];
        if (currentTime < prayerTime) {
            nextPrayer = prayer;
            nextTime = prayerTime;
            break;
        }
    }

    if (!nextPrayer) {
        nextPrayer = 'Fajr';
        nextTime = prayerTimes.Fajr;
        document.getElementById('nextPrayer').textContent = `Next: ${nextPrayer} (Tomorrow) at ${formatTime(nextTime)}`;
    } else {
        const timeDiff = getTimeDifference(currentTime, nextTime);
        document.getElementById('nextPrayer').textContent = `Next: ${nextPrayer} in ${timeDiff} at ${formatTime(nextTime)}`;
    }
}

// Toggle prayer completion
function togglePrayer(prayer) {
    const todayKey = getTodayKey();
    const checkbox = document.getElementById(`check-${prayer}`);

    if (!completedPrayers[todayKey]) {
        completedPrayers[todayKey] = {};
    }

    if (checkbox.checked) {
        completedPrayers[todayKey][prayer] = true;
        // Remove from missed if it was there
        if (missedPrayers[todayKey] && missedPrayers[todayKey][prayer]) {
            delete missedPrayers[todayKey][prayer];
            if (Object.keys(missedPrayers[todayKey]).length === 0) {
                delete missedPrayers[todayKey];
            }
        }
        document.getElementById(`prayer-${prayer}`).classList.add('completed');
    } else {
        delete completedPrayers[todayKey][prayer];
        if (Object.keys(completedPrayers[todayKey]).length === 0) {
            delete completedPrayers[todayKey];
        }
        document.getElementById(`prayer-${prayer}`).classList.remove('completed');

        // Check if this prayer should be marked as missed
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const endTime = getEndTime(prayer);

        // If current time is past the prayer end time, mark as missed
        if (currentTime > endTime) {
            if (!missedPrayers[todayKey]) {
                missedPrayers[todayKey] = {};
            }
            missedPrayers[todayKey][prayer] = {
                date: todayKey,
                time: prayerTimes[prayer === 'Jummah' ? 'Dhuhr' : prayer]
            };
        }
    }

    // Store in memory
    window.memoryStorage.completedPrayers = completedPrayers;
    window.memoryStorage.missedPrayers = missedPrayers;

    updateStats();
    displayMissedPrayers();
}

// Check for missed prayers
function checkForMissedPrayers() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayKey = getTodayKey();
    const isFriday = now.getDay() === 5;

    const prayers = isFriday ?
        ['Fajr', 'Jummah', 'Asr', 'Maghrib', 'Isha'] :
        ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    prayers.forEach(prayer => {
        const endTime = getEndTime(prayer);

        if (currentTime > endTime) {
            // Prayer time has passed
            if (!completedPrayers[todayKey] || !completedPrayers[todayKey][prayer]) {
                // Prayer was not completed
                if (!missedPrayers[todayKey]) {
                    missedPrayers[todayKey] = {};
                }

                if (!missedPrayers[todayKey][prayer]) {
                    missedPrayers[todayKey][prayer] = {
                        date: todayKey,
                        time: prayerTimes[prayer === 'Jummah' ? 'Dhuhr' : prayer]
                    };
                    window.memoryStorage.missedPrayers = missedPrayers;
                }
            }
        }
    });

    displayMissedPrayers();
}

// Display missed prayers summary
function displayMissedPrayers() {
    const missedCounts = {};
    let totalMissed = 0;

    // Count missed prayers by type from ALL dates
    Object.keys(missedPrayers).forEach(dateKey => {
        Object.keys(missedPrayers[dateKey]).forEach(prayer => {
            if (!missedCounts[prayer]) {
                missedCounts[prayer] = 0;
            }
            missedCounts[prayer]++;
            totalMissed++;
        });
    });

    const missedSection = document.getElementById('missedSection');
    const missedGrid = document.getElementById('missedPrayersGrid');

    if (totalMissed === 0) {
        missedSection.style.display = 'none';
        return;
    }

    missedSection.style.display = 'block';

    let html = '';
    Object.keys(missedCounts).forEach(prayer => {
        html += `
                    <div class="missed-prayer-item">
                        <div class="missed-prayer-name">${prayer}</div>
                        <div class="missed-count">${missedCounts[prayer]}</div>
                    </div>
                `;
    });

    missedGrid.innerHTML = html;
}

// Update statistics
function updateStats() {
    const todayKey = getTodayKey();
    const today = new Date();
    const isFriday = today.getDay() === 5;

    const prayers = isFriday ?
        ['Fajr', 'Jummah', 'Asr', 'Maghrib', 'Isha'] :
        ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    let completed = 0;
    if (completedPrayers[todayKey]) {
        prayers.forEach(prayer => {
            if (completedPrayers[todayKey][prayer]) {
                completed++;
            }
        });
    }

    document.getElementById('completedCount').textContent = completed;
    document.getElementById('remainingCount').textContent = 5 - completed;
}

// Check and perform daily reset
function checkDailyReset() {
    const lastReset = window.memoryStorage.lastReset;
    const today = new Date().toDateString();

    if (lastReset !== today) {
        // It's a new day, but don't delete old data
        window.memoryStorage.lastReset = today;

        // Clean up old data (keep only last 30 days)
        cleanOldData();
    }
}

// Clean up old data
function cleanOldData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Clean missed prayers
    Object.keys(missedPrayers).forEach(dateKey => {
        const [day, month, year] = dateKey.split('-');
        const date = new Date(year, month - 1, day);
        if (date < thirtyDaysAgo) {
            delete missedPrayers[dateKey];
        }
    });

    // Clean completed prayers
    Object.keys(completedPrayers).forEach(dateKey => {
        const [day, month, year] = dateKey.split('-');
        const date = new Date(year, month - 1, day);
        if (date < thirtyDaysAgo) {
            delete completedPrayers[dateKey];
        }
    });

    window.memoryStorage.completedPrayers = completedPrayers;
    window.memoryStorage.missedPrayers = missedPrayers;
}

// Utility Functions
function getTodayKey() {
    const today = new Date();
    return `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
}

function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function isTimeInRange(current, start, end) {
    return current >= start && current <= end;
}

function addMinutes(time, minutes) {
    const [h, m] = time.split(':').map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function subtractMinutes(time, minutes) {
    return addMinutes(time, -minutes);
}

function getTimeDifference(from, to) {
    const [fromH, fromM] = from.split(':').map(Number);
    const [toH, toM] = to.split(':').map(Number);

    let diffMinutes = (toH * 60 + toM) - (fromH * 60 + fromM);

    if (diffMinutes < 0) {
        diffMinutes += 24 * 60; // Add 24 hours if negative
    }

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// Update date and time
function updateDateTime() {
    const now = new Date();

    // Update current time
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    document.getElementById('currentTime').textContent = timeStr;

    // Update date
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    const dateStr = now.toLocaleDateString('en-US', options);

    // Use cached Islamic date or fallback
    const islamicDateStr = islamicDate || getApproximateIslamicDate(now);
    document.getElementById('dateInfo').innerHTML =
        `${dateStr}<br><small style="opacity: 0.9">${islamicDateStr}</small>`;
}

// Get approximate Islamic date (fallback when API doesn't provide it)
function getApproximateIslamicDate(date) {
    const islamicMonths = [
        'Muharram', 'Safar', 'Rabi\' al-Awwal', 'Rabi\' al-Thani',
        'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Sha\'ban',
        'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'
    ];

    // Very simplified calculation for fallback (not accurate)
    const islamicYear = 1446; // Current approximate year
    const monthIndex = Math.floor(Math.random() * 12); // Random for demo
    const day = Math.floor(Math.random() * 28) + 1;

    return `${day} ${islamicMonths[monthIndex]} ${islamicYear} AH`;
}

// PWA Installation
function setupPWA() {
    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('installPrompt').style.display = 'block';
    });
}

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
            document.getElementById('installPrompt').style.display = 'none';
        });
    }
}

function dismissInstall() {
    document.getElementById('installPrompt').style.display = 'none';
}

// Start the app
window.addEventListener('DOMContentLoaded', init);
