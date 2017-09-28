var Readability = require('readability-node').Readability,
	_ = require('lodash'),
	async = require('async'),
	escapeStringRegexp = require('escape-string-regexp'),
	Delegate = require('dom-delegate');

chrome.runtime.sendMessage({type: 'onAttach'});

function Storyfinder() {
    var cssNamespace = 'de-tu-darmstadt-lt-storyfinder',
        article = null,
        articleNodes = [],
        nodeToOpen = null,
        timeoutForOpening = null,
        openDelay = 150;

    function initializePlugin(){
        chrome.runtime.onMessage.addListener(communication);

        function communication(message) {
            switch (message.type) {
                case 'getArticle':
                    onGetArticle(message.data, message.tab);
                    break;
                case 'setEntities':
                    setEntities(message.data.Site.Entities);
                    activateHighlighting();
                    break;
                case 'addEntities':
                    setEntities(message.data.nodes);
                    activateHighlighting();
                    break;
                case 'error':
                    alert(message.err.msg);
                    break;
                case 'highlight':
                    highlight(message.nodeId);
                    break;
                case 'unhighlight':
                    //unhighlight(message.nodeId);
                    break;
                case 'test':
                    alert(message.data);
                    break;
                case 'read-readability':
                    readReadability();
                    break;
            }
        }

        function onGetArticle(data, tab) {
            if (_.isNull(article)) {
                if (!getArticle()) {
                    article = {
                        isRelevant: false,
                        isParseable: false
                    };
                }
            }

            if (!_.isUndefined(data) && !_.isUndefined(data.isRelevant)) {
                article.isRelevant = data.isRelevant;
            }

            chrome.runtime.sendMessage({type: 'setArticle', tab: tab, data: article});
        }
    }

    function readReadability() {
        var loc = document.location;
        var uri = {
            spec: loc.href,
            host: loc.host,
            prePath: loc.protocol + "//" + loc.host,
            scheme: loc.protocol.substr(0, loc.protocol.indexOf(":")),
            pathBase: loc.protocol + "//" + loc.host + loc.pathname.substr(0, loc.pathname.lastIndexOf("/") + 1)
        };

        var documentClone = document.cloneNode(true);
        article = new Readability(uri, documentClone).parse();

        var html = '<html><head><meta charset="utf-8"><title>'+article.title+'</title></head><body><h1>'+article.title+'</h1><h4>'+article.byline+'</h4><p>Length:'+article.length+'</p><h5>Excerpt</h5><p>'+article.excerpt+'</p>'+article.content+'</body></html>';

        chrome.runtime.sendMessage({type: 'create-readability-tab', html: html});
    }

    /*
    Find the elements of the website which contain the article
*/
    function getArticle(){
        var loc = document.location;
        var uri = {
            spec: loc.href,
            host: loc.host,
            prePath: loc.protocol + "//" + loc.host,
            scheme: loc.protocol.substr(0, loc.protocol.indexOf(":")),
            pathBase: loc.protocol + "//" + loc.host + loc.pathname.substr(0, loc.pathname.lastIndexOf("/") + 1)
        };

        /*
            Readability modified the dom tree by removing elements etc.
            We do not want to alter the visible website. Therefor, readability gets applied to a clone of the document.
            In order to find the elements of the clone in the real document, after readability has extracted the article,
            we assign an id to every node:
            1) Assign ID to every node
            2) Clone document
            3) Run Readability on the clone
            4) get the content articleContent by overwriting the _postProcessContent method of Readability
            5) find elements with ids in the articleContent
            6) get only the top level elements with ids
            7) find the same elements in the real document by their ids
        */

        var content = null;

        //1)
        var elementList = document.querySelectorAll('*');
        for(var i = 0;i < elementList.length; i++){
            elementList[i].setAttribute('__sf__eid', i++);
        }

        //4)
        Readability.prototype._postProcessContent = function(articleContent){
            content = articleContent;
            this._fixRelativeUris(articleContent);
        };

        //2)
        var documentClone = document.cloneNode(true);

        //3)
        article = new Readability(uri, documentClone).parse();

        if(_.isNull(article))
            return false;

        article.bounds = {top: null, right: null, bottom: null, left: null, width: null, height: null};

        var topNodes = [];
        if(typeof content !== 'undefined' && content !== null){
            //5)
            let elementIds = [],
                topNodeClones = content.querySelectorAll('[__sf__eid]');

            //6)
            for(let node of topNodeClones){
                let p = node;
                while(typeof p.parentNode !== 'undefined' && p.parentNode !== null){
                    p = p.parentNode;

                    if(p.hasAttribute('__sf__eid'))
                        break;
                }
                if(p.hasAttribute('__sf__eid') && p !== node)continue;

                elementIds.push(node.getAttribute('__sf__eid'));
            }

            //7)
            topNodes = document.querySelectorAll('[__sf__eid="' + elementIds.join('"], [__sf__eid="', elementIds) + '"]');
            for(let i = 0;i < topNodes.length; i++){
                articleNodes.push({
                    id: topNodes[i].getAttribute('__sf__eid'),
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

                //Assign the storyfinder root class to the element
                topNodes[i].classList.add(cssNamespace + '-root');
            }

            //article.bounds.height = document.contentDocument.clientHeight - article.bounds.bottom - article.bounds.top;
            //article.bounds.width = document.contentDocument.clientWidth - article.bounds.left - article.bounds.right;
            article.plain = article.title + "\n" + articleNodes.map(function(node){
                return node.el.textContent;
            }).join("\n");
            article.html = article.content.innerHTML;
            return true;
        }
        return false;
    }

    /*
	Highlight entities
	*/
    function setEntities(entities){
        entities = entities.sort(function(a, b){
            return b.caption.length - a.caption.length;
        });

        articleNodes.forEach(articleNode => {
            let textNodes = getTextNodesIn(articleNode.el);

            if(textNodes.length === 0) {
                return;
            }

            entities.forEach(entity => {
                let val = entity.caption;

                textNodes.forEach((textNode) => {
                    let txt = textNode.textContent;

                    if(!_.isUndefined(txt.split)){
                        let split = new RegExp('([^A-Za-z0-9\-])(' + escapeStringRegexp(val) + ')([^\-A-Za-z0-9])', 'g');
                        let replaced = txt.replace(split, '$1<sf-entity class="entity type-' + entity.type + '" data-entity-id="' + entity.id + '">$2</sf-entity>$3');
                        if(txt !== replaced){
                            let newTextNode = document.createElement('sf-text-node');
                            newTextNode.innerHTML = replaced;

                            if(!_.isNull(textNode.parentElement)) {
                                textNode.parentElement.replaceChild(newTextNode, textNode);
                            }
                        }
                    }
                });
            });
        });
    }

    function activateHighlighting(){
        articleNodes.forEach(articleNode => {
            let delegate = new Delegate(articleNode.el);

            delegate.on('mouseover', 'sf-entity', function(event){
                let nodeId = this.getAttribute('data-entity-id');
                setHighlight(nodeId, true);
            });

            delegate.on('mouseout', 'sf-entity', function(event){
                let nodeId = this.getAttribute('data-entity-id');
                setHighlight(nodeId, false);
                console.log('clear timeout');
                if(timeoutForOpening !== null)
                    clearTimeout(timeoutForOpening);
            });

            delegate.on('mousedown', 'sf-entity', function(event){
                let nodeId = this.getAttribute('data-entity-id');
                console.log('mousedown');

                if(timeoutForOpening !== null)
                    clearTimeout(timeoutForOpening);

                nodeToOpen = nodeId;
                console.log('Setting timeout');
                timeoutForOpening = setTimeout(openNode, openDelay);
                console.log('Timeout set');
            });

            delegate.on('mouseup', 'sf-entity', function(event){
                console.log('clear timeout');
                if(timeoutForOpening !== null)
                    clearTimeout(timeoutForOpening);
            });
        });
    }

    function openNode(){
        if(nodeToOpen !== null){
            console.log('Opening ' + nodeToOpen);

            chrome.runtime.sendMessage({
                type: 'emit-sidebar-event',
                data: {
                    event: 'open',
                    data: nodeToOpen
                }
            });
        }
    }

    function setHighlight(id, status){
        chrome.runtime.sendMessage({
            type: 'emit-sidebar-event',
            data: {
                event: status?'highlight':'unhighlight',
                data: id
            }
        });

        articleNodes.forEach(articleNode => {
            if(status)
                articleNode.el.classList.add('storyfinder-highlighted');
            else
                articleNode.el.classList.remove('storyfinder-highlighted');
        });
    }

    function getTextNodesIn(el){
        //Select all children
        //console.log(typeof el);
        let result = [];

        for(let c of el.childNodes){
            if(c.nodeType === 3)
                result.push(c);
        }

        let children = el.querySelectorAll(':not(iframe)');

        for(let c of children){
            if(c.nodeType === 3)
                result.push(c);
            else if(typeof c.childNodes !== 'undefined'){
                for(let cc of c.childNodes)
                    if(cc.nodeType === 3)
                        result.push(cc);
            }
        }

        return result;
    }

    initializePlugin();
}

new Storyfinder();