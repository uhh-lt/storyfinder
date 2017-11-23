var Pagerank = require('pagerank-js')
	, _ = require('lodash')
	;

module.exports = function(store){
	var indexMap = {}
		, linksInGraph = {}
		, linksWaitingForNode = {}
		, linksWaiting = []
		, nodes = []
		, links = []
		, firstNode = null
		, graphGroups = []
		, nodeToGroup = {}
		, hiddenLinks = {}
		, renderNodes = []
		, renderLinks = []
		, linksByNode = {}
		, lBN = {}
		, deletedNodes = []
		;

	function get(){
		var graph = store.getState().storyfinder.get('graph').toJS()
			, render = {
				nodes: [],
				links: []
			}
			, idToIdx = {}
			;

		_.forOwn(graph.nodes, function(node){
			var id = node.id
				, n = render.nodes.length
				;

			render.nodes[n] = node;
			idToIdx[node.id] = n;
		});

		_.forOwn(graph.links, function(link){
			var id = link.entity1_id + ',' + link.entity2_id;
			render.links.push(_.defaults({
				source: parseInt(idToIdx[link.entity1_id]),
				sourceIdx: parseInt(idToIdx[link.entity1_id]),
				target: parseInt(idToIdx[link.entity2_id]),
				targetIdx: parseInt(idToIdx[link.entity2_id])
			}, link));
		});

		return render;
	}

	this.get = get;

	function setData(graph, focus){
		var nodesWithoutLink = {};

		_.each(nodes, function(n){
			if(_.isUndefined(n))return;

			if(!_.isUndefined(n.focused))
				delete n.focused;
		});

		_.each(graph.Entities, function(node){
			var id = node.id;

			//if(node.type == 'OTH')return;

			if(_.isUndefined(indexMap[id])){
				var n = nodes.length;
				nodes[n] = node;
				indexMap[id] = n;
				nodesWithoutLink[id] = n;

				//Neue Knoten werden zuerst zu einer eigenen Gruppe hinzugefuegt und spaeter beim linken werden Gruppen zusammengefasst
				var g = graphGroups.length;
				graphGroups.push([id]);
				nodeToGroup[id] = g;

				if(!_.isUndefined(focus) && focus){
					node.focused = true;
				}
			}else{
				if(!_.isUndefined(focus) && focus){
					nodes[indexMap[id]].focused = true;
					if(!_.isUndefined(node.tfidf))
						nodes[indexMap[id]].tfidf = node.tfidf;
				}else{
					if(!_.isUndefined(nodes[indexMap[id]].tfidf))
						delete nodes[indexMap[id]].tfidf;
				}
			}
		});

		_.each(graph.Relations, function(link){
			var id = link.entity1_id + ',' + link.entity2_id;

			if(!_.isUndefined(linksInGraph[id])){
				linkIndex = linksInGraph[id];

				if(!_.isUndefined(links[linkIndex]))
					links[linkIndex].label = link.label;
				return;
			}

			if(_.isUndefined(indexMap[link.entity1_id]) || _.isUndefined(indexMap[link.entity2_id])){
				return null;
			}

			if(!_.isUndefined(nodesWithoutLink[link.entity1_id]))
				delete nodesWithoutLink[link.entity1_id];
			if(!_.isUndefined(nodesWithoutLink[link.entity2_id]))
				delete nodesWithoutLink[link.entity2_id];

			if(_.isNull(firstNode))
				firstNode = parseInt(indexMap[link.entity1_id]);

			var n = links.length;

			links.push(_.defaults({
				source: parseInt(indexMap[link.entity1_id]),
				sourceIdx: parseInt(indexMap[link.entity1_id]),
				target: parseInt(indexMap[link.entity2_id]),
				targetIdx: parseInt(indexMap[link.entity2_id])
			}, link));

			if(_.isUndefined(lBN[link.entity1_id]))
				lBN[link.entity1_id] = [];
			lBN[link.entity1_id].push(link.entity2_id);

			if(_.isUndefined(lBN[link.entity2_id]))
				lBN[link.entity2_id] = [];
			lBN[link.entity2_id].push(link.entity1_id);

			linksInGraph[id] = n;

			//Gruppen ermitteln
			var g1 = nodeToGroup[link.entity1_id]
				, g2 = nodeToGroup[link.entity2_id]
				;

			//Falls die Knoten in unterschiedlichen Gruppen sind, werden die Gruppe zusammengefuehrt
			if(g1 != g2){
				//Es werden immer die Knoten aus der Gruppe mit der hoeheren ID zur Gruppe mit der niedrigeren ID verschoben
				var to = Math.min(g1, g2)
					, from = Math.max(g1, g2)
					;

				//Allen Knoten aus der from Gruppe die neue Gruppe zuordnen
				_.each(graphGroups[from], function(nodeId){
					nodeToGroup[nodeId] = to;
					graphGroups[to].push(nodeId);
				});

				//Falls es einen unsichtbaren Link von der "from" Gruppe gab, dann wird dieser entfernt
				if(_.isUndefined(hiddenLinks[from])){
					var linkIndex = hiddenLinks[from];
					links[linkIndex] = null; //der Link wird nur auf null gesetzt. Am Ende werden dann alle null links entfernt
					delete hiddenLinks[from];
				}

				graphGroups[from] = null;
			}
		});
	}

	this.setData = setData;

	function addData(graph){
		var nodesWithoutLink = {};

		_.each(nodes, function(n){
			if(_.isUndefined(n))return;
		});

		_.each(graph.nodes, function(node){
			var id = node.id;

			//if(node.type == 'OTH')return;

			if(_.isUndefined(indexMap[id])){
				var n = nodes.length;
				nodes[n] = node;
				node.focused = true;
				indexMap[id] = n;
				nodesWithoutLink[id] = n;

				//Neue Knoten werden zuerst zu einer eigenen Gruppe hinzugefuegt und spaeter beim linken werden Gruppen zusammengefasst
				var g = graphGroups.length;
				graphGroups.push([id]);
				nodeToGroup[id] = g;
			}
		});

		_.each(graph.links, function(link){
			var id = link.entity1_id + ',' + link.entity2_id;

			link.entity1_id = parseInt(link.entity1_id);
			link.entity2_id = parseInt(link.entity2_id);

			if(!_.isUndefined(linksInGraph[id])){
				linkIndex = linksInGraph[id];

				if(!_.isUndefined(links[linkIndex])){
					links[linkIndex].label = link.label;
					links[linkIndex].Relationtype = link.Relationtype;
				}

				return;
			}
			/*console.log('Ok 2');
			if(_.isUndefined(link.Relation) || _.isUndefined(link.Relationtype))
				link.Relation.Relationtype = link.Relationtype;
			console.log('Ok 3');
			link = link.Relation;*/

			if(_.isUndefined(indexMap[link.entity1_id]) || _.isUndefined(indexMap[link.entity2_id])){
				return null;
			}

			if(!_.isUndefined(nodesWithoutLink[link.entity1_id]))
				delete nodesWithoutLink[link.entity1_id];
			if(!_.isUndefined(nodesWithoutLink[link.entity2_id]))
				delete nodesWithoutLink[link.entity2_id];

			if(_.isNull(firstNode))
				firstNode = parseInt(indexMap[link.entity1_id]);

			var n = links.length;

			links.push(_.defaults({
				source: parseInt(indexMap[link.entity1_id]),
				sourceIdx: parseInt(indexMap[link.entity1_id]),
				target: parseInt(indexMap[link.entity2_id]),
				targetIdx: parseInt(indexMap[link.entity2_id])
			}, link));

			if(_.isUndefined(lBN[link.entity1_id]))
				lBN[link.entity1_id] = [];
			lBN[link.entity1_id].push(link.entity2_id);

			if(_.isUndefined(lBN[link.entity2_id]))
				lBN[link.entity2_id] = [];
			lBN[link.entity2_id].push(link.entity1_id);

			linksInGraph[id] = n;

			//Gruppen ermitteln
			var g1 = nodeToGroup[link.entity1_id]
				, g2 = nodeToGroup[link.entity2_id]
				;

			//Falls die Knoten in unterschiedlichen Gruppen sind, werden die Gruppe zusammengefuehrt
			if(g1 != g2){
				//Es werden immer die Knoten aus der Gruppe mit der hoeheren ID zur Gruppe mit der niedrigeren ID verschoben
				var to = Math.min(g1, g2)
					, from = Math.max(g1, g2)
					;

				//Allen Knoten aus der from Gruppe die neue Gruppe zuordnen
				_.each(graphGroups[from], function(nodeId){
					nodeToGroup[nodeId] = to;
					graphGroups[to].push(nodeId);
				});

				//Falls es einen unsichtbaren Link von der "from" Gruppe gab, dann wird dieser entfernt
				if(_.isUndefined(hiddenLinks[from])){
					var linkIndex = hiddenLinks[from];
					links[linkIndex] = null; //der Link wird nur auf null gesetzt. Am Ende werden dann alle null links entfernt
					delete hiddenLinks[from];
				}

				graphGroups[from] = null;
			}
		});
	}

	this.addData = addData;

	function deleteNode(nodeId){
		var idx = indexMap[nodeId]
			, linksToDelete = []
			;

		for(var i = 0;i < links.length; i++){
			if(_.isUndefined(links[i]))continue;
			if(links[i].sourceIdx == idx || links[i].targetIdx == idx){
				linksToDelete.push(i);
				var other = nodes[(links[i].sourceIdx == idx)?links[i].targetIdx:links[i].sourceIdx].id;

				if(!_.isUndefined(lBN[other]))
					lBN[other] = _.pull(lBN[other], nodeId);
			}
		}

		delete nodes[idx];
		linksToDelete.sort();

		for(var i = linksToDelete.length - 1; i >= 0; i--)
			delete links[linksToDelete[i]];

		delete indexMap[nodeId];
	}

	this.deleteNode = deleteNode;

	function mergeNodes(tgtId, srcId){
		var srcIdx = indexMap[srcId]
			, tgtIdx = indexMap[tgtId]
			, linksToDelete = []
			, linksOfTarget = {}
			;

		if(!_.isUndefined(lBN[tgtId]))
			_.each(lBN[tgtId], function(id){
				linksOfTarget[id] = true;
			});

		for(var i = 0;i < links.length; i++){
			if(_.isUndefined(links[i]))continue;

			if((links[i].sourceIdx == srcIdx && links[i].targetIdx == tgtIdx) || (links[i].sourceIdx == tgtIdx && links[i].targetIdx == srcIdx)){
				//Links zwischen den beiden Knoten werden geloescht
				linksToDelete.push(i);

				if(!_.isUndefined(lBN[srcId]))
					lBN[srcId] = _.pull(lBN[srcId], tgtId);

				if(!_.isUndefined(lBN[tgtIdx]))
					lBN[tgtId] = _.pull(lBN[tgtId], srcId);
			}else{
				//Links zu neuem Knoten hinzufuegen
				if(links[i].sourceIdx == srcIdx){
					var other = nodes[links[i].targetIdx].id;

					if(!_.isUndefined(linksOfTarget[other])){
						linksToDelete.push(i);

						if(!_.isUndefined(lBN[other]))
							lBN[other] = _.pull(lBN[other], srcId);
					}else{
						links[i].sourceIdx = tgtIdx;
						links[i].source = tgtIdx;

						if(!_.isUndefined(lBN[other]))
							lBN[other] = _.pull(lBN[other], srcId);

						if(_.isUndefined(lBN[other]))
							lBN[other] = [];

						lBN[other].push(tgtId);

						if(_.isUndefined(lBN[tgtId]))
							lBN[tgtId] = [];

						lBN[tgtId].push(other);
					}
				}else if(links[i].targetIdx == srcIdx){
					var other = nodes[links[i].sourceIdx].id;

					if(!_.isUndefined(linksOfTarget[other])){
						linksToDelete.push(i);

						if(!_.isUndefined(lBN[other]))
							lBN[other] = _.pull(lBN[other], srcId);
					}else{
						links[i].targetIdx = tgtIdx;
						links[i].target = tgtIdx;


						if(!_.isUndefined(lBN[other]))
							lBN[other] = _.pull(lBN[other], srcId);

						if(_.isUndefined(lBN[other]))
							lBN[other] = [];

						lBN[other].push(tgtId);

						if(_.isUndefined(lBN[tgtId]))
							lBN[tgtId] = [];

						lBN[tgtId].push(nodes[other].id);
					}
				}
			}

			//ToDo: Doppelte Links löschen

			//Index der Links anpassen
			/*if(links[i].source > idx)
				links[i].source--;
			if(links[i].sourceIdx > idx)
				links[i].sourceIdx--;
			if(links[i].target > idx)
				links[i].target--;
			if(links[i].targetIdx > idx)
				links[i].targetIdx--;*/
		}

		delete nodes[srcIdx];
		linksToDelete.sort();

		for(var i = linksToDelete.length - 1; i >= 0; i--)
			delete links[linksToDelete[i]];

		delete indexMap[srcId];
	}

	this.mergeNodes = mergeNodes;

	function expand(nodeId){
		nodes[indexMap[nodeId]].isExpanded = true;
	}

	this.expand = expand;

	function show(nodeId, isTemporarily){
		if(!_.isUndefined(indexMap[nodeId]) && !_.isUndefined(nodes[indexMap[nodeId]])){
			nodes[indexMap[nodeId]][isTemporarily?'showTemporarily':'show'] = true;
		}else{
			console.log(indexMap);
		}
	}

	this.show = show;

	function nodeExists(nodeId) {
		return !_.isUndefined(indexMap[nodeId]) && !_.isUndefined(nodes[indexMap[nodeId]]);
	}

	this.nodeExists = nodeExists;

	function hide(nodeId, isTemporarily){
		if(!_.isUndefined(nodes[indexMap[nodeId]][isTemporarily?'showTemporarily':'show']))
			delete nodes[indexMap[nodeId]][isTemporarily?'showTemporarily':'show'];
	}

	this.hide = hide;

	function hideTemporarily(){
		for(var n in nodes){
			if(typeof nodes[n]['showTemporarily'] != 'undefined')
				delete nodes[n]['showTemporarily'];
		}
	}

	this.hideTemporarily = hideTemporarily;

	function collapse(nodeId){
		nodes[indexMap[nodeId]].isExpanded = false;
	}

	this.collapse = collapse;

	function buildRenderGraph(){
		var maxTopNodes = 10
			, maxNeighbours = 2
			, state = store.getState().storyfinder
			, addFocus = false
			, site_id = state.get('site_id')
			, site_ids = state.get('site_ids')
			;

		if(!_.isUndefined(site_id) && !_.isNull(site_id))
			addFocus = true;
		else if(!_.isUndefined(site_ids) && !_.isNull(site_ids))
			addFocus = true;

		if(arguments.length > 0 && arguments[0] != null)
			maxTopNodes = arguments[0];
		if(arguments.length > 1 && arguments[1] != null)
			maxNeighbours = arguments[1];
		if(arguments.length > 2 && arguments[2] != null)
			addFocus = arguments[2];

		/*
		Nur die #topNodes Top Knoten und davon jeweils die #leafs wichtigsten Nachbarn werden gerendert
		*/
		var pageRankByNode = _.map(nodes, (node) => {
			if(_.isUndefined(node))
					return 0;

			if(addFocus){
				if(!_.isUndefined(node.focused) && node.focused){
					//console.log('calc', node.tfidf);
					return node.tfidf;
				}
			}

			return node.pageRank;
		});

		for(var i = 0;i < pageRankByNode.length; i++)
			pageRankByNode[i] = {idx: i, pageRank: pageRankByNode[i]};

		pageRankByNode.sort(function(a, b){
			return b.pageRank - a.pageRank;
		});

		deletedNodes = _.map(renderNodes, function(n){
			return n.id;
		});

		renderNodes = [];
		renderLinks = [];

		//idx of the node in the global graph mapped to the idx in the render graph
		var globalToLocal = {}
			, nodesInRenderGraph = {}
			, rGraphGroups = []
			, rNodeToGroup = {}
			, rNodesWithoutLink = {}
			, fixedNodes = 0
			;

		//Knoten hinzufuegen, die immer angezeigt werden sollen
		if(addFocus){
			for(var idx = 0; idx < nodes.length; idx++){
				if(_.isUndefined(nodes[idx]))continue;
				if(!_.isUndefined(nodes[idx].show_always) && nodes[idx].show_always && !_.isUndefined(nodes[idx].focused) && nodes[idx].focused){
					var n = renderNodes.length;

					globalToLocal[idx] = n;
					renderNodes.push(nodes[idx]);
					nodesInRenderGraph[idx] = true;

					var g = rGraphGroups.length;
					rGraphGroups.push([n]);
					rNodeToGroup[n] = g;
					//Die Anzahl der TopNodes muss jeweils um 1 erhoeht werden, damit keine anderen Elemente beim hinzufuegen neuer Knoten ausgeblendet werden
					maxTopNodes++;
				}
			}
		}

		//Focused nodes hinzufuegen
		if(addFocus){
			for(var i = 0; i < pageRankByNode.length; i++){
				var idx = pageRankByNode[i].idx;
				if(_.isUndefined(nodes[idx]))continue;
				if(!_.isUndefined(nodesInRenderGraph[idx]))continue;

				if(!_.isUndefined(nodes[idx].focused) && nodes[idx].focused){
					var n = renderNodes.length;

					globalToLocal[idx] = n;
					nodes[idx].focused = true;
					renderNodes.push(nodes[idx]);
					nodesInRenderGraph[idx] = true;

					var g = rGraphGroups.length;
					rGraphGroups.push([n]);
					rNodeToGroup[n] = g;

					if(n > maxTopNodes)break;
				}
			}

			console.log('Focus:', _.map(renderNodes, 'id'));
		}else{
			//Top 20 Knoten
			for(var i = 0; i < Math.min(maxTopNodes, pageRankByNode.length); i++){
				var idx = pageRankByNode[i].idx;
				var n = renderNodes.length;

				if(!_.isUndefined(nodesInRenderGraph[idx]))continue;

				globalToLocal[idx] = n;
				nodes[idx].isTopNode = true;
				renderNodes.push(nodes[idx]);
				nodesInRenderGraph[idx] = true;

				var g = rGraphGroups.length;
				rGraphGroups.push([n]);
				rNodeToGroup[n] = g;
			}
		}

		var topNodesLength = renderNodes.length;

		//Jeweils die Top 3 Knoten fuer jeden Knoten im Rendergraph hinzufuegen
		for(var i = 0;i < topNodesLength; i++){
			//Alle benachbarten Knoten die noch nicht im Graph sind werden nach ihrem Pagerank sortiert und anschließend werden die Top 3 hinzugefuegt
			if(_.isEmpty(lBN[renderNodes[i].id]))continue;

			var remaining = [];
			_.each(lBN[renderNodes[i].id], function(l){
				var neighbour = indexMap[l];

				if(!_.isUndefined(nodesInRenderGraph[neighbour]))return;

				//nodesInGraph[neighbour] = true;
				if(!_.isUndefined(nodes[neighbour]))
					remaining.push({
						pageRank: nodes[neighbour].pageRank,
						idx: neighbour
					});
			});

			if(_.isEmpty(remaining))continue;

			remaining.sort(function(a, b){
				if(addFocus){
					var aId = a.idx;
					var bId = b.idx;

					var aFocused = !_.isUndefined(nodes[aId].focused) && nodes[aId].focused;
					var bFocused = !_.isUndefined(nodes[bId].focused) && nodes[bId].focused;

					if(aFocused && !bFocused)
						return -1;
					else if(bFocused && !aFocused)
						return 1;
					if(aFocused && bFocused)
						return b.tfidf - a.tfidf;

				}

				return b.pageRank - a.pageRank;
			});

			for(var j = 0; j < Math.min(remaining.length, maxNeighbours); j++){
				var idx = remaining[j].idx;
				var n = renderNodes.length;

				nodes[idx].isTopNode = false;

				globalToLocal[idx] = n;
				renderNodes.push(nodes[idx]);
				nodesInRenderGraph[idx] = true;

				var g = rGraphGroups.length;
				rGraphGroups.push([n]);
				rNodeToGroup[n] = g;
			}
		}

		//Knoten anzeigen, die manuell hervorgehoben wurden
		for(var idx = 0; idx < nodes.length; idx++){
			if(_.isUndefined(nodes[idx]))continue;
			if((!_.isUndefined(nodes[idx].show) && nodes[idx].show) || (!_.isUndefined(nodes[idx].showTemporarily) && nodes[idx].showTemporarily)){
				var n = renderNodes.length;

				globalToLocal[idx] = n;
				renderNodes.push(nodes[idx]);
				nodesInRenderGraph[idx] = true;

				var g = rGraphGroups.length;
				rGraphGroups.push([n]);
				rNodeToGroup[n] = g;
				//Die Anzahl der TopNodes muss jeweils um 1 erhoeht werden, damit keine anderen Elemente beim hinzufuegen neuer Knoten ausgeblendet werden
				maxTopNodes++;
			}
		}

		/*
			Links by Node
		*/
		var linksByNode = {}
			;

		for(var i = 0;i < links.length; i++){
			if(_.isUndefined(links[i]))continue;
			if(links[i].isHidden)continue;

			var el = [links[i].sourceIdx, links[i].targetIdx];

			if(_.isUndefined(linksByNode[el[0]]))
				linksByNode[el[0]] = [];
			linksByNode[el[0]].push(el[1]);

			if(_.isUndefined(linksByNode[el[1]]))
				linksByNode[el[1]] = [];
			linksByNode[el[1]].push(el[0]);
		}

		//Expanded nodes hinzufuegen
		function expandNodes(idx){
			if(_.isUndefined(linksByNode[idx]))return;

			//Alle Nachbarknoten ermitteln
			linksByNode[idx].forEach(function(idxNext){
				//Nachbarknoten ggf. zum Graphen hinzufuegen
				if(_.isUndefined(nodesInRenderGraph[idxNext])){
					var n = renderNodes.length;
					nodes[idxNext].isTopNode = false;

					globalToLocal[idxNext] = n;
					renderNodes.push(nodes[idxNext]);
					nodesInRenderGraph[idxNext] = true;

					var g = rGraphGroups.length;
					rGraphGroups.push([n]);
					rNodeToGroup[n] = g;

					//Falls der Nachbarknoten ausgeklappt werden soll, diesen Knoten auch ausklappen
					if(!_.isUndefined(nodes[idxNext].isExpanded) && nodes[idxNext].isExpanded){
						expandNodes(idxNext);
					}
				}
			});
		}

		var masterNodes = _.map(renderNodes, 'id');

		for(var i = 0;i < masterNodes.length; i++){
			var idx = indexMap[masterNodes[i]];

			if(!_.isUndefined(nodes[idx].isExpanded) && nodes[idx].isExpanded){
				expandNodes(idx);
			}
		}

		//Links hinzufuegen
		for(var i = 0; i < links.length; i++){
			if(_.isUndefined(links[i]))continue;
			if(links[i].isHidden)continue;

			if(_.isUndefined(nodesInRenderGraph[links[i].sourceIdx]) || _.isUndefined(nodesInRenderGraph[links[i].targetIdx]))continue;

			renderLinks.push(_.defaults({
				source: globalToLocal[links[i].sourceIdx],
				target: globalToLocal[links[i].targetIdx]
			}, links[i]));

			//Gruppen ermitteln
			var g1 = rNodeToGroup[globalToLocal[links[i].sourceIdx]]
				, g2 = rNodeToGroup[globalToLocal[links[i].targetIdx]]
				;

			//Falls die Knoten in unterschiedlichen Gruppen sind, werden die Gruppe zusammengefuehrt
			if(g1 != g2){
				//Es werden immer die Knoten aus der Gruppe mit der hoeheren ID zur Gruppe mit der niedrigeren ID verschoben
				var to = Math.min(g1, g2)
					, from = Math.max(g1, g2)
					;

				//Allen Knoten aus der from Gruppe in die to Gruppe zuordnen
				_.each(rGraphGroups[from], function(nodeId){
					rNodeToGroup[nodeId] = to;
					rGraphGroups[to].push(nodeId);
				});

				rGraphGroups[from] = null;
			}
		}

		/*
		HiddenLinks einfuegen
		*/
		for(var i = 1;i < rGraphGroups.length; i++){
			if(!_.isNull(rGraphGroups[i])){
				//	Eine Verbindung zwischen dieser Gruppe und Gruppe 0 herstellen.
				//	Es wird jeweils das erste Element aus Gruppe 0 mit dem ersten Element aus der aktuellen Gruppe verbunden
				var n = renderLinks.length
					, src = rGraphGroups[0][0]
					, tgt = rGraphGroups[i][0]
					;

				//Link zur Liste der hidden links hinzufuegen

				renderLinks[n] = {
					source: src,
					sourceIdx: src,
					target: tgt,
					targetIdx: tgt,
					isHidden: true
				};
			}
		}

		/*
			Welche Knoten haben Nachbarn die nicht im Graph enthalten sind?!
		*/
			for(var idx in nodesInRenderGraph){
				if(_.isUndefined(linksByNode[idx]))continue;

				nodes[idx].more = 0;

				for(var i = 0;i < linksByNode[idx].length; i++){
					var idx2 = linksByNode[idx][i];
					if(!_.isUndefined(nodesInRenderGraph[idx2]))continue;

					nodes[idx].more++;
				}
			}

		/*
			Liste der geloeschten Knoten erstellen
		*/

		var nodesInRenderGraphById = {};

		renderNodes.forEach(function(n){
			if(!_.isUndefined(n.id))
				nodesInRenderGraphById[n.id] = true;
		});

		//Liste der geloeschten Knoten aktualisieren
		deletedNodes = _.filter(deletedNodes, function(id){
			if(_.isUndefined(indexMap[id]))return false;

			if(_.isUndefined(nodesInRenderGraphById[id])){
				var n = indexMap[id];
				if(!_.isUndefined(nodes[n].prevData))
					delete nodes[n].prevData;

				return true;
			}

			return false;
		});

		console.log('Global graph', nodes.length);
		console.log('Render graph', renderNodes.length);
	}

	this.buildRenderGraph = buildRenderGraph;

	function rankNodes(){
		var focused = null
			, linkProb = 0.85 //high numbers are more stable
			, tolerance = 0.0001 //sensitivity for accuracy of convergence.
			;

		if(arguments.length > 0 && !_.isNull(arguments[0]))
			linkProb = arguments[0];
		if(arguments.length > 1 && !_.isNull(arguments[1]))
			tolerance = arguments[1];
		if(arguments.length > 2 && !_.isNull(arguments[2]))
			focused = arguments[2];

		var nodesForPagerank = []
			, linksByNode = {}
			;

		var idxOffset = [];
		var offset = 0;

		for(var i = 0;i < nodes.length; i++){
			if(_.isUndefined(nodes[i]))
				offset++;
			idxOffset[i] = offset;
		}

		for(var i = 0;i < links.length; i++){
			if(_.isUndefined(links[i]))continue;
			if(links[i].isHidden)continue;

			var el = [links[i].sourceIdx, links[i].targetIdx];

			if(_.isUndefined(linksByNode[el[0]]))
				linksByNode[el[0]] = [];
			linksByNode[el[0]].push(el[1] - idxOffset[el[1]]);

			if(_.isUndefined(linksByNode[el[1]]))
				linksByNode[el[1]] = [];
			linksByNode[el[1]].push(el[0] - idxOffset[el[0]]);
		}

		var pageRankToIdx = [];

		for(var i = 0;i < nodes.length; i++){
			if(_.isUndefined(nodes[i]))continue;

			pageRankToIdx.push(i);

			if(_.isUndefined(linksByNode[i]))
				nodesForPagerank.push([]);
			else
				nodesForPagerank.push(linksByNode[i]);
		}

		//console.log(nodes[indexMap[520]].pageRank);

		Pagerank(nodesForPagerank, linkProb, tolerance, function (err, res) {
		    if (err) throw new Error(err)

			var max = 0
				, min = 1
				;

			for(var i = 0;i < res.length; i++){
				if(res[i] > max)max = res[i];
				if(res[i] < min)min = res[i];
			}

			//Skalierung zwischen 0 und 1 vornehmen

			for(var i = 0;i < res.length; i++){
				var idx = pageRankToIdx[i];

				if(min == max)
					nodes[idx].pageRank = 0.5;
				else
					nodes[idx].pageRank = (res[i] - min) / (max - min);
			}

			//console.log(nodes[indexMap[520]].pageRank);
		});
	}

	this.rankNodes = rankNodes;

	function getRenderGraph(){
		return {
			nodes: renderNodes,
			links: renderLinks,
			remove: deletedNodes
		};
	}

	this.getRenderGraph = getRenderGraph;

	function setCurrentValues(values){
		values.forEach(function(node){
			var n = indexMap[node.id];

			if(!_.isUndefined(nodes[n])){
				nodes[n].prevData = node;

				_.forOwn(node, function(val, key){
					nodes[n][key] = val;
				});
			}
		});
	}

	this.setCurrentValues = setCurrentValues;

	function datum(id){
		return nodes[indexMap[id]];
	}

	this.datum = datum;
}
