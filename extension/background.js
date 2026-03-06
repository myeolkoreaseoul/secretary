// Secretary Activity Tracker - Chrome Extension
// 브라우저 활성 탭의 URL과 제목을 자동으로 Supabase에 기록

const SUPABASE_URL = 'https://mwahabvsteokswykikgh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWhhYnZzdGVva3N3eWtpa2doIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ1NzU3NywiZXhwIjoyMDg0MDMzNTc3fQ.pBCF-KetM37gY7ODCFc2f-2_WXJyqWCdE6qG9EH-G2o';
const REST_URL = `${SUPABASE_URL}/rest/v1/activity_logs`;

let lastUrl = '';
let lastSentAt = 0;

async function logActivity(tab) {
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
    return;
  }

  const now = Date.now();
  // 같은 URL이고 20초 이내면 스킵 (중복 방지)
  if (tab.url === lastUrl && now - lastSentAt < 20000) {
    return;
  }

  lastUrl = tab.url;
  lastSentAt = now;

  try {
    await fetch(REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        window_title: (tab.title || 'Unknown').substring(0, 500),
        app_name: 'Chrome',
        url: tab.url.substring(0, 2000),
        source: 'extension'
      })
    });
  } catch (e) {
    // 네트워크 오류 무시 (다음 기회에 기록)
  }
}

// 탭 전환 시
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await logActivity(tab);
  } catch (e) {}
});

// 페이지 로드 완료 시
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await logActivity(tab);
  }
});

// 30초마다 현재 탭 기록 (같은 페이지에 머무는 경우)
chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'heartbeat') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await logActivity(tab);
    } catch (e) {}
  }
});

console.log('Secretary Tracker started');
