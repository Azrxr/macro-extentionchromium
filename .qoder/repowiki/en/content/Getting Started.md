# Getting Started

<cite>
**Referenced Files in This Document**
- [manifest.json](file://manifest.json)
- [README.md](file://README.md)
- [sidepanel.html](file://sidepanel.html)
- [js/background.js](file://js/background.js)
- [js/content.js](file://js/content.js)
- [js/sidepanel.js](file://js/sidepanel.js)
- [contoh_ext/manifest.json](file://contoh_ext/manifest.json)
- [contoh_ext/sample/index.html](file://contoh_ext/sample/index.html)
- [contoh_ext/guide.html](file://contoh_ext/guide.html)
- [contoh_ext/js/integrity.json](file://contoh_ext/js/integrity.json)
- [contoh_ext/sample_scenarios/General/Isi_Google_Form.json](file://contoh_ext/sample_scenarios/General/Isi_Google_Form.json)
- [contoh_ext/sample_scenarios/General/isi_form_dengan_loop_dataset.json](file://contoh_ext/sample_scenarios/General/isi_form_dengan_loop_dataset.json)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Initial Setup](#initial-setup)
5. [Permissions and Security](#permissions-and-security)
6. [Access the Side Panel](#access-the-side-panel)
7. [First-Time Configuration](#first-time-configuration)
8. [Load Sample Scenarios](#load-sample-scenarios)
9. [Run Your First Automation](#run-your-first-automation)
10. [Verification Checklist](#verification-checklist)
11. [Architecture Overview](#architecture-overview)
12. [Troubleshooting](#troubleshooting)
13. [Browser Compatibility](#browser-compatibility)
14. [Next Steps](#next-steps)

## Introduction
This guide helps you install and use the ExtentionAuto Chrome extension (also known as Magerin) for browser automation. You will learn how to:
- Install the extension from source
- Understand permissions and security model
- Access the side panel UI
- Load sample scenarios
- Run your first automation tasks
- Verify everything works correctly
- Troubleshoot common issues

## Prerequisites
- Google Chrome (or a Chromium-based browser) installed on your computer
- Basic familiarity with Chrome extensions and developer mode
- A target website or page to automate (for testing)

## Installation
Follow these steps to install the extension locally:

1. **Clone or download the repository**
   - Download the repository as a ZIP and extract it to a permanent location on your computer.

2. **Enable Developer Mode**
   - Open Chrome and navigate to chrome://extensions/.
   - Toggle Developer Mode to ON (top-right corner).

3. **Load the unpacked extension**
   - Click Load unpacked in the top-left area.
   - Select the extracted folder containing the extension files.

4. **Verify installation**
   - The extension icon should appear in the toolbar.
   - If prompted, confirm that you trust this developer extension.

**Section sources**
- [README.md:56-63](file://README.md#L56-L63)
- [manifest.json:1-45](file://manifest.json#L1-L45)

## Initial Setup
After loading the extension:

- Open the side panel by clicking the extension icon in the toolbar.
- The side panel defaults to the Automation tab.
- Review the status indicator at the top of the panel (should show IDLE).

Tip: Keep the side panel open during your first tests so you can see logs and status updates.

**Section sources**
- [sidepanel.html:30-34](file://sidepanel.html#L30-L34)
- [js/background.js:5-13](file://js/background.js#L5-L13)

## Permissions and Security
The extension requests the following permissions:
- storage: To save scenarios and CSV data locally
- tabs: To manage browser tabs
- scripting: To inject content scripts into pages
- sidePanel: To open the side panel
- activeTab: To interact with the currently active tab
- host_permissions: <all_urls> to work on any website

Security note:
- The extension runs entirely in your browser.
- No data leaves your machine unless you explicitly share scenarios or use external services.
- Integrity hashes for included files are provided for verification.

**Section sources**
- [manifest.json:6-15](file://manifest.json#L6-L15)
- [contoh_ext/js/integrity.json:1-36](file://contoh_ext/js/integrity.json#L1-L36)

## Access the Side Panel
There are two ways to open the side panel:

- Click the extension icon in the toolbar
- Use the keyboard shortcut Alt+Shift+M (if configured by your browser)

Once opened, you can:
- Toggle between tabs (Automation, CSV Manager, Scenarios)
- See live logs and status indicators
- Enable floating mode for quick access

**Section sources**
- [js/background.js:5-13](file://js/background.js#L5-L13)
- [sidepanel.html:52-56](file://sidepanel.html#L52-L56)

## First-Time Configuration
Complete these steps to prepare for automation:

1. **Set up CSV data (optional)**
   - Go to the CSV Manager tab.
   - Drag-and-drop or click to upload a .csv file.
   - Confirm the file appears in the Saved CSVs list.

2. **Configure loop settings**
   - In the Automation tab, choose Loop Mode:
     - Based on CSV rows
     - Static loop count
   - Adjust start/end rows or static count as needed.

3. **Prepare your first scenario**
   - Use the Record button to capture interactions on a live page.
   - Or add manual actions (Navigate, Scroll, Wait).
   - Edit selectors and values as needed.

4. **Save your scenario**
   - Go to the Scenarios tab.
   - Enter a name and save to local storage.

**Section sources**
- [sidepanel.html:86-114](file://sidepanel.html#L86-L114)
- [sidepanel.html:171-207](file://sidepanel.html#L171-L207)
- [sidepanel.html:209-226](file://sidepanel.html#L209-L226)

## Load Sample Scenarios
The repository includes sample scenarios you can load and run immediately:

- Navigate to the Scenarios tab in the side panel.
- Click “Load” next to a scenario in the list.
- Review the steps and parameters.
- Optionally edit steps before running.

Examples you can explore:
- Filling a Google Form
- Looping through a dataset to fill multiple forms

**Section sources**
- [contoh_ext/sample_scenarios/General/Isi_Google_Form.json:1-56](file://contoh_ext/sample_scenarios/General/Isi_Google_Form.json#L1-L56)
- [contoh_ext/sample_scenarios/General/isi_form_dengan_loop_dataset.json:1-23](file://contoh_ext/sample_scenarios/General/isi_form_dengan_loop_dataset.json#L1-L23)

## Run Your First Automation
Follow this process to execute an automation:

1. **Open the target page**
   - Navigate to the website/page you want to automate.

2. **Start the automation**
   - In the side panel, Automation tab:
     - Click Run Scenario.
     - Observe the status change to PLAYING.
     - Watch the logs for progress.

3. **Handle errors**
   - If an element is missing, the engine pauses and shows an error modal.
   - Choose Resume to skip or Stop to cancel.

4. **Review results**
   - After completion, the status returns to IDLE.
   - Check logs for any warnings or messages.

**Section sources**
- [js/background.js:342-359](file://js/background.js#L342-L359)
- [js/background.js:478-527](file://js/background.js#L478-L527)
- [js/background.js:532-567](file://js/background.js#L532-L567)
- [sidepanel.html:159-168](file://sidepanel.html#L159-L168)

## Verification Checklist
After installation and first run, verify the following:

- [ ] Extension icon appears in the toolbar
- [ ] Side panel opens and shows IDLE status
- [ ] CSV upload completes and appears in Saved CSVs
- [ ] Scenario loads and displays steps
- [ ] Automation runs without critical errors
- [ ] Logs show meaningful progress messages

If any step fails, refer to the Troubleshooting section below.

## Architecture Overview
The extension consists of three main parts:

- Background service worker: Manages state, orchestrates automation, and handles messaging between UI and content scripts.
- Content script: Injected into web pages to record interactions and execute actions.
- Side panel UI: Provides controls, logging, CSV management, and scenario storage.

```mermaid
graph TB
subgraph "Chrome Extension"
BG["Background Service Worker<br/>js/background.js"]
CS["Content Script<br/>js/content.js"]
SP["Side Panel UI<br/>sidepanel.html + js/sidepanel.js"]
end
subgraph "Web Page"
DOM["Target Web Page"]
end
SP --> BG
BG <- --> CS
CS --> DOM
BG --> DOM
```

**Diagram sources**
- [js/background.js:1-711](file://js/background.js#L1-L711)
- [js/content.js:1-442](file://js/content.js#L1-L442)
- [sidepanel.html:1-255](file://sidepanel.html#L1-L255)

## Troubleshooting
Common issues and fixes:

- Side panel does not open
  - Ensure Developer Mode is enabled.
  - Try reloading the extension from chrome://extensions/.
  - Use the action icon again; if needed, toggle Developer Mode off/on.

- Cannot record actions
  - Make sure you are on a supported page.
  - Confirm the content script is injected (check logs).
  - Avoid protected pages (chrome://, about:, etc.).

- Automation stops unexpectedly
  - An error modal may appear; choose Resume or Stop.
  - Check that selectors still match the page.
  - Add delays or wait steps for dynamic content.

- CSV not recognized
  - Ensure the file is .csv and has headers.
  - Re-upload after editing the file externally.

- Floating mode not working
  - Some pages restrict overlays; try disabling floating mode.
  - Use the side panel directly on the page.

**Section sources**
- [js/background.js:532-567](file://js/background.js#L532-L567)
- [js/content.js:78-107](file://js/content.js#L78-L107)
- [sidepanel.html:229-250](file://sidepanel.html#L229-L250)

## Browser Compatibility
- Supported browsers: Chrome (stable), Edge (Chromium), Brave, Opera, Vivaldi
- Not supported: Firefox (due to side panel API limitations), Safari

Note: The extension uses Manifest V3 and side panel APIs, which require Chromium-based browsers.

**Section sources**
- [contoh_ext/sample/index.html:518-520](file://contoh_ext/sample/index.html#L518-L520)

## Next Steps
- Practice recording and editing scenarios
- Explore advanced features like loops, conditions, and CSV mapping
- Build reusable scenarios for repetitive tasks
- Share scenarios safely using the built-in storage

For additional examples and guidance, review the sample scenarios and the included demo page.

**Section sources**
- [contoh_ext/sample_scenarios/General/Isi_Google_Form.json:1-56](file://contoh_ext/sample_scenarios/General/Isi_Google_Form.json#L1-L56)
- [contoh_ext/sample/index.html:501-538](file://contoh_ext/sample/index.html#L501-L538)