import * as types from '../constants/ActionTypes';

export function toRelation(entity1_id, entity2_id) {  
  return {
    type: types.TO_RELATION,
    entity1_id: entity1_id,
    entity2_id: entity2_id
  };
}

export function showRelation(entity1_id, entity2_id) {  
	return function(dispatch){		
		dispatch(requestRelation(entity1_id, entity2_id));
		
		return fetch('/Relations/' + entity1_id + '/' + entity2_id, {
			credentials: 'same-origin'
		})
			.then(response => response.json())
			.then(json => {
				dispatch(receiveRelation(json));
			}).catch(err => {
				dispatch(receiveRelation({}));	
			})
	}
}

export function requestRelation(entity1_id, entity2_id){
	return {
		type: types.REQUEST_RELATION,
		entity1_id: entity1_id,
		entity2_id: entity2_id
	};
}

export function receiveRelation(data){
	return {
		type: types.RECEIVE_RELATION,
		data: data
	};
}

export function toGraph(){
	return {
		type: types.TO_GRAPH
	};
}

export function showGraph(){
	return {
		type: types.SHOW_GRAPH
	};
}

export function toLocalgraph(site_id){
	return {
		type: types.TO_LOCALGRAPH,
		site_id: site_id
	};
}

export function toGroupgraph(sites){
	return {
		type: types.TO_GROUPGRAPH,
		sites: sites
	};
}

export function showGroupgraph(sites, articles){
	return {
		type: types.SHOW_GROUPGRAPH,
		sites: sites,
		articles: articles
	}
}

export function showLocalgraph(site, article){
	return {
		type: types.SHOW_LOCALGRAPH,
		site: site,
		article: article
	}
}

export function initializeGlobal() {  
	return function(dispatch){
		dispatch(requestGlobal());
		
		return fetch('/Globalgraphs')
			.then(response => response.json())
			.then(json => {
				dispatch(receiveGlobal(json));
			}).catch(err => {
				dispatch(receiveGlobal({}));	
			})
	}
}

export function requestGlobal(){
	return {
		type: types.REQUEST_GLOBAL
	};
}

export function receiveGlobal(data){
	return {
		type: types.RECEIVE_GLOBAL,
		data: data
	};
}

export function deleteNode(userId, id) {  
	return function(dispatch){
		dispatch(requestDeleteNode());
		
		return fetch('/Entities/' + id, {
				method: 'DELETE',
				credentials: 'same-origin'
			})
			.then(response => response.json())
			.then(json => {
				dispatch(receiveDeleteNode(json));
			}).catch(err => {
				dispatch(receiveDeleteNode({}));	
			})
	}
}

export function requestDeleteNode(){
	return {
		type: types.REQUEST_DELETE_NODE
	};
}

export function receiveDeleteNode(data){
	return {
		type: types.RECEIVE_DELETE_NODE,
		data: data
	};
}

export function toGlobal(){
	return {
		type: types.TO_GLOBAL
	}
}

export function showGlobal(){
	return {
		type: types.SHOW_GLOBAL
	}
}

export function expandNode(nodeId) {  
	return function(dispatch){
		dispatch(requestNeighbours(nodeId));
		
		return fetch('http://127.0.0.1:3055/1/nodes/' + nodeId + '/neighbours')
			.then(response => response.json())
			.then(json => {
				dispatch(receiveNeighbours(nodeId, json));
			}).catch(err => {
				dispatch(receiveNeighbours(nodeId, {}));	
			})
	}
}

export function requestNeighbours(nodeId){
	return {
		type: types.REQUEST_NEIGHBOURS,
		node: nodeId
	}
}

export function receiveNeighbours(nodeId, data){
	return {
		type: types.RECEIVE_NEIGHBOURS,
		node: nodeId,
		data: data
	}
}

export function createNode(data){
	return {
		type: types.CREATE_NODE,
		data: data
	}
}

export function saveNode(nodeData){
	return function(dispatch){
		dispatch(requestSaveNode());
		
		return fetch('/Entities', {
				method: 'PUT',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(nodeData),
				credentials: 'same-origin'
			})
			.then(response => response.json())
			.then(json => {
				dispatch(receiveSaveNode(json));
			}).catch(err => {
				dispatch(receiveSaveNode({}));	
			})
	}
}

export function requestSaveNode(){
	return {
		type: types.REQUEST_SAVE_NODE
	}
}

export function receiveSaveNode(data){
	return {
		type: types.RECEIVE_SAVE_NODE,
		data: data
	}
}

export function createRelation(entity1, entity2, label){
	return function(dispatch){
		dispatch(requestCreateRelation());
		
		return fetch('/Relations/' + entity1 + '/' + entity2, {
				method: 'PUT',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					label: label
				}),
				credentials: 'same-origin'
			})
			.then(response => response.json())
			.then(json => {
				dispatch(receiveCreateRelation(json));
			}).catch(err => {
				dispatch(receiveCreateRelation({}));	
			})
	}
}

export function requestCreateRelation(){
	return {
		type: types.REQUEST_CREATE_RELATION
	}
}

export function receiveCreateRelation(data){
	return {
		type: types.RECEIVE_CREATE_RELATION,
		data: data
	}
}

/*export function selectLayer(path, layerId) {
	return function(dispatch){
		path = path.push(layerId);
		
		dispatch(requestLayers(path));
	
		return fetch('http://127.0.0.1:3000/Layers.json?path=' + path.toJS().join('/') + '&fields=data')
			.then(response => response.json())
			.then(json => {
				dispatch(receiveLayers(path, json.data));
			})
	}
}*/