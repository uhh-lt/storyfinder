var _ = require('lodash')
	, async = require('async')
	, smoothLine = require('../helpers/smoothLine.js')
	, d3 = require('d3')
	, Hypher = require('hypher')
	, hyphenation = new Hypher(require('hyphenation.de'));
	;

module.exports = function(options, elNew, elExisting, renderGraph, node, label, link){
	function getScalingFactor(d){
		if(!_.isUndefined(d.focused) && d.focused == true && !_.isUndefined(d.tfidf) && !_.isNaN(d.tfidf))
			return d.tfidf;
		return d.pageRank;
	}
	
	/*
		Die Liste der Knoten in neue Knoten und bereits vorhandene Knoten aufteilen	
	*/
	function splitNodes(){
		//Alte und neue Nodes splitten
		elNew.nodes = node.filter(function(d, i){
			var b = _.isUndefined(d.prevData) && _.isEmpty(d.isDeleted);
			if(b)elNew.nodeIds[i] = true;
			
			return b;
		});
		elNew.labels = label.filter(function(d, i){
			return _.isUndefined(d.prevData) && _.isEmpty(d.isDeleted);
		});
		elNew.links = link.filter(function(d, i){
			var b = (_.isUndefined(d.source.prevData) || _.isUndefined(d.target.prevData)) && _.isEmpty(d.source.isDeleted) && _.isEmpty(d.target.isDeleted);
			if(b)elNew.linkIds[i] = true;
			return b;
		});
		elExisting.nodes = node.filter(function(d, i){
			var b = !_.isUndefined(d.prevData) && _.isEmpty(d.isDeleted);
			if(b)elExisting.nodeIds[i] = true;
			
			return b;
		});
		elExisting.labels = label.filter(function(d, i){
			var b = !_.isUndefined(d.prevData) && _.isEmpty(d.isDeleted);
			return b;
		});
		elExisting.links = link.filter(function(d, i){
			var b = (!_.isUndefined(d.source.prevData) && !_.isUndefined(d.target.prevData)) && _.isEmpty(d.source.isDeleted) && _.isEmpty(d.target.isDeleted);
			if(b)elExisting.linkIds[i] = true;
			
			return b;
		});
	}
	
	/*
			
	*/
	function renderNode(d){
		if(d.more > 0){
			d3.select(this).select('g.more > text').text('+' + d.more);
		}
		
		var w = 0;
		
		d.r = options.labelRadius / 2;
		
		d3.select(this).select('text.caption')
			.text(function(d){ return d.caption; })
			.each(function(d){
				w = this.getComputedTextLength();
			})
			.style("font-size", function(d) {
				var fontSize = options.minFontSize
					, el = d3.select(this)
					, r = options.labelRadius
					, padding = 3
					, caption = d.caption
					, hyphens = hyphenation.hyphenate(caption).reduceRight((h, v) => {
							v = v.split(' ');
							
							if(v[v.length - 1] == ''){
								v.pop();
								v[v.length - 1] += ' ';
							}
							
							v = _.reverse(v);
							
							v.forEach((vt, i) => {
								if(i > 0)
									vt = vt + ' ';
								
								if(vt.match(/\s$/)){
									if(h.length > 0)
										h[0] = ' ' + h[0];
									vt = vt.substr(0, vt.length - 1);
								}
								
								h.unshift(vt);
							});
							return h;
						}, [])
					, maxHeight = (r - padding) * 2
					, maxWidth = (r - padding * 2) * 2
					, currentLength = this.getComputedTextLength()
					;
														
				//fontSize = Math.min(Math.min(2 * d.r, (2 * d.r - 8) / this.getComputedTextLength() * 24, options.maxFontSize));
				var lineHeight = fontSize + 2;
				
				//console.log(caption, currentLength, maxWidth);
				
				if(currentLength <= maxWidth) //Falls das Label in einer Zeile passt, sind keine weiteren Anpassungen nötig
					return fontSize + 'px';
				
				//Maximale Anzahl der Zeilen ermitteln
				var maxRows = Math.floor(maxHeight / lineHeight);
				var splitChars = false;
				
				el.text('');
				
				//console.log('Using hyphenation for ' + caption + ' with max rows: ' + maxRows);
				
				//Mit einer Zeile beginnen und bis max. maxRows Zeilen testen
				
				do{
					var fits = false;
					
					for(var rows = 2; rows <= maxRows; rows++){						
						var _hyphens = _.clone(hyphens);
						
						el.selectAll('tspan').remove();
						
						for(var i = 0; i < rows; i++){
							var lineY = i - (rows - 1) / 2;
							lineY *= lineHeight;
							
							if(r <= lineY)continue;
							
							var lineWidth = Math.max(Math.abs(Math.sqrt(r * r - lineY * lineY)) * 2 - 12, 0);
							
							if(lineWidth <= 0 || isNaN(lineWidth))continue;
							
							var n = _hyphens.length;			
							var span = el
								.append('tspan')
								.text(_hyphens.join(''))
								.attr('x', 0)
								.attr('y', lineY)
								.attr('dy', '0.35em')
								.each(function(){ 
									var p = null
										, o = d3.select(this)
										;
									
									while(this.getComputedTextLength() > lineWidth){
										n--;
										
										if(n == 0){
											o.text('');
											break;
										}
											
										p = _hyphens.slice(0, n);
																				
										var postfix = '-';
										if(i == rows - 1){
											//In der letzten Zeile wird kein '-' angezeigt, sondern '...' falls nicht das gesamte Wort passt
											postfix = '…';
										}else{
											if(_hyphens[n].match(/^\s/))
												postfix = ''; //Falls das naechste Token ein neues Wort ist, wird kein '-' verwendet
										}
										
										o.text(p.join('').replace(/^\s/,'') + postfix);
									}
									
									while(n > 0){
										_hyphens.shift();
										n--;
									}
								})
								;
						}
											
						if(_hyphens.length == 0){
							//console.log(caption, 'fits in ' + rows + ' rows');
							fits = true;
							break;
						}else if(rows == maxRows){
							//console.log(caption, 'Overflow for max ' + rows + ' is', _hyphens);
							if(_hyphens.length > hyphens.length * 0.50){
								//Falls nicht mindestens 50% der Silben platziert wurden, wird eine Zeichentrennung verwendet
								splitChars = true;
							}
						}else{
							//console.log(caption, 'Overflow for ' + rows + ' rows is', _hyphens);
						}
					}
					
					if(!fits && d.type == 'PER'){
						//Position des letzten Leerzeichens ermitteln	
						//console.log(hyphens);
						
						var pos = null;
						hyphens.forEach((v, i) => {
							if(v.match(/^\s/) && i != 0)
								pos = i;
						});
						
						if(pos == null){
							caption = hyphens.join('');
							break; //Falls keine Leerzeichen enthalten ist, kann nicht weiter gekuerzt werden
						}
												
						hyphens = hyphens.reduce((h, v, i) => {
							if(i < pos){
								if(i == 0 || v.match(/^\s/))
									if(v.length > 2)
										h.push(v.substr(0, 1) + '.');
							}else{
								if(h.length == 0)
									v = v.substr(1, v.length - 1);
								h.push(v);
							}
							return h;
						}, []);
					}else{
						break;
					}
				}while(true);
								
				if(splitChars){
					//console.log('Using char splitting for ', caption);
					//Wrap lines
					el.text(caption);
					var currentLength = this.getComputedTextLength();
					var maxWidth = (r - 6) * 2;
								
					el.selectAll('tspan').remove();				
					el.text('');
								
					var lines = Math.ceil(currentLength / maxWidth);
					lines *= Math.log2(lines);
					lines = Math.ceil(lines);
					
					if(lines == 0)lines++;
					for(var i = 0;i < lines; i++){
						var lineY = i - (lines - 1) / 2;
						
						lineY *= (fontSize + 2);
						
						if(r <= lineY)continue;
						
						var maxWidth = Math.max(Math.abs(Math.sqrt(r * r - lineY * lineY)) * 2 - 12, 0);
						
						if(maxWidth <= 0 || isNaN(maxWidth))continue;
											
						var span = el
							.append('tspan')
							.text(caption)
							.attr('x', 0)
							.attr('y', lineY)
							.attr('dy', '0.35em')
							.each(function(){ 
								var p = caption;
								var o = d3.select(this);
								
								while(this.getComputedTextLength() > maxWidth){
									p = p.substr(0, p.length - 1);
									o.text(p);
								}
								
								caption = caption.substr(p.length);
							})
							;
					}
				}
				
				return fontSize + 'px';
			})
			.attr("y", ".35em")
			;
		
		w += options.labelPadding * 2;
		var h = options.labelTotalHeight;
		
		d.width = w;
		d.height = options.labelTotalHeight;
			
		d3.select(this).select('rect')
			.attr('height', h)
			.attr('y', 17)
			.attr('width', w)
			.attr('x', w / -2)
			.attr('rx', 5)
			
		/*
			Circle	
		*/
		d.width = options.labelRadius * 1.5;
		d.height = options.labelRadius * 1.5;
		
		d3.select(this).selectAll('circle')
			.attr('r', options.labelRadius)
			;
	}
	
	/*
		Die Daten aus dem neu berechneten Layout anwenden
	*/
	function applyNewData(){
		var done = arguments[arguments.length - 1];
		var highlightNode = null
			, highlightId = null 
			, highlightData = null
			;
		
		if(arguments.length > 1){
			highlightId = arguments[0];
		}
		
		//Neue Links hinzufuegen
		var newLinks = link
			.enter().append("g")
			.attr('opacity', 0)
			;
		
		newLinks.each(function(el){
			if(_.isUndefined(options._upathid))
				options._upathid = 0;
				
			var uid = options._upathid++
				, el = d3.select(this)
				;
			
			el.append('path')
				.attr('id', 'path:' + uid)
				.attr('class', 'relation-marker')
				;
				
			el.append('path')
				.attr('class', 'click-target')
				;
				
			/*el.append('path')
				.attr('id', 'path:' + uid)
				;*/
			
			el.append('text')
				.attr('dy', '-4px')
			.append('textPath')
				.attr('xlink:href', '#path:' + uid)
				.attr('startOffset', '50%')
				;
		});		
										
		node.enter().append("circle")
			.attr("class", "node")
			.attr("r", options.labelRadius)
			;
		
		//Neue Labels hinzufuegen
		var newLabels = label.enter()
			.append("g")
			//.call(d3cola.drag)
			;
		
		splitNodes();
		
		//highlight neighbours if a node is highligted
		var neighbours = {};
			
		//Neue Links aus-, alte Links einblenden
		link
		.attr('opacity', function(d, i){
			if(!_.isUndefined(elExisting.linkIds[i]) && _.isUndefined(d.isHidden))return 1;
			return 0;
		})
		.attr('data-sourceId', function(d){
			return d.source.id;
		})
		.attr('data-targetId', function(d){
			return d.target.id;
		})
		.attr("class", function(d){
			var c = 'link';
			
			c += ' ' + d.source.type + '-' + d.target.type;
			
		 	if(!_.isUndefined(d.isHidden))
				c += ' is-hidden';
			else{				
				if(d.source.focused && d.target.focused)
					c += ' focused';
			}
			
			if(!_.isNull(highlightId)){
				if(d.source.id == highlightId || d.target.id == highlightId){
					c += ' selection-neighbour';
					
					if(d.source.id == highlightId)
						neighbours[d.target.id] = true;
					else
						neighbours[d.source.id] = true;
				}
			}
			
			return c;
		})
		.select('path.relation-marker')
			.attr('d', function(d){
				var sx = d.source.x
					, sy = d.source.y
					, tx = d.target.x
					, ty = d.target.y
					;
				
				if(!_.isUndefined(d.source.prevData)){
					sx = d.source.prevData.x;
					sy = d.source.prevData.y;
				}
				
				if(!_.isUndefined(d.target.prevData)){
					tx = d.target.prevData.x;
					ty = d.target.prevData.y;
				}
				
				return smoothLine({x: sx, y: sy}, {x:tx, y:ty});
			})
		link.select('path.click-target')
			.attr('d', function(d){
				var sx = d.source.x
					, sy = d.source.y
					, tx = d.target.x
					, ty = d.target.y
					;
				
				if(!_.isUndefined(d.source.prevData)){
					sx = d.source.prevData.x;
					sy = d.source.prevData.y;
				}
				
				if(!_.isUndefined(d.target.prevData)){
					tx = d.target.prevData.x;
					ty = d.target.prevData.y;
				}
				
				return smoothLine({x: sx, y: sy}, {x:tx, y:ty});
			})
		/*.style('stroke', function(d){
			return 'url(#' + d.source.type + '-' + d.target.type + '-gradient)';	
		})*/;
		
		link.select('textPath').text(function(d){
			//console.log(d);
			
			if(!_.isUndefined(d.Relationtype) && !_.isNull(d.Relationtype))
				if(options.bShowLinklabels)
					return d.Relationtype.label;
				else
					return '...';
			else
				return '';
		});
		
		var moreStacked = newLabels.append('g')
			.attr('class', 'more-stacked')
			;
			
		moreStacked.append('circle').attr('r', options.labelRadius);
		moreStacked.append('circle').attr('r', options.labelRadius);
		
		newLabels.append('circle')
		var moreLabels = newLabels.append('g')
			.attr('class', 'more')
			.attr('transform','translate(15, -15)')
			;
			
		moreLabels.append('circle')
			.attr('r', options.labelRadius)
			;
			
		moreLabels.append('text')
			.attr('dy', '.35em')
			;
		
		//newLabels.append('rect');					
		newLabels.append('text')
			.attr('class', 'caption')
			;
			
		label
			.attr('opacity', function(d, i){
				if(!_.isUndefined(elExisting.nodeIds[i]))return 1;
				return 0;
			})
			.attr("class", function(d){
				var ret = "label";
				if(d.isTopNode)
					ret += ' topNode';
					
				ret += ' type-' + d.type;
					
				if(d.focused)
					ret += ' focused';
								
				if(d.more > 0 && (_.isUndefined(d.isExpanded) || !d.isExpanded))
					ret += ' has-more';
				
				if(highlightId == d.id)
					ret += ' highlighted';
				
				if(!_.isUndefined(neighbours[d.id]))
					ret += ' selection-neighbour';
				
				return ret;
			})
			.attr('transform', function(d){
				if(!_.isUndefined(d.prevData)){
					return 'translate(' + Math.round(d.prevData.x) + ',' + Math.round(d.prevData.y) + ') scale(' + (getScalingFactor(d.prevData) / 2 + 0.75) + ')';
				}else{
					return 'translate(' + Math.round(d.x) + ',' + Math.round(d.y) + ') scale(' + (getScalingFactor(d) / 2 + 0.75) + ')';
				}
			})
			.attr('data-id', function(d){
				return d.id
			})
			.each(renderNode);
	
		setTimeout(done, 0);
	}
	
	this.applyNewData = applyNewData;
}