(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var Delegate = require('dom-delegate');

function escapeStringRegexp(string) {
	if (typeof string !== 'string') {
		throw new TypeError('Expected a string');
	}
    return string
		.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
		.replace(/-/g, '\\x2d');
}

chrome.storage.sync.get({
    highlightEntities: false
}, function (items) {
    if (items.highlightEntities) {
        document.body.classList.add("storyfinder-main");
    }
});

function Storyfinder()
{
    
    var article = null;
    var articleNodes = [];
    var cssNamespace = 'de-tu-darmstadt-lt-storyfinder';
    var entities = null;
    var highlighting_activated = false;
    var openDelay = 150;
    var timeoutForOpening = null;
    var nodeToOpen = null;

    function initializePlugin()
    {
        chrome.runtime.onMessage.addListener(communication);
    
        function communication(message)
        {
            console.log(message);
            switch(message.content_job)
            {
                case "perform-readability":
                    performReadability();
                    break;
                case "get-article":
                    getArticle(message.data, message.tab);
                    break;
                case "summarize":
                    summarizeArticle();
                    break;
                case "extract-plain":
                    handleExtractPlainMessage();
                    break;
                case "set-entities":
                    entities = message.data.Site.Entities;
                    setEntities(true)
                    break;
                case "toggle-highlight":
                    console.log("highlight changed");
                    console.log(message.checked);
                    if(document.body.classList.contains("storyfinder-main") && !message.checked)
                        document.body.classList.remove("storyfinder-main");
                    else if (!document.body.classList.contains("storyfinder-main") && message.checked)
                        document.body.classList.add("storyfinder-main");
            }
        }
    }
    
    function activateHighlighting()
    {
        if(highlighting_activated)
        {
            return;
        }

        highlighting_activated = true;
        articleNodes.forEach(articleNode => {
            let delegate = new Delegate(articleNode.el);

            delegate.on('mouseover', 'sf-entity', function(event)
            {
                let nodeId = this.getAttribute('data-entity-id');
                setHighlight(nodeId, true);
            });

            delegate.on('mouseout', 'sf-entity', function(event)
            {
                let nodeId = this.getAttribute('data-entity-id');
                setHighlight(nodeId, false);
                if(timeoutForOpening !== null)
                {
                    clearTimeout(timeoutForOpening);
                }
            });

            delegate.on('mousedown', 'sf-entity', function(event)
            {
                let nodeId = this.getAttribute('data-entity-id');
                if(timeoutForOpening !== null)
                {
                    clearTimeout(timeoutForOpening);
                }
                nodeToOpen = nodeId;
                timeoutForOpening = setTimeout(openNode, openDelay);

            });

            delegate.on('mouseup', 'sf-entity', function(event)
            {
                if(timeoutForOpening !== null)
                {
                    clearTimeout(timeoutForOpening);
                }
            });
        })
         
    }

    function openNode()
    {
        if(nodeToOpen !== null)
        {
            chrome.runtime.sendMessage(
            {
                type: 'emit-sidebar-event',
                data : {
                    event: 'open',
                    data: nodeToOpen
                }
            });
        }

    }

    function setHighlight(nodeId, status)
    {
        chrome.runtime.sendMessage({
            type: 'emit-sidebar-event',
            data: {
                event: status ? 'highlight' : 'unhighlight',
                data: nodeId
            }
        });
        articleNodes.forEach(articleNode => {
            if(status)
            {
                articleNode.el.classList.add('storyfinder-highlighted');
            }
            else
            {
                articleNode.el.classList.remove('storyfinder-highlighted');
            }
        });
        
    }

    function setEntities(activate)
    {
        chrome.storage.sync.get(
        {
            highlightEntities: false
        }, function(items)
        {
            if(!items.highlightEntities)
            {
                return;
            } else
            {
                entities = entities.sort(function(a, b)
                {
                    return b.caption.length - a.caption.length;
                });

                entities.forEach(entity => {
                    articleNodes.forEach(articleNode => {
                        let textNodes = getTextNodesIn(articleNode.el);
                        if(textNodes.length === 0)
                        {
                            return;
                        }

                        let val = entity.caption;
                        textNodes.forEach(textNode => {
                            let txt = textNode.textContent;
                            if(txt.split !== undefined)
                            {
                        
                                let split = new RegExp('([^A-Za-z0-9\-])(' + escapeStringRegexp(val) + ')([^\-A-Za-z0-9])', 'g');
                                let replaced = txt.replace(split, '$1<sf-entity class="entity type-' + entity.type + '" data-entity-id="' + entity.id + '">$2</sf-entity>$3');
                                if(txt !== replaced)
                                {
                                    let newTextNode = document.createElement('sf-text-node');
                                    newTextNode.innerHTML = replaced;
                                    if(textNode.parentElement !== null)
                                    {
                                        textNode.parentElement.replaceChild(newTextNode, textNode);
                                    }
                                }
                            }
                        });
                    });
                });
            }
        if(activate)
        {
            activateHighlighting()
        }
        });

        
    }

    function getArticle(data, tab)
    {
        if(article === null)
        {
            if(!generateArticle())
            {
                article = 
                {
                    isRelevant: false,
                    isParsable: false
                };
            }
        }

        if(data !== undefined && data.isRelevant !== undefined)
        {
            article.isRelevant = data.isRelevant;
        }

        chrome.runtime.sendMessage({type: "set-article", tab: tab, article: article});
    }

    function generateArticle()
    {
        var loc = document.location;
        var uri = 
        {
            spec: loc.href,
            host: loc.host,
            prePath: loc.protocol + "//" + loc.host,
            scheme: loc.protocol.substring(0, loc.protocol.indexOf(":")),
            pathBase: loc.protocol + "//" + loc.host + loc.pathname.substring(0, loc.pathname.lastIndexOf("/") + 1)
        };
        
        var content = null;
        var elementList = document.querySelectorAll("*");
        for(var i = 0; i < elementList.length; i++)
        {
            elementList[i].setAttribute('__sf__eid', i);
        }
        Readability.prototype._postProcessContent = function(articleContent)
        {
            content = articleContent;
            this._fixRelativeUris(articleContent);
        }

        var docuementClone = document.cloneNode(true);
        article = new Readability(uri, docuementClone).parse();
        if(article === null)
        {
            return false;
        }

        article.bounds = 
        {
            top: null, 
            right: null,
            bottom: null, 
            left: null, 
            width: null, 
            height: null
        };

        var lang = document.getElementsByTagName('html')[0].getAttribute('lang');
        if(lang !== 'undefined' && lang !== undefined && lang !== null)
        {
          let split = new RegExp('[a-zA-Z]+', 'g');
          lang = lang.replace(split, '');
          article.language = lang;

        } else 
        {
          article.language = null;
        }

        var topNodes = [];
        if(typeof content !== 'undefined' && content !== null)
        {
            let elementIds = [];
            let topNodeClones = content.querySelectorAll('[__sf__eid]');
            for(let node of topNodeClones)
            {
                let p = node;
                while(typeof p.parentNode !== "undefined" && p.parentNode !== null)
                {
                    p = p.parentNode;
                    if(p.hasAttribute("__sf__eid"))
                    {
                        break;
                    }
                }
                if(p.hasAttribute("__sf__eid") && p !== node)
                {
                    continue;
                }

                elementIds.push(node.getAttribute("__sf__eid"));
            }

            topNodes = document.querySelectorAll('[__sf__eid="' + elementIds.join('"], [__sf__eid="', elementIds) + '"]');
            for(let i = 0; i < topNodes.length; i++)
            {
                articleNodes.push(
                {
                    id: topNodes[i].getAttribute("__sf__eid"),
                    el: topNodes[i]
                });

                let dim = topNodes[i].getBoundingClientRect();
                if(article.bounds.top === null || article.bounds.top > dim.top + window.scrollY)
                    article.bounds.top = dim.top + window.scrollY;
                if(article.bounds.left === null || article.bounds.left > dim.left + window.scrollY)
                    article.bounds.left = dim.left + window.scrollX;
                if(article.bounds.right === null || article.bounds.right > dim.right + window.scrollX)
                    article.bounds.right = dim.right + window.scrollX;
                if(article.bounds.bottom === null || article.bounds.bottom > dim.bottom + window.scrollY)
                    article.bounds.bottom = dim.bottom + window.scrollY;
                if(article.bounds.width === null || article.bounds.width < topNodes[i].scrollWidth)
                    article.bounds.width = topNodes[i].scrollWidth;
                if(article.bounds.height === null || article.bounds.height < topNodes[i].scrollHeight)
                    article.bounds.height = topNodes[i].scrollHeight;

                topNodes[i].classList.add(cssNamespace + '-root');
            }

            article.plain = article.title + "\n" + articleNodes.map(function(node){
                return node.el.innerText.trim();
            }).join("\n");
            article.html = article.content.innerHTML;
            //console.log(articleNodes[0]);
            return true;
        }
        return false;
    }
    
    function performReadability()
    {

        var loc = document.location;
        var uri = {
            spec: loc.href,
            host: loc.host,
            prePath: loc.protocol + "//" + loc.host,
            scheme: loc.protocol.substring(0, loc.protocol.indexOf(":")),
            pathBase: loc.protocol + "//" + loc.host + loc.pathname.substring(0, loc.pathname.lastIndexOf("/") + 1)
        };

        var documentClone = document.cloneNode(true);
        var article2 = new Readability(uri, documentClone).parse();
        console.log(article2);
        var html = '<html><head><meta charset="utf-8"><title>'+article2.title+'</title></head><body><h1>'+article2.title+'</h1><h4>'+article2.byline+'</h4><p>Length:'+article2.length+'</p><h5>Excerpt</h5><p>'+article2.excerpt+'</p>'+article2.content+'</body></html>';
        chrome.runtime.sendMessage({type: 'create-readability-tab', html: html});
        
    }

    function getTextNodesIn(node)
    {
        let results = [];

        function traverse(node)
        {
            if(node.nodeType === 3)
            {
                results.push(node);
            } else if(node.nodeType ===1 && node.tagName !== 'IFRAME')
            {
                for(let child of node.childNodes)
                {
                    traverse(child);
                }
            }
        }
        traverse(node);
        return results;
    }

    /**
     * summarizeArticle(): extract main article text using Readability (generateArticle/article.plain)
     * and send it as a payload to the Service Worker
     */
    function summarizeArticle() {
        // If we haven't parsed the article yet, try to generate it
        if (!article) {
            const success = generateArticle();
            if (!success) {
            console.error("summarizeArticle: failed to parse article via Readability");
            return;
            }
        }

        // Build the payload with the plain text and current URL
        const payload = {
            text: article.plain,
            url: window.location.href
        };

        // Log the payload so we can verify in the Console
        console.log("[CS] send summarize_request with payload:", payload);

        // Send the payload to the background script
        chrome.runtime.sendMessage({
            type: "summarize_request",
            data: payload
        });
        showLoadingOverlay();
    }

    /**
     * Return article.plain, generating the Readability article on demand.
     * Keeps all logic in one place for reuse.
     */
    function getOrGeneratePlainText() {
      if (!article) {
        const ok = generateArticle();
        if (!ok) return "";
      }
      return (article && typeof article.plain === "string") ? article.plain : "";
    }

    /**
     * Handle a plain-text extraction request; isolated for cleanliness.
     * Sends a single runtime message back (type: 'plain_extracted').
     */
    function handleExtractPlainMessage() {
      try {
        const text = getOrGeneratePlainText();
        if (!text || text.trim().length === 0) {
          console.warn("[CS] handleExtractPlainMessage: no plain text extracted");
          chrome.runtime.sendMessage({
            type: "plain_extracted",
            error: "No plain text extracted",
            url: window.location.href
          });
          return;
        }
        chrome.runtime.sendMessage({
          type: "plain_extracted",
          text,
          url: window.location.href
        });
      } catch (e) {
        chrome.runtime.sendMessage({
          type: "plain_extracted",
          error: String(e || "extract failed")
        });
      }
    }


    /**
     * Show loading overlay while waiting for summary
     */
    function showLoadingOverlay() {
        // Remove old overlay if any
        const oldOverlay = document.getElementById('sf-summary-overlay');
        if (oldOverlay) {
            oldOverlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.id = 'sf-summary-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '30px';
        overlay.style.right = '30px';
        overlay.style.width = '300px';
        overlay.style.backgroundColor = '#ffffff';
        overlay.style.border = '1px solid #aaa';
        overlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        overlay.style.padding = '16px';
        overlay.style.zIndex = '999999';
        overlay.style.fontSize = '14px';
        overlay.style.fontFamily = 'Arial, sans-serif';
        overlay.style.borderRadius = '8px';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.gap = '10px';

        // Spinner
        const spinner = document.createElement('div');
        spinner.style.border = '4px solid #f3f3f3';
        spinner.style.borderTop = '4px solid #4A90E2';
        spinner.style.borderRadius = '50%';
        spinner.style.width = '24px';
        spinner.style.height = '24px';
        spinner.style.animation = 'spin 1s linear infinite';

        const style = document.createElement('style');
        style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }`;
        document.head.appendChild(style);

        const text = document.createElement('div');
        text.textContent = "Generating summary... please wait.";

        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.body.appendChild(overlay);
    }

    initializePlugin();
}



// Listen for background responses (not content_job messages)
// Listen for background responses (not content_job messages)
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type !== "summarize_response") return;

  try {
    const data = message && message.data ? message.data : {};
    const text = typeof data.summary === "string" ? data.summary : "";
    const fromCache = !!data.fromCache;
    const isEdited = !!data.edited;

    console.log("[CS] summarize_response received. len:", text.length, "fromCache:", fromCache, "edited:", isEdited);

    // Remove any previous overlay (loading or result)
    try {
      const old = document.getElementById('sf-summary-overlay');
      if (old) old.remove();
    } catch (e) { /* noop */ }

    // Inject shared CSS once (badges + buttons)
    (function ensureSummaryStyles() {
      if (document.getElementById('sf-summary-styles')) return;
      const s = document.createElement('style');
      s.id = 'sf-summary-styles';
      s.textContent = `
        .sf-badges{display:inline-flex;align-items:center;gap:8px}
        .sf-badge{display:inline-flex;align-items:center;justify-content:center;
          width:22px;height:22px;border-radius:50%;
          border:1px solid transparent; box-sizing:border-box}
        /* klare Farben */
        .sf-badge.gray{ color:#111827; background:#E5E7EB; border-color:#D1D5DB }   /* hellgrau */
        .sf-badge.green{ color:#064E3B; background:#86EFAC; border-color:#34D399 }  /* hellgrün */
        .sf-badge svg{width:14px;height:14px;fill:currentColor;opacity:1}

        /* Basis-Button (z.B. im Footer) */
        .sf-btn{
          background:#ffffff; color:#0f172a; border:1px solid #d1d5db;
          padding:6px 10px; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer;
          box-shadow:0 1px 0 rgba(0,0,0,.03);
          transition:background .15s ease,border-color .15s ease,transform .04s ease,box-shadow .15s ease;
        }
        .sf-btn:hover{ background:#f8fafc; border-color:#cbd5e1 }
        .sf-btn:active{ transform:translateY(1px) }
        .sf-btn:focus-visible{ outline:2px solid #93c5fd; outline-offset:2px }

        /* Header-Variante: für blaue Leiste */
        .sf-btn.header{
          background:rgba(255,255,255,.14);
          color:#ffffff;
          border:1px solid rgba(255,255,255,.35);
          box-shadow:0 1px 0 rgba(0,0,0,.12), inset 0 0 0 9999px rgba(255,255,255,.02);
        }
        .sf-btn.header:hover{
          background:rgba(255,255,255,.22);
          border-color:rgba(255,255,255,.55);
          box-shadow:0 2px 8px rgba(0,0,0,.18), inset 0 0 0 9999px rgba(255,255,255,.03);
        }
        .sf-btn.header:active{ transform:translateY(1px) }
        .sf-btn.header:focus-visible{ outline:2px solid #e5f2ff; outline-offset:2px }

        /* Optional: Primär-Button */
        .sf-btn.primary{ background:#2563eb; border-color:#2563eb; color:#fff }
        .sf-btn.primary:hover{ filter:brightness(.96) }
      `;
      (document.head || document.documentElement).appendChild(s);
    })();

    // Root overlay
    const overlay = document.createElement('div');
    overlay.id = 'sf-summary-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '24px',
      right: '24px',
      width: '360px',
      maxHeight: '62vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#ffffff',
      border: '1px solid #d1d5db',
      boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
      padding: '0',
      zIndex: '999999',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      borderRadius: '10px',
      opacity: '0',
      transition: 'opacity 0.2s ease'
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      alignItems: 'center',
      columnGap: '10px',
      backgroundColor: '#4A90E2',
      color: 'white',
      padding: '8px 10px',
      fontWeight: 'bold',
      fontSize: '14px',
      borderTopLeftRadius: '10px',
      borderTopRightRadius: '10px',
      flex: '0 0 auto'
    });

    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.style.gap = '10px';

    const titleEl = document.createElement('span');
    titleEl.textContent = 'Summary';
    titleWrap.appendChild(titleEl);

    const badgesWrap = document.createElement('div');
    badgesWrap.className = 'sf-badges';

    // from cache → gray DB icon
    if (fromCache) {
      const b = document.createElement('span');
      b.className = 'sf-badge gray';
      b.title = 'Served from cache';
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 .99 6 2s-2.13 2-6 2-6-.99-6-2 2.13-2 6-2zm0 6c3.87 0 6 .99 6 2s-2.13 2-6 2-6-.99-6-2 2.13-2 6-2zm0 6c3.87 0 6 .99 6 2s-2.13 2-6 2-6-.99-6-2 2.13-2 6-2z"/>
      </svg>`;
      badgesWrap.appendChild(b);
    }
    // edited → green pencil icon
    if (isEdited) {
      const b = document.createElement('span');
      b.className = 'sf-badge green';
      b.title = 'Summary was edited';
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
      </svg>`;
      badgesWrap.appendChild(b);
    }

    const buttonsWrap = document.createElement('div');
    buttonsWrap.style.display = 'flex';
    buttonsWrap.style.alignItems = 'center';
    buttonsWrap.style.gap = '6px';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'sf-btn header';
    regenBtn.textContent = 'Regenerate';
    regenBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: "trigger-summarize", forceRefresh: true });
      regenBtn.disabled = true; regenBtn.textContent = '…';
    });

    const openTabBtn = document.createElement('button');
    openTabBtn.className = 'sf-btn header';
    openTabBtn.textContent = 'Open';
    openTabBtn.title = 'Open in tab (you can edit there)';
    openTabBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: "open-summary-tab",
        summary: text,
        url: window.location.href,
        fromCache,
        edited: isEdited
      });
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      background: 'transparent', border: 'none', color: 'white',
      fontSize: '18px', lineHeight: '18px', cursor: 'pointer', padding: '0 2px'
    });
    closeBtn.addEventListener('click', () => overlay.remove());

    buttonsWrap.appendChild(regenBtn);
    buttonsWrap.appendChild(openTabBtn);
    buttonsWrap.appendChild(closeBtn);

    header.appendChild(titleWrap);
    header.appendChild(badgesWrap);
    header.appendChild(buttonsWrap);

    // BODY
    const body = document.createElement('div');
    Object.assign(body.style, {
      padding: '12px',
      overflowY: 'auto',
      color: '#0f172a',
      flex: '1 1 auto'
    });

    const content = document.createElement('div');
    content.textContent = text || '';
    Object.assign(content.style, {
      whiteSpace: 'pre-wrap',
      lineHeight: '1.55',
      letterSpacing: '.01em'
    });
    body.appendChild(content);

    // FOOTER
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 10px',
      borderTop: '1px solid #e5e7eb',
      fontSize: '11px',
      color: '#64748b',
      flex: '0 0 auto'
    });
    const tip = document.createElement('div');
    tip.textContent = 'Tip: Open in tab to edit this summary.';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'sf-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text || '')
        .then(() => { copyBtn.textContent = 'Copied'; setTimeout(() => copyBtn.textContent = 'Copy', 1100); })
        .catch(() => { copyBtn.textContent = 'Failed'; setTimeout(() => copyBtn.textContent = 'Copy', 1100); });
    });
    footer.appendChild(tip);
    footer.appendChild(copyBtn);

    // Assemble
    overlay.appendChild(header);
    overlay.appendChild(body);
    overlay.appendChild(footer);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  } catch (err) {
    console.error("[CS] summarize_response handler failed:", err);
    try { alert("Summary received but rendering failed. Open console for details."); } catch (_) {}
  }
});



new Storyfinder();
},{"dom-delegate":3}],2:[function(require,module,exports){
/*jshint browser:true, node:true*/

'use strict';

module.exports = Delegate;

/**
 * DOM event delegator
 *
 * The delegator will listen
 * for events that bubble up
 * to the root node.
 *
 * @constructor
 * @param {Node|string} [root] The root node or a selector string matching the root node
 */
function Delegate(root) {

  /**
   * Maintain a map of listener
   * lists, keyed by event name.
   *
   * @type Object
   */
  this.listenerMap = [{}, {}];
  if (root) {
    this.root(root);
  }

  /** @type function() */
  this.handle = Delegate.prototype.handle.bind(this);
}

/**
 * Start listening for events
 * on the provided DOM element
 *
 * @param  {Node|string} [root] The root node or a selector string matching the root node
 * @returns {Delegate} This method is chainable
 */
Delegate.prototype.root = function(root) {
  var listenerMap = this.listenerMap;
  var eventType;

  // Remove master event listeners
  if (this.rootElement) {
    for (eventType in listenerMap[1]) {
      if (listenerMap[1].hasOwnProperty(eventType)) {
        this.rootElement.removeEventListener(eventType, this.handle, true);
      }
    }
    for (eventType in listenerMap[0]) {
      if (listenerMap[0].hasOwnProperty(eventType)) {
        this.rootElement.removeEventListener(eventType, this.handle, false);
      }
    }
  }

  // If no root or root is not
  // a dom node, then remove internal
  // root reference and exit here
  if (!root || !root.addEventListener) {
    if (this.rootElement) {
      delete this.rootElement;
    }
    return this;
  }

  /**
   * The root node at which
   * listeners are attached.
   *
   * @type Node
   */
  this.rootElement = root;

  // Set up master event listeners
  for (eventType in listenerMap[1]) {
    if (listenerMap[1].hasOwnProperty(eventType)) {
      this.rootElement.addEventListener(eventType, this.handle, true);
    }
  }
  for (eventType in listenerMap[0]) {
    if (listenerMap[0].hasOwnProperty(eventType)) {
      this.rootElement.addEventListener(eventType, this.handle, false);
    }
  }

  return this;
};

/**
 * @param {string} eventType
 * @returns boolean
 */
Delegate.prototype.captureForType = function(eventType) {
  return ['blur', 'error', 'focus', 'load', 'resize', 'scroll'].indexOf(eventType) !== -1;
};

/**
 * Attach a handler to one
 * event for all elements
 * that match the selector,
 * now or in the future
 *
 * The handler function receives
 * three arguments: the DOM event
 * object, the node that matched
 * the selector while the event
 * was bubbling and a reference
 * to itself. Within the handler,
 * 'this' is equal to the second
 * argument.
 *
 * The node that actually received
 * the event can be accessed via
 * 'event.target'.
 *
 * @param {string} eventType Listen for these events
 * @param {string|undefined} selector Only handle events on elements matching this selector, if undefined match root element
 * @param {function()} handler Handler function - event data passed here will be in event.data
 * @param {boolean} [useCapture] see 'useCapture' in <https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener>
 * @returns {Delegate} This method is chainable
 */
Delegate.prototype.on = function(eventType, selector, handler, useCapture) {
  var root, listenerMap, matcher, matcherParam;

  if (!eventType) {
    throw new TypeError('Invalid event type: ' + eventType);
  }

  // handler can be passed as
  // the second or third argument
  if (typeof selector === 'function') {
    useCapture = handler;
    handler = selector;
    selector = null;
  }

  // Fallback to sensible defaults
  // if useCapture not set
  if (useCapture === undefined) {
    useCapture = this.captureForType(eventType);
  }

  if (typeof handler !== 'function') {
    throw new TypeError('Handler must be a type of Function');
  }

  root = this.rootElement;
  listenerMap = this.listenerMap[useCapture ? 1 : 0];

  // Add master handler for type if not created yet
  if (!listenerMap[eventType]) {
    if (root) {
      root.addEventListener(eventType, this.handle, useCapture);
    }
    listenerMap[eventType] = [];
  }

  if (!selector) {
    matcherParam = null;

    // COMPLEX - matchesRoot needs to have access to
    // this.rootElement, so bind the function to this.
    matcher = matchesRoot.bind(this);

  // Compile a matcher for the given selector
  } else if (/^[a-z]+$/i.test(selector)) {
    matcherParam = selector;
    matcher = matchesTag;
  } else if (/^#[a-z0-9\-_]+$/i.test(selector)) {
    matcherParam = selector.slice(1);
    matcher = matchesId;
  } else {
    matcherParam = selector;
    matcher = matches;
  }

  // Add to the list of listeners
  listenerMap[eventType].push({
    selector: selector,
    handler: handler,
    matcher: matcher,
    matcherParam: matcherParam
  });

  return this;
};

/**
 * Remove an event handler
 * for elements that match
 * the selector, forever
 *
 * @param {string} [eventType] Remove handlers for events matching this type, considering the other parameters
 * @param {string} [selector] If this parameter is omitted, only handlers which match the other two will be removed
 * @param {function()} [handler] If this parameter is omitted, only handlers which match the previous two will be removed
 * @returns {Delegate} This method is chainable
 */
Delegate.prototype.off = function(eventType, selector, handler, useCapture) {
  var i, listener, listenerMap, listenerList, singleEventType;

  // Handler can be passed as
  // the second or third argument
  if (typeof selector === 'function') {
    useCapture = handler;
    handler = selector;
    selector = null;
  }

  // If useCapture not set, remove
  // all event listeners
  if (useCapture === undefined) {
    this.off(eventType, selector, handler, true);
    this.off(eventType, selector, handler, false);
    return this;
  }

  listenerMap = this.listenerMap[useCapture ? 1 : 0];
  if (!eventType) {
    for (singleEventType in listenerMap) {
      if (listenerMap.hasOwnProperty(singleEventType)) {
        this.off(singleEventType, selector, handler);
      }
    }

    return this;
  }

  listenerList = listenerMap[eventType];
  if (!listenerList || !listenerList.length) {
    return this;
  }

  // Remove only parameter matches
  // if specified
  for (i = listenerList.length - 1; i >= 0; i--) {
    listener = listenerList[i];

    if ((!selector || selector === listener.selector) && (!handler || handler === listener.handler)) {
      listenerList.splice(i, 1);
    }
  }

  // All listeners removed
  if (!listenerList.length) {
    delete listenerMap[eventType];

    // Remove the main handler
    if (this.rootElement) {
      this.rootElement.removeEventListener(eventType, this.handle, useCapture);
    }
  }

  return this;
};


/**
 * Handle an arbitrary event.
 *
 * @param {Event} event
 */
Delegate.prototype.handle = function(event) {
  var i, l, type = event.type, root, phase, listener, returned, listenerList = [], target, /** @const */ EVENTIGNORE = 'ftLabsDelegateIgnore';

  if (event[EVENTIGNORE] === true) {
    return;
  }

  target = event.target;

  // Hardcode value of Node.TEXT_NODE
  // as not defined in IE8
  if (target.nodeType === 3) {
    target = target.parentNode;
  }

  root = this.rootElement;

  phase = event.eventPhase || ( event.target !== event.currentTarget ? 3 : 2 );
  
  switch (phase) {
    case 1: //Event.CAPTURING_PHASE:
      listenerList = this.listenerMap[1][type];
    break;
    case 2: //Event.AT_TARGET:
      if (this.listenerMap[0] && this.listenerMap[0][type]) listenerList = listenerList.concat(this.listenerMap[0][type]);
      if (this.listenerMap[1] && this.listenerMap[1][type]) listenerList = listenerList.concat(this.listenerMap[1][type]);
    break;
    case 3: //Event.BUBBLING_PHASE:
      listenerList = this.listenerMap[0][type];
    break;
  }

  // Need to continuously check
  // that the specific list is
  // still populated in case one
  // of the callbacks actually
  // causes the list to be destroyed.
  l = listenerList.length;
  while (target && l) {
    for (i = 0; i < l; i++) {
      listener = listenerList[i];

      // Bail from this loop if
      // the length changed and
      // no more listeners are
      // defined between i and l.
      if (!listener) {
        break;
      }

      // Check for match and fire
      // the event if there's one
      //
      // TODO:MCG:20120117: Need a way
      // to check if event#stopImmediatePropagation
      // was called. If so, break both loops.
      if (listener.matcher.call(target, listener.matcherParam, target)) {
        returned = this.fire(event, target, listener);
      }

      // Stop propagation to subsequent
      // callbacks if the callback returned
      // false
      if (returned === false) {
        event[EVENTIGNORE] = true;
        event.preventDefault();
        return;
      }
    }

    // TODO:MCG:20120117: Need a way to
    // check if event#stopPropagation
    // was called. If so, break looping
    // through the DOM. Stop if the
    // delegation root has been reached
    if (target === root) {
      break;
    }

    l = listenerList.length;
    target = target.parentElement;
  }
};

/**
 * Fire a listener on a target.
 *
 * @param {Event} event
 * @param {Node} target
 * @param {Object} listener
 * @returns {boolean}
 */
Delegate.prototype.fire = function(event, target, listener) {
  return listener.handler.call(target, event, target);
};

/**
 * Check whether an element
 * matches a generic selector.
 *
 * @type function()
 * @param {string} selector A CSS selector
 */
var matches = (function(el) {
  if (!el) return;
  var p = el.prototype;
  return (p.matches || p.matchesSelector || p.webkitMatchesSelector || p.mozMatchesSelector || p.msMatchesSelector || p.oMatchesSelector);
}(Element));

/**
 * Check whether an element
 * matches a tag selector.
 *
 * Tags are NOT case-sensitive,
 * except in XML (and XML-based
 * languages such as XHTML).
 *
 * @param {string} tagName The tag name to test against
 * @param {Element} element The element to test with
 * @returns boolean
 */
function matchesTag(tagName, element) {
  return tagName.toLowerCase() === element.tagName.toLowerCase();
}

/**
 * Check whether an element
 * matches the root.
 *
 * @param {?String} selector In this case this is always passed through as null and not used
 * @param {Element} element The element to test with
 * @returns boolean
 */
function matchesRoot(selector, element) {
  /*jshint validthis:true*/
  if (this.rootElement === window) return element === document;
  return this.rootElement === element;
}

/**
 * Check whether the ID of
 * the element in 'this'
 * matches the given ID.
 *
 * IDs are case-sensitive.
 *
 * @param {string} id The ID to test against
 * @param {Element} element The element to test with
 * @returns boolean
 */
function matchesId(id, element) {
  return id === element.id;
}

/**
 * Short hand for off()
 * and root(), ie both
 * with no parameters
 *
 * @return void
 */
Delegate.prototype.destroy = function() {
  this.off();
  this.root();
};

},{}],3:[function(require,module,exports){
/*jshint browser:true, node:true*/

'use strict';

/**
 * @preserve Create and manage a DOM event delegator.
 *
 * @codingstandard ftlabs-jsv2
 * @copyright The Financial Times Limited [All Rights Reserved]
 * @license MIT License (see LICENSE.txt)
 */
var Delegate = require('./delegate');

module.exports = function(root) {
  return new Delegate(root);
};

module.exports.Delegate = Delegate;

},{"./delegate":2}]},{},[1]);
