# Plugin 

## General overview of contents 

### Manifest file 
- `manifest.json`- Main file of the chrome extension in manifest version 3 that defines the extensions metadata, permissons and the behaviour. Please refer to [Manifest Documentation](https://developer.chrome.com/docs/extensions/reference/manifest) for further details about the stucture and contents. 
    - injects scripts (Readibility.js, options.js etc.) and styles into webpages
    - requests permissions (i.e. read, store, ...)
    - runs the background service_worker.js
    - provides the UI (references to .html files)

### Background Scripts
Service workers that act as the control system for the plugin. Its main functionalities are the following. 
- `sw` folder
    - `api.js`: Unified API helpers - message handling
    - `articles.js`: Article parsing and posting helpers 
    - `chat.js`: Chat handlers and helpers
    - `content.js`: Content actions helpers (one-way messages to the active tab)
    - `storage.js`: Storage utilities for MV3 service worker
    - `summarize.js`: Summarize routing and server call handling
    - `tabs.js`: Tabs and content-script helpers
    - `ui.js`: UI helpers: open side panel and close behaviors

### Content Scripts
Part of the plugin that interacts with the website content.
- `index.js` - brain of the content script that acts as bridge between webpage and other plugin contents
    - Storyfinder() - main class that contains:
        - initalization of the plugin that sets listeners 
        - highliting logic (of entity names)
        - article extraction based on readibility.js to parse the page for the background script (service_worker.js) #verfify
        - summarization logic that sends parsed article to background script for summary generation 
        - Further utility functions 
- `package-lock.json` - automatically created file with the exact versions of dependencies
- `package.json` - Node.js project config for the content script

- `content_script.js` is the comiled version of the index.js file in the content_script folder. Gets created during the build phase through browserify. The main manifest.js file refers to the contents of this compiled version. 

### Popup / Frontend files
Files that contain the .html website content for popups and other UI elements. Html files for the UI elements and .js files for the logic and interactive behavior.
- `menu.html` & `menu.js` & `menu.css`: Menu UI of the story finder plugin (little pop up with buttons for parsing, opening sidebar, readability and summary)
- `options.html` & `options.js`: Extensions popup window to enter the server address 
- `popup.html` & `popup.js`: Popup for the graph visualisation
- `summary.js` & `summary.css` & `summary.html`: Summary UI for the user to update or reload summaries 
- `sidepanel.js` & `sidepanel.html`: Sidepanel embedded in the browser in which the summary opens

### Options page
Options page of the story finder to set server address. Will be accessed when clicking on Extension -> Storyfinder -> Options 
- `options.html`: Simple form in which a user can insert the Storyfinder webserver URL alongside a save button 
- `options.js`: script for reading, saving and syncing the server URL settings

### Icons for the menu
- icon-48.png
- icon-500.png
- icon-red-48.png
- icon-red-500.png

### Other assets
- `chome_types`: Typescript helper file for autocompletion, type safety and documentation
- `content_style.css`: File for the styling of the entity highlighting and the UI
- `jsononfig.json`: config for type checking, autocomletion and error detection 
- `Readability.js`: External readability script (open sourced by Arc90 Labs)
