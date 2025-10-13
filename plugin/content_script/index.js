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