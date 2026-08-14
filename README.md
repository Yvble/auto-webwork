# WebWork AutoSolve 

This Chrome extension extracts the visible problem text and images, opens ChatGPT or Claude and gets the answer then inputs the answer into WebWork.

## Setup
1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open the extension popup and pick **ChatGPT** or **Claude** under AI Provider.
4. Click **Send to ChatGPT/Claude** on the page.

## Options 
- Click the extension icon to open options
- Choose which AI provider (ChatGPT or Claude) receives the question
- You can enable/disable auto submit
- See info 

## Behavior
- Detects problem text, options, and a single image.
- Opens the image in a new tab (once) if present.
- Prefills the selected AI's chat input; if an image is detected you must drag-drop it and then press Enter/Send.
- After you send, the image tab closes automatically.

