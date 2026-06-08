const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 }); // Mobile size

  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  console.log('Opening page...');
  await page.goto('http://localhost:8000/index.html');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/01_welcome.png' });
  console.log('Saved welcome screen');

  // Click Start
  await page.click('#btn-welcome-start');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/02_auth.png' });
  console.log('Saved auth screen');

  // Mock a login by setting localStorage
  await page.evaluate(() => {
    const mockUser = {
      id: "100123456",
      username: "TestUser",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Test",
      gold: 1000,
      lv: 1,
      vip: 0
    };
    localStorage.setItem('smo_user', JSON.stringify(mockUser));
    location.reload();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/03_home.png' });
  console.log('Saved home tab');

  // Navigate to Rooms
  await page.click('.nav-item[data-tab="rooms"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/04_rooms.png' });
  console.log('Saved rooms tab');

  // Navigate to Social
  await page.click('.nav-item[data-tab="social"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/05_social.png' });
  console.log('Saved social tab');

  // Navigate to Profile
  await page.click('.nav-item[data-tab="profile"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/06_profile.png' });
  console.log('Saved profile tab');

  // Open Room
  await page.click('.nav-item[data-tab="rooms"]');
  await page.waitForTimeout(500);
  await page.click('.room-card');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/07_room_layer.png' });
  console.log('Saved room layer');

  await browser.close();
})();
