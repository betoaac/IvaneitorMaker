const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/browser', timeout: 45000, workers: 1,
    use: { baseURL: 'http://localhost:4173', channel: process.env.CI ? undefined : 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'npm start', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }
});
