# Public 

This file gives an overview of the structure of the public folder. It includes the frontend pages that are not related to the graph visualisation itself. All information regarding the graph folder can be found in the [highlevel readme](../README.md) file of this section. 

## Utils
- `bridge.js`: postMessage bridge between extension sidepanel and this app.
- `dom.js`: Small DOM and asset helpers to keep view JS clean of HTML/CSS snippets.
- `misc.js`: Consolidated utility helpers used by chat.js and related views.
- `router.js`: Minimal hash-router with active tab highlight and duplicate-render guard.
- `state.js`: Auth state + cross-tab sync + 401-aware fetch.

## Viewers

### html files 
- `chat.html`: html part of the user interface of the chat function
- `forgot.html`: html part of the 'forgot my password' page
- `login.html`: html of the login
- `register.html`: html of the user registration

### js files
- `chat.js`: Chat UX: load external HTML/CSS, rendering messages, handling user input, and managing sessions, context, and message history.
- `forget.js`: Simple "Forgot password" placeholder; HTML & CSS externalized.
- `graph.js`: Embeds the graph UX in an iframe to reload. 
- `login.js`: Login UX: email + password, proper errors, forgot/register links, and "open in tab" flow for the side panel (iframes).
- `register.js`: Register UX: load external HTML/CSS, validate, register, auto-login.
- `summary.js`: Renders a placeholder “Summary” view in the web app, showing static text about future summaries
#### components
- `contextDrawer.js`: Context drawer component: builds UI for context mode selection and exposes elements.
- `headerActions.js`: Header actions component: renders chat header buttons and manages visibility/disabled states.
- `messageBubbles.js`: Renders chat bubbles (user / assistant), handles edit/copy clicks, and provides helpers.
- `messageEditor.js`: Inline editor for user message bubbles. Replaces bubble content with a textarea and Save/Cancel.
- `sessionsDrawer.js`: Sessions drawer component: creates the drawer and exposes open/close and listEl
- `templateActions.js`: Renders chat template actions with minimal UI and an inline caret for options.
#### transport
- `catTransport.js`: Factory for chat transport: switches between panel (postMessage) and tab (HTTP)
- `swEvents.js`: Attach/detach Service Worker event routing for panel mode
#### UI
- `banner.js`: Lightweight banner overlay service used by chat.js to show transient messages.
- `busy.js`: Busy orchestrator: maintains a set of reasons and notifies on state changes.
- `drawer.js`: Drawer panel utilities: createDrawer + registerGlobalAutoClose
- `modal.js`: Centered modal dialog factory used by chat.js for simple confirmations.

## 
- `ìndex.html`: Main layout of the storyfinder interface
- `main.js`: Cetral controler, eregisters all page routes (graph, chat, login, etc.), initializes user authentication, and manages navigation and UI updates
- `styles.css`: Global Stylesheet (styles.css) for all public views and layout
