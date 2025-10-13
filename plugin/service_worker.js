// Enable ES module imports
import { handleMsg as handleChatMsg } from './sw/chat.js';
import {
  openSidePanel,
  panelOpenTabAndClose,
  panelClose,
  toggleLegacySidebar,
  emitSidebarEvent,
} from './sw/ui.js';
import {
  handleTriggerSummarize,
  handleSummarizeRequest,
  openSummaryTab,
  handleSaveEditedSummary,
} from './sw/summarize.js';
import {
  setArticle,
  createReadabilityTab,
  handleForceParseSite,
} from './sw/articles.js';
import { doReadability, toggleHighlight } from './sw/content.js';

// ------------------------- Message Router -------------------------
chrome.runtime.onMessage.addListener(function (msg, sender) {
  switch (msg.type) {
    case 'toggle-sidebar':
      openSidePanel(sender, () => toggleLegacySidebar());
      break;

    case 'do-readability':
      doReadability();
      break;

    case 'create-readability-tab':
      createReadabilityTab(msg.html);
      break;

    case 'force-parse-site':
      handleForceParseSite();
      break;

    case 'trigger-summarize':
      handleTriggerSummarize(msg, sender);
      break;

    case 'summarize_request':
      handleSummarizeRequest(msg, sender);
      break;

    case 'set-article':
      setArticle(msg.article, msg.tab);
      break;

    case 'highlight-changed':
      toggleHighlight(msg.checked);
      break;

    case 'emit-sidebar-event':
      emitSidebarEvent(msg?.data?.event, msg?.data?.data);
      break;

    case 'panel-open-tab-and-close':
      panelOpenTabAndClose(msg);
      break;

    case 'panel-close':
      panelClose(msg);
      break;

    case 'msg':
      handleChatMsg(msg?.data);
      break;

    case 'open-summary-tab':
      openSummaryTab(msg);
      break;

    case 'save-edited-summary':
      handleSaveEditedSummary(msg, sender);
      break;

    default:
      break;
  }
});
